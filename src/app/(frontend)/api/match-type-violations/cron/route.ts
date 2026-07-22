import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getPayload } from "payload";
import config from "@/payload.config";
import { logActivity } from "@/lib/activity-log";
import { filterViolations, readScope } from "@/lib/match-type-filter";
import {
  findCoveringNegative,
  type CoverageNkl,
} from "@/lib/match-type-negation-coverage";

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
  /** Spend (account currency) attributed to this violating search term. */
  cost?: number;
  /** Total spend for this violation's ad group over the window (denominator). */
  adGroupCost?: number;
  conversions?: number;
  allConversions?: number;
  campaignName: string;
  adGroupName: string;
  nearestKeyword?: string;
  offendingWords?: string[];
  recommendedKeyword?: string;
  recommendedMatchType?: "exact" | "phrase";
}

interface AdGroupSpend {
  campaignName: string;
  adGroupName: string;
  cost: number;
}

interface GrowthToolsResponse {
  violations: Violation[];
  adGroupSpend?: AdGroupSpend[];
}

interface ExistingKeywordRow {
  text: string;
  campaignName: string;
  matchType: string;
}

function normaliseKeywordText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normaliseCampaignName(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function collectKeywordRows(value: unknown, rows: ExistingKeywordRow[] = []): ExistingKeywordRow[] {
  if (Array.isArray(value)) {
    for (const item of value) collectKeywordRows(item, rows);
    return rows;
  }
  if (!value || typeof value !== "object") return rows;
  const obj = value as Record<string, unknown>;
  const text = normaliseKeywordText(obj.keywordText ?? obj.keyword ?? obj.text);
  const campaignName = normaliseCampaignName(obj.campaignName ?? obj.campaign);
  const matchType = String(obj.matchType ?? obj.keywordMatchType ?? obj.keyword_match_type ?? "").trim().toUpperCase();
  if (text && campaignName) rows.push({ text, campaignName, matchType });
  for (const key of ["keywords", "results", "rows", "data"] as const) {
    if (obj[key]) collectKeywordRows(obj[key], rows);
  }
  return rows;
}

async function fetchExistingKeywordSet(customerId: string): Promise<Set<string>> {
  if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY) return new Set();
  try {
    const res = await fetch(`${GROWTH_TOOLS_URL}/api/google-ads/keywords/list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": INTERNAL_API_KEY,
      },
      body: JSON.stringify({ customerId }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!isEndpointReady(res) || !res.ok) return new Set();
    const data = await res.json().catch(() => null);
    return new Set(
      collectKeywordRows(data)
        .filter((row) => row.matchType === "EXACT")
        .map((row) => `${row.campaignName}\u0000${row.text}`),
    );
  } catch {
    return new Set();
  }
}

function buildExistingKeywordSet(...sources: unknown[]): Set<string> {
  const existing = new Set<string>();
  for (const source of sources) {
    if (source instanceof Set) {
      for (const key of source) existing.add(String(key));
      continue;
    }
    for (const row of collectKeywordRows(source)) {
      if (row.matchType === "EXACT") existing.add(`${row.campaignName}\u0000${row.text}`);
    }
  }
  return existing;
}

function alreadyExistsInCampaign(v: Violation, existingKeywords: Set<string>): boolean {
  if (existingKeywords.size === 0) return false;
  return existingKeywords.has(`${normaliseCampaignName(v.campaignName)}\u0000${normaliseKeywordText(v.searchTerm)}`);
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

function esc(s: unknown): string {
  if (s === null || s === undefined) return 'NULL';
  return `'${String(s).replace(/'/g, "''")}'`;
}

async function hideExistingKeywordCandidate(
  payload: Awaited<ReturnType<typeof getPayload>>,
  clientId: number,
  v: Violation,
  now: string,
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = ((payload as any).db as { client: { execute: (sql: string) => Promise<unknown> } }).client;
  const result = await db.execute(
    `UPDATE match_type_violation_candidates
     SET status = 'rejected', rejected_at = COALESCE(rejected_at, ${esc(now)}), last_seen_at = ${esc(now)}
     WHERE client_id = ${Number(clientId)}
       AND search_term = ${esc(v.searchTerm)}
       AND triggering_keyword = ${esc(v.triggeringKeyword)}
       AND status = 'pending';`,
  ) as { rowsAffected?: number };
  return Number(result.rowsAffected ?? 0) > 0;
}

async function upsertViolation(
  payload: Awaited<ReturnType<typeof getPayload>>,
  clientId: number,
  v: Violation,
  now: string,
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = ((payload as any).db as { client: { execute: (sql: string) => Promise<unknown> } }).client;
  const today = now.split('T')[0];
  const offendingWords = Array.isArray(v.offendingWords) ? v.offendingWords.join(', ') : '';
  const recommendedKeyword = v.recommendedKeyword ?? '';
  // `recommendedMatchType` is a Payload select field ('exact' | 'phrase').
  // Writing '' makes EVERY later payload.update() on the row fail validation
  // ("This field has an invalid selection"), which silently broke
  // Approve/Dismiss. Empty must be SQL NULL, never ''.
  const recommendedMatchTypeSql = v.recommendedMatchType ? esc(v.recommendedMatchType) : 'NULL';
  const nearestKeyword = v.nearestKeyword ?? '';
  const conversions = Number(v.conversions ?? v.allConversions ?? 0) || 0;
  const cost = Number(v.cost ?? 0) || 0;
  const adGroupCost = Number(v.adGroupCost ?? 0) || 0;

  // Check for an existing candidate before skip guards so previously-visible
  // pending rows can be hidden when the detector later reports conversions.
  const existing = await db.execute(
    `SELECT id, status FROM match_type_violation_candidates
     WHERE client_id = ${Number(clientId)}
       AND search_term = ${esc(v.searchTerm)}
       AND triggering_keyword = ${esc(v.triggeringKeyword)}
     LIMIT 1;`,
  ) as { rows: Array<{ id: number; status: string }> };

  if (existing.rows.length > 0) {
    const doc = existing.rows[0];
    if (conversions > 0) {
      if (doc.status === 'pending') {
        await db.execute(
          `UPDATE match_type_violation_candidates SET
             impressions = ${v.impressions ?? 0},
             clicks = ${v.clicks ?? 0},
             cost = ${cost},
             ad_group_cost = ${adGroupCost},
             status = 'rejected',
             rejected_at = COALESCE(rejected_at, ${esc(now)}),
             last_seen_at = ${esc(now)},
             run_date = ${esc(today)}
           WHERE id = ${doc.id};`,
        );
      } else {
        await db.execute(
          `UPDATE match_type_violation_candidates SET
             impressions = ${v.impressions ?? 0},
             clicks = ${v.clicks ?? 0},
             cost = ${cost},
             ad_group_cost = ${adGroupCost},
             last_seen_at = ${esc(now)},
             run_date = ${esc(today)}
           WHERE id = ${doc.id};`,
        );
      }
      return false;
    }
    if (doc.status === 'pending') {
      await db.execute(
        `UPDATE match_type_violation_candidates SET
           campaign_name = ${esc(v.campaignName ?? '')},
           ad_group_name = ${esc(v.adGroupName ?? '')},
           match_type = ${esc(v.matchType)},
           violation_type = ${esc(v.violationType)},
           impressions = ${v.impressions ?? 0},
           clicks = ${v.clicks ?? 0},
           cost = ${cost},
           ad_group_cost = ${adGroupCost},
           recommended_keyword = ${esc(recommendedKeyword)},
           recommended_match_type = ${recommendedMatchTypeSql},
           offending_words = ${esc(offendingWords)},
           nearest_keyword = ${esc(nearestKeyword)},
           last_seen_at = ${esc(now)},
           run_date = ${esc(today)}
         WHERE id = ${doc.id};`,
      );
    } else {
      await db.execute(
        `UPDATE match_type_violation_candidates SET
           impressions = ${v.impressions ?? 0},
           clicks = ${v.clicks ?? 0},
           cost = ${cost},
           ad_group_cost = ${adGroupCost},
           last_seen_at = ${esc(now)}
         WHERE id = ${doc.id};`,
      );
    }
  } else {
    if (conversions > 0) return false;

    // Insert new candidate — use raw SQL to bypass Payload ORM id=null bug
    await db.execute(
      `INSERT INTO match_type_violation_candidates
         (client_id, search_term, triggering_keyword, campaign_name, ad_group_name,
          match_type, violation_type, impressions, clicks, cost, ad_group_cost,
          recommended_keyword, recommended_match_type, offending_words, nearest_keyword,
          status, last_seen_at, first_seen_at, run_date, created_at, updated_at)
       VALUES (
         ${Number(clientId)}, ${esc(v.searchTerm)}, ${esc(v.triggeringKeyword)},
         ${esc(v.campaignName ?? '')}, ${esc(v.adGroupName ?? '')},
         ${esc(v.matchType)}, ${esc(v.violationType)},
         ${v.impressions ?? 0}, ${v.clicks ?? 0}, ${cost}, ${adGroupCost},
         ${esc(recommendedKeyword)}, ${recommendedMatchTypeSql}, ${esc(offendingWords)}, ${esc(nearestKeyword)},
         'pending', ${esc(now)}, ${esc(now)}, ${esc(today)}, ${esc(now)}, ${esc(now)}
       );`,
    );
  }

  return true;
}

async function syncClient(
  payload: Awaited<ReturnType<typeof getPayload>>,
  clientDoc: any,
): Promise<{ processed: boolean; violationCount: number; skippedNegated: number; error?: string }> {
  const clientId = typeof clientDoc.id === "object" ? (clientDoc.id as any).id : clientDoc.id;
  const clientName = typeof clientDoc.name === "string" && clientDoc.name.trim() ? clientDoc.name : "This client";
  const customerId = clientDoc.googleAdsCustomerId as string | null;
  if (!customerId) return { processed: false, violationCount: 0, skippedNegated: 0, error: "no customer ID" };

  // Per-client scope: separate exact/phrase toggles + campaign/ad-group allow-list.
  const scope = readScope(clientDoc);
  // Both match types disabled → nothing to police; skip the detector call entirely.
  if (!scope.exact && !scope.phrase) {
    return { processed: false, violationCount: 0, skippedNegated: 0, error: "both match types disabled" };
  }

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
  const allViolations: Violation[] = Array.isArray(data?.violations) ? data.violations : [];
  // Denominator lookup: total spend per ad group over the same window, so each
  // candidate can carry its ad group's total cost for the share-in-violation %.
  const adGroupSpendByKey = new Map<string, number>();
  for (const s of Array.isArray(data?.adGroupSpend) ? data.adGroupSpend : []) {
    adGroupSpendByKey.set(`${s.campaignName ?? ''}\u0000${s.adGroupName ?? ''}`, Number(s.cost) || 0);
  }
  for (const v of allViolations) {
    v.adGroupCost = adGroupSpendByKey.get(`${v.campaignName ?? ''}\u0000${v.adGroupName ?? ''}`) ?? 0;
  }
  const existingKeywords = buildExistingKeywordSet(data, await fetchExistingKeywordSet(customerId.replace(/-/g, "")));
  const scopedViolations = filterViolations(allViolations, scope);
  const now = new Date().toISOString();

  // Active NKLs for this client, used to suppress violations already blocked by
  // a negative (exact, phrase, or broad) in a list that routes to the
  // violation's campaign / ad group.
  const nklResult = await (payload.find as any)({
    collection: "negative-keyword-lists",
    where: {
      and: [{ client: { equals: clientId } }, { isActive: { equals: true } }],
    },
    depth: 0,
    limit: 500,
    overrideAccess: true,
  });
  const campaignNegatives: CoverageNkl[] = Array.isArray(nklResult?.docs) ? nklResult.docs : [];

  // Keep only violations the client actually polices (match-type gate + allow-list),
  // then suppress rows where the search term already exists as a keyword in that
  // campaign, or is already covered by an applicable negative keyword.
  const violations: Violation[] = [];
  let skippedNegated = 0;
  for (const v of scopedViolations) {
    if (alreadyExistsInCampaign(v, existingKeywords)) {
      await hideExistingKeywordCandidate(payload, clientId as number, v, now);
      continue;
    }
    const covering = findCoveringNegative(
      v.searchTerm,
      { campaignName: v.campaignName, adGroupName: v.adGroupName },
      campaignNegatives,
    );
    if (covering) {
      // No-op for brand-new terms (nothing to hide); hides any stale pending row.
      await hideExistingKeywordCandidate(payload, clientId as number, v, now);
      skippedNegated++;
      continue;
    }
    violations.push(v);
  }

  let createdOrUpdated = 0;

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

  const scopeNote = [
    !scope.exact || !scope.phrase ? (scope.exact ? "exact only" : "phrase only") : null,
    scope.allowList.length > 0 ? `${scope.allowList.length} allow-list rule(s)` : null,
  ]
    .filter(Boolean)
    .join("; ");

  await logActivity(payload, {
    type: "match_type_violation_sync",
    title: `Match type violations sync: ${createdOrUpdated} violations found`,
    description:
      (skippedNegated > 0
        ? `${clientName}: ${createdOrUpdated} violations, ${skippedNegated} skipped (already negated)`
        : `${clientName}: ${createdOrUpdated} violations for "${customerId}"`) +
      (scopeNote ? ` (${scopeNote})` : ""),
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
    // Schedule enable toggle. Defaults to true when the column is null (e.g.
    // pre-migration rows) so behaviour is unchanged until explicitly disabled.
    const monitorEnabled = cronSettings?.matchTypeMonitorEnabled ?? true;

    // Get the current hour in the agency's timezone (handles DST automatically)
    const localHour = new Intl.DateTimeFormat("en-US", {
      timeZone: agencyTimezone,
      hour: "numeric",
      hour12: false,
    }).format(new Date());

    const forceSync = req.nextUrl.searchParams.get("forceSync") === "true";
    // When the schedule is disabled, only an explicit forceSync runs it.
    const doSync = forceSync || (monitorEnabled && Number(localHour) === syncHour);

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
