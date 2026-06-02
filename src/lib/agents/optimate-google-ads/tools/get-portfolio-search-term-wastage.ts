import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { customRangeForGrowthTools, resolveRangeWithSegment } from "./_date-range";
import { growthToolsGet } from "./_growth-tools";
import { customerKey, loadPortfolioAccounts, type PortfolioAccount } from "./_portfolio-accounts";

interface SearchTermWastageArgs {
  accountRefs?: Array<string | number>;
  range?: string;
  minSpend?: number;
  limitPerAccount?: number;
  totalLimit?: number;
}

interface SearchTermRaw {
  searchTerm?: string;
  query?: string;
  campaignName?: string;
  cost?: number;
  spend?: number;
  clicks?: number;
  impressions?: number;
  conversions?: number;
}

interface SearchTermsEnvelope {
  searchTerms?: SearchTermRaw[];
  terms?: SearchTermRaw[];
}

const MAX_ACCOUNTS = 5;
const MAX_PER_ACCOUNT = 10;
const MAX_TOTAL = 50;

export const getPortfolioSearchTermWastage: CanonicalTool<SearchTermWastageArgs> = {
  name: "get_portfolio_search_term_wastage",
  description:
    "Read-only compact cross-account search-term wastage. Args: accountRefs (inventory refs), range (default LAST_30_DAYS), minSpend (default 10), limitPerAccount (default 5, max 10), totalLimit (default 25, max 50). Returns zero-conversion spend totals, top waste terms, pattern summaries, candidate counts, and partial failures. Never proposes negatives.",
  inputSchema: {
    type: "object",
    properties: {
      accountRefs: { type: "array", items: { anyOf: [{ type: "string" }, { type: "number" }] } },
      range: { type: "string" },
      minSpend: { type: "number", minimum: 0 },
      limitPerAccount: { type: "integer", minimum: 1, maximum: MAX_PER_ACCOUNT },
      totalLimit: { type: "integer", minimum: 1, maximum: MAX_TOTAL },
    },
    additionalProperties: false,
  },
  validate: (raw) => {
    const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const out: SearchTermWastageArgs = {};
    if (Array.isArray(obj.accountRefs)) out.accountRefs = obj.accountRefs.filter((v) => typeof v === "string" || typeof v === "number");
    if (typeof obj.range === "string" && obj.range.trim()) out.range = obj.range.trim();
    if (obj.minSpend !== undefined) {
      const n = Number(obj.minSpend);
      if (!Number.isFinite(n) || n < 0) throw new Error("minSpend must be >= 0");
      out.minSpend = n;
    }
    if (obj.limitPerAccount !== undefined) {
      const n = Number(obj.limitPerAccount);
      if (!Number.isFinite(n) || n < 1) throw new Error("limitPerAccount must be >= 1");
      out.limitPerAccount = Math.min(MAX_PER_ACCOUNT, Math.floor(n));
    }
    if (obj.totalLimit !== undefined) {
      const n = Number(obj.totalLimit);
      if (!Number.isFinite(n) || n < 1) throw new Error("totalLimit must be >= 1");
      out.totalLimit = Math.min(MAX_TOTAL, Math.floor(n));
    }
    return out;
  },
  execute: async (args) => {
    const allAccounts = await loadPortfolioAccounts();
    const accounts = selectAccounts(allAccounts, args.accountRefs).slice(0, MAX_ACCOUNTS);
    const resolved = resolveRangeWithSegment(args.range ?? "LAST_30_DAYS", undefined);
    const dateRangeParam = customRangeForGrowthTools(resolved);
    const minSpend = args.minSpend ?? 10;
    const limitPerAccount = args.limitPerAccount ?? 5;
    const totalLimit = args.totalLimit ?? 25;
    const results = await mapWithConcurrency(accounts, 3, (account) => fetchWaste(account, dateRangeParam, minSpend, limitPerAccount));
    const topTerms = results.flatMap((result) => result.topTerms ?? []).sort((a, b) => b.spend - a.spend).slice(0, totalLimit);
    const totalZeroConversionSpend = round2(results.reduce((sum, result) => sum + (result.zeroConversionSpend ?? 0), 0));
    return {
      ok: true,
      data: {
        rangeLabel: resolved.label,
        analysedCount: accounts.length,
        cappedAccounts: accounts.length < matchingAccounts(allAccounts, args.accountRefs).length,
        minSpend,
        totalZeroConversionSpend,
        candidateCount: results.reduce((sum, result) => sum + (result.candidateCount ?? 0), 0),
        accounts: results,
        topTerms,
      },
    };
  },
};

function selectAccounts(accounts: PortfolioAccount[], refs: Array<string | number> | undefined): PortfolioAccount[] {
  return matchingAccounts(accounts, refs).sort((a, b) => (b.monthlySpend ?? 0) - (a.monthlySpend ?? 0) || a.displayName.localeCompare(b.displayName));
}

function matchingAccounts(accounts: PortfolioAccount[], refs: Array<string | number> | undefined): PortfolioAccount[] {
  if (!refs || refs.length === 0) return accounts.filter((a) => a.managed);
  const refSet = new Set(refs.map(String));
  return accounts.filter((account) =>
    (account.accountRef !== undefined && refSet.has(String(account.accountRef))) ||
    (account.clientId !== undefined && refSet.has(String(account.clientId))) ||
    refSet.has(customerKey(account.customerId)),
  );
}

async function fetchWaste(account: PortfolioAccount, dateRange: string, minSpend: number, limitPerAccount: number) {
  const qs = new URLSearchParams({ customerId: customerKey(account.customerId), dateRange, limit: "200" });
  const res = await growthToolsGet<SearchTermsEnvelope>(`/api/google-ads/search-terms?${qs.toString()}`, 30_000);
  if (!res.ok) {
    return {
      accountRef: account.accountRef,
      clientId: account.clientId,
      displayName: account.displayName,
      maskedCustomerId: account.maskedCustomerId,
      error: res.error,
    };
  }
  const candidates = (res.data?.searchTerms ?? res.data?.terms ?? [])
    .map((term) => ({
      term: String(term.searchTerm ?? term.query ?? "").trim(),
      campaignName: term.campaignName ?? "",
      spend: round2(Number(term.cost ?? term.spend ?? 0)),
      clicks: Number(term.clicks ?? 0),
      impressions: Number(term.impressions ?? 0),
      conversions: round2(Number(term.conversions ?? 0)),
    }))
    .filter((term) => term.term && term.conversions === 0 && term.spend >= minSpend)
    .sort((a, b) => b.spend - a.spend);
  const zeroConversionSpend = round2(candidates.reduce((sum, term) => sum + term.spend, 0));
  const topTerms = candidates.slice(0, limitPerAccount).map((term) => ({
    accountRef: account.accountRef,
    displayName: account.displayName,
    maskedCustomerId: account.maskedCustomerId,
    ...term,
  }));
  return {
    accountRef: account.accountRef,
    clientId: account.clientId,
    displayName: account.displayName,
    maskedCustomerId: account.maskedCustomerId,
    zeroConversionSpend,
    candidateCount: candidates.length,
    topPatterns: buildPatterns(candidates),
    topTerms,
  };
}

function buildPatterns(candidates: Array<{ term: string; spend: number }>): Array<{ pattern: string; spend: number; count: number }> {
  const buckets = new Map<string, { spend: number; count: number }>();
  for (const candidate of candidates) {
    for (const token of candidate.term.toLowerCase().split(/\s+/).filter((part) => part.length >= 4)) {
      const current = buckets.get(token) ?? { spend: 0, count: 0 };
      current.spend += candidate.spend;
      current.count += 1;
      buckets.set(token, current);
    }
  }
  return Array.from(buckets.entries())
    .map(([pattern, value]) => ({ pattern, spend: round2(value.spend), count: value.count }))
    .filter((row) => row.count > 1)
    .sort((a, b) => b.spend - a.spend || b.count - a.count || a.pattern.localeCompare(b.pattern))
    .slice(0, 5);
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  async function worker(): Promise<void> {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      if (current !== undefined) results.push(await fn(current));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
