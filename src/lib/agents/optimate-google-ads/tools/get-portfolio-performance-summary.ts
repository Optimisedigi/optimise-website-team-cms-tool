import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { customRangeForGrowthTools, resolveRangeWithSegment } from "./_date-range";
import { growthToolsGet } from "./_growth-tools";
import { customerKey, loadPortfolioAccounts, type PortfolioAccount } from "./_portfolio-accounts";

interface PerformanceSummaryArgs {
  accountRefs?: Array<string | number>;
  range?: string;
  sortBy?: "spend" | "conversions" | "cpa" | "name";
  limit?: number;
}

interface MetricRaw {
  campaignId?: string;
  campaignName?: string;
  status?: string;
  cost?: number;
  spend?: number;
  impressions?: number;
  clicks?: number;
  conversions?: number;
}

interface MetricsEnvelope {
  metrics?: MetricRaw[];
}

const MAX_ACCOUNTS = 10;

export const getPortfolioPerformanceSummary: CanonicalTool<PerformanceSummaryArgs> = {
  name: "get_portfolio_performance_summary",
  description:
    "Read-only compact portfolio performance summary. Args: accountRefs (audit ids/client refs from inventory), range (default LAST_30_DAYS), sortBy ('spend'|'conversions'|'cpa'|'name', default spend), limit (max 10). Returns account-level totals only plus partial failures. Does not expose raw customer ids.",
  inputSchema: {
    type: "object",
    properties: {
      accountRefs: { type: "array", items: { anyOf: [{ type: "string" }, { type: "number" }] } },
      range: { type: "string" },
      sortBy: { type: "string", enum: ["spend", "conversions", "cpa", "name"] },
      limit: { type: "integer", minimum: 1, maximum: MAX_ACCOUNTS },
    },
    additionalProperties: false,
  },
  validate: (raw) => {
    const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const out: PerformanceSummaryArgs = {};
    if (Array.isArray(obj.accountRefs)) out.accountRefs = obj.accountRefs.filter((v) => typeof v === "string" || typeof v === "number");
    if (typeof obj.range === "string" && obj.range.trim()) out.range = obj.range.trim();
    if (obj.sortBy !== undefined) {
      const sortBy = String(obj.sortBy).toLowerCase();
      if (sortBy !== "spend" && sortBy !== "conversions" && sortBy !== "cpa" && sortBy !== "name") {
        throw new Error("sortBy must be spend, conversions, cpa, or name");
      }
      out.sortBy = sortBy as PerformanceSummaryArgs["sortBy"];
    }
    if (obj.limit !== undefined) {
      const n = Number(obj.limit);
      if (!Number.isFinite(n) || n < 1) throw new Error("limit must be >= 1");
      out.limit = Math.min(MAX_ACCOUNTS, Math.floor(n));
    }
    return out;
  },
  execute: async (args) => {
    const allAccounts = await loadPortfolioAccounts();
    const selected = selectAccounts(allAccounts, args.accountRefs, args.limit ?? 5);
    const resolved = resolveRangeWithSegment(args.range ?? "LAST_30_DAYS", undefined);
    const dateRangeParam = customRangeForGrowthTools(resolved);
    const rows = await mapWithConcurrency(selected, 4, async (account) => fetchAccountSummary(account, dateRangeParam));
    const sortBy = args.sortBy ?? "spend";
    rows.sort((a, b) => {
      if (sortBy === "name") return a.displayName.localeCompare(b.displayName);
      const av = typeof a[sortBy] === "number" ? a[sortBy] : -1;
      const bv = typeof b[sortBy] === "number" ? b[sortBy] : -1;
      return bv - av || a.displayName.localeCompare(b.displayName);
    });
    return {
      ok: true,
      data: {
        rangeLabel: resolved.label,
        analysedCount: selected.length,
        capped: selected.length < accountsMatchingRefs(allAccounts, args.accountRefs).length,
        conversionScopeNote: "Portfolio summary uses Growth Tools default conversion scope for each account unless the upstream account has saved conversion settings.",
        accounts: rows,
      },
    };
  },
};

function selectAccounts(accounts: PortfolioAccount[], refs: Array<string | number> | undefined, limit: number): PortfolioAccount[] {
  const candidates = accountsMatchingRefs(accounts, refs);
  return candidates.slice(0, Math.min(limit, MAX_ACCOUNTS));
}

function accountsMatchingRefs(accounts: PortfolioAccount[], refs: Array<string | number> | undefined): PortfolioAccount[] {
  if (!refs || refs.length === 0) return accounts.filter((a) => a.managed).sort((a, b) => (b.monthlySpend ?? 0) - (a.monthlySpend ?? 0) || a.displayName.localeCompare(b.displayName));
  const refSet = new Set(refs.map(String));
  return accounts.filter((account) =>
    (account.accountRef !== undefined && refSet.has(String(account.accountRef))) ||
    (account.clientId !== undefined && refSet.has(String(account.clientId))) ||
    refSet.has(customerKey(account.customerId)),
  );
}

async function fetchAccountSummary(account: PortfolioAccount, dateRange: string) {
  const qs = new URLSearchParams({ customerId: customerKey(account.customerId), dateRange });
  const res = await growthToolsGet<MetricsEnvelope>(`/api/google-ads/campaign-budgets/get-metrics?${qs.toString()}`, 30_000);
  if (!res.ok) {
    return {
      accountRef: account.accountRef,
      clientId: account.clientId,
      displayName: account.displayName,
      maskedCustomerId: account.maskedCustomerId,
      error: res.error,
    };
  }
  const metrics = res.data?.metrics ?? [];
  const totals = metrics.reduce<{
    spend: number;
    conversions: number;
    clicks: number;
    impressions: number;
    activeCampaigns: number;
  }>(
    (acc, row) => {
      const spend = Number(row.cost ?? row.spend ?? 0);
      const conversions = Number(row.conversions ?? 0);
      acc.spend += Number.isFinite(spend) ? spend : 0;
      acc.conversions += Number.isFinite(conversions) ? conversions : 0;
      acc.clicks += Number(row.clicks ?? 0);
      acc.impressions += Number(row.impressions ?? 0);
      if (String(row.status ?? "").toUpperCase() === "ENABLED") acc.activeCampaigns += 1;
      return acc;
    },
    { spend: 0, conversions: 0, clicks: 0, impressions: 0, activeCampaigns: 0 },
  );
  return {
    accountRef: account.accountRef,
    clientId: account.clientId,
    displayName: account.displayName,
    maskedCustomerId: account.maskedCustomerId,
    spend: round2(totals.spend),
    conversions: round2(totals.conversions),
    cpa: totals.conversions > 0 ? round2(totals.spend / totals.conversions) : null,
    clicks: totals.clicks,
    impressions: totals.impressions,
    activeCampaigns: totals.activeCampaigns,
  };
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
