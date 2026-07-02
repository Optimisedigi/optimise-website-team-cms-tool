import type { CanonicalTool, ToolContext } from "@/lib/agents/_shared/tool";
import type { GoogleAdsEmailComponentKey } from "@/lib/google-ads-email-components";
import { GOOGLE_ADS_EMAIL_COMPONENT_KEYS } from "@/lib/google-ads-email-components";
import { createGmailDraftTool } from "./create-gmail-draft";
import { getBudgetManagementEmail } from "./get-budget-management-email";
import { getDashboardEmailComponents } from "./get-dashboard-email-components";
import { getMonthlyMetricTable } from "./get-monthly-metric-table";

interface CreateMonthlyBudgetGmailDraftArgs {
  components: GoogleAdsEmailComponentKey[];
  months?: number;
  range?: string;
  auditId?: string | number;
}

interface DashboardComponentsData {
  html: string;
  components: GoogleAdsEmailComponentKey[];
  warnings?: string[];
  componentData?: {
    keywordRelevancyTrend?: Array<{ label: string; value: number | null }>;
    cpaTrend?: Array<{ label: string; value: number | null }>;
    qualityScore?: {
      latestQualityScore?: number | null;
      latestMonth?: string | null;
      trend?: Array<{ label: string; value: number | null }>;
    } | null;
    topConverters?: Array<{ term: string; conversions?: number | null; cpa?: number | null }>;
  };
}

interface MonthlyMetricTableData {
  html: string;
  rows: Array<{
    label: string;
    totals: { spend: number; conversions: number };
    metrics: { cpa?: number | null } & Record<string, number | null | undefined>;
    displayMetrics?: Partial<Record<string, string>>;
  }>;
  metrics: string[];
}

interface BudgetEmailData {
  subject: string;
  html: string;
}

interface GmailDraftData {
  draftId: string;
  messageId: string;
  gmailUrl: string;
  subject: string;
}

const SUPPORTED_COMPONENTS = new Set<GoogleAdsEmailComponentKey>(GOOGLE_ADS_EMAIL_COMPONENT_KEYS);
const DEFAULT_MONTHS = 4;
const DASHBOARD_TREND_MONTHS = 14;
const MAX_MONTHS = 12;
const COMPONENT_LABELS: Record<GoogleAdsEmailComponentKey, string> = {
  keyword_relevancy: "Keyword Relevancy",
  cpa_trend: "CPA Trend",
  quality_score: "Quality Score",
  top_converters: "Top Converters",
};

export const createMonthlyBudgetGmailDraftTool: CanonicalTool<CreateMonthlyBudgetGmailDraftArgs> = {
  name: "create_monthly_budget_gmail_draft",
  description:
    "Create the standard one-off Gmail draft for a monthly Google Ads budget report in one deterministic step. Requires explicit dashboard components; if none are supplied, asks which components to include and does not create a draft. Use this instead of separately calling get_dashboard_email_components, get_monthly_metric_table, get_budget_management_email, and create_gmail_draft whenever the user asks to create/save/drop a monthly budget report into Gmail. Valid components: keyword_relevancy, cpa_trend, quality_score, top_converters. Leaves the Gmail recipient blank.",
  inputSchema: {
    type: "object",
    properties: {
      components: {
        type: "array",
        items: { type: "string", enum: GOOGLE_ADS_EMAIL_COMPONENT_KEYS as unknown as string[] },
        description: "Explicit ordered dashboard components to include. Required to create the draft.",
      },
      months: {
        type: "number",
        description: "Completed calendar months for the monthly performance table. Defaults to 4; clamped to 1..12. Dashboard trend components always use the 14-month template window."
      },
      range: {
        type: "string",
        description: "Optional Growth Tools range for components that need a range, e.g. LAST_30_DAYS.",
      },
      auditId: {
        type: ["string", "number"],
        description: "Optional audit/account ref. Omit in a normal audit-scoped chat.",
      },
    },
    required: [],
    additionalProperties: false,
  },
  validate(raw) {
    const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const components: GoogleAdsEmailComponentKey[] = [];
    const seen = new Set<GoogleAdsEmailComponentKey>();
    if (obj.components !== undefined && obj.components !== null) {
      if (!Array.isArray(obj.components)) throw new Error("components must be an array when provided");
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
    }

    let months: number | undefined;
    if (obj.months !== undefined && obj.months !== null && obj.months !== "") {
      const n = Number(obj.months);
      if (!Number.isFinite(n) || !Number.isInteger(n)) throw new Error("months must be an integer between 1 and 12");
      months = Math.max(1, Math.min(MAX_MONTHS, n));
    }

    const auditId = obj.auditId;
    if (
      auditId !== undefined &&
      auditId !== null &&
      auditId !== "" &&
      typeof auditId !== "string" &&
      typeof auditId !== "number"
    ) {
      throw new Error("auditId must be a string or number when provided");
    }

    return {
      components,
      ...(months !== undefined ? { months } : {}),
      ...(typeof obj.range === "string" && obj.range.trim() ? { range: obj.range.trim() } : {}),
      ...(auditId !== undefined && auditId !== null && auditId !== "" ? { auditId } : {}),
    };
  },
  async execute(args, ctx) {
    if (args.components.length === 0) {
      return {
        ok: true,
        data: {
          needsClarification: true,
          message:
            "Which monthly email components should I include: Keyword Relevancy, CPA Trend, Quality Score, Top Converters, or a specific combination? I will create the Gmail draft after you choose.",
          validComponents: GOOGLE_ADS_EMAIL_COMPONENT_KEYS,
        },
      };
    }

    const months = args.months ?? DEFAULT_MONTHS;
    const monthSpan = monthSpanEndingPreviousMonth(months);

    const dashboardResult = await getDashboardEmailComponents.execute(
      {
        components: args.components,
        months: DASHBOARD_TREND_MONTHS,
        endMonth: monthSpan.endMonth,
        range: args.range ?? "LAST_MONTH",
        ...(args.auditId !== undefined ? { auditId: args.auditId } : {}),
      },
      ctx,
    );
    if (!dashboardResult.ok) return dashboardResult;
    const dashboard = dashboardResult.data as DashboardComponentsData;

    const monthlyResult = await getMonthlyMetricTable.execute(
      {
        startMonth: monthSpan.startMonth,
        endMonth: monthSpan.endMonth,
        metrics: ["spend", "conversions", "cpa"],
      },
      ctx,
    );
    if (!monthlyResult.ok) return monthlyResult;
    const monthly = monthlyResult.data as MonthlyMetricTableData;

    const budgetResult = await getBudgetManagementEmail.execute(
      {
        mode: "this_month",
        campaignMetricsRange: "LAST_MONTH",
        ...(args.auditId !== undefined ? { auditId: args.auditId } : {}),
      },
      ctx,
    );
    if (!budgetResult.ok) return budgetResult;
    const budget = budgetResult.data as BudgetEmailData;

    const summary = buildSummary(monthly.rows, args.components, dashboard.componentData);
    const reportMonthLabel = latestMonthLabel(monthly.rows);
    const budgetHtml = prepareMonthlyBudgetBreakdownHtml(budget.html);
    const htmlBody = `<p style="margin:0 0 20px;width:100%;max-width:none;display:block;font-family:Arial,sans-serif;font-size:14px;color:#1e293b">Hey team,</p>\n<p style="margin:0 0 20px;width:100%;max-width:none;display:block;font-family:Arial,sans-serif;font-size:14px;color:#1e293b;line-height:1.5">${escapeHtml(summary)}</p>\n${monthly.html}\n${dashboard.html}\n${budgetHtml}`;
    const subject = buildMonthlySubject(ctx, budget.subject, reportMonthLabel);

    const draftResult = await createGmailDraftTool.execute(
      { subject, htmlBody },
      ctx,
    );
    if (!draftResult.ok) return draftResult;
    const draft = draftResult.data as GmailDraftData;

    return {
      ok: true,
      data: {
        draftId: draft.draftId,
        messageId: draft.messageId,
        gmailUrl: draft.gmailUrl,
        subject,
        summary,
        components: dashboard.components,
        componentLabels: dashboard.components.map((component) => COMPONENT_LABELS[component]),
        months,
        warnings: dashboard.warnings ?? [],
      },
    };
  },
};

function monthSpanEndingPreviousMonth(months: number, now = new Date()): { startMonth: string; endMonth: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - Math.max(1, Math.min(MAX_MONTHS, months)) + 1);
  return { startMonth: toMonth(start), endMonth: toMonth(end) };
}

function toMonth(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function prepareMonthlyBudgetBreakdownHtml(html: string): string {
  return html
    .replace(/\s*\(Month-to-Date\)/g, "")
    .replace(/>MTD Spend<\/th>/g, ">Spend</th>")
    .replace(/Behind expected pace by/g, "Under budget by")
    .replace(/Ahead of expected pace by/g, "Over budget by")
    .replace(/Target spend to date/g, "Monthly budget")
    .replace(/Pacing difference/g, "Budget difference")
    .replace(/behind pace\./g, "under budget.")
    .replace(/ahead of pace\./g, "over budget.")
    .replace(/on pace\./g, "on budget.")
    .replace(/\s*<td[^>]*data-budget-time-tracking-cell="1"[^>]*>[\s\S]*?<\/td>/g, "")
    .replace(/data-budget-progress-cell="1"([^>]*)width:64%;/g, 'data-budget-progress-cell="1"$1width:100%;')
    .replace(/\s*<t[hd][^>]*\sdata-col="adjusted-daily-budget"[^>]*>[\s\S]*?<\/t[hd]>/g, "");
}

function latestMonthLabel(rows: MonthlyMetricTableData["rows"]): string | null {
  return rows[rows.length - 1]?.label ?? null;
}

function buildMonthlySubject(ctx: ToolContext, fallbackSubject: string, monthLabel: string | null): string {
  const clientName = String(ctx.context.clientName || fallbackSubject.split(" - Google Ads")[0] || "Client").trim() || "Client";
  return monthLabel ? `${clientName} - Google Ads Monthly Report - ${monthLabel}` : `${clientName} - Google Ads Monthly Report`;
}

function buildSummary(
  rows: MonthlyMetricTableData["rows"],
  components: GoogleAdsEmailComponentKey[],
  dashboardData?: DashboardComponentsData["componentData"],
): string {
  const latest = rows[rows.length - 1];
  const performanceSentence = buildPerformanceSentence(latest);
  const insightSentence = buildInsightSentence(components, dashboardData);
  return [performanceSentence, insightSentence].filter(Boolean).join(" ");
}

function buildPerformanceSentence(latest: MonthlyMetricTableData["rows"][number] | undefined): string {
  if (!latest) return "Here is the monthly Google Ads performance update.";
  const conversions = Number(latest.totals?.conversions ?? 0);
  const spend = Number(latest.totals?.spend ?? 0);
  const cpa = typeof latest.metrics?.cpa === "number" ? latest.metrics.cpa : conversions > 0 ? spend / conversions : null;

  if (conversions > 0 && cpa !== null) {
    const cpaTone = cpa <= 100 ? "efficient" : cpa <= 150 ? "steady" : "heavier than target";
    return `${latest.label} delivered ${formatNumber(conversions)} conversions from ${formatCurrency(spend)} in spend, with CPA ${cpaTone} at ${formatCurrency(cpa)}.`;
  }
  if (spend > 0) {
    return `${latest.label} recorded ${formatCurrency(spend)} in spend, and conversion volume remained limited across the month.`;
  }
  return `${latest.label} is included in the monthly performance table.`;
}

function buildInsightSentence(
  components: GoogleAdsEmailComponentKey[],
  dashboardData?: DashboardComponentsData["componentData"],
): string {
  const insights: string[] = [];

  for (const component of components) {
    if (component === "keyword_relevancy") {
      const trend = dashboardData?.keywordRelevancyTrend?.filter(hasNumericValue);
      if (trend && trend.length >= 2) {
        const latest = trend[trend.length - 1]!;
        const previous = trend[trend.length - 2]!;
        const delta = Number(latest.value) - Number(previous.value);
        const direction = delta >= 0.5 ? "improved" : delta <= -0.5 ? "softened" : "held steady";
        insights.push(
          direction === "held steady"
            ? `search relevance held steady at ${formatPercent(Number(latest.value))}`
            : `search relevance ${direction} to ${formatPercent(Number(latest.value))} from ${formatPercent(Number(previous.value))}`,
        );
      }
      continue;
    }

    if (component === "cpa_trend") {
      const trend = dashboardData?.cpaTrend?.filter(hasNumericValue);
      if (trend && trend.length >= 2) {
        const latest = trend[trend.length - 1]!;
        const previous = trend[trend.length - 2]!;
        const delta = Number(latest.value) - Number(previous.value);
        const direction = delta <= -5 ? "improved" : delta >= 5 ? "rose" : "held steady";
        insights.push(
          direction === "held steady"
            ? `the wider CPA trend held steady at ${formatCurrency(Number(latest.value))}`
            : `the wider CPA trend ${direction} to ${formatCurrency(Number(latest.value))} from ${formatCurrency(Number(previous.value))}`,
        );
      }
      continue;
    }

    if (component === "quality_score") {
      const latestScore = Number(dashboardData?.qualityScore?.latestQualityScore ?? NaN);
      const latestMonth = String(dashboardData?.qualityScore?.latestMonth ?? "").trim();
      const trend = dashboardData?.qualityScore?.trend?.filter(hasNumericValue);
      if (Number.isFinite(latestScore)) {
        const prior = trend && trend.length >= 2 ? Number(trend[trend.length - 2]?.value ?? NaN) : NaN;
        if (Number.isFinite(prior)) {
          const direction = latestScore >= prior + 0.2 ? "improved" : latestScore <= prior - 0.2 ? "softened" : "held steady";
          insights.push(
            direction === "held steady"
              ? `Quality Score held steady${latestMonth ? ` in ${latestMonth}` : ""} at ${formatScore(latestScore)}`
              : `Quality Score ${direction}${latestMonth ? ` in ${latestMonth}` : ""} to ${formatScore(latestScore)} from ${formatScore(prior)}`,
          );
        } else {
          insights.push(`Quality Score sits at ${formatScore(latestScore)}${latestMonth ? ` in ${latestMonth}` : ""}`);
        }
      }
      continue;
    }

    if (component === "top_converters") {
      const top = dashboardData?.topConverters?.[0];
      const conversions = Number(top?.conversions ?? 0);
      if (top?.term && conversions > 0) {
        const cpaText = Number.isFinite(Number(top.cpa)) && Number(top.cpa) > 0 ? ` at a CPA of ${formatCurrency(Number(top.cpa))}` : "";
        insights.push(`the strongest converting search was ${top.term}, generating ${formatNumber(conversions)} conversions${cpaText}`);
      }
    }
  }

  if (insights.length === 0) {
    return "The supporting trend data is included below to show how efficiency and search quality moved across the recent reporting window.";
  }

  return `${joinInsights(insights)}.`;
}

function joinInsights(insights: string[]): string {
  if (insights.length === 1) return capitalize(insights[0]!);
  if (insights.length === 2) return `${capitalize(insights[0]!)} and ${insights[1]!}`;
  return `${capitalize(insights.slice(0, -1).join(", "))}, and ${insights[insights.length - 1]!}`;
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function hasNumericValue<T extends { value: number | null }>(row: T): row is T & { value: number } {
  return typeof row.value === "number" && Number.isFinite(row.value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 }).format(value);
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 }).format(value)}%`;
}

function formatScore(value: number): string {
  return new Intl.NumberFormat("en-AU", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const __createMonthlyBudgetGmailDraftInternals = {
  monthSpanEndingPreviousMonth,
  buildSummary,
};
