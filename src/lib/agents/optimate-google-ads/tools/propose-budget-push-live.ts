/**
 * Tool: propose_budget_push_live
 *
 * Queues "push these daily budgets to Google Ads" for approval. On Apply,
 * dispatcher calls Growth Tools `campaign-budgets/push` against the linked
 * customer ID and stamps `actualDailyBudget` + `lastPushedAt` on the CMS
 * rows.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { agentApprovalPath } from "@/lib/agents/_shared/admin-paths";
import { queueProposal, buildInternalMarkdown, mdTable } from "./_propose-helpers";

interface PushCampaignIn {
  campaignId: string;
  campaignName: string;
  dailyBudget: number;
  bidStrategy?: string;
  bidStrategyId?: string;
}

interface ProposeBudgetPushArgs {
  campaigns: PushCampaignIn[];
  summary: string;
  supportingNumbers?: string[];
}

export const proposeBudgetPushLive: CanonicalTool<ProposeBudgetPushArgs> = {
  name: "propose_budget_push_live",
  description:
    "Queue a live push of daily campaign budgets to Google Ads for human approval. Each campaign needs a campaignId, campaignName, and the new dailyBudget (in account currency). Optional bidStrategy/bidStrategyId update.",
  inputSchema: {
    type: "object",
    properties: {
      campaigns: {
        type: "array",
        minItems: 1,
        maxItems: 100,
        items: {
          type: "object",
          properties: {
            campaignId: { type: "string", minLength: 1 },
            campaignName: { type: "string", minLength: 1 },
            dailyBudget: { type: "number", minimum: 0 },
            bidStrategy: { type: "string" },
            bidStrategyId: { type: "string" },
          },
          required: ["campaignId", "campaignName", "dailyBudget"],
          additionalProperties: false,
        },
      },
      summary: { type: "string", minLength: 10, maxLength: 800 },
      supportingNumbers: {
        type: "array",
        items: { type: "string", maxLength: 240 },
        maxItems: 12,
      },
    },
    required: ["campaigns", "summary"],
    additionalProperties: false,
  },
  validate: (raw) => {
    if (!raw || typeof raw !== "object") throw new Error("input must be an object");
    const obj = raw as Record<string, unknown>;
    const summary = String(obj.summary ?? "").trim();
    if (summary.length < 10) throw new Error("summary must be at least 10 characters");
    const camps = Array.isArray(obj.campaigns) ? obj.campaigns : [];
    if (camps.length === 0) throw new Error("campaigns array required");
    const campaigns: PushCampaignIn[] = camps.map((c, i) => {
      if (!c || typeof c !== "object") throw new Error(`campaigns[${i}] not an object`);
      const co = c as Record<string, unknown>;
      const campaignId = String(co.campaignId ?? "").trim();
      const campaignName = String(co.campaignName ?? "").trim();
      const dailyBudget = Number(co.dailyBudget);
      if (!campaignId) throw new Error(`campaigns[${i}] missing campaignId`);
      if (!campaignName) throw new Error(`campaigns[${i}] missing campaignName`);
      if (!Number.isFinite(dailyBudget) || dailyBudget < 0) {
        throw new Error(`campaigns[${i}] invalid dailyBudget`);
      }
      const out: PushCampaignIn = { campaignId, campaignName, dailyBudget };
      if (typeof co.bidStrategy === "string") out.bidStrategy = co.bidStrategy;
      if (typeof co.bidStrategyId === "string") out.bidStrategyId = co.bidStrategyId;
      return out;
    });
    const out: ProposeBudgetPushArgs = { campaigns, summary };
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
    const customerId = ctx.context.customerId as string | undefined;

    const totalDaily = args.campaigns.reduce((s, c) => s + c.dailyBudget, 0);
    const rows = args.campaigns.map((c) => [
      c.campaignName,
      `$${c.dailyBudget.toFixed(2)}/day`,
      c.bidStrategy ?? "—",
    ]);

    const internalMarkdown = buildInternalMarkdown({
      summary: args.summary,
      supportingNumbers: args.supportingNumbers,
      diffSection: `${mdTable(["Campaign", "Daily $", "Bid strategy"], rows)}\n\n**Total daily across pushed campaigns:** $${totalDaily.toFixed(2)}`,
      applyEffect: `Will call Growth Tools \`campaign-budgets/push\` against customer ${customerId ?? "?"} for audit #${auditId ?? "?"} and stamp \`actualDailyBudget\` + \`lastPushedAt\` on each CMS row.`,
    });

    let approvalId: number;
    try {
      approvalId = await queueProposal({
        agentName: "optimate-google-ads",
        agentRunId: ctx.agentRunId,
        triggeredByUserId: ctx.context.userId as number | undefined,
        proposalType: "budget-push-live",
        title: `Push daily budgets to ${args.campaigns.length} campaign${args.campaigns.length === 1 ? "" : "s"}`,
        clientId,
        proposalPayload: {
          auditId: auditId ?? null,
          campaigns: args.campaigns,
        },
        rendered: { internalMarkdown },
      });
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    return { ok: true, data: { approvalId, approvalUrl: agentApprovalPath(approvalId) } };
  },
};
