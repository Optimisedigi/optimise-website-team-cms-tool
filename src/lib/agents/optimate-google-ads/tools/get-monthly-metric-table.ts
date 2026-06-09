import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import {
  computeMetric,
  formatMetric,
  metricHeader,
  WEEKLY_METRIC_KEYS,
  type WeeklyBucketTotals,
  type WeeklyMetricKey,
} from "@/lib/google-ads-weekly-metric-table";
import { ensureCustomerId, growthToolsGet, parseConversionActions } from "./_growth-tools";

export interface MonthlyMetricTableArgs {
  startMonth?: string;
  endMonth?: string;
  metrics: WeeklyMetricKey[];
  conversionActions?: string[];
}

interface MetricRaw {
  cost?: number;
  spend?: number;
  clicks?: number;
  impressions?: number;
  conversions?: number;
  /** Google Ads CTR returned by Growth Tools as a percent, e.g. 1.42. */
  ctr?: number | string | null;
}

interface MetricsEnvelope {
  metrics?: MetricRaw[];
}

interface MonthlyMetricRow {
  month: string;
  label: string;
  startDate: string;
  endDate: string;
  campaignRows: number;
  totals: WeeklyBucketTotals;
  metrics: Record<WeeklyMetricKey, number | null>;
  displayMetrics: Partial<Record<WeeklyMetricKey, string>>;
  validation: {
    ctrFormula: string;
    cpcFormula: string;
    cpaFormula: string;
    convRateFormula: string;
  };
}

const MONTH_RE = /^\d{4}-\d{2}$/;
const MAX_MONTHS = 24;
const MAX_METRICS = 6;

export const getMonthlyMetricTable: CanonicalTool<MonthlyMetricTableArgs> = {
  name: "get_monthly_metric_table",
  description:
    "Canonical account-level monthly Google Ads metric table. Use this whenever the user asks for CTR by month, monthly CTR, month-by-month clicks/impressions/CTR, or any monthly breakdown of spend, clicks, impressions, conversions, CPA, CPC, CTR, or conversion rate for the active audit account. For CTR, uses Google Ads' metrics.ctr values returned by Growth Tools, weighted by impressions across rows. Other derived rates still use summed totals. Returns totals, display values, and validation formulas.",
  inputSchema: {
    type: "object",
    properties: {
      startMonth: { type: "string", description: "First calendar month as YYYY-MM, e.g. 2026-04. Default January of current year." },
      endMonth: { type: "string", description: "Last calendar month as YYYY-MM, e.g. 2026-05. Default current month." },
      metrics: {
        type: "array",
        items: { type: "string", enum: WEEKLY_METRIC_KEYS as unknown as string[] },
        minItems: 1,
        maxItems: MAX_METRICS,
        description: "Required metric columns: spend, clicks, impressions, conversions, cpa, cpc, ctr, conv_rate.",
      },
      conversionActions: {
        type: "array",
        items: { type: "string" },
        description: "Optional exact Google Ads conversion action names. Only affects conversions, CPA, and conversion rate, never clicks, impressions, or CTR.",
      },
    },
    required: ["metrics"],
    additionalProperties: false,
  },
  validate: (raw) => {
    const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const out: MonthlyMetricTableArgs = { metrics: validateMetrics(obj.metrics) };

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
    if (out.startMonth && out.endMonth && out.startMonth > out.endMonth) {
      throw new Error("startMonth must be before or equal to endMonth");
    }
    if (obj.conversionActions !== undefined) {
      if (!Array.isArray(obj.conversionActions)) throw new Error("conversionActions must be an array of strings");
      out.conversionActions = parseConversionActions(obj.conversionActions);
    }
    return out;
  },
  execute: async (args, ctx) => {
    let customerId: string;
    try {
      customerId = ensureCustomerId(ctx.context.customerId);
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    const months = monthSpan(args.startMonth ?? defaultStartMonth(), args.endMonth ?? defaultEndMonth());
    const conversionActions = (args.conversionActions?.length ? args.conversionActions : parseConversionActions(ctx.context.conversionActions)).join(",");
    const rows: MonthlyMetricRow[] = [];

    for (const month of months) {
      const fetched = await fetchMonthTotals(customerId, month, conversionActions);
      if (!fetched.ok) return { ok: false, error: fetched.error };
      if (args.metrics.includes("ctr") && typeof fetched.totals.googleCtr !== "number") {
        return {
          ok: false,
          error:
            "Growth Tools did not return Google Ads CTR for this monthly request. Update /api/google-ads/campaign-budgets/get-metrics to include metrics.ctr before answering CTR-only-from-Google requests.",
        };
      }
      rows.push(buildRow(month, fetched.totals, fetched.campaignRows, args.metrics));
    }

    return {
      ok: true,
      data: {
        source: "Growth Tools /api/google-ads/campaign-budgets/get-metrics, one request per calendar month",
        derivationRule: "CTR uses Google Ads metrics.ctr returned by Growth Tools, weighted by impressions when multiple rows exist. Other rates are recomputed from summed account totals. Never average campaign CTRs.",
        conversionActionsApplied: conversionActions || null,
        metrics: args.metrics,
        startMonth: months[0] ?? null,
        endMonth: months[months.length - 1] ?? null,
        rows,
        markdownTable: renderMarkdown(rows, args.metrics),
      },
    };
  },
};

function validateMetrics(value: unknown): WeeklyMetricKey[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`metrics is required and must include one or more of: ${WEEKLY_METRIC_KEYS.join(", ")}`);
  }
  const seen = new Set<WeeklyMetricKey>();
  const metrics: WeeklyMetricKey[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !(WEEKLY_METRIC_KEYS as readonly string[]).includes(item)) {
      throw new Error(`Unknown metric "${String(item)}". Valid: ${WEEKLY_METRIC_KEYS.join(", ")}`);
    }
    const metric = item as WeeklyMetricKey;
    if (!seen.has(metric)) {
      seen.add(metric);
      metrics.push(metric);
    }
  }
  if (metrics.length > MAX_METRICS) throw new Error(`metrics may not exceed ${MAX_METRICS} entries`);
  return metrics;
}

async function fetchMonthTotals(
  customerId: string,
  month: string,
  conversionActions: string,
): Promise<{ ok: true; totals: WeeklyBucketTotals; campaignRows: number } | { ok: false; error: string }> {
  const qs = new URLSearchParams({ customerId, dateRange: `${month}-01,${lastDayOfMonth(month)}` });
  if (conversionActions) qs.set("conversionActions", conversionActions);
  const res = await growthToolsGet<MetricsEnvelope>(`/api/google-ads/campaign-budgets/get-metrics?${qs.toString()}`);
  if (!res.ok) return { ok: false, error: res.error ?? "Growth Tools call failed" };
  const totals: WeeklyBucketTotals = { spend: 0, clicks: 0, impressions: 0, conversions: 0 };
  const rows = res.data?.metrics ?? [];
  for (const row of rows) {
    totals.spend += Number(row.cost ?? row.spend ?? 0);
    totals.clicks += Number(row.clicks ?? 0);
    totals.impressions += Number(row.impressions ?? 0);
    totals.conversions += Number(row.conversions ?? 0);
  }
  const googleCtr = weightedGoogleCtr(rows);
  if (typeof googleCtr === "number") totals.googleCtr = googleCtr;
  return { ok: true, totals, campaignRows: rows.length };
}

function weightedGoogleCtr(rows: MetricRaw[]): number | null {
  let numerator = 0;
  let denominator = 0;
  for (const row of rows) {
    const impressions = Number(row.impressions ?? 0);
    if (impressions <= 0) continue;
    const ctr = parseGoogleCtrPercent(row.ctr);
    if (ctr === null) return null;
    numerator += ctr * impressions;
    denominator += impressions;
  }
  return denominator > 0 ? numerator / denominator : null;
}

function parseGoogleCtrPercent(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    return value;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed.replace(/[%<>,\s]/g, ""));
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return numeric;
}

function buildRow(
  month: string,
  totals: WeeklyBucketTotals,
  campaignRows: number,
  requestedMetrics: WeeklyMetricKey[],
): MonthlyMetricRow {
  const metrics = Object.fromEntries(
    WEEKLY_METRIC_KEYS.map((metric) => [metric, roundMetric(metric, computeMetric(metric, totals))]),
  ) as Record<WeeklyMetricKey, number | null>;
  const displayMetrics = Object.fromEntries(
    requestedMetrics.map((metric) => [metric, formatMetric(metric, metrics[metric])]),
  ) as Partial<Record<WeeklyMetricKey, string>>;
  return {
    month,
    label: monthLabel(month),
    startDate: `${month}-01`,
    endDate: lastDayOfMonth(month),
    campaignRows,
    totals,
    metrics,
    displayMetrics,
    validation: {
      ctrFormula: typeof totals.googleCtr === "number" ? `Google Ads metrics.ctr weighted by ${totals.impressions} impressions = ${formatMetric("ctr", metrics.ctr)}` : "Google Ads CTR unavailable",
      cpcFormula: totals.clicks > 0 ? `${formatMoney(totals.spend)} / ${totals.clicks} = ${formatMetric("cpc", metrics.cpc)}` : "No clicks, CPC unavailable",
      cpaFormula: totals.conversions > 0 ? `${formatMoney(totals.spend)} / ${round2(totals.conversions)} = ${formatMetric("cpa", metrics.cpa)}` : "No conversions, CPA unavailable",
      convRateFormula: totals.clicks > 0 ? `${round2(totals.conversions)} / ${totals.clicks} * 100 = ${formatMetric("conv_rate", metrics.conv_rate)}` : "No clicks, conversion rate unavailable",
    },
  };
}

function renderMarkdown(rows: MonthlyMetricRow[], metrics: WeeklyMetricKey[]): string {
  const headers = ["Month", ...metrics.map(metricHeader)];
  const lines = [headers.join(" | "), headers.map(() => "---").join(" | ")];
  for (const row of rows) {
    lines.push([row.label, ...metrics.map((metric) => row.displayMetrics[metric] ?? "-")].join(" | "));
  }
  return lines.join("\n");
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
    if (months.length >= MAX_MONTHS) break;
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

function monthLabel(month: string): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  return date.toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });
}

function roundMetric(metric: WeeklyMetricKey, value: number | null): number | null {
  if (value === null) return null;
  if (metric === "spend" || metric === "conversions" || metric === "cpc" || metric === "ctr" || metric === "conv_rate") {
    return round2(value);
  }
  if (metric === "cpa") return Math.round(value);
  return Math.round(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatMoney(value: number): string {
  return `$${round2(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
