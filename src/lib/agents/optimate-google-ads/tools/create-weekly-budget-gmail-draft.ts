import type { CanonicalTool, ToolContext } from "@/lib/agents/_shared/tool";
import type { WeeklyBucketRow } from "@/lib/google-ads-weekly-metric-table";
import type { GoogleAdsEmailComponentKey } from "@/lib/google-ads-email-components";
import { createGmailDraftTool } from "./create-gmail-draft";
import { getBudgetManagementEmail } from "./get-budget-management-email";
import { getDashboardEmailComponents } from "./get-dashboard-email-components";
import { getWeeklyMetricTable } from "./get-weekly-metric-table";
import { copySeed, pickGreeting, seedCustomerId } from "./_email-copy-variants";
import { loadClientEmailCopy } from "@/lib/agents/_shared/client-email-copy";
import { buildWeeklyEmailSummary, type WeeklySummaryBudget } from "./_weekly-email-summary";
import type { EmailComponentData } from "./_email-component-insights";

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
  budget?: WeeklySummaryBudget;
}

interface DashboardComponentsData {
  html: string;
  components: GoogleAdsEmailComponentKey[];
  warnings?: string[];
  componentData?: EmailComponentData;
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
  // Creates a real Gmail draft, so the agent loop must de-duplicate repeats.
  sideEffect: true,
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
    // Force the audit-backed component lookup on the individual surface too.
    // Portfolio drafts already pass this value, and the context-only path can
    // resolve a different client dashboard dataset for the same account.
    const contextAuditId = ctx.context.auditId;
    const auditId =
      args.auditId ??
      (typeof contextAuditId === "string" || typeof contextAuditId === "number" ? contextAuditId : undefined);

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
        ...(auditId !== undefined ? { auditId } : {}),
      },
      ctx,
    );
    if (!dashboardResult.ok) return dashboardResult;
    const dashboard = dashboardResult.data as DashboardComponentsData;

    const budgetResult = await getBudgetManagementEmail.execute(
      {
        mode: "this_month",
        ...(auditId !== undefined ? { auditId } : {}),
      },
      ctx,
    );
    if (!budgetResult.ok) return budgetResult;
    const budget = budgetResult.data as BudgetEmailData;

    const clientName = String(ctx.context.clientName || "Client").trim() || "Client";
    // Seeded per client + week so batched drafts do not all read the same way.
    const seed = copySeed(clientName, seedCustomerId(ctx.context.customerId), endDate, args.weeks);
    const copy = await loadClientEmailCopy();
    const summary = buildWeeklyEmailSummary({
      rows: weekly.rows,
      components: args.components,
      dashboardData: dashboard.componentData,
      budget: budget.budget,
      seed,
      copy,
    });
    const subject = `${clientName} - Google Ads Weekly Report`;
    const htmlBody = `<p style="font-family:Verdana,sans-serif;font-size:13px;color:#222;margin:0 0 12px;line-height:1.5">${pickGreeting(seed, copy)}</p>\n<p style="font-family:Verdana,sans-serif;font-size:13px;color:#222;margin:0 0 16px;line-height:1.5">${escapeHtml(summary)}</p>\n${weekly.html}\n${dashboard.html}\n${budget.html}`;

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




function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const __createWeeklyBudgetGmailDraftInternals = {
  previousSundayInAgencyTime,
};
