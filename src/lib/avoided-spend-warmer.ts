import type { Payload } from "payload";
import type { GoogleAdsDashboardAvoidedSpend } from "@/lib/dashboard-types";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const GROWTH_TOOLS_API_KEY = process.env.INTERNAL_API_KEY;

const CURRENT_MONTH_TTL_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_MONTHS_BACK = 12;

export type MatchType = "EXACT" | "PHRASE" | "BROAD";

const MATCH_TYPE_PRIORITY: Record<MatchType, number> = {
  EXACT: 0,
  PHRASE: 1,
  BROAD: 2,
};

export interface AvoidedSpendCacheRow {
  id: number;
  client: number | { id: number };
  keyword: string;
  matchType: MatchType;
  yearMonth: string;
  spend: number;
  isFinal: boolean | number;
  fetchedAt: string;
}

interface NklKeyword {
  keyword: string;
  matchType: MatchType;
  negatedAt: string; // ISO
}

/**
 * Build the rolling YYYY-MM month list (oldest first). Length = monthsBack.
 */
export function buildMonthList(monthsBack: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    months.push(`${yyyy}-${mm}`);
  }
  return months;
}

export function currentYearMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Pull the dedup-priority match type for a given keyword text. EXACT > PHRASE > BROAD.
 */
function dedupKeywords(keywords: NklKeyword[]): NklKeyword[] {
  const byText = new Map<string, NklKeyword>();
  for (const kw of keywords) {
    const key = kw.keyword.trim().toLowerCase();
    const existing = byText.get(key);
    if (!existing) {
      byText.set(key, kw);
      continue;
    }
    if (MATCH_TYPE_PRIORITY[kw.matchType] < MATCH_TYPE_PRIORITY[existing.matchType]) {
      byText.set(key, kw);
    }
  }
  return Array.from(byText.values());
}

function addMiss(
  map: Map<string, { kw: NklKeyword; months: Set<string> }>,
  kw: NklKeyword,
  month: string,
) {
  const key = `${kw.keyword.toLowerCase()}|${kw.matchType}`;
  const entry = map.get(key);
  if (entry) {
    entry.months.add(month);
  } else {
    map.set(key, { kw, months: new Set([month]) });
  }
}

export interface WarmAvoidedSpendResult {
  misses: number;
  durationMs: number;
  error?: string;
  /** Populated cache + deduped keyword list — useful for serving paths to skip a re-read. */
  cache: Map<string, AvoidedSpendCacheRow>;
  deduped: NklKeyword[];
  months: string[];
  monthsBack: number;
  currentMonth: string;
}

/**
 * Pull NKLs, compute misses against the cache, and refresh the missing
 * (client, keyword, matchType, month) cells from Growth Tools. The map and
 * deduped keyword list are returned so callers can build a response without
 * a second Turso round-trip.
 *
 * Used by:
 *   - GET /api/dashboard/avoided-spend (read-through)
 *   - /api/dashboard/prewarm (nightly warmer)
 */
export async function warmAvoidedSpendForClient(
  payload: Payload,
  clientId: number,
  customerId: string,
  monthsBackInput: number = DEFAULT_MONTHS_BACK,
): Promise<WarmAvoidedSpendResult> {
  const startedAt = Date.now();
  const monthsBack = Math.min(36, Math.max(1, monthsBackInput || DEFAULT_MONTHS_BACK));

  const months = buildMonthList(monthsBack);
  const currentMonth = currentYearMonth();

  const cache = new Map<string, AvoidedSpendCacheRow>();
  let misses = 0;

  // 1. Pull all active NKLs for this client.
  const nklResult = await payload.find({
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

  const allKeywords: NklKeyword[] = [];
  for (const list of nklResult.docs as any[]) {
    const listCreatedAt = list.createdAt || new Date().toISOString();
    const keywords = Array.isArray(list.keywords) ? list.keywords : [];
    for (const kw of keywords) {
      if (!kw?.keyword || !kw?.matchType) continue;
      const mt = String(kw.matchType).toUpperCase() as MatchType;
      if (mt !== "EXACT" && mt !== "PHRASE" && mt !== "BROAD") continue;
      allKeywords.push({
        keyword: String(kw.keyword).trim(),
        matchType: mt,
        negatedAt: kw.negatedAt || listCreatedAt,
      });
    }
  }

  const deduped = dedupKeywords(allKeywords);

  if (deduped.length === 0) {
    return {
      misses: 0,
      durationMs: Date.now() - startedAt,
      cache,
      deduped,
      months,
      monthsBack,
      currentMonth,
    };
  }

  // 2. Read existing cache rows.
  const cacheResult = await payload.find({
    collection: "negative-keyword-avoided-spend-cache",
    where: { client: { equals: clientId } },
    limit: 10000,
    depth: 0,
    overrideAccess: true,
  });

  for (const row of cacheResult.docs as unknown as AvoidedSpendCacheRow[]) {
    const key = `${row.keyword.toLowerCase()}|${row.matchType}|${row.yearMonth}`;
    cache.set(key, row);
  }

  // 3. Compute the misses.
  const now = Date.now();
  const missesByKeyword = new Map<string, { kw: NklKeyword; months: Set<string> }>();
  let allMissesAreCurrentMonth = true;

  for (const kw of deduped) {
    for (const m of months) {
      const negatedMonth = (kw.negatedAt || "").slice(0, 7);
      if (negatedMonth && m < negatedMonth) continue;

      const key = `${kw.keyword.toLowerCase()}|${kw.matchType}|${m}`;
      const row = cache.get(key);
      const isCurrentMonth = m === currentMonth;

      if (!row) {
        addMiss(missesByKeyword, kw, m);
        if (!isCurrentMonth) allMissesAreCurrentMonth = false;
        continue;
      }
      if (isCurrentMonth) {
        const fetchedAt = new Date(row.fetchedAt).getTime();
        if (Number.isNaN(fetchedAt) || now - fetchedAt > CURRENT_MONTH_TTL_MS) {
          addMiss(missesByKeyword, kw, m);
        }
      }
    }
  }

  for (const v of missesByKeyword.values()) misses += v.months.size;

  // 4. If any misses, batch into a single Growth Tools call.
  if (missesByKeyword.size > 0 && GROWTH_TOOLS_URL && GROWTH_TOOLS_API_KEY && customerId) {
    const cleanCustomerId = customerId.replace(/-/g, "");
    const requestKeywords = Array.from(missesByKeyword.values()).map((m) => ({
      text: m.kw.keyword,
      matchType: m.kw.matchType,
      negatedSince: m.kw.negatedAt,
    }));

    const onlyMonths = allMissesAreCurrentMonth ? [currentMonth] : undefined;

    try {
      const res = await fetch(`${GROWTH_TOOLS_URL}/api/google-ads/keyword-historical-spend`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-key": GROWTH_TOOLS_API_KEY,
        },
        body: JSON.stringify({
          customerId: cleanCustomerId,
          monthsBack,
          keywords: requestKeywords,
          ...(onlyMonths ? { onlyMonths } : {}),
        }),
        cache: "no-store",
      });

      if (res.ok) {
        const data = await res.json();
        const perKw: Array<{
          text: string;
          matchType: MatchType;
          negatedSince?: string;
          monthlySpend: Record<string, number>;
        }> = Array.isArray(data?.perKeyword) ? data.perKeyword : [];

        const fetchedAt = new Date().toISOString();

        type Write =
          | { kind: "update"; id: number | string; data: { spend: number; isFinal: boolean; fetchedAt: string } }
          | { kind: "create"; data: { client: number; keyword: string; matchType: MatchType; yearMonth: string; spend: number; isFinal: boolean; fetchedAt: string } };
        const writes: Write[] = [];
        for (const kwResp of perKw) {
          const text = String(kwResp.text || "").trim();
          const matchType = String(kwResp.matchType || "").toUpperCase() as MatchType;
          const monthly = kwResp.monthlySpend || {};
          for (const [month, value] of Object.entries(monthly)) {
            const spend = Number(value) || 0;
            const isFinal = month < currentMonth;
            const cacheKey = `${text.toLowerCase()}|${matchType}|${month}`;
            const existing = cache.get(cacheKey);
            if (existing) {
              writes.push({ kind: "update", id: existing.id, data: { spend, isFinal, fetchedAt } });
              existing.spend = spend;
              existing.isFinal = isFinal;
              existing.fetchedAt = fetchedAt;
            } else {
              writes.push({
                kind: "create",
                data: { client: clientId, keyword: text, matchType, yearMonth: month, spend, isFinal, fetchedAt },
              });
              cache.set(cacheKey, {
                id: -1,
                client: clientId,
                keyword: text,
                matchType,
                yearMonth: month,
                spend,
                isFinal,
                fetchedAt,
              });
            }
          }
        }

        const CONCURRENCY = 16;
        for (let i = 0; i < writes.length; i += CONCURRENCY) {
          const batch = writes.slice(i, i + CONCURRENCY);
          await Promise.all(
            batch.map(async (w) => {
              try {
                if (w.kind === "update") {
                  await payload.update({
                    collection: "negative-keyword-avoided-spend-cache",
                    id: w.id,
                    data: w.data,
                    overrideAccess: true,
                  });
                } else {
                  await payload.create({
                    collection: "negative-keyword-avoided-spend-cache",
                    data: w.data,
                    overrideAccess: true,
                  });
                }
              } catch (err) {
                payload.logger?.warn?.(`[avoided-spend] cache upsert failed: ${err}`);
              }
            }),
          );
        }
      } else {
        const text = await res.text().catch(() => "");
        payload.logger?.warn?.(`[avoided-spend] Growth Tools ${res.status}: ${text}`);
        return {
          misses,
          durationMs: Date.now() - startedAt,
          error: `Growth Tools ${res.status}`,
          cache,
          deduped,
          months,
          monthsBack,
          currentMonth,
        };
      }
    } catch (err) {
      payload.logger?.warn?.(`[avoided-spend] Growth Tools fetch failed: ${err}`);
      return {
        misses,
        durationMs: Date.now() - startedAt,
        error: String(err),
        cache,
        deduped,
        months,
        monthsBack,
        currentMonth,
      };
    }
  }

  return {
    misses,
    durationMs: Date.now() - startedAt,
    cache,
    deduped,
    months,
    monthsBack,
    currentMonth,
  };
}

/**
 * Build the API response shape from a populated cache map.
 * The cache map and deduped keyword list come straight from
 * `warmAvoidedSpendForClient` so the read-through and warming
 * paths produce identical responses.
 */
export function buildAvoidedSpendResponse(
  result: WarmAvoidedSpendResult,
): GoogleAdsDashboardAvoidedSpend {
  const { cache, deduped, months, monthsBack } = result;

  if (deduped.length === 0) {
    return {
      monthsBack,
      months,
      perKeyword: [],
      totals: Object.fromEntries(months.map((m) => [m, 0])),
      cumulativeAvoided: 0,
      keywordCount: 0,
    };
  }

  const dedupedKeySet = new Set(
    deduped.map((k) => `${k.keyword.toLowerCase()}|${k.matchType}`),
  );

  const perKeywordMap = new Map<
    string,
    {
      text: string;
      matchType: MatchType;
      negatedSince: string;
      monthlySpend: Record<string, number>;
    }
  >();
  for (const k of deduped) {
    perKeywordMap.set(`${k.keyword.toLowerCase()}|${k.matchType}`, {
      text: k.keyword,
      matchType: k.matchType,
      negatedSince: k.negatedAt,
      monthlySpend: Object.fromEntries(months.map((m) => [m, 0])),
    });
  }

  const totals: Record<string, number> = Object.fromEntries(months.map((m) => [m, 0]));

  for (const row of cache.values()) {
    const key = `${row.keyword.toLowerCase()}|${row.matchType}`;
    if (!dedupedKeySet.has(key)) continue;
    if (!months.includes(row.yearMonth)) continue;
    const entry = perKeywordMap.get(key);
    if (!entry) continue;
    const spend = Number(row.spend) || 0;
    entry.monthlySpend[row.yearMonth] = spend;
    totals[row.yearMonth] = (totals[row.yearMonth] || 0) + spend;
  }

  const cumulativeAvoided = Object.values(totals).reduce((a, b) => a + b, 0);

  return {
    monthsBack,
    months,
    perKeyword: Array.from(perKeywordMap.values()),
    totals,
    cumulativeAvoided,
    keywordCount: deduped.length,
  };
}
