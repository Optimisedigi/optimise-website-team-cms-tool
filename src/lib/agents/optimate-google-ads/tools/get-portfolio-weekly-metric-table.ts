import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { buildWeeklyBuckets, WEEKLY_METRIC_KEYS, type WeeklyMetricKey } from "@/lib/google-ads-weekly-metric-table";
import { growthToolsGet } from "./_growth-tools";
import { customerKey, loadPortfolioAccounts, mapWithConcurrencyOrdered, PORTFOLIO_FETCH_CONCURRENCY, type PortfolioAccount } from "./_portfolio-accounts";

interface PortfolioWeeklyMetricTableArgs {
  accountRefs?: Array<string | number>;
  weeks?: number;
  endDate?: string;
  metrics: WeeklyMetricKey[];
}

interface MetricRaw {
  cost?: number;
  spend?: number;
  clicks?: number;
  impressions?: number;
  conversions?: number;
}

interface MetricsEnvelope {
  metrics?: MetricRaw[];
}

type PortfolioMetricTotals = {
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
};

type FetchTotalsResult = { ok: true; totals: PortfolioMetricTotals } | { ok: false; error: string };

const MAX_ACCOUNTS = 10;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const getPortfolioWeeklyMetricTable: CanonicalTool<PortfolioWeeklyMetricTableArgs> = {
  name: "get_portfolio_weekly_metric_table",
  description:
    "Selected-account weekly Google Ads performance, run one account at a time and labelled per account so numbers are not mixed. Use when portfolio/selected-account chat or voice asks for weekly, week-by-week, 10-week, or WoW-style performance across selected accounts. Args: accountRefs (server-injected for voice; optional in text), weeks 1..12 default 10, endDate YYYY-MM-DD default today UTC, metrics from spend/clicks/impressions/conversions/cpa/cpc/ctr/conv_rate. Returns weekly rows per account; do not combine account figures unless the user explicitly asks.",
  inputSchema: {
    type: "object",
    properties: {
      accountRefs: { type: "array", items: { anyOf: [{ type: "string" }, { type: "number" }] } },
      weeks: { type: "integer", minimum: 1, maximum: 12 },
      endDate: { type: "string" },
      metrics: { type: "array", items: { type: "string", enum: WEEKLY_METRIC_KEYS as unknown as string[] }, minItems: 1, maxItems: 6 },
    },
    required: ["metrics"],
    additionalProperties: false,
  },
  validate: (raw) => {
    const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    if (!Array.isArray(obj.metrics) || obj.metrics.length === 0) throw new Error(`metrics is required: ${WEEKLY_METRIC_KEYS.join(", ")}`);
    const seen = new Set<WeeklyMetricKey>();
    const metrics: WeeklyMetricKey[] = [];
    for (const value of obj.metrics) {
      if (typeof value !== "string" || !(WEEKLY_METRIC_KEYS as readonly string[]).includes(value)) throw new Error(`Unknown metric ${String(value)}`);
      if (!seen.has(value as WeeklyMetricKey)) {
        seen.add(value as WeeklyMetricKey);
        metrics.push(value as WeeklyMetricKey);
      }
    }
    const out: PortfolioWeeklyMetricTableArgs = { metrics };
    if (Array.isArray(obj.accountRefs)) out.accountRefs = obj.accountRefs.filter((v) => typeof v === "string" || typeof v === "number");
    if (obj.weeks !== undefined) {
      const weeks = Number(obj.weeks);
      if (!Number.isInteger(weeks) || weeks < 1 || weeks > 12) throw new Error("weeks must be between 1 and 12");
      out.weeks = weeks;
    }
    if (obj.endDate !== undefined && obj.endDate !== null && String(obj.endDate).trim()) {
      const endDate = String(obj.endDate).trim();
      if (!ISO_DATE_RE.test(endDate)) throw new Error("endDate must be YYYY-MM-DD");
      out.endDate = endDate;
    }
    return out;
  },
  execute: async (args, ctx) => {
    const refs = args.accountRefs?.length ? args.accountRefs : Array.isArray(ctx.context.selectedAccountRefs) ? (ctx.context.selectedAccountRefs as Array<string | number>) : undefined;
    const accounts = selectAccounts(await loadPortfolioAccounts(), refs);
    const weeks = args.weeks ?? 10;
    const endDate = args.endDate ?? todayUtcIso();
    const buckets = buildWeeklyBuckets({ perDay: [], weeks, endDate });

    // Fetch every (account × week) cell with bounded concurrency instead of a
    // fully serial nested loop. A 3-account × 10-week request was 30 sequential
    // Growth Tools round-trips, which under backend load blew past the route's
    // maxDuration and surfaced as a Vercel 504.
    const tasks = accounts.flatMap((account) =>
      buckets.map((bucket) => ({ customerId: customerKey(account.customerId), weekStart: bucket.weekStart, weekEnd: bucket.weekEnd })),
    );
    const flat = await mapWithConcurrencyOrdered(tasks, PORTFOLIO_FETCH_CONCURRENCY, (task) =>
      fetchTotals(task.customerId, task.weekStart, task.weekEnd),
    );

    const results = accounts.map((account, accountIndex) => {
      const weekResults = buckets.map((_, bucketIndex) => flat[accountIndex * buckets.length + bucketIndex]);
      const firstError = weekResults.find((result) => result && !result.ok);
      if (firstError && !firstError.ok) {
        return accountEnvelope(account, { error: firstError.error });
      }
      return accountEnvelope(account, {
        weeks: buckets.map((bucket, index) => {
          const result = weekResults[index];
          const totals = result?.ok ? result.totals : { spend: 0, clicks: 0, impressions: 0, conversions: 0 };
          return { weekStart: bucket.weekStart, weekEnd: bucket.weekEnd, ...deriveMetrics(totals) };
        }),
      });
    });

    return { ok: true, data: { analysedCount: accounts.length, metrics: args.metrics, weeks, endDate, accounts: results } };
  },
};

function selectAccounts(accounts: PortfolioAccount[], refs: Array<string | number> | undefined): PortfolioAccount[] {
  if (!refs || refs.length === 0) return accounts.filter((account) => account.managed).slice(0, MAX_ACCOUNTS);
  const refSet = new Set(refs.map(String));
  return accounts.filter((account) => (account.accountRef !== undefined && refSet.has(String(account.accountRef))) || (account.clientId !== undefined && refSet.has(String(account.clientId))) || refSet.has(customerKey(account.customerId))).slice(0, MAX_ACCOUNTS);
}

function accountEnvelope(account: PortfolioAccount, data: Record<string, unknown>): Record<string, unknown> {
  return { accountRef: account.accountRef, clientId: account.clientId, displayName: account.displayName, maskedCustomerId: account.maskedCustomerId, ...data };
}

async function fetchTotals(customerId: string, startDate: string, endDate: string): Promise<FetchTotalsResult> {
  const qs = new URLSearchParams({ customerId, dateRange: `${startDate},${endDate}` });
  const res = await growthToolsGet<MetricsEnvelope>(`/api/google-ads/campaign-budgets/get-metrics?${qs.toString()}`, 30_000);
  if (!res.ok) return { ok: false, error: res.error ?? "Growth Tools call failed" };
  const totals = { spend: 0, clicks: 0, impressions: 0, conversions: 0 };
  for (const row of res.data?.metrics ?? []) {
    totals.spend += Number(row.cost ?? row.spend ?? 0);
    totals.clicks += Number(row.clicks ?? 0);
    totals.impressions += Number(row.impressions ?? 0);
    totals.conversions += Number(row.conversions ?? 0);
  }
  return { ok: true, totals };
}

function deriveMetrics(totals: PortfolioMetricTotals): Record<string, number | null> {
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

function todayUtcIso(): string {
  const date = new Date();
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
