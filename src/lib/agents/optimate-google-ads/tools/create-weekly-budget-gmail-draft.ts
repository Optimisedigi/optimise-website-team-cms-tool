import type { CanonicalTool, ToolContext } from "@/lib/agents/_shared/tool";
import type { WeeklyBucketRow } from "@/lib/google-ads-weekly-metric-table";
import type { GoogleAdsEmailComponentKey } from "@/lib/google-ads-email-components";
import { createGmailDraftTool } from "./create-gmail-draft";
import { getBudgetManagementEmail } from "./get-budget-management-email";
import { getDashboardEmailComponents } from "./get-dashboard-email-components";
import { getWeeklyMetricTable } from "./get-weekly-metric-table";
import { copySeed, pickGreeting, pickVariant } from "./_email-copy-variants";

interface CreateWeeklyBudgetGmailDraftArgs {
  weeks: number;
  components: WeeklyReportComponentKey[];
  endDate?: string;
  auditId?: string | number;
}

type WeeklyReportComponentKey = Extract<GoogleAdsEmailComponentKey, "keyword_relevancy" | "cpa_trend">;

interface WeeklyMetricTableData {
  html: string;
  rows: WeeklyBucketRow[];
  weeks: number;
}

interface BudgetEmailData {
  subject: string;
  html: string;
}

interface DashboardComponentsData {
  html: string;
  components: GoogleAdsEmailComponentKey[];
  warnings?: string[];
}

const WEEKLY_REPORT_COMPONENT_KEYS = ["keyword_relevancy", "cpa_trend"] as const satisfies readonly WeeklyReportComponentKey[];
const SUPPORTED_COMPONENTS = new Set<WeeklyReportComponentKey>(WEEKLY_REPORT_COMPONENT_KEYS);
const DASHBOARD_TREND_MONTHS = 14;

interface GmailDraftData {
  draftId: string;
  messageId: string;
  gmailUrl: string;
  subject: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const AGENCY_TIMEZONE = "Australia/Brisbane";

export const createWeeklyBudgetGmailDraftTool: CanonicalTool<CreateWeeklyBudgetGmailDraftArgs> = {
  name: "create_weekly_budget_gmail_draft",
  description:
    "Create the standard one-off Gmail draft for a weekly Google Ads spend-pacing report in one deterministic step. Requires an explicit choice of graphs: keyword_relevancy, cpa_trend, or both; when none are supplied, returns a clarification instead of creating a draft. This avoids passing large report HTML back through the LLM. Use this instead of separately calling get_weekly_metric_table, get_dashboard_email_components, get_budget_management_email, and create_gmail_draft whenever the user asks to create/save/drop a weekly budget report into Gmail. Args: weeks=1 for last week; weeks=4 for an unspecified weekly report or last four weeks / 4-week trend (weeks defaults to 4 when omitted); endDate optional ISO previous Sunday anchor; auditId optional for portfolio/audit override. Leaves the Gmail recipient blank.",
  inputSchema: {
    type: "object",
    properties: {
      weeks: {
        type: "number",
        description: "Completed Monday-Sunday weeks to include. Use 1 for last week; 4 for an unspecified weekly report or last four weeks / 4-week trend. Defaults to 4 when omitted.",
      },
      components: {
        type: "array",
        items: { type: "string", enum: WEEKLY_REPORT_COMPONENT_KEYS as unknown as string[] },
        description: "Explicit ordered graphs to include: keyword_relevancy, cpa_trend, or both. Required to create the draft.",
      },
      endDate: {
        type: "string",
        description: "Optional inclusive ISO YYYY-MM-DD end anchor. Defaults to the previous Sunday in agency time.",
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
    const weeksRaw = obj.weeks ?? 4;
    const weeks = Number(weeksRaw);
    if (!Number.isInteger(weeks) || weeks < 1 || weeks > 12) {
      throw new Error("weeks must be an integer between 1 and 12");
    }

    const components: WeeklyReportComponentKey[] = [];
    const seen = new Set<WeeklyReportComponentKey>();
    if (obj.components !== undefined && obj.components !== null) {
      if (!Array.isArray(obj.components)) throw new Error("components must be an array when provided");
      for (const item of obj.components) {
        if (typeof item !== "string" || !SUPPORTED_COMPONENTS.has(item as WeeklyReportComponentKey)) {
          throw new Error(`Unknown weekly report graph "${String(item)}". Valid: ${WEEKLY_REPORT_COMPONENT_KEYS.join(", ")}`);
        }
        const component = item as WeeklyReportComponentKey;
        if (!seen.has(component)) {
          seen.add(component);
          components.push(component);
        }
      }
    }

    let endDate: string | undefined;
    if (obj.endDate !== undefined && obj.endDate !== null && obj.endDate !== "") {
      endDate = String(obj.endDate).trim();
      if (!ISO_DATE_RE.test(endDate)) throw new Error("endDate must be in YYYY-MM-DD format");
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
      weeks,
      components,
      ...(endDate ? { endDate } : {}),
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
            "Which weekly report graphs should I include: Keyword Relevancy, CPA Trend, or both? I will create the Gmail draft after you choose.",
          validComponents: WEEKLY_REPORT_COMPONENT_KEYS,
        },
      };
    }

    const endDate = args.endDate ?? previousSundayInAgencyTime();

    const weeklyResult = await getWeeklyMetricTable.execute(
      {
        weeks: args.weeks,
        endDate,
        metrics: ["spend", "conversions", "cpa"],
        title: "Weekly Performance Trend",
      },
      ctx,
    );
    if (!weeklyResult.ok) return weeklyResult;
    const weekly = weeklyResult.data as WeeklyMetricTableData;

    const dashboardResult = await getDashboardEmailComponents.execute(
      {
        components: args.components,
        months: DASHBOARD_TREND_MONTHS,
        range: "LAST_30_DAYS",
        ...(args.auditId !== undefined ? { auditId: args.auditId } : {}),
      },
      ctx,
    );
    if (!dashboardResult.ok) return dashboardResult;
    const dashboard = dashboardResult.data as DashboardComponentsData;

    const budgetResult = await getBudgetManagementEmail.execute(
      {
        mode: "this_month",
        ...(args.auditId !== undefined ? { auditId: args.auditId } : {}),
      },
      ctx,
    );
    if (!budgetResult.ok) return budgetResult;
    const budget = budgetResult.data as BudgetEmailData;

    const clientName = String(ctx.context.clientName || "Client").trim() || "Client";
    // Seeded per client + week so batched drafts do not all read the same way.
    const seed = copySeed(clientName, String(ctx.context.customerId ?? ""), endDate, args.weeks);
    const summary = buildIntroSummary(weekly.rows, seed);
    const subject = `${clientName} - Google Ads Weekly Report`;
    const htmlBody = `<p style="font-family:Verdana,sans-serif;font-size:13px;color:#222;margin:0 0 12px;line-height:1.5">${pickGreeting(seed)}</p>\n<p style="font-family:Verdana,sans-serif;font-size:13px;color:#222;margin:0 0 16px;line-height:1.5">${escapeHtml(summary)}</p>\n${weekly.html}\n${dashboard.html}\n${budget.html}`;

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
        weeks: weekly.weeks,
        components: dashboard.components,
        warnings: dashboard.warnings ?? [],
        endDate,
      },
    };
  },
};

function previousSundayInAgencyTime(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: AGENCY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  const agencyDateAsUtc = new Date(Date.UTC(year, month - 1, day));
  const dow = agencyDateAsUtc.getUTCDay();
  const daysSincePreviousSunday = dow === 0 ? 7 : dow;
  agencyDateAsUtc.setUTCDate(agencyDateAsUtc.getUTCDate() - daysSincePreviousSunday);
  return agencyDateAsUtc.toISOString().slice(0, 10);
}

function buildIntroSummary(rows: WeeklyBucketRow[], seed = 0): string {
  const latest = rows[rows.length - 1];
  if (!latest) return "Here is the completed-week Google Ads budget report with the weekly performance trend included above the budget tracker.";
  const conversions = latest.totals.conversions;
  const spend = latest.totals.spend;
  const cpa = conversions > 0 ? spend / conversions : null;

  if (conversions > 0 && cpa !== null) {
    return pickVariant(
      [
        `${latest.label} delivered ${formatNumber(conversions)} conversions at a CPA of ${formatCurrency(cpa)}, with ${formatCurrency(spend)} in spend.`,
        `${latest.label} brought in ${formatNumber(conversions)} conversions from ${formatCurrency(spend)} in spend, at a CPA of ${formatCurrency(cpa)}.`,
        `Across ${latest.label}, ${formatCurrency(spend)} in spend produced ${formatNumber(conversions)} conversions at ${formatCurrency(cpa)} each.`,
        `${latest.label} closed out with ${formatNumber(conversions)} conversions, ${formatCurrency(spend)} in spend and a CPA of ${formatCurrency(cpa)}.`,
      ],
      seed,
      "weekly-intro-converting",
    );
  }
  if (spend > 0) {
    return pickVariant(
      [
        `${latest.label} recorded ${formatCurrency(spend)} in Google Ads spend, with the completed-week trend included below for context.`,
        `Google Ads spend for ${latest.label} came in at ${formatCurrency(spend)}, and the completed-week trend is below for context.`,
        `${latest.label} used ${formatCurrency(spend)} in spend, with the completed-week trend set out below.`,
        `Spend across ${latest.label} was ${formatCurrency(spend)}, and the completed-week trend follows below.`,
      ],
      seed,
      "weekly-intro-spend",
    );
  }
  return pickVariant(
    [
      `${latest.label} is included as the completed-week view, with the budget tracker below for current pacing context.`,
      `${latest.label} is the completed-week view, and the budget tracker below covers current pacing.`,
      `Below is the completed week for ${latest.label}, along with the budget tracker for current pacing.`,
    ],
    seed,
    "weekly-intro-flat",
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
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

export const __createWeeklyBudgetGmailDraftInternals = {
  previousSundayInAgencyTime,
  buildIntroSummary,
};
