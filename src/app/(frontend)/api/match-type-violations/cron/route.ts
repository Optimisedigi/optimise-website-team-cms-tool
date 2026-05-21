import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getPayload } from "payload";
import config from "@/payload.config";
import { logActivity } from "@/lib/activity-log";

export const maxDuration = 180;

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const IDEMPOTENCY_GUARD_MS = 25 * 60 * 1000; // 25 minutes

interface Violation {
  searchTerm: string;
  matchType: "EXACT" | "PHRASE";
  triggeringKeyword: string;
  violationType: "exact_close_variant" | "phrase_missing_word";
  impressions: number;
  clicks: number;
  campaignName: string;
  adGroupName: string;
}

interface GrowthToolsResponse {
  violations: Violation[];
}

async function authCron(req: NextRequest): Promise<boolean> {
  if (!CRON_SECRET) return false;
  const token = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!token) return false;
  try {
    const expected = Buffer.from(CRON_SECRET);
    const provided = Buffer.from(token);
    return (
      expected.length === provided.length && crypto.timingSafeEqual(expected, provided)
    );
  } catch {
    return false;
  }
}

/**
 * Returns true if the search term is already negated (as any match type)
 * in any active negative keyword list for this client.
 */
async function isAlreadyNegated(
  payload: Awaited<ReturnType<typeof getPayload>>,
  clientId: number,
  searchTerm: string,
): Promise<boolean> {
  const nklResult = await (payload.find as any)({
    collection: "negative-keyword-lists",
    where: {
      and: [
        { client: { equals: clientId } },
        { isActive: { equals: true } },
      ],
    },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  });

  const term = searchTerm.trim().toLowerCase();
  for (const nkl of nklResult.docs as any[]) {
    const keywords = Array.isArray(nkl.keywords) ? nkl.keywords : [];
    for (const kw of keywords) {
      if ((kw.keyword ?? "").trim().toLowerCase() === term) {
        return true;
      }
    }
  }
  return false;
}

async function upsertViolation(
  payload: Awaited<ReturnType<typeof getPayload>>,
  clientId: number,
  v: Violation,
  now: string,
): Promise<boolean> {
  // Skip if already negated in any active NKL for this client
  if (await isAlreadyNegated(payload, clientId, v.searchTerm)) {
    return false;
  }

  const existing = await (payload.find as any)({
    collection: "match-type-violation-candidates",
    where: {
      and: [
        { client: { equals: clientId } },
        { searchTerm: { equals: v.searchTerm } },
        { triggeringKeyword: { equals: v.triggeringKeyword } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  const base = {
    client: clientId,
    searchTerm: v.searchTerm,
    triggeringKeyword: v.triggeringKeyword,
    campaignName: v.campaignName ?? "",
    adGroupName: v.adGroupName ?? "",
    matchType: v.matchType,
    violationType: v.violationType,
    impressions: v.impressions ?? 0,
    clicks: v.clicks ?? 0,
    lastSeenAt: now,
    runDate: now.split("T")[0],
  };

  if (existing.docs.length > 0) {
    const doc = existing.docs[0] as any;
    // Preserve existing approved/rejected status — only update pending candidates
    if (doc.status === "pending") {
      await (payload.update as any)({
        collection: "match-type-violation-candidates",
        id: doc.id,
        data: base,
        overrideAccess: true,
      });
    } else {
      // Still update metrics on approved/rejected rows for visibility
      await (payload.update as any)({
        collection: "match-type-violation-candidates",
        id: doc.id,
        data: { impressions: v.impressions ?? 0, clicks: v.clicks ?? 0, lastSeenAt: now },
        overrideAccess: true,
      });
    }
  } else {
    await (payload.create as any)({
      collection: "match-type-violation-candidates",
      data: { ...base, firstSeenAt: now, status: "pending" },
      overrideAccess: true,
    });
  }

  return true;
}

async function syncClient(
  payload: Awaited<ReturnType<typeof getPayload>>,
  clientDoc: any,
): Promise<{ processed: boolean; violationCount: number; skippedNegated: number; error?: string }> {
  const clientId = typeof clientDoc.id === "object" ? (clientDoc.id as any).id : clientDoc.id;
  const customerId = clientDoc.googleAdsCustomerId as string | null;
  if (!customerId) return { processed: false, violationCount: 0, skippedNegated: 0, error: "no customer ID" };

  const res = await fetch(`${GROWTH_TOOLS_URL}/api/google-ads/match-type-violations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": INTERNAL_API_KEY!,
    },
    body: JSON.stringify({
      customerId: customerId.replace(/-/g, ""),
      minImpressions: 50,
      lookbackDays: 7,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (res.status === 404) {
    return { processed: false, violationCount: 0, skippedNegated: 0, error: "endpoint not found" };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Growth Tools returned ${res.status}: ${text}`);
  }

  const data: GrowthToolsResponse = await res.json();
  const violations: Violation[] = Array.isArray(data?.violations) ? data.violations : [];
  const now = new Date().toISOString();

  let createdOrUpdated = 0;
  let skippedNegated = 0;

  for (const v of violations) {
    const wasUpserted = await upsertViolation(payload, clientId as number, v, now);
    if (wasUpserted) {
      createdOrUpdated++;
    } else {
      skippedNegated++;
    }
  }

  // Upsert sync state
  const syncStateResult = await (payload.find as any)({
    collection: "match-type-sync-state",
    where: { client: { equals: clientId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  if (syncStateResult.docs.length > 0) {
    await (payload.update as any)({
      collection: "match-type-sync-state",
      id: (syncStateResult.docs[0] as any).id,
      data: { lastRunAt: now },
      overrideAccess: true,
    });
  } else {
    await (payload.create as any)({
      collection: "match-type-sync-state",
      data: { client: clientId, lastRunAt: now },
      overrideAccess: true,
    });
  }

  await logActivity(payload, {
    type: "match_type_violation_sync",
    title: `Match type violations sync: ${createdOrUpdated} violations found`,
    description:
      skippedNegated > 0
        ? `Client ${clientId}: ${createdOrUpdated} violations, ${skippedNegated} skipped (already negated)`
        : `Client ${clientId}: ${createdOrUpdated} violations for "${customerId}"`,
    client: clientId,
  });

  return { processed: true, violationCount: createdOrUpdated, skippedNegated };
}

export async function GET(req: NextRequest) {
  if (!(await authCron(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY) {
    return NextResponse.json(
      { error: "Server misconfigured: missing GROWTH_TOOLS_URL or INTERNAL_API_KEY" },
      { status: 500 }
    );
  }

  // Fetch agency's timezone and sync hour from CronSettings global
  const cronSettings = await (payload.findGlobal as any)({
    slug: "cron-settings",
    depth: 0,
    overrideAccess: true,
  });

  const agencyTimezone = cronSettings?.timezone ?? "Australia/Sydney";
  const syncHour = cronSettings?.matchTypeMonitorSyncHour ?? 9;

  // Get the current hour in the agency's timezone (handles DST automatically)
  const localHour = new Intl.DateTimeFormat("en-US", {
    timeZone: agencyTimezone,
    hour: "numeric",
    hour12: false,
  }).format(new Date());

  const doSync = Number(localHour) === syncHour;

  // Only process clients that have the monitor enabled
  const clientsResult = await (payload.find as any)({
    collection: "clients",
    where: {
      and: [
        { googleAdsCustomerId: { exists: true } },
        { "gadsAuto.matchTypeMonitorEnabled": { equals: true } },
      ],
    },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  });

  let processed = 0;
  let errors = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const clientDoc of clientsResult.docs) {
    const clientId =
      typeof clientDoc.id === "object" ? (clientDoc.id as any).id : clientDoc.id;

    if (doSync) {
      // Full sync — check idempotency guard
      const syncStateResult = await (payload.find as any)({
        collection: "match-type-sync-state",
        where: { client: { equals: clientId } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      });

      const existingState = syncStateResult.docs[0] as any;
      if (existingState?.lastRunAt) {
        const lastRunMs = new Date(existingState.lastRunAt).getTime();
        if (Date.now() - lastRunMs < IDEMPOTENCY_GUARD_MS) {
          skipped++;
          continue;
        }
      }

      try {
        const result = await syncClient(payload, clientDoc);
        if (result.error === "endpoint not found") {
          console.warn(
            `[match-type-violations/cron] Growth Tools endpoint not found for client ${clientId} — skipping`
          );
          continue;
        }
        if (result.processed) processed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[match-type-violations/cron] Client ${clientId} error:`, msg);
        errors++;
      }
    } else {
      // Not the configured sync hour — touch sync state so the 25-min guard doesn't block the next run
      const syncStateResult = await (payload.find as any)({
        collection: "match-type-sync-state",
        where: { client: { equals: clientId } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      });

      if (syncStateResult.docs.length > 0) {
        await (payload.update as any)({
          collection: "match-type-sync-state",
          id: (syncStateResult.docs[0] as any).id,
          data: { lastRunAt: now },
          overrideAccess: true,
        });
      } else {
        await (payload.create as any)({
          collection: "match-type-sync-state",
          data: { client: clientId, lastRunAt: now },
          overrideAccess: true,
        });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    agencyTimezone,
    localHour: Number(localHour),
    syncHour,
    doSync,
    processed,
    errors,
    skipped,
    totalMonitoredClients: clientsResult.totalDocs,
  });
}
