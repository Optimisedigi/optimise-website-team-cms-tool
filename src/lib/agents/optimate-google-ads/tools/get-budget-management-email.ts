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
  type BudgetCampaign,
  type LastMonthRecap,
} from "@/lib/google-ads-budget-email";

type EmailMode = "this_month" | "last_month";

interface BudgetEmailArgs {
  mode: EmailMode;
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

function resolveBaseUrl(): string {
  return (
    process.env.CMS_BASE_URL ||
    process.env.NEXT_PUBLIC_SERVER_URL ||
    "http://localhost:3004"
  ).replace(/\/+$/, "");
}

export const getBudgetManagementEmail: CanonicalTool<BudgetEmailArgs> = {
  name: "get_budget_management_email",
  description:
    "Returns the exact same Gmail-ready HTML produced by the CMS Budget Management tab's 'Copy for Gmail' button. Use this when the user asks for a budget update email, a draft for client communication, or as the body for a scheduled weekly report. Copy the returned `html` verbatim into your reply — do NOT summarise or modify it. Args: mode='this_month' for the current month-to-date budget update, mode='last_month' for the previous-month recap.",
  inputSchema: {
    type: "object",
    properties: {
      mode: {
        type: "string",
        enum: ["this_month", "last_month"],
        description:
          "Which email to render. 'this_month' = current MTD budget update (the default Budget Management tab). 'last_month' = previous-month recap with action items.",
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
    return { mode };
  },
  execute: async (args, ctx) => {
    const auditId = ctx.context.auditId as number | string | undefined;
    if (auditId === undefined || auditId === null || auditId === "") {
      return { ok: false, error: "No auditId in context; this tool needs an audit-scoped chat." };
    }

    const apiKey = process.env.AUDIT_API_KEY;
    if (!apiKey) {
      return {
        ok: false,
        error: "AUDIT_API_KEY env var is not configured; cannot authenticate self-call.",
      };
    }

    // Load audit + linked client server-side via getPayload (no HTTP).
    let audit: AuditDoc;
    try {
      const cfg = await payloadConfig;
      const payload = await getPayload({ config: cfg });
      audit = (await payload.findByID({
        collection: "google-ads-audits",
        id: auditId as never,
        depth: 1,
        overrideAccess: true,
      })) as unknown as AuditDoc;
    } catch (err) {
      return {
        ok: false,
        error: `Failed to load audit ${auditId}: ${(err as Error).message}`,
      };
    }

    const businessName = audit.businessName?.trim() || "Client";
    const monthlyBudget = Number(audit.monthlyBudget || 0);

    let clientSlug = "";
    let clientPin = "";
    if (audit.client && typeof audit.client === "object") {
      const c = audit.client as ClientDoc;
      clientSlug = c.slug?.trim() || "";
      clientPin = c.clientPin?.trim() || "";
    }

    const baseUrl = resolveBaseUrl();

    if (args.mode === "this_month") {
      // Fetch live campaigns + MTD spend from the same endpoint the UI loads
      // on mount. The /list route already supports x-api-key authentication.
      let listData: ListResponse;
      try {
        const res = await fetch(`${baseUrl}/api/google-ads-budgets/${auditId}/list`, {
          method: "GET",
          headers: { "x-api-key": apiKey },
          signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          return {
            ok: false,
            error: `Failed to load campaigns (${res.status}): ${errText.slice(0, 200)}`,
          };
        }
        listData = (await res.json()) as ListResponse;
      } catch (err) {
        return {
          ok: false,
          error: `Failed to load campaigns: ${(err as Error).message}`,
        };
      }

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

      const spend = calculateMonthlySpend(campaigns, effectiveBudget);
      const monthLabel = new Date().toLocaleDateString("en-AU", {
        month: "long",
        year: "numeric",
      });
      const html = generateBudgetEmailHtml(
        businessName,
        monthLabel,
        spend,
        campaigns,
        effectiveBudget,
        clientSlug,
        clientPin,
      );

      return {
        ok: true,
        data: {
          mode: "this_month" as const,
          subject: `${businessName} - Google Ads Budget Report - ${monthLabel}`,
          html,
          monthLabel,
        },
      };
    }

    // mode === "last_month"
    let recap: LastMonthRecap;
    try {
      const res = await fetch(
        `${baseUrl}/api/google-ads-audits/${auditId}/last-month-recap`,
        {
          method: "POST",
          headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
          signal: AbortSignal.timeout(60_000),
        },
      );
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return {
          ok: false,
          error: `Failed to load last-month recap (${res.status}): ${errText.slice(0, 200)}`,
        };
      }
      recap = (await res.json()) as LastMonthRecap;
    } catch (err) {
      return {
        ok: false,
        error: `Failed to load last-month recap: ${(err as Error).message}`,
      };
    }

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
