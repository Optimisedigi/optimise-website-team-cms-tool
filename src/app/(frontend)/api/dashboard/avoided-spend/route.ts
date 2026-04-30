import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { validateDashboardToken } from "../verify/route";
import type { GoogleAdsDashboardAvoidedSpend } from "@/lib/dashboard-types";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const GROWTH_TOOLS_API_KEY = process.env.INTERNAL_API_KEY;

const CURRENT_MONTH_TTL_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_MONTHS_BACK = 12;

type MatchType = "EXACT" | "PHRASE" | "BROAD";

const MATCH_TYPE_PRIORITY: Record<MatchType, number> = {
  EXACT: 0,
  PHRASE: 1,
  BROAD: 2,
};

interface CacheRow {
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
function buildMonthList(monthsBack: number): string[] {
  const months: string[] = [];
  const now = new Date();
  // Anchor on the 1st of each month to avoid timezone-edge issues.
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    months.push(`${yyyy}-${mm}`);
  }
  return months;
}

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Pull the dedup-priority match type for a given keyword text. When a client
 * has multiple negatives for the same query (e.g. EXACT "free brand" and
 * PHRASE "free brand x"), we credit only the most specific match type so
 * the dashboard total isn't double-counted.
 *
 * Decision: EXACT > PHRASE > BROAD.
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
    // Keep the higher-priority (lower number) match type.
    if (MATCH_TYPE_PRIORITY[kw.matchType] < MATCH_TYPE_PRIORITY[existing.matchType]) {
      byText.set(key, kw);
    }
  }
  return Array.from(byText.values());
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  const clientIdParam = req.nextUrl.searchParams.get("clientId");
  const customerId = req.nextUrl.searchParams.get("customerId") || "";
  const monthsBack = Math.min(
    36,
    Math.max(1, parseInt(req.nextUrl.searchParams.get("monthsBack") || String(DEFAULT_MONTHS_BACK), 10) || DEFAULT_MONTHS_BACK),
  );

  if (!slug || !clientIdParam) {
    return NextResponse.json({ error: "Missing slug or clientId" }, { status: 400 });
  }

  const token = req.cookies.get("dashboard_token")?.value;
  if (!validateDashboardToken(token, slug)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = parseInt(clientIdParam, 10);
  if (Number.isNaN(clientId)) {
    return NextResponse.json({ error: "Invalid clientId" }, { status: 400 });
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

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
        // Per-keyword negated_at takes priority; fall back to list createdAt
        // for legacy entries that haven't been backfilled yet.
        negatedAt: kw.negatedAt || listCreatedAt,
      });
    }
  }

  const deduped = dedupKeywords(allKeywords);
  const months = buildMonthList(monthsBack);
  const currentMonth = currentYearMonth();

  const emptyResponse: GoogleAdsDashboardAvoidedSpend = {
    monthsBack,
    months,
    perKeyword: [],
    totals: Object.fromEntries(months.map((m) => [m, 0])),
    cumulativeAvoided: 0,
    keywordCount: deduped.length,
  };

  if (deduped.length === 0) {
    return NextResponse.json(emptyResponse);
  }

  // 2. Read existing cache rows.
  const cacheResult = await payload.find({
    collection: "negative-keyword-avoided-spend-cache",
    where: { client: { equals: clientId } },
    limit: 10000,
    depth: 0,
    overrideAccess: true,
  });

  const cache = new Map<string, CacheRow>();
  for (const row of cacheResult.docs as unknown as CacheRow[]) {
    const key = `${row.keyword.toLowerCase()}|${row.matchType}|${row.yearMonth}`;
    cache.set(key, row);
  }

  // 3. Compute the misses (need fetch / refresh).
  const now = Date.now();
  const missesByKeyword = new Map<string, { kw: NklKeyword; months: Set<string> }>();
  let allMissesAreCurrentMonth = true;

  for (const kw of deduped) {
    for (const m of months) {
      // If the month is entirely before the keyword was negated, skip — we
      // don't credit pre-negation spend. Compare YYYY-MM against the
      // negation month so partial months at boundary behave conservatively.
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
      // Past months with rows are immutable — never refetch.
    }
  }

  // 4. If any misses, batch into a single Growth Tools call.
  if (missesByKeyword.size > 0 && GROWTH_TOOLS_URL && GROWTH_TOOLS_API_KEY && customerId) {
    const cleanCustomerId = customerId.replace(/-/g, "");
    const requestKeywords = Array.from(missesByKeyword.values()).map((m) => ({
      text: m.kw.keyword,
      matchType: m.kw.matchType,
      negatedSince: m.kw.negatedAt,
    }));

    // If every miss is a current-month refresh, narrow the request so
    // Growth Tools doesn't redo immutable past-month GAQL queries.
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
        for (const kwResp of perKw) {
          const text = String(kwResp.text || "").trim();
          const matchType = String(kwResp.matchType || "").toUpperCase() as MatchType;
          const monthly = kwResp.monthlySpend || {};
          for (const [month, value] of Object.entries(monthly)) {
            const spend = Number(value) || 0;
            const isFinal = month < currentMonth;
            const cacheKey = `${text.toLowerCase()}|${matchType}|${month}`;
            const existing = cache.get(cacheKey);
            try {
              if (existing) {
                await payload.update({
                  collection: "negative-keyword-avoided-spend-cache",
                  id: existing.id,
                  data: {
                    spend,
                    isFinal,
                    fetchedAt,
                  },
                  overrideAccess: true,
                });
              } else {
                await payload.create({
                  collection: "negative-keyword-avoided-spend-cache",
                  data: {
                    client: clientId,
                    keyword: text,
                    matchType,
                    yearMonth: month,
                    spend,
                    isFinal,
                    fetchedAt,
                  },
                  overrideAccess: true,
                });
              }
            } catch (err) {
              payload.logger?.warn?.(`[avoided-spend] cache upsert failed for ${text}/${matchType}/${month}: ${err}`);
            }
          }
        }
      } else {
        const text = await res.text().catch(() => "");
        payload.logger?.warn?.(`[avoided-spend] Growth Tools ${res.status}: ${text}`);
      }
    } catch (err) {
      payload.logger?.warn?.(`[avoided-spend] Growth Tools fetch failed: ${err}`);
    }
  }

  // 5. Re-read the full cache and aggregate.
  const finalCache = await payload.find({
    collection: "negative-keyword-avoided-spend-cache",
    where: { client: { equals: clientId } },
    limit: 10000,
    depth: 0,
    overrideAccess: true,
  });

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

  for (const row of finalCache.docs as unknown as CacheRow[]) {
    const key = `${row.keyword.toLowerCase()}|${row.matchType}`;
    if (!dedupedKeySet.has(key)) continue; // dropped/replaced keyword
    if (!months.includes(row.yearMonth)) continue;
    const entry = perKeywordMap.get(key);
    if (!entry) continue;
    const spend = Number(row.spend) || 0;
    entry.monthlySpend[row.yearMonth] = spend;
    totals[row.yearMonth] = (totals[row.yearMonth] || 0) + spend;
  }

  const cumulativeAvoided = Object.values(totals).reduce((a, b) => a + b, 0);

  const response: GoogleAdsDashboardAvoidedSpend = {
    monthsBack,
    months,
    perKeyword: Array.from(perKeywordMap.values()),
    totals,
    cumulativeAvoided,
    keywordCount: deduped.length,
  };

  const out = NextResponse.json(response);
  out.headers.set("Cache-Control", "no-store");
  return out;
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
