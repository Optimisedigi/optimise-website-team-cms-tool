import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createLocalReq, getPayload } from "payload";
import config from "@/payload.config";
import { logActivity } from "@/lib/activity-log";
import { KEYWORD_COST_FINDER_ACTIVITY_TYPE, perthDateTime, usageWeek, weekLabel, weeklyUsageUrl } from "@/lib/keyword-cost-finder-usage";

export const dynamic = "force-dynamic";

type EstimateUsagePayload = {
  type?: string;
  status?: string;
  city?: string;
  targetArea?: string;
  keyword?: string;
  source?: string;
  dailyLiveCalls?: number;
  usedAt?: string;
};

type AdminUser = {
  id: string | number;
  email?: string | null;
};

const NOTIFICATION_KIND = "google-ads-keyword-cost-finder-usage";
const ACTIVITY_TYPE = KEYWORD_COST_FINDER_ACTIVITY_TYPE;

function isAuthorized(request: NextRequest) {
  const apiKey = process.env.GOOGLE_ADS_ESTIMATE_WEBHOOK_API_KEY || process.env.AUDIT_API_KEY;
  if (!apiKey) return false;

  const provided = request.headers.get("x-api-key");
  if (!provided) return false;

  const expectedBuffer = Buffer.from(apiKey);
  const providedBuffer = Buffer.from(provided);

  return (
    expectedBuffer.length === providedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

function sanitizeText(value: unknown, fallback = "Unknown") {
  if (typeof value !== "string") return fallback;
  const cleaned = value.trim().replace(/\s+/g, " ").slice(0, 120);
  return cleaned || fallback;
}

function eventTime(value: unknown, now = new Date()) {
  if (typeof value !== "string") return now;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed <= now ? parsed : now;
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "google-ads-estimate-usage" });
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: EstimateUsagePayload;
  try {
    body = (await request.json()) as EstimateUsagePayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const cfg = await config;
  const payload = await getPayload({ config: cfg });

  const admins = await payload.find({
    collection: "users" as never,
    where: { role: { equals: "admin" } } as never,
    limit: 1,
    sort: "createdAt",
    depth: 0,
    overrideAccess: true,
  });

  const recipient = admins.docs[0] as unknown as AdminUser | undefined;
  const keyword = sanitizeText(body.keyword, "No keyword");
  const targetArea = sanitizeText(body.targetArea ?? body.city, "Unknown area");
  const status = sanitizeText(body.status, "unknown");
  const source = sanitizeText(body.source, "unknown");
  const usedAt = eventTime(body.usedAt);
  const activity = {
    type: ACTIVITY_TYPE,
    title: "Google Ads keyword cost finder used",
    description: `${keyword} in ${targetArea} — ${status}/${source}`,
    targetUrl: "/admin/collections/activity-log?where[type][equals]=google_ads_keyword_cost_finder_used",
    occurredAt: usedAt,
  };

  if (!recipient) {
    await logActivity(payload, activity);
    return NextResponse.json({ ok: true, stored: false, activityStored: true, reason: "no_admin_user" });
  }

  const transactionID = await payload.db.beginTransaction();
  if (transactionID === null) {
    return NextResponse.json({ error: "Could not safely record usage" }, { status: 503 });
  }
  try {
    const payloadReq = await createLocalReq({}, payload);
    payloadReq.transactionID = transactionID;
    await payload.create({
      collection: "activity-log" as never,
      overrideAccess: true,
      req: payloadReq,
      data: {
        type: activity.type,
        title: activity.title,
        description: activity.description,
        targetUrl: activity.targetUrl,
        createdAt: usedAt.toISOString(),
      } as never,
    });

    // One notification per Monday-Sunday week: the count goes up and it shows
    // the latest use, instead of one row per search.
    const week = usageWeek(usedAt);
    const url = weeklyUsageUrl(week.start);
    const usesThisWeek = await payload.count({
      collection: "activity-log" as never,
      where: {
        and: [
          { type: { equals: ACTIVITY_TYPE } },
          { createdAt: { greater_than_equal: week.start.toISOString() } },
          { createdAt: { less_than: week.end.toISOString() } },
        ],
      } as never,
      overrideAccess: true,
      req: payloadReq,
    });
    const existing = await payload.find({
      collection: "notifications" as never,
      where: {
        and: [
          { recipient: { equals: recipient.id } },
          { kind: { equals: NOTIFICATION_KIND } },
          { url: { equals: url } },
        ],
      } as never,
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req: payloadReq,
    });
    const current = existing.docs[0] as { id: string | number; createdAt?: string; body?: string } | undefined;
    const latestKnown = current?.createdAt ? new Date(current.createdAt) : null;
    const isLatest = !latestKnown || Number.isNaN(latestKnown.getTime()) || usedAt >= latestKnown;
    const count = Math.max(usesThisWeek.totalDocs, 1);
    const data = {
      title: `Google Ads keyword cost finder used this week (${count})`,
      // An out-of-order (older) event bumps the count but keeps the latest-use line.
      body: isLatest || !current?.body
        ? `Week of ${weekLabel(week.monday)}. Latest: ${keyword} in ${targetArea}, ${status}/${source}, ${perthDateTime(usedAt)}`
        : current.body,
      readAt: null,
      ...(isLatest ? { createdAt: usedAt.toISOString() } : {}),
    };
    if (current) {
      await payload.update({
        collection: "notifications" as never,
        id: current.id,
        overrideAccess: true,
        req: payloadReq,
        data: data as never,
      });
    } else {
      await payload.create({
        collection: "notifications" as never,
        overrideAccess: true,
        req: payloadReq,
        data: { ...data, recipient: recipient.id, kind: NOTIFICATION_KIND, url, createdAt: usedAt.toISOString() } as never,
      });
    }
    await payload.db.commitTransaction(transactionID);
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID).catch(() => undefined);
    throw error;
  }

  const total = await payload.count({
    collection: "activity-log" as never,
    where: { type: { equals: ACTIVITY_TYPE } } as never,
    overrideAccess: true,
  });

  return NextResponse.json({ ok: true, stored: true, totalUses: total.totalDocs });
}
