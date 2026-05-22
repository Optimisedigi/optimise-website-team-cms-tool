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
const CONSOLIDATION_THRESHOLD = 400; // NKL exact negatives before flagging for consolidation

interface ConsolidationCandidate {
  phrase: string;
  exacts: string[];
  overlapRisk: boolean;
  overlapDetails: string;
}

interface GrowthToolsConsolidationResponse {
  candidates: ConsolidationCandidate[];
}

interface ConsolidationResult {
  created: number;
}

/**
 * For each monitored client, checks if any NKL has ≥ 400 exact negatives.
 * If so, calls Growth Tools to get phrase consolidation candidates, de-dups
 * against existing pending/approved candidates, creates new ones, and notifies admins.
 */
async function checkConsolidation(
  payload: Awaited<ReturnType<typeof getPayload>>,
  clientDocs: any[],
  clientIdMap: Map<string | number, any>,
): Promise<ConsolidationResult> {
  let created = 0;

  for (const clientDoc of clientDocs) {
    const clientId =
      typeof clientDoc.id === "object" ? (clientDoc.id as any).id : clientDoc.id;
    const clientData = clientIdMap.get(clientId);
    const customerId = clientData?.googleAdsCustomerId as string | null;
    if (!customerId) continue;

    // Fetch all active NKLs for this client
    const nklResult = await (payload.find as any)({
      collection: "negative-keyword-lists",
      where: {
        and: [
          { client: { equals: clientId } },
          { isActive: { equals: true } },
        ],
      },
      depth: 1,
      limit: 500,
      overrideAccess: true,
    });

    for (const nkl of nklResult.docs) {
      const nklId = typeof nkl.id === "object" ? (nkl.id as any).id : nkl.id;
      const keywords: Array<{ keyword?: string; matchType?: string }> = Array.isArray(nkl.keywords) ? nkl.keywords : [];
      const exactNegatives = keywords
        .filter((k) => (k.matchType ?? "").toLowerCase() === "exact")
        .map((k) => k.keyword ?? "")
        .filter(Boolean);

      if (exactNegatives.length < CONSOLIDATION_THRESHOLD) continue;

      // Call Growth Tools to get consolidation candidates
      const res = await fetch(
        `${GROWTH_TOOLS_URL}/api/google-ads/consolidation-candidates`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-key": INTERNAL_API_KEY!,
          },
          body: JSON.stringify({
            customerId: customerId.replace(/-/g, ""),
            exactNegatives,
          }),
          signal: AbortSignal.timeout(60_000),
        },
      );

      if (!isEndpointReady(res)) {
        console.warn(
          `[consolidation] Growth Tools endpoint not ready (status=${res.status}, content-type=${res.headers.get("content-type") ?? "none"}) for client ${clientId} NKL ${nklId} — skipping`,
        );
        continue;
      }

      if (!res.ok) {
        console.warn(
          `[consolidation] Growth Tools returned ${res.status} for client ${clientId} NKL ${nklId}`,
        );
        continue;
      }

      const data: GrowthToolsConsolidationResponse = await res.json();
      const candidates: ConsolidationCandidate[] = Array.isArray(data?.candidates) ? data.candidates : [];
      const now = new Date().toISOString();

      for (const c of candidates) {
        // Skip if a pending or approved candidate for this NKL already exists
        const existing = await (payload.find as any)({
          collection: "consolidation-candidates",
          where: {
            and: [
              { nkl: { equals: nklId } },
              { phraseCandidate: { equals: c.phrase } },
              { status: { in: ["pending", "approved"] } },
            ],
          },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        });

        if (existing.totalDocs > 0) continue;

        // Create the consolidation candidate
        const candidateDoc = await (payload.create as any)({
          collection: "consolidation-candidates",
          data: {
            client: clientId,
            nkl: nklId,
            nklName: nkl.name ?? "",
            phraseCandidate: c.phrase,
            exactNegativesToRemove: c.exacts.map((kw) => ({ keyword: kw })),
            exactCount: c.exacts.length,
            overlapRisk: c.overlapRisk ?? false,
            overlapDetails: c.overlapDetails ?? "",
            status: "pending",
            createdAt: now,
            updatedAt: now,
          },
          overrideAccess: true,
        });
        created++;

        const candidateId = typeof candidateDoc.id === "object" ? (candidateDoc.id as any).id : candidateDoc.id;

        // Notify all admins
        const admins = await (payload.find as any)({
          collection: "users",
          where: { role: { equals: "admin" } },
          depth: 0,
          limit: 100,
          overrideAccess: true,
        });

        for (const admin of admins.docs) {
          const adminId = typeof admin.id === "object" ? (admin.id as any).id : admin.id;
          await (payload.create as any)({
            collection: "notifications" as never,
            data: {
              recipient: adminId,
              kind: "consolidation-pending",
              title: `NKL consolidation needed: "${nkl.name ?? nklId}"`,
              body:
                c.overlapRisk
                  ? `Phrase "${c.phrase}" flagged with overlap risk — review required.`
                  : `Phrase "${c.phrase}" can replace ${c.exacts.length} exact negatives.`,
              url: `/admin/collections/consolidation-candidates`,
              relatedConsolidationCandidate: candidateId,
            },
            overrideAccess: true,
          });
        }
      }
    }
  }

  return { created };
}

/**
 * Returns true if the response looks like a real JSON payload from the
 * Growth Tools service. Returns false for 404 or for any response whose
 * Content-Type is not JSON (e.g. Railway's HTML fallback page when the
 * endpoint hasn't been deployed yet, gateway error pages, etc.). These
 * cases are treated as "endpoint not ready" — skipped, not counted as
 * errors — so transient build/deploy windows don't pollute the run.
 */
function isEndpointReady(res: Response): boolean {
  if (res.status === 404) return false;
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return false;
  return true;
}

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
      minImpressions: 2,
      lookbackDays: 7,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!isEndpointReady(res)) {
    console.log(`[match-type-violations/cron] Growth Tools responded with non-JSON or 404 — status=${res.status}, ct=${res.headers.get("content-type") ?? "none"}`);
    return {
      processed: false,
      violationCount: 0,
      skippedNegated: 0,
      error: "endpoint not ready",
    };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Growth Tools returned ${res.status}: ${text}`);
  }

  const data: GrowthToolsResponse = await res.json().catch((err) => {
    throw new Error(`Failed to parse Growth Tools response as JSON: ${err?.message ?? err}`);
  });
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

  try {
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

    const doSync = Number(localHour) === syncHour || req.nextUrl.searchParams.get("forceSync") === "true";

    // ?resetSync=true clears all sync state so the idempotency guard doesn't block the run
    if (req.nextUrl.searchParams.get("resetSync") === "true") {
      const dbClient = ((payload as any).db as { client?: { execute: (sql: string) => Promise<unknown> } }).client;
      if (dbClient) await dbClient.execute("DELETE FROM `match_type_sync_state`");
    }

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

    // Build lookup map so checkConsolidation can access client data without re-fetching
    const clientIdMap = new Map<string | number, any>();
    for (const doc of clientsResult.docs) {
      const id = typeof doc.id === "object" ? (doc.id as any).id : doc.id;
      clientIdMap.set(id, doc);
    }

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
        if (result.error === "endpoint not ready") {
          console.warn(
            `[match-type-violations/cron] Growth Tools endpoint not ready for client ${clientId} — skipping`
          );
          skipped++;
          continue;
        }
        if (result.processed) processed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const cause = (err as any)?.cause?.message ?? '';
        console.error(`[match-type-violations/cron] Client ${clientId} error:`, msg, cause ? `Cause: ${cause}` : '');
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

  // ── Consolidation check: flag NKLs approaching the 5,000 limit ───────────────
  let consolidationCandidatesCreated = 0;
  if (doSync) {
    const consolidationResult = await checkConsolidation(payload, clientsResult.docs, clientIdMap);
    consolidationCandidatesCreated = consolidationResult.created;
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
    consolidationCandidatesCreated,
    totalMonitoredClients: clientsResult.totalDocs,
  });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const cause = (err as any)?.cause?.message ?? '';
    console.error(`[match-type-violations/cron] Unhandled error:`, msg, cause ? `Cause: ${cause}` : '');
    return NextResponse.json({ ok: false, error: msg, cause }, { status: 500 });
  }
}
