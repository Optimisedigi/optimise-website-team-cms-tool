import type { CanonicalTool, ToolContext } from "@/lib/agents/_shared/tool";
import type { WeeklyBucketRow } from "@/lib/google-ads-weekly-metric-table";
import { createGmailDraftTool } from "./create-gmail-draft";
import { getBudgetManagementEmail } from "./get-budget-management-email";
import { getWeeklyMetricTable } from "./get-weekly-metric-table";

interface CreateWeeklyBudgetGmailDraftArgs {
  weeks: number;
  endDate?: string;
  auditId?: string | number;
}

interface WeeklyMetricTableData {
  html: string;
  rows: WeeklyBucketRow[];
  weeks: number;
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

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const AGENCY_TIMEZONE = "Australia/Brisbane";

export const createWeeklyBudgetGmailDraftTool: CanonicalTool<CreateWeeklyBudgetGmailDraftArgs> = {
  name: "create_weekly_budget_gmail_draft",
  description:
    "Create the standard one-off Gmail draft for a weekly Google Ads budget report in one deterministic step. This avoids passing large budget HTML back through the LLM. Use this instead of separately calling get_weekly_metric_table, get_budget_management_email, and create_gmail_draft whenever the user asks to create/save/drop a weekly budget report into Gmail. Args: weeks=1 for last week; weeks=4 for an unspecified weekly report or last four weeks / 4-week trend (weeks defaults to 4 when omitted); endDate optional ISO previous Sunday anchor; auditId optional for portfolio/audit override. Leaves the Gmail recipient blank.",
  inputSchema: {
    type: "object",
    properties: {
      weeks: {
        type: "number",
        description: "Completed Monday-Sunday weeks to include. Use 1 for last week; 4 for an unspecified weekly report or last four weeks / 4-week trend. Defaults to 4 when omitted.",
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
      ...(endDate ? { endDate } : {}),
      ...(auditId !== undefined && auditId !== null && auditId !== "" ? { auditId } : {}),
    };
  },
  async execute(args, ctx) {
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

    const budgetResult = await getBudgetManagementEmail.execute(
      {
        mode: "this_month",
        ...(args.auditId !== undefined ? { auditId: args.auditId } : {}),
      },
      ctx,
    );
    if (!budgetResult.ok) return budgetResult;
    const budget = budgetResult.data as BudgetEmailData;

    const summary = buildIntroSummary(weekly.rows);
    const clientName = String(ctx.context.clientName || "Client").trim() || "Client";
    const subject = `${clientName} - Google Ads Weekly Report`;
    const htmlBody = `<p style="font-family:Verdana,sans-serif;font-size:13px;color:#222;margin:0 0 12px;line-height:1.5">Hey team,</p>\n<p style="font-family:Verdana,sans-serif;font-size:13px;color:#222;margin:0 0 16px;line-height:1.5">${escapeHtml(summary)}</p>\n${weekly.html}\n${budget.html}`;

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

function buildIntroSummary(rows: WeeklyBucketRow[]): string {
  const latest = rows[rows.length - 1];
  if (!latest) return "Here is the completed-week Google Ads budget report with the weekly performance trend included above the budget tracker.";
  const conversions = latest.totals.conversions;
  const spend = latest.totals.spend;
  const cpa = conversions > 0 ? spend / conversions : null;

  if (conversions > 0 && cpa !== null) {
    return `${latest.label} delivered ${formatNumber(conversions)} conversions at a CPA of ${formatCurrency(cpa)}, with ${formatCurrency(spend)} in spend.`;
  }
  if (spend > 0) {
    return `${latest.label} recorded ${formatCurrency(spend)} in Google Ads spend, with the completed-week trend included below for context.`;
  }
  return `${latest.label} is included as the completed-week view, with the budget tracker below for current pacing context.`;
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
