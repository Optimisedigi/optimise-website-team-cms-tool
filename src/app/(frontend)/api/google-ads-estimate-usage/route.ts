import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createLocalReq, getPayload } from "payload";
import config from "@/payload.config";
import { logActivity } from "@/lib/activity-log";

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
    type: "google_ads_keyword_cost_finder_used" as const,
    title: "Google Ads keyword cost finder used",
    description: `${keyword} in ${targetArea} — ${status}/${source}`,
    targetUrl: "/admin/collections/notifications?where[kind][equals]=google-ads-keyword-cost-finder-usage",
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
      collection: "notifications" as never,
      overrideAccess: true,
      req: payloadReq,
      data: {
        recipient: recipient.id,
        kind: NOTIFICATION_KIND,
        title: "Google Ads keyword cost finder used",
        body: `${keyword} in ${targetArea} — ${status}/${source} at ${usedAt.toLocaleString("en-AU", { timeZone: "Australia/Perth" })}`,
        url: "/admin/collections/notifications?where[kind][equals]=google-ads-keyword-cost-finder-usage",
        createdAt: usedAt.toISOString(),
      } as never,
    });
    await logActivity(payload, activity, payloadReq);
    await payload.db.commitTransaction(transactionID);
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID).catch(() => undefined);
    throw error;
  }

  const total = await payload.count({
    collection: "notifications" as never,
    where: { kind: { equals: NOTIFICATION_KIND } } as never,
    overrideAccess: true,
  });

  return NextResponse.json({ ok: true, stored: true, totalUses: total.totalDocs });
}
