import type { CanonicalTool } from "@/lib/agents/_shared/tool";
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
        ...(args.range ? { range: args.range } : {}),
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

    const summary = buildSummary(monthly.rows, args.components);
    const reportMonthLabel = latestMonthLabel(monthly.rows);
    const budgetHtml = prepareMonthlyBudgetBreakdownHtml(budget.html);
    const htmlBody = `<p style="margin:0 0 20px;width:100%;max-width:none;display:block;font-family:Arial,sans-serif;font-size:14px;color:#1e293b">Hey team,</p>\n<p style="margin:0 0 20px;width:100%;max-width:none;display:block;font-family:Arial,sans-serif;font-size:14px;color:#1e293b;line-height:1.5">${escapeHtml(summary)}</p>\n${monthly.html}\n${dashboard.html}\n${budgetHtml}`;
    const subject = reportMonthLabel ? replaceSubjectMonth(budget.subject, reportMonthLabel) : budget.subject;

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
    .replace(/\s*<h3 style="margin:24px 0 16px;font-size:15px">[\s\S]*?<!-- Budget Progress \+ Time Tracking side by side -->[\s\S]*?<h3 style="margin:0 0 8px;font-size:15px">Campaign Breakdown<\/h3>/, '\n  <h3 style="margin:0 0 8px;font-size:15px">Campaign Breakdown</h3>')
    .replace(/>MTD Spend<\/th>/g, ">Spend</th>");
}

function latestMonthLabel(rows: MonthlyMetricTableData["rows"]): string | null {
  return rows[rows.length - 1]?.label ?? null;
}

function replaceSubjectMonth(subject: string, monthLabel: string): string {
  return subject.replace(/ - [A-Z][a-z]+ \d{4}$/, ` - ${monthLabel}`);
}

function buildSummary(rows: MonthlyMetricTableData["rows"], components: GoogleAdsEmailComponentKey[]): string {
  const latest = rows[rows.length - 1];
  const componentText = components.map((component) => COMPONENT_LABELS[component]).join(", ");
  if (!latest) {
    return `I have included ${componentText} above the monthly budget tracker for this report.`;
  }
  const conversions = Number(latest.totals?.conversions ?? 0);
  const spend = Number(latest.totals?.spend ?? 0);
  const cpa = typeof latest.metrics?.cpa === "number" ? latest.metrics.cpa : conversions > 0 ? spend / conversions : null;
  if (conversions > 0 && cpa !== null) {
    return `${latest.label} delivered ${formatNumber(conversions)} conversions at a CPA of ${formatCurrency(cpa)}, with ${componentText} included above the budget tracker.`;
  }
  if (spend > 0) {
    return `${latest.label} recorded ${formatCurrency(spend)} in spend, with ${componentText} included above the budget tracker.`;
  }
  return `${latest.label} is included in the monthly performance table, with ${componentText} above the budget tracker.`;
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
