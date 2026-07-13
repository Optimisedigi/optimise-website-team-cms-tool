/**
 * Tool: get_budget_management_email
 *
 * Returns the EXACT same Gmail-ready HTML email the CMS Budget Management
 * tab's "Copy for Gmail" button produces today. Used by OptiMate so it can
 * prepend a custom summary and drop the result into the user's Gmail Drafts
 * via the scheduled-task pipeline (or surface it ad-hoc in chat).
 *
 * Two modes:
 *   - this_month: current month-to-date budget update. Loads campaigns + MTD
 *     spend from /api/google-ads-budgets/[id]/list, runs the same
 *     generateBudgetEmailHtml as the UI.
 *   - last_month: last-month recap. Loads the recap from
 *     /api/google-ads-audits/[id]/last-month-recap, runs
 *     generateLastMonthRecapEmailHtml.
 *
 * The tool reads `auditId` and `clientId` straight from agent context (set by
 * the chat route, not the LLM). It never receives budget numbers from the
 * model — the HTML is generated deterministically server-side.
 */

import { getPayload } from "payload";
import payloadConfig from "@/payload.config";
import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import {
  generateBudgetEmailHtml,
  generateLastMonthRecapEmailHtml,
  calculateMonthlySpend,
  calculateCompletedMonthSpend,
  type BudgetCampaign,
  type LastMonthRecap,
} from "@/lib/google-ads-budget-email";

type EmailMode = "this_month" | "last_month";
type CampaignMetricsRange = "THIS_MONTH" | "LAST_MONTH";

interface BudgetEmailArgs {
  mode: EmailMode;
  /** Metrics window for the campaign breakdown in this_month mode. Defaults to THIS_MONTH. */
  campaignMetricsRange?: CampaignMetricsRange;
  /** Optional audit id, used only in portfolio mode to render one client email at a time. */
  auditId?: number | string;
}

interface AuditDoc {
  id: number | string;
  businessName?: string | null;
  monthlyBudget?: number | null;
  client?: number | string | { id: number | string; slug?: string | null; clientPin?: string | null } | null;
}

interface ClientDoc {
  id?: number | string;
  slug?: string | null;
  clientPin?: string | null;
}

interface ListResponse {
  success?: boolean;
  campaigns?: Array<Partial<BudgetCampaign> & { campaignId: string }>;
  monthlyBudget?: number;
}

const BUDGET_EMAIL_SELF_CALL_TIMEOUT_MS = 180_000;

function resolveBaseUrl(): string {
  // Prefer explicit overrides, then fall back to the Vercel-injected production
  // URL (set automatically on every deploy). Without that fallback, serverless
  // invocations in production hit `http://localhost:3004` and the self-call
  // fails with `fetch failed` because there's nothing listening locally. Match
  // the resolution pattern used by the contracts + meeting-scheduler routes.
  const fromVercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "";
  return (
    process.env.CMS_BASE_URL ||
    process.env.NEXT_PUBLIC_SERVER_URL ||
    fromVercel ||
    "http://localhost:3004"
  ).replace(/\/+$/, "");
}

/**
 * Fetch with one silent retry on 5xx or network error. Returns either the
 * parsed JSON body or a structured failure. We retry once because the call
 * chain here is CMS → Growth Tools → Google Ads — a transient hiccup anywhere
 * along that path lands as a one-shot failure, and the underlying data is
 * idempotent (a GET / a recap calculation), so a retry is safe.
 */
async function fetchJsonWithRetry<T>(
  url: string,
  init: RequestInit,
  label: string,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  let lastErrText = "";
  let lastStatus: number | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(BUDGET_EMAIL_SELF_CALL_TIMEOUT_MS) });
      if (res.ok) {
        const data = (await res.json()) as T;
        if (attempt > 1) {
          console.log(`[BudgetEmail] ${label} succeeded on retry`);
        }
        return { ok: true, data };
      }
      lastStatus = res.status;
      lastErrText = await res.text().catch(() => "");
      console.error(
        `[BudgetEmail] ${label} HTTP ${res.status} (attempt ${attempt}/2): ${lastErrText.slice(0, 500)}`,
      );
      // Only retry on server-side failures — 4xx is the caller's fault, retrying won't help.
      if (res.status < 500) break;
    } catch (err) {
      lastErrText = (err as Error).message;
      console.error(`[BudgetEmail] ${label} network error (attempt ${attempt}/2): ${lastErrText}`);
      // Network errors retry.
    }
  }
  const statusPart = lastStatus !== null ? ` (HTTP ${lastStatus})` : "";
  return {
    ok: false,
    error: `Failed to ${label}${statusPart}: ${lastErrText.slice(0, 500) || "unknown error"}. Tried twice. The data path is CMS → Growth Tools → Google Ads — check Growth Tools logs and the Budget Management tab in the CMS for live data.`,
  };
}

export const getBudgetManagementEmail: CanonicalTool<BudgetEmailArgs> = {
  name: "get_budget_management_email",
  description:
    "Returns the exact same Gmail-ready HTML produced by the CMS Budget Management tab's 'Copy for Gmail' button. Use this when the user asks for a budget update email, a draft for client communication, or as the body for a scheduled weekly report. Copy the returned `html` verbatim into your reply — do NOT summarise or modify it. Args: mode='this_month' for the current month-to-date budget update, mode='last_month' for the previous-month recap. In audit mode, auditId is read from context. In portfolio mode, pass one auditId/accountRef at a time to create client-specific drafts.",
  inputSchema: {
    type: "object",
    properties: {
      mode: {
        type: "string",
        enum: ["this_month", "last_month"],
        description:
          "Which email to render. 'this_month' = current MTD budget update (the default Budget Management tab). 'last_month' = previous-month recap with action items.",
      },
      campaignMetricsRange: {
        type: "string",
        enum: ["THIS_MONTH", "LAST_MONTH"],
        description:
          "Optional. Metrics window for the campaign breakdown in this_month mode. Defaults to THIS_MONTH; monthly report drafts use LAST_MONTH.",
      },
      auditId: {
        type: ["string", "number"],
        description:
          "Optional. Portfolio-mode audit/accountRef to render. Omit in normal audit-scoped chats.",
      },
    },
    required: ["mode"],
    additionalProperties: false,
  },
  validate: (raw) => {
    const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const mode = obj.mode;
    if (mode !== "this_month" && mode !== "last_month") {
      throw new Error(
        "mode must be 'this_month' or 'last_month'",
      );
    }
    const campaignMetricsRange = obj.campaignMetricsRange;
    if (
      campaignMetricsRange !== undefined &&
      campaignMetricsRange !== null &&
      campaignMetricsRange !== "THIS_MONTH" &&
      campaignMetricsRange !== "LAST_MONTH"
    ) {
      throw new Error("campaignMetricsRange must be 'THIS_MONTH' or 'LAST_MONTH' when provided");
    }
    const auditId = obj.auditId;
    if (
      auditId !== undefined &&
      auditId !== null &&
      typeof auditId !== "string" &&
      typeof auditId !== "number"
    ) {
      throw new Error("auditId must be a string or number when provided");
    }
    return {
      mode,
      ...(campaignMetricsRange === "THIS_MONTH" || campaignMetricsRange === "LAST_MONTH" ? { campaignMetricsRange } : {}),
      ...(auditId !== undefined && auditId !== null && auditId !== "" ? { auditId } : {}),
    };
  },
  execute: async (args, ctx) => {
    const auditId = args.auditId ?? (ctx.context.auditId as number | string | undefined);
    if (auditId === undefined || auditId === null || auditId === "") {
      return { ok: false, error: "No auditId supplied; use audit context or pass an auditId/accountRef in portfolio mode." };
    }

    const apiKey = process.env.AUDIT_API_KEY;
    if (!apiKey) {
      return {
        ok: false,
        error: "AUDIT_API_KEY env var is not configured; cannot authenticate self-call.",
      };
    }

    // Load only stable audit/client columns. Payload findByID selects every
    // google_ads_audits field, so schema drift in unrelated proposal/admin
    // columns can break budget pacing before this tool reaches live spend data.
    let audit: AuditDoc;
    let clientSlug = "";
    let clientPin = "";
    try {
      const cfg = await payloadConfig;
      const payload = await getPayload({ config: cfg });
      const numericAuditId = Number(auditId);
      if (!Number.isFinite(numericAuditId)) throw new Error(`Invalid audit id: ${auditId}`);
      const dbClient = (payload as unknown as { db?: { client?: { execute: (sql: string) => Promise<{ rows?: Array<Record<string, unknown>> }> } } }).db?.client;
      if (dbClient) {
        const result = await dbClient.execute(
          `SELECT a.id, a.business_name, a.monthly_budget, a.client_id, c.slug AS client_slug, c.client_pin AS client_pin FROM google_ads_audits a LEFT JOIN clients c ON c.id = a.client_id WHERE a.id = ${numericAuditId} LIMIT 1`,
        );
        const row = result?.rows?.[0];
        if (!row) throw new Error(`Audit ${auditId} not found`);
        audit = {
          id: row.id as string | number,
          businessName: String(row.business_name ?? ""),
          monthlyBudget: typeof row.monthly_budget === "number" ? row.monthly_budget : Number(row.monthly_budget || 0),
          client: row.client_id as string | number | null,
        };
        clientSlug = String(row.client_slug ?? "").trim();
        clientPin = String(row.client_pin ?? "").trim();
      } else {
        audit = (await payload.findByID({
          collection: "google-ads-audits",
          id: auditId as any,
          overrideAccess: true,
          depth: 1,
        })) as unknown as AuditDoc;
        const linkedClient = audit.client as { slug?: string; clientPin?: string } | null | undefined;
        clientSlug = typeof linkedClient === "object" ? String(linkedClient?.slug ?? "").trim() : "";
        clientPin = typeof linkedClient === "object" ? String(linkedClient?.clientPin ?? "").trim() : "";
      }
    } catch (err) {
      return {
        ok: false,
        error: `Failed to load audit ${auditId}: ${(err as Error).message}`,
      };
    }

    const businessName = audit.businessName?.trim() || "Client";
    const monthlyBudget = Number(audit.monthlyBudget || 0);

    const baseUrl = resolveBaseUrl();

    if (args.mode === "this_month") {
      // Fetch live campaigns + MTD spend from the same endpoint the UI loads
      // on mount. The /list route already supports x-api-key authentication.
      const campaignMetricsRange = args.campaignMetricsRange ?? "THIS_MONTH";
      const query = new URLSearchParams({ reportOnly: "1" });
      if (campaignMetricsRange !== "THIS_MONTH") {
        query.set("range", campaignMetricsRange);
        query.set("skipPersist", "1");
      }
      const listRes = await fetchJsonWithRetry<ListResponse>(
        `${baseUrl}/api/google-ads-budgets/${auditId}/list?${query.toString()}`,
        { method: "GET", headers: { "x-api-key": apiKey } },
        "load campaigns",
      );
      if (!listRes.ok) return listRes;
      const listData = listRes.data;

      const campaigns: BudgetCampaign[] = (listData.campaigns ?? []).map((c) => ({
        campaignId: String(c.campaignId),
        campaignName: c.campaignName || String(c.campaignId),
        budgetPercentage: Number(c.budgetPercentage ?? 0),
        calculatedDailyBudget: Number(c.calculatedDailyBudget ?? 0),
        actualDailyBudget: Number(c.actualDailyBudget ?? 0),
        bidStrategy: c.bidStrategy || "manual_cpc",
        impressions: Number(c.impressions ?? 0),
        clicks: Number(c.clicks ?? 0),
        avgCpc: Number(c.avgCpc ?? 0),
        conversions: Number(c.conversions ?? 0),
        mtdSpend: Number(c.mtdSpend ?? 0),
        enabled: c.enabled !== undefined ? Boolean(c.enabled) : true,
        standalone: Boolean(c.standalone ?? false),
        standaloneBudget: Number(c.standaloneBudget ?? 0),
        standaloneStartDate: c.standaloneStartDate ?? null,
        standaloneEndDate: c.standaloneEndDate ?? null,
      }));

      // Prefer monthlyBudget from the list response (it pulls from the audit
      // record) but fall back to the audit doc we already loaded.
      const effectiveBudget = Number(listData.monthlyBudget ?? monthlyBudget);

      const lastMonthKey = previousMonthKey();
      const spend = campaignMetricsRange === "LAST_MONTH"
        ? calculateCompletedMonthSpend(campaigns, effectiveBudget, lastMonthKey)
        : calculateMonthlySpend(campaigns, effectiveBudget);
      const monthLabel = monthLabelForBudgetRange(campaignMetricsRange);
      const html = generateBudgetEmailHtml(
        businessName,
        monthLabel,
        spend,
        campaigns,
        effectiveBudget,
        clientSlug,
        clientPin,
        { variant: campaignMetricsRange === "LAST_MONTH" ? "monthly" : "weekly" },
      );

      return {
        ok: true,
        data: {
          mode: "this_month" as const,
          subject: `${businessName} - Google Ads Budget Report - ${monthLabel}`,
          html,
          monthLabel,
          budget: {
            monthlyBudget: spend.maxBudget,
            totalSpend: spend.totalSpend,
            targetSpendToDate:
              spend.maxBudget *
              (spend.daysElapsed / Math.max(1, spend.daysElapsed + spend.daysRemaining)),
            pacingDifference:
              spend.totalSpend -
              spend.maxBudget *
                (spend.daysElapsed / Math.max(1, spend.daysElapsed + spend.daysRemaining)),
          },
        },
      };
    }

    // mode === "last_month"
    const recapRes = await fetchJsonWithRetry<LastMonthRecap>(
      `${baseUrl}/api/google-ads-audits/${auditId}/last-month-recap`,
      {
        method: "POST",
        headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      },
      "load last-month recap",
    );
    if (!recapRes.ok) return recapRes;
    const recap = recapRes.data;

    const html = generateLastMonthRecapEmailHtml(
      businessName,
      recap,
      clientSlug,
      clientPin,
    );
    const monthLabel = recap.monthLabel || "";

    return {
      ok: true,
      data: {
        mode: "last_month" as const,
        subject: `${businessName} - Google Ads Recap - ${monthLabel}`,
        html,
        monthLabel,
      },
    };
  },
};

function previousMonthKey(now = new Date()): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabelForBudgetRange(range: CampaignMetricsRange, now = new Date()): string {
  const date = range === "LAST_MONTH"
    ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    : now;
  return date.toLocaleDateString("en-AU", {
    month: "long",
    year: "numeric",
  });
}
