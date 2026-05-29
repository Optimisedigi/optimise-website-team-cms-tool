/**
 * Tool: propose_budget_update
 *
 * Queues a budget change for human approval. Two modes:
 *   - monthly_budget       : set the audit's monthlyBudget field (CMS only).
 *   - campaign_allocations : set per-campaign budgetPercentage allocations
 *                            on `google-ads-campaign-budgets`. CMS-only —
 *                            live push is a separate proposal.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { agentApprovalPath } from "@/lib/agents/_shared/admin-paths";
import { queueProposal, buildInternalMarkdown, mdTable } from "./_propose-helpers";

type Mode = "monthly_budget" | "campaign_allocations";

interface CampaignAllocation {
  campaignId: string;
  campaignName: string;
  budgetPercentage: number;
  calculatedDailyBudget?: number;
  bidStrategy?: string;
  enabled?: boolean;
}

interface ProposeBudgetUpdateArgs {
  mode: Mode;
  monthlyBudget?: number;
  campaigns?: CampaignAllocation[];
  summary: string;
  supportingNumbers?: string[];
}

const MODES: Mode[] = ["monthly_budget", "campaign_allocations"];

export const proposeBudgetUpdate: CanonicalTool<ProposeBudgetUpdateArgs> = {
  name: "propose_budget_update",
  description:
    "Queue a budget change for human approval. Mode 'monthly_budget' sets the audit's monthly budget (CMS only). Mode 'campaign_allocations' saves per-campaign budgetPercentage allocations (CMS only) — pair with propose_budget_push_live to actually push them to Google Ads.",
  inputSchema: {
    type: "object",
    properties: {
      mode: { type: "string", enum: MODES },
      monthlyBudget: { type: "number", minimum: 0, description: "Required when mode=monthly_budget." },
      campaigns: {
        type: "array",
        minItems: 1,
        maxItems: 100,
        items: {
          type: "object",
          properties: {
            campaignId: { type: "string", minLength: 1 },
            campaignName: { type: "string", minLength: 1 },
            budgetPercentage: { type: "number", minimum: 0, maximum: 100 },
            calculatedDailyBudget: { type: "number", minimum: 0 },
            bidStrategy: { type: "string" },
            enabled: { type: "boolean" },
          },
          required: ["campaignId", "campaignName", "budgetPercentage"],
          additionalProperties: false,
        },
        description: "Required when mode=campaign_allocations.",
      },
      summary: { type: "string", minLength: 10, maxLength: 800 },
      supportingNumbers: {
        type: "array",
        items: { type: "string", maxLength: 240 },
        maxItems: 12,
      },
    },
    required: ["mode", "summary"],
    additionalProperties: false,
  },
  validate: (raw) => {
    if (!raw || typeof raw !== "object") throw new Error("input must be an object");
    const obj = raw as Record<string, unknown>;
    const mode = String(obj.mode ?? "") as Mode;
    if (!MODES.includes(mode)) throw new Error("mode must be monthly_budget or campaign_allocations");
    const summary = String(obj.summary ?? "").trim();
    if (summary.length < 10) throw new Error("summary must be at least 10 characters");

    const out: ProposeBudgetUpdateArgs = { mode, summary };
    if (mode === "monthly_budget") {
      const mb = Number(obj.monthlyBudget);
      if (!Number.isFinite(mb) || mb < 0) throw new Error("monthly_budget mode requires a non-negative monthlyBudget");
      out.monthlyBudget = mb;
    }
    if (mode === "campaign_allocations") {
      const camps = Array.isArray(obj.campaigns) ? obj.campaigns : [];
      if (camps.length === 0) throw new Error("campaign_allocations mode requires non-empty campaigns array");
      const allocations: CampaignAllocation[] = camps.map((c, i) => {
        if (!c || typeof c !== "object") throw new Error(`campaigns[${i}] not an object`);
        const co = c as Record<string, unknown>;
        const campaignId = String(co.campaignId ?? "").trim();
        const campaignName = String(co.campaignName ?? "").trim();
        const pct = Number(co.budgetPercentage);
        if (!campaignId) throw new Error(`campaigns[${i}] missing campaignId`);
        if (!campaignName) throw new Error(`campaigns[${i}] missing campaignName`);
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
          throw new Error(`campaigns[${i}] budgetPercentage must be 0–100`);
        }
        const allocation: CampaignAllocation = { campaignId, campaignName, budgetPercentage: pct };
        if (co.calculatedDailyBudget !== undefined) {
          const v = Number(co.calculatedDailyBudget);
          if (!Number.isFinite(v) || v < 0) throw new Error(`campaigns[${i}] calculatedDailyBudget invalid`);
          allocation.calculatedDailyBudget = v;
        }
        if (typeof co.bidStrategy === "string" && co.bidStrategy) allocation.bidStrategy = co.bidStrategy;
        if (typeof co.enabled === "boolean") allocation.enabled = co.enabled;
        return allocation;
      });
      out.campaigns = allocations;

      const totalPct = allocations.reduce((s, a) => s + a.budgetPercentage, 0);
      if (totalPct > 100.5) {
        throw new Error(`campaign_allocations: total budgetPercentage is ${totalPct.toFixed(1)}%, must be ≤100`);
      }
    }
    if (Array.isArray(obj.supportingNumbers)) {
      out.supportingNumbers = obj.supportingNumbers
        .map((s) => (typeof s === "string" ? s : String(s)))
        .filter((s) => s.trim().length > 0);
    }
    return out;
  },
  execute: async (args, ctx) => {
    const auditId = ctx.context.auditId as string | number | undefined;
    const clientId = ctx.context.clientId as string | number | undefined;

    let diff: string;
    let title: string;
    if (args.mode === "monthly_budget") {
      diff = `Set audit monthly budget → **$${(args.monthlyBudget ?? 0).toLocaleString()}**`;
      title = `Set monthly budget to $${(args.monthlyBudget ?? 0).toLocaleString()}`;
    } else {
      const rows = (args.campaigns ?? []).map((c) => [
        c.campaignName,
        `${c.budgetPercentage.toFixed(1)}%`,
        c.calculatedDailyBudget !== undefined ? `$${c.calculatedDailyBudget.toFixed(2)}/day` : "—",
        c.enabled === false ? "off" : "on",
      ]);
      diff = mdTable(["Campaign", "% Budget", "Daily $", "State"], rows);
      title = `Reallocate budget across ${args.campaigns?.length ?? 0} campaigns`;
    }

    const internalMarkdown = buildInternalMarkdown({
      summary: args.summary,
      supportingNumbers: args.supportingNumbers,
      diffSection: diff,
      applyEffect: args.mode === "monthly_budget"
        ? `Will write \`monthlyBudget\` to audit #${auditId ?? "?"} (CMS only).`
        : `Will save allocations to \`google-ads-campaign-budgets\` for audit #${auditId ?? "?"} (CMS only). Push to Google Ads is a separate proposal.`,
    });

    let approvalId: number;
    try {
      approvalId = await queueProposal({
        agentName: "optimate-google-ads",
        agentRunId: ctx.agentRunId,
        triggeredByUserId: ctx.context.userId as number | undefined,
        proposalType: "budget-update",
        title,
        clientId,
        proposalPayload: {
          auditId: auditId ?? null,
          mode: args.mode,
          ...(args.monthlyBudget !== undefined ? { monthlyBudget: args.monthlyBudget } : {}),
          ...(args.campaigns ? { campaigns: args.campaigns } : {}),
        },
        rendered: { internalMarkdown },
      });
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    return { ok: true, data: { approvalId, approvalUrl: agentApprovalPath(approvalId) } };
  },
};
