import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { growthToolsGet } from "./_growth-tools";
import { customerKey, loadPortfolioAccounts, type PortfolioAccount } from "./_portfolio-accounts";

interface PortfolioMonthlyPerformanceBreakdownArgs {
  accountRefs?: Array<string | number>;
  startMonth?: string;
  endMonth?: string;
}

interface MetricRaw {
  cost?: number;
  spend?: number;
  clicks?: number;
  impressions?: number;
  conversions?: number;
  conversionsByAction?: Record<string, number>;
  conversionsByCategory?: Record<string, number>;
}

interface MetricsEnvelope {
  metrics?: MetricRaw[];
}

const MAX_ACCOUNTS = 10;
const MONTH_RE = /^\d{4}-\d{2}$/;

export const getPortfolioMonthlyPerformanceBreakdown: CanonicalTool<PortfolioMonthlyPerformanceBreakdownArgs> = {
  name: "get_portfolio_monthly_performance_breakdown",
  description:
    "Selected-account monthly Google Ads performance, run one account at a time and labelled per account so numbers are not mixed. Use when portfolio/selected-account chat or voice asks for January-May, month-by-month, monthly breakdowns, or lead-type/conversion-action monthly tables across selected accounts. Args: accountRefs (server-injected for voice; optional in text), startMonth YYYY-MM default Jan of current year, endMonth YYYY-MM default current month. Returns monthly totals plus conversionsByAction/conversionsByCategory when Growth Tools provides them.",
  inputSchema: {
    type: "object",
    properties: {
      accountRefs: { type: "array", items: { anyOf: [{ type: "string" }, { type: "number" }] } },
      startMonth: { type: "string", description: "YYYY-MM, e.g. 2026-01." },
      endMonth: { type: "string", description: "YYYY-MM, e.g. 2026-05." },
    },
    additionalProperties: false,
  },
  validate: (raw) => {
    const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const out: PortfolioMonthlyPerformanceBreakdownArgs = {};
    if (Array.isArray(obj.accountRefs)) out.accountRefs = obj.accountRefs.filter((v) => typeof v === "string" || typeof v === "number");
    if (obj.startMonth !== undefined && obj.startMonth !== null && String(obj.startMonth).trim()) {
      const startMonth = String(obj.startMonth).trim();
      if (!MONTH_RE.test(startMonth)) throw new Error("startMonth must be YYYY-MM");
      out.startMonth = startMonth;
    }
    if (obj.endMonth !== undefined && obj.endMonth !== null && String(obj.endMonth).trim()) {
      const endMonth = String(obj.endMonth).trim();
      if (!MONTH_RE.test(endMonth)) throw new Error("endMonth must be YYYY-MM");
      out.endMonth = endMonth;
    }
    if (out.startMonth && out.endMonth && out.startMonth > out.endMonth) throw new Error("startMonth must be before or equal to endMonth");
    return out;
  },
  execute: async (args, ctx) => {
    const refs = args.accountRefs?.length ? args.accountRefs : Array.isArray(ctx.context.selectedAccountRefs) ? (ctx.context.selectedAccountRefs as Array<string | number>) : undefined;
    const accounts = selectAccounts(await loadPortfolioAccounts(), refs);
    const months = monthSpan(args.startMonth ?? defaultStartMonth(), args.endMonth ?? defaultEndMonth());
    const results = [];
    for (const account of accounts) {
      const rows = [];
      for (const month of months) {
        const totals = await fetchMonthTotals(account, month);
        if (!totals.ok) {
          rows.push({ month, error: totals.error });
          continue;
        }
        rows.push({ month, ...deriveMetrics(totals.totals), conversionsByAction: totals.conversionsByAction, conversionsByCategory: totals.conversionsByCategory });
      }
      results.push({ accountRef: account.accountRef, clientId: account.clientId, displayName: account.displayName, maskedCustomerId: account.maskedCustomerId, months: rows });
    }
    return { ok: true, data: { analysedCount: accounts.length, startMonth: months[0] ?? null, endMonth: months[months.length - 1] ?? null, accounts: results } };
  },
};

function selectAccounts(accounts: PortfolioAccount[], refs: Array<string | number> | undefined): PortfolioAccount[] {
  if (!refs || refs.length === 0) return accounts.filter((account) => account.managed).slice(0, MAX_ACCOUNTS);
  const refSet = new Set(refs.map(String));
  return accounts.filter((account) => (account.accountRef !== undefined && refSet.has(String(account.accountRef))) || (account.clientId !== undefined && refSet.has(String(account.clientId))) || refSet.has(customerKey(account.customerId))).slice(0, MAX_ACCOUNTS);
}

async function fetchMonthTotals(account: PortfolioAccount, month: string): Promise<{ ok: true; totals: { spend: number; clicks: number; impressions: number; conversions: number }; conversionsByAction: Record<string, number>; conversionsByCategory: Record<string, number> } | { ok: false; error: string }> {
  const qs = new URLSearchParams({ customerId: customerKey(account.customerId), dateRange: `${month}-01,${lastDayOfMonth(month)}` });
  if (account.conversionActions) qs.set("conversionActions", account.conversionActions);
  if (account.conversionActionCategories) qs.set("conversionActionCategories", account.conversionActionCategories);
  const res = await growthToolsGet<MetricsEnvelope>(`/api/google-ads/campaign-budgets/get-metrics?${qs.toString()}`);
  if (!res.ok) return { ok: false, error: res.error ?? "Growth Tools call failed" };
  const totals = { spend: 0, clicks: 0, impressions: 0, conversions: 0 };
  const conversionsByAction: Record<string, number> = {};
  const conversionsByCategory: Record<string, number> = {};
  for (const row of res.data?.metrics ?? []) {
    totals.spend += Number(row.cost ?? row.spend ?? 0);
    totals.clicks += Number(row.clicks ?? 0);
    totals.impressions += Number(row.impressions ?? 0);
    totals.conversions += Number(row.conversions ?? 0);
    addBreakdown(conversionsByAction, row.conversionsByAction);
    addBreakdown(conversionsByCategory, row.conversionsByCategory);
  }
  return { ok: true, totals, conversionsByAction: roundBreakdown(conversionsByAction), conversionsByCategory: roundBreakdown(conversionsByCategory) };
}

function monthSpan(startMonth: string, endMonth: string): string[] {
  const [startYear, start] = startMonth.split("-").map(Number);
  const [endYear, end] = endMonth.split("-").map(Number);
  if (!startYear || !start || !endYear || !end) return [];
  const months: string[] = [];
  let year = startYear;
  let month = start;
  while (year < endYear || (year === endYear && month <= end)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    if (months.length >= 24) break;
  }
  return months;
}

function lastDayOfMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 1970, monthNumber ?? 1, 0));
  return `${month}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function defaultStartMonth(): string {
  return `${new Date().getUTCFullYear()}-01`;
}

function defaultEndMonth(): string {
  const date = new Date();
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function deriveMetrics(totals: { spend: number; clicks: number; impressions: number; conversions: number }): Record<string, number | null> {
  return {
    spend: round2(totals.spend),
    clicks: totals.clicks,
    impressions: totals.impressions,
    conversions: round2(totals.conversions),
    cpa: totals.conversions > 0 ? round2(totals.spend / totals.conversions) : null,
    cpc: totals.clicks > 0 ? round2(totals.spend / totals.clicks) : null,
    ctr: totals.impressions > 0 ? round2((totals.clicks / totals.impressions) * 100) : null,
    conv_rate: totals.clicks > 0 ? round2((totals.conversions / totals.clicks) * 100) : null,
  };
}

function addBreakdown(target: Record<string, number>, value: Record<string, number> | undefined): void {
  if (!value) return;
  for (const [key, raw] of Object.entries(value)) {
    const n = Number(raw ?? 0);
    if (key.trim() && Number.isFinite(n)) target[key] = (target[key] ?? 0) + n;
  }
}

function roundBreakdown(value: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(value).map(([key, raw]) => [key, round2(raw)]));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
