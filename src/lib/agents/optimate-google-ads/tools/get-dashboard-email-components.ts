import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import {
  GOOGLE_ADS_EMAIL_COMPONENT_KEYS,
  renderGoogleAdsEmailComponentsHtml,
  type GoogleAdsEmailComponentKey,
  type GoogleAdsEmailComponentsData,
  type GoogleAdsEmailMetricTotals,
} from "@/lib/google-ads-email-components";
import { ensureCustomerId, growthToolsGet, parseConversionActions } from "./_growth-tools";
import { customerKey, loadPortfolioAccounts, type PortfolioAccount } from "./_portfolio-accounts";

export interface DashboardEmailComponentsArgs {
  components: GoogleAdsEmailComponentKey[];
  months?: number;
  range?: string;
  auditId?: number | string;
}

interface MetricRaw {
  campaignName?: string;
  campaign?: string;
  cost?: number;
  spend?: number;
  clicks?: number;
  impressions?: number;
  conversions?: number;
  ctr?: number | string | null;
  searchImpressionShare?: number | string | null;
  searchBudgetLostIS?: number | string | null;
  searchBudgetLostImpressionShare?: number | string | null;
}

interface MetricsEnvelope {
  metrics?: MetricRaw[];
}

interface MetricTotalsAccumulator {
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  ctrNumerator: number;
  ctrDenominator: number;
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

const MAX_MONTHS = 12;
const DEFAULT_MONTHS = 6;
const DEFAULT_RANGE = "LAST_30_DAYS";
const SUPPORTED_COMPONENTS = new Set<GoogleAdsEmailComponentKey>(GOOGLE_ADS_EMAIL_COMPONENT_KEYS);

export const getDashboardEmailComponents: CanonicalTool<DashboardEmailComponentsArgs> = {
  name: "get_dashboard_email_components",
  description:
    "Returns ordered Gmail-safe OptiMate dashboard component HTML for monthly Google Ads budget emails. Use when the user selects monthly email components/chips such as monthly_performance, kpi_summary, top_converters, budget_wasters, campaign_breakdown, lead_quality, or competitor_snapshot. Insert returned html before get_budget_management_email's canonical budget tracker. Missing data returns warnings and never invents metrics.",
  inputSchema: {
    type: "object",
    properties: {
      components: {
        type: "array",
        items: { type: "string", enum: GOOGLE_ADS_EMAIL_COMPONENT_KEYS as unknown as string[] },
        minItems: 1,
        description: "Ordered dashboard component keys to render into Gmail-safe HTML.",
      },
      months: {
        type: "integer",
        minimum: 1,
        maximum: MAX_MONTHS,
        description: "Number of completed calendar months for monthly_performance. Defaults to 6 and is clamped to 1..12.",
      },
      range: {
        type: "string",
        description: "Growth Tools date range for KPI/search-term/campaign blocks. Defaults to LAST_30_DAYS.",
      },
      auditId: {
        type: ["string", "number"],
        description: "Optional audit/account ref for portfolio-mode prompts. Audit-mode chats use context.",
      },
    },
    required: ["components"],
    additionalProperties: false,
  },
  validate(raw) {
    const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    if (!Array.isArray(obj.components) || obj.components.length === 0) {
      throw new Error(`components is required and must include one or more of: ${GOOGLE_ADS_EMAIL_COMPONENT_KEYS.join(", ")}`);
    }

    const components: GoogleAdsEmailComponentKey[] = [];
    const seen = new Set<GoogleAdsEmailComponentKey>();
    for (const item of obj.components) {
      if (typeof item !== "string" || !SUPPORTED_COMPONENTS.has(item as GoogleAdsEmailComponentKey)) {
        throw new Error(`Unknown component "${String(item)}". Valid: ${GOOGLE_ADS_EMAIL_COMPONENT_KEYS.join(", ")}`);
      }
      const key = item as GoogleAdsEmailComponentKey;
      if (!seen.has(key)) {
        seen.add(key);
        components.push(key);
      }
    }

    const out: DashboardEmailComponentsArgs = { components };
    if (obj.months !== undefined && obj.months !== null) {
      const months = Number(obj.months);
      if (!Number.isFinite(months) || months < 1) throw new Error("months must be a positive integer");
      out.months = clamp(Math.floor(months), 1, MAX_MONTHS);
    }
    if (obj.range !== undefined && obj.range !== null && String(obj.range).trim()) {
      out.range = String(obj.range).trim();
    }
    if (obj.auditId !== undefined && obj.auditId !== null && obj.auditId !== "") {
      if (typeof obj.auditId !== "string" && typeof obj.auditId !== "number") throw new Error("auditId must be a string or number when provided");
      out.auditId = obj.auditId;
    }
    return out;
  },
  async execute(args, ctx) {
    const resolvedAccount = await resolveAccountContext(args, ctx.context);
    if (!resolvedAccount.ok) return { ok: false, error: resolvedAccount.error };

    const warnings: string[] = [];
    const data: GoogleAdsEmailComponentsData = { unavailable: {} };
    const range = args.range ?? DEFAULT_RANGE;
    const customerId = resolvedAccount.customerId;
    const conversionActions = resolvedAccount.conversionActions;
    const conversionActionCategories = resolvedAccount.conversionActionCategories;

    if (args.components.includes("monthly_performance")) {
      const monthly = await fetchMonthlyPerformance(customerId, args.months ?? DEFAULT_MONTHS, conversionActions);
      if (monthly.ok) {
        data.monthlyPerformanceRows = monthly.rows;
      } else {
        warnings.push(monthly.error);
        data.unavailable!.monthly_performance = monthly.error;
      }
    }

    const needsMetrics = args.components.some((key) => key === "kpi_summary" || key === "campaign_breakdown" || key === "competitor_snapshot");
    if (needsMetrics) {
      const metrics = await fetchMetrics(customerId, range, conversionActions);
      if (metrics.ok) {
        data.periodLabel = rangeLabel(range);
        const totals = sumMetrics(metrics.rows);
        data.kpiSummary = totals;
        data.campaignBreakdown = aggregateCampaignRows(metrics.rows);
        const impressionShare = competitorSnapshot(metrics.rows);
        if (impressionShare) data.competitorSnapshot = { ...impressionShare, periodLabel: data.periodLabel };
        if (args.components.includes("competitor_snapshot") && !impressionShare) {
          const warning = "Competitor snapshot skipped because Growth Tools did not return impression-share fields for this period.";
          warnings.push(warning);
          data.unavailable!.competitor_snapshot = warning;
        }
      } else {
        warnings.push(metrics.error);
        for (const key of ["kpi_summary", "campaign_breakdown", "competitor_snapshot"] as const) {
          if (args.components.includes(key)) data.unavailable![key] = metrics.error;
        }
      }
    }

    const needsSearchTerms = args.components.some((key) => key === "top_converters" || key === "budget_wasters");
    if (needsSearchTerms) {
      const terms = await fetchSearchTerms(customerId, range, conversionActions, conversionActionCategories);
      if (terms.ok) {
        data.topConverters = terms.rows
          .filter((row) => Number(row.conversions ?? 0) > 0)
          .sort((a, b) => Number(b.conversions ?? 0) - Number(a.conversions ?? 0))
          .slice(0, 8);
        data.budgetWasters = terms.rows
          .filter((row) => Number(row.conversions ?? 0) <= 0 && Number(row.spend ?? 0) > 0)
          .sort((a, b) => Number(b.spend ?? 0) - Number(a.spend ?? 0))
          .slice(0, 8);
      } else {
        warnings.push(terms.error);
        if (args.components.includes("top_converters")) data.unavailable!.top_converters = terms.error;
        if (args.components.includes("budget_wasters")) data.unavailable!.budget_wasters = terms.error;
      }
    }

    for (const key of ["lead_quality"] as const) {
      if (args.components.includes(key)) {
        const warning = "Lead quality skipped because connected lead-quality fields were not available in this OptiMate data path.";
        warnings.push(warning);
        data.unavailable![key] = warning;
      }
    }

    const html = renderGoogleAdsEmailComponentsHtml(args.components, data);
    return {
      ok: true,
      data: {
        html,
        components: args.components,
        warnings,
        sourceSummary: {
          monthlyPerformance: args.components.includes("monthly_performance") ? "Growth Tools campaign-budgets/get-metrics, one request per completed calendar month" : null,
          dashboardBlocks: needsMetrics ? `Growth Tools campaign-budgets/get-metrics for ${range}` : null,
          searchTerms: needsSearchTerms ? `Growth Tools search-terms for ${range}` : null,
          auditId: resolvedAccount.auditId ?? null,
          conversionActionsApplied: conversionActions || null,
        },
      },
    };
  },
};

async function fetchMonthlyPerformance(customerId: string, months: number, conversionActions: string): Promise<{ ok: true; rows: NonNullable<GoogleAdsEmailComponentsData["monthlyPerformanceRows"]> } | { ok: false; error: string }> {
  const monthKeys = completedMonthKeys(clamp(months, 1, MAX_MONTHS));
  const rows: NonNullable<GoogleAdsEmailComponentsData["monthlyPerformanceRows"]> = [];
  for (const month of monthKeys) {
    const res = await fetchMetrics(customerId, `${month}-01,${lastDayOfMonth(month)}`, conversionActions);
    if (!res.ok) return res;
    const totals = sumMetrics(res.rows);
    rows.push({ label: monthLabel(month), spend: totals.spend, conversions: totals.conversions, cpa: totals.cpa });
  }
  return { ok: true, rows };
}

async function fetchMetrics(customerId: string, dateRange: string, conversionActions: string): Promise<{ ok: true; rows: MetricRaw[] } | { ok: false; error: string }> {
  const qs = new URLSearchParams({ customerId, dateRange });
  if (conversionActions) qs.set("conversionActions", conversionActions);
  const res = await growthToolsGet<MetricsEnvelope>(`/api/google-ads/campaign-budgets/get-metrics?${qs.toString()}`);
  if (!res.ok) return { ok: false, error: res.error ?? "Growth Tools metrics call failed" };
  return { ok: true, rows: res.data?.metrics ?? [] };
}

async function fetchSearchTerms(customerId: string, dateRange: string, conversionActions: string, conversionActionCategories: string): Promise<{ ok: true; rows: NonNullable<GoogleAdsEmailComponentsData["topConverters"]> } | { ok: false; error: string }> {
  const qs = new URLSearchParams({ customerId, dateRange, limit: "100" });
  if (conversionActions) qs.set("conversionActions", conversionActions);
  if (conversionActionCategories) qs.set("conversionActionCategories", conversionActionCategories);
  const res = await growthToolsGet<SearchTermsEnvelope>(`/api/google-ads/search-terms?${qs.toString()}`);
  if (!res.ok) return { ok: false, error: res.error ?? "Growth Tools search terms call failed" };
  const raw = res.data?.searchTerms ?? res.data?.terms ?? [];
  const rows = raw.map((row) => {
    const spend = Number(row.cost ?? row.spend ?? 0);
    const conversions = Number(row.conversions ?? 0);
    return {
      term: String(row.searchTerm ?? row.query ?? "").trim(),
      campaignName: String(row.campaignName ?? "").trim(),
      spend: round2(spend),
      clicks: Number(row.clicks ?? 0),
      impressions: Number(row.impressions ?? 0),
      conversions: round2(conversions),
      cpa: conversions > 0 ? round2(spend / conversions) : null,
    };
  }).filter((row) => row.term.length > 0);
  return { ok: true, rows };
}

function sumMetrics(rows: MetricRaw[]): GoogleAdsEmailMetricTotals {
  const totals = rows.reduce<MetricTotalsAccumulator>(
    (acc, row) => {
      const spend = Number(row.cost ?? row.spend ?? 0);
      const clicks = Number(row.clicks ?? 0);
      const impressions = Number(row.impressions ?? 0);
      const conversions = Number(row.conversions ?? 0);
      const ctr = parsePercent(row.ctr);
      acc.spend += spend;
      acc.clicks += clicks;
      acc.impressions += impressions;
      acc.conversions += conversions;
      if (ctr !== null && impressions > 0) {
        acc.ctrNumerator += ctr * impressions;
        acc.ctrDenominator += impressions;
      }
      return acc;
    },
    { spend: 0, clicks: 0, impressions: 0, conversions: 0, ctrNumerator: 0, ctrDenominator: 0 },
  );
  return {
    spend: round2(totals.spend),
    clicks: Math.round(totals.clicks),
    impressions: Math.round(totals.impressions),
    conversions: round2(totals.conversions),
    ctr: totals.ctrDenominator > 0 ? round2(totals.ctrNumerator / totals.ctrDenominator) : totals.impressions > 0 ? round2((totals.clicks / totals.impressions) * 100) : null,
    cpc: totals.clicks > 0 ? round2(totals.spend / totals.clicks) : null,
    cpa: totals.conversions > 0 ? round2(totals.spend / totals.conversions) : null,
  };
}

function aggregateCampaignRows(rows: MetricRaw[]): NonNullable<GoogleAdsEmailComponentsData["campaignBreakdown"]> {
  const map = new Map<string, MetricRaw[]>();
  for (const row of rows) {
    const campaignName = String(row.campaignName ?? row.campaign ?? "Unknown campaign").trim() || "Unknown campaign";
    map.set(campaignName, [...(map.get(campaignName) ?? []), row]);
  }
  return Array.from(map.entries())
    .map(([campaignName, campaignRows]) => ({ campaignName, ...sumMetrics(campaignRows) }))
    .sort((a, b) => Number(b.spend ?? 0) - Number(a.spend ?? 0));
}

function competitorSnapshot(rows: MetricRaw[]): { searchImpressionShare?: number | null; searchBudgetLostIS?: number | null } | null {
  let shareNumerator = 0;
  let lostNumerator = 0;
  let denominator = 0;
  for (const row of rows) {
    const impressions = Number(row.impressions ?? 0);
    if (impressions <= 0) continue;
    const share = parseSharePercent(row.searchImpressionShare);
    const lost = parseSharePercent(row.searchBudgetLostIS ?? row.searchBudgetLostImpressionShare);
    if (share !== null) shareNumerator += share * impressions;
    if (lost !== null) lostNumerator += lost * impressions;
    if (share !== null || lost !== null) denominator += impressions;
  }
  if (denominator <= 0) return null;
  return {
    searchImpressionShare: shareNumerator > 0 ? round2(shareNumerator / denominator) : null,
    searchBudgetLostIS: lostNumerator > 0 ? round2(lostNumerator / denominator) : null,
  };
}

async function resolveAccountContext(
  args: DashboardEmailComponentsArgs,
  context: Record<string, unknown>,
): Promise<
  | { ok: true; customerId: string; auditId?: string | number; conversionActions: string; conversionActionCategories: string }
  | { ok: false; error: string }
> {
  if (typeof context.customerId === "string" && context.customerId.trim()) {
    return {
      ok: true,
      customerId: customerKey(context.customerId),
      auditId: args.auditId ?? (context.auditId as string | number | undefined),
      conversionActions: parseConversionActions(context.conversionActions).join(","),
      conversionActionCategories: (context.conversionActionCategories as string | undefined) ?? "",
    };
  }

  if (args.auditId === undefined || args.auditId === null || args.auditId === "") {
    try {
      return {
        ok: true,
        customerId: ensureCustomerId(context.customerId),
        conversionActions: parseConversionActions(context.conversionActions).join(","),
        conversionActionCategories: (context.conversionActionCategories as string | undefined) ?? "",
      };
    } catch (err) {
      return { ok: false, error: `${(err as Error).message}; pass auditId/accountRef in portfolio mode.` };
    }
  }

  const account = await findPortfolioAccount(args.auditId);
  if (!account) return { ok: false, error: `No Google Ads account found for auditId/accountRef ${String(args.auditId)}.` };
  return {
    ok: true,
    customerId: customerKey(account.customerId),
    auditId: account.accountRef ?? args.auditId,
    conversionActions: account.conversionActions ?? "",
    conversionActionCategories: account.conversionActionCategories ?? "",
  };
}

async function findPortfolioAccount(ref: string | number): Promise<PortfolioAccount | null> {
  const refText = String(ref);
  const accounts = await loadPortfolioAccounts();
  return accounts.find((account) =>
    (account.accountRef !== undefined && String(account.accountRef) === refText) ||
    (account.clientId !== undefined && String(account.clientId) === refText) ||
    customerKey(account.customerId) === refText.replace(/-/g, ""),
  ) ?? null;
}

function completedMonthKeys(count: number): string[] {
  const cursor = new Date();
  cursor.setUTCDate(1);
  cursor.setUTCMonth(cursor.getUTCMonth() - count);
  const months: string[] = [];
  for (let i = 0; i < count; i += 1) {
    months.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

function lastDayOfMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 1970, monthNumber ?? 1, 0));
  return `${month}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  return date.toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });
}

function rangeLabel(range: string): string {
  if (/^\d{4}-\d{2}-\d{2},\d{4}-\d{2}-\d{2}$/.test(range)) return range.replace(",", " to ");
  return range.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parsePercent(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const numeric = Number(value.replace(/[%<>,\s]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function parseSharePercent(value: unknown): number | null {
  const parsed = parsePercent(value);
  if (parsed === null) return null;
  return parsed > 0 && parsed <= 1 ? parsed * 100 : parsed;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
