import type { Payload } from "payload";
import { buildMonthList, currentYearMonth } from "@/lib/avoided-spend-warmer";
import { parseBrandTerms } from "@/lib/brand-terms";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const GROWTH_TOOLS_API_KEY = process.env.INTERNAL_API_KEY;

const CURRENT_MONTH_TTL_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_MONTHS_BACK = 14;

export interface WasteRelevancyCacheRow {
  id: number;
  client: number | { id: number };
  yearMonth: string;
  totalSpend: number;
  nonConvertingSpend: number;
  irrelevantSpend: number;
  competitorExcludedSpend?: number;
  brandExcludedSpend?: number;
  brandSpend?: number;
  isFinal: boolean | number;
  fetchedAt: string;
}

export interface MonthlyWasteRelevancyEntry {
  month: string; // YYYY-MM
  totalSpend: number;
  nonConvertingSpend: number;
  irrelevantSpend: number;
  competitorExcludedSpend: number;
  brandExcludedSpend: number;
  brandSpend: number;
}

export interface WarmMonthlyWasteRelevancyResult {
  /** Number of (month) cells refreshed from Growth Tools. */
  misses: number;
  durationMs: number;
  error?: string;
  cache: Map<string, WasteRelevancyCacheRow>;
  months: string[];
  monthsBack: number;
  irrelevantTermCount: number;
  /** Slug used in the upstream Growth Tools URL. Caller must pass it through. */
  slug: string;
}

/**
 * Pull NKLs (the "currently irrelevant" term set), compute misses against
 * the cache, refresh missing months from Growth Tools, and return the
 * populated cache for response building.
 *
 * Used by:
 *   - GET /api/dashboard/monthly-waste-relevancy (read-through)
 *   - /api/dashboard/prewarm (nightly warmer)
 */
export async function warmMonthlyWasteRelevancyForClient(
  payload: Payload,
  clientId: number,
  customerId: string,
  slug: string,
  monthsBackInput: number = DEFAULT_MONTHS_BACK,
): Promise<WarmMonthlyWasteRelevancyResult> {
  const startedAt = Date.now();
  const monthsBack = Math.min(36, Math.max(1, monthsBackInput || DEFAULT_MONTHS_BACK));
  const months = buildMonthList(monthsBack);
  const currentMonth = currentYearMonth();

  const cache = new Map<string, WasteRelevancyCacheRow>();

  // 1. Read existing cache rows for this client.
  const cacheResult = await payload.find({
    collection: "negative-keyword-monthly-waste-relevancy-cache",
    where: { client: { equals: clientId } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  });

  for (const row of cacheResult.docs as unknown as WasteRelevancyCacheRow[]) {
    cache.set(row.yearMonth, row);
  }

  // 2. Pull NKLs to build the irrelevantTerms set. We always need this so
  // Growth Tools can bucket per-month spend the same way.
  const nkls = await payload.find({
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

  // Collect negatives with their match types intact. Each NKL keyword carries
  // a structured matchType (exact/phrase/broad); forwarding it lets Growth
  // Tools apply true Google Ads match semantics instead of substring-matching
  // every term as BROAD (which over-credits irrelevant spend and craters the
  // relevancy %). Dedup on (text|matchType).
  const seen = new Set<string>();
  const irrelevantKeywords: Array<{
    text: string;
    matchType: "EXACT" | "PHRASE" | "BROAD";
    exclusion: "none" | "competitor" | "brand";
  }> = [];
  for (const list of nkls.docs as any[]) {
    // A list tagged competitor/brand has its keywords kept OUT of the default
    // relevancy % (foldable back in via dashboard toggles). "none" lists
    // count normally. Each keyword inherits its list's exclusion tag.
    const ex = String(list?.relevancyExclusion ?? "").toLowerCase();
    const listExclusion: "none" | "competitor" | "brand" =
      ex === "competitor" || ex === "brand" ? ex : "none";
    for (const kw of list?.keywords ?? []) {
      if (typeof kw?.keyword !== "string" || !kw.keyword.trim()) continue;
      const text = kw.keyword.trim();
      // matchType is required on the NKL keyword schema (default "exact").
      // Fall back to EXACT for any malformed value rather than BROAD — BROAD
      // is the over-aggressive default that caused the original over-flagging
      // bug, so we never want to silently widen a keyword's reach here.
      const mt = String(kw?.matchType ?? "").toUpperCase();
      const matchType: "EXACT" | "PHRASE" | "BROAD" =
        mt === "EXACT" || mt === "PHRASE" || mt === "BROAD" ? mt : "EXACT";
      // Dedup keeps the FIRST occurrence. Normal ("none") lists are processed
      // the same as before; if the same keyword appears in both a normal and
      // an excluded list, Growth Tools' priority logic (none > competitor >
      // brand) ensures it still counts against relevancy.
      const dedupKey = `${text.toLowerCase()}|${matchType}|${listExclusion}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      irrelevantKeywords.push({ text, matchType, exclusion: listExclusion });
    }
  }
  // Legacy bare-string list kept for the response's irrelevantTermCount and
  // for backward compatibility with older Growth Tools deploys.
  const irrelevantTerms = irrelevantKeywords.map((k) => k.text);

  // Pull the client's brand keywords so Growth Tools can compute the
  // per-month brand/generic split from search-term data.
  let brandKeywords: string[] = [];
  try {
    const clientDoc = await payload.findByID({
      collection: "clients",
      id: clientId,
      depth: 0,
      overrideAccess: true,
    });
    brandKeywords = parseBrandTerms((clientDoc as any)?.brandKeywords);
  } catch { /* fall through with empty list */ }

  // 3. Compute misses: any month not in cache, or current month older than 1h.
  // Self-healing backfill: when the client has brand keywords but a cached
  // row predates the brand_spend column deploy (no brandSpend persisted),
  // treat that month as a miss so the warmer refetches and stamps the
  // brand split. Without this hook past months are isFinal=true and never
  // refetched, so brand spend stays zero forever after upgrading.
  const BRAND_SPEND_DEPLOY_TS = Date.parse("2026-05-06T11:00:00Z");
  const now = Date.now();
  const missingMonths: string[] = [];
  for (const m of months) {
    const row = cache.get(m);
    if (!row) {
      missingMonths.push(m);
      continue;
    }
    if (m === currentMonth) {
      const fetchedAt = new Date(row.fetchedAt).getTime();
      if (Number.isNaN(fetchedAt) || now - fetchedAt > CURRENT_MONTH_TTL_MS) {
        missingMonths.push(m);
        continue;
      }
    }
    // Brand-spend backfill: refetch any past row whose fetchedAt predates
    // the brand_spend column deploy AND the client now has brand keywords
    // configured. One-time per row — once refetched, fetchedAt advances
    // past the threshold so the row is immutable again.
    if (brandKeywords.length > 0) {
      const fetchedAtMs = new Date(row.fetchedAt).getTime();
      if (!Number.isNaN(fetchedAtMs) && fetchedAtMs < BRAND_SPEND_DEPLOY_TS) {
        missingMonths.push(m);
      }
    }
    // Past months with rows are immutable.
  }

  if (missingMonths.length === 0 || !GROWTH_TOOLS_URL || !GROWTH_TOOLS_API_KEY || !customerId) {
    return {
      misses: 0,
      durationMs: Date.now() - startedAt,
      error: !GROWTH_TOOLS_URL || !GROWTH_TOOLS_API_KEY || !customerId
        ? "missing upstream config"
        : undefined,
      cache,
      months,
      monthsBack,
      irrelevantTermCount: irrelevantTerms.length,
      slug,
    };
  }

  // 4. Fetch from Growth Tools. The endpoint accepts an optional `onlyMonths`
  // hint so we don't redo immutable past months when only the current month
  // is stale.
  const cleanCustomerId = customerId.replace(/-/g, "");
  // Compute the upstream's effective monthsBack = max distance from "now" of
  // any miss. This way we only ask for as much history as we need.
  const earliestMissIdx = missingMonths
    .map((m) => months.indexOf(m))
    .filter((i) => i >= 0)
    .reduce((min, i) => Math.min(min, i), months.length - 1);
  const effectiveMonthsBack = Math.max(1, months.length - earliestMissIdx);

  try {
    const res = await fetch(
      `${GROWTH_TOOLS_URL}/api/google-ads/dashboard/${encodeURIComponent(slug)}/monthly-waste-relevancy`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-key": GROWTH_TOOLS_API_KEY,
        },
        body: JSON.stringify({
          customerId: cleanCustomerId,
          // Preferred: structured negatives with match types so Growth Tools
          // applies true EXACT/PHRASE/BROAD matching.
          irrelevantKeywords,
          // Legacy field kept for older Growth Tools deploys (treated as BROAD).
          irrelevantTerms,
          brandKeywords,
          monthsBack: effectiveMonthsBack,
          onlyMonths: missingMonths,
        }),
        cache: "no-store",
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      payload.logger?.warn?.(`[monthly-waste-relevancy] Growth Tools ${res.status}: ${text}`);
      return {
        misses: 0,
        durationMs: Date.now() - startedAt,
        error: `Growth Tools ${res.status}`,
        cache,
        months,
        monthsBack,
        irrelevantTermCount: irrelevantTerms.length,
        slug,
      };
    }

    const data = await res.json();
    const monthly: Array<{
      month: string;
      totalSpend?: number;
      nonConvertingSpend?: number;
      irrelevantSpend?: number;
      competitorExcludedSpend?: number;
      brandExcludedSpend?: number;
      brandSpend?: number;
    }> = Array.isArray(data?.monthly) ? data.monthly : [];

    const fetchedAt = new Date().toISOString();

    type Write =
      | {
          kind: "update";
          id: number | string;
          data: {
            totalSpend: number;
            nonConvertingSpend: number;
            irrelevantSpend: number;
            competitorExcludedSpend: number;
            brandExcludedSpend: number;
            brandSpend: number;
            isFinal: boolean;
            fetchedAt: string;
          };
        }
      | {
          kind: "create";
          data: {
            client: number;
            yearMonth: string;
            totalSpend: number;
            nonConvertingSpend: number;
            irrelevantSpend: number;
            competitorExcludedSpend: number;
            brandExcludedSpend: number;
            brandSpend: number;
            isFinal: boolean;
            fetchedAt: string;
          };
        };
    const writes: Write[] = [];

    let misses = 0;
    for (const entry of monthly) {
      const m = entry.month;
      if (!m || !months.includes(m)) continue;
      // Only persist months the warmer asked for. Upstream may have padded
      // its response with extras; we don't want to overwrite immutable rows.
      if (!missingMonths.includes(m)) continue;

      const totalSpend = Number(entry.totalSpend) || 0;
      const nonConvertingSpend = Number(entry.nonConvertingSpend) || 0;
      const irrelevantSpend = Number(entry.irrelevantSpend) || 0;
      const competitorExcludedSpend = Number(entry.competitorExcludedSpend) || 0;
      const brandExcludedSpend = Number(entry.brandExcludedSpend) || 0;
      const brandSpend = Number(entry.brandSpend) || 0;
      const isFinal = m < currentMonth;

      const existing = cache.get(m);
      if (existing) {
        writes.push({
          kind: "update",
          id: existing.id,
          data: {
            totalSpend,
            nonConvertingSpend,
            irrelevantSpend,
            competitorExcludedSpend,
            brandExcludedSpend,
            brandSpend,
            isFinal,
            fetchedAt,
          },
        });
        existing.totalSpend = totalSpend;
        existing.nonConvertingSpend = nonConvertingSpend;
        existing.irrelevantSpend = irrelevantSpend;
        existing.competitorExcludedSpend = competitorExcludedSpend;
        existing.brandExcludedSpend = brandExcludedSpend;
        existing.brandSpend = brandSpend;
        existing.isFinal = isFinal;
        existing.fetchedAt = fetchedAt;
      } else {
        writes.push({
          kind: "create",
          data: {
            client: clientId,
            yearMonth: m,
            totalSpend,
            nonConvertingSpend,
            irrelevantSpend,
            competitorExcludedSpend,
            brandExcludedSpend,
            brandSpend,
            isFinal,
            fetchedAt,
          },
        });
        cache.set(m, {
          id: -1,
          client: clientId,
          yearMonth: m,
          totalSpend,
          nonConvertingSpend,
          irrelevantSpend,
          competitorExcludedSpend,
          brandExcludedSpend,
          brandSpend,
          isFinal,
          fetchedAt,
        });
      }
      misses += 1;
    }

    // Run cache writes in parallel batches — 12 months max so a single batch is fine.
    const CONCURRENCY = 8;
    for (let i = 0; i < writes.length; i += CONCURRENCY) {
      const batch = writes.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (w) => {
          try {
            if (w.kind === "update") {
              await payload.update({
                collection: "negative-keyword-monthly-waste-relevancy-cache",
                id: w.id,
                data: w.data,
                overrideAccess: true,
              });
            } else {
              await payload.create({
                collection: "negative-keyword-monthly-waste-relevancy-cache",
                data: w.data,
                overrideAccess: true,
              });
            }
          } catch (err) {
            payload.logger?.warn?.(`[monthly-waste-relevancy] cache upsert failed: ${err}`);
          }
        }),
      );
    }

    return {
      misses,
      durationMs: Date.now() - startedAt,
      cache,
      months,
      monthsBack,
      irrelevantTermCount: irrelevantTerms.length,
      slug,
    };
  } catch (err) {
    payload.logger?.warn?.(`[monthly-waste-relevancy] fetch failed: ${err}`);
    return {
      misses: 0,
      durationMs: Date.now() - startedAt,
      error: String(err),
      cache,
      months,
      monthsBack,
      irrelevantTermCount: irrelevantTerms.length,
      slug,
    };
  }
}

/**
 * Build the API response shape (oldest-first month list with totals)
 * from a populated cache map.
 */
export function buildMonthlyWasteRelevancyResponse(
  result: WarmMonthlyWasteRelevancyResult,
): {
  monthsBack: number;
  monthly: MonthlyWasteRelevancyEntry[];
  irrelevantTermCount: number;
} {
  const { cache, months, monthsBack, irrelevantTermCount } = result;

  const monthly: MonthlyWasteRelevancyEntry[] = months.map((m) => {
    const row = cache.get(m);
    return {
      month: m,
      totalSpend: row ? Number(row.totalSpend) || 0 : 0,
      nonConvertingSpend: row ? Number(row.nonConvertingSpend) || 0 : 0,
      irrelevantSpend: row ? Number(row.irrelevantSpend) || 0 : 0,
      competitorExcludedSpend: row ? Number(row.competitorExcludedSpend) || 0 : 0,
      brandExcludedSpend: row ? Number(row.brandExcludedSpend) || 0 : 0,
      brandSpend: row ? Number(row.brandSpend) || 0 : 0,
    };
  });

  return { monthsBack, monthly, irrelevantTermCount };
}
