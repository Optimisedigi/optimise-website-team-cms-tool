import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { agentApprovalPath } from "@/lib/agents/_shared/admin-paths";
import { fetchCampaignsForCustomer } from "./_campaign-validation";
import { queueProposal, buildInternalMarkdown, mdTable } from "./_propose-helpers";

interface ProposeAllCampaignBudgetPushArgs {
  dailyBudget: number;
  includePaused?: boolean;
  summary: string;
  supportingNumbers?: string[];
}

interface PushCampaignOut {
  campaignId: string;
  campaignName: string;
  dailyBudget: number;
  currentDailyBudget?: number | null;
}

function formatDailyBudget(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `$${value.toFixed(2)}/day` : "—";
}

export const proposeAllCampaignBudgetPush: CanonicalTool<ProposeAllCampaignBudgetPushArgs> = {
  name: "propose_all_campaign_budget_push",
  description:
    "Queue a live push of one daily budget amount to all live campaigns in the linked Google Ads account. The model supplies only dailyBudget and scope intent; campaign IDs and names are fetched from Growth Tools server-side.",
  inputSchema: {
    type: "object",
    properties: {
      dailyBudget: { type: "number", minimum: 0 },
      includePaused: {
        type: "boolean",
        description: "Whether paused campaigns should be included. Defaults to true for explicit all-campaign requests.",
      },
      summary: { type: "string", minLength: 10, maxLength: 800 },
      supportingNumbers: {
        type: "array",
        items: { type: "string", maxLength: 240 },
        maxItems: 12,
      },
    },
    required: ["dailyBudget", "summary"],
    additionalProperties: false,
  },
  validate: (raw) => {
    if (!raw || typeof raw !== "object") throw new Error("input must be an object");
    const obj = raw as Record<string, unknown>;
    const dailyBudget = Number(obj.dailyBudget);
    if (!Number.isFinite(dailyBudget) || dailyBudget < 0) throw new Error("dailyBudget must be a non-negative number");
    const summary = String(obj.summary ?? "").trim();
    if (summary.length < 10) throw new Error("summary must be at least 10 characters");
    const out: ProposeAllCampaignBudgetPushArgs = { dailyBudget, summary };
    if (typeof obj.includePaused === "boolean") out.includePaused = obj.includePaused;
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

    let campaigns: PushCampaignOut[];
    try {
      const liveCampaigns = await fetchCampaignsForCustomer(customerId);
      const includePaused = args.includePaused ?? true;
      campaigns = liveCampaigns
        .filter((campaign) => campaign.status !== "REMOVED")
        .filter((campaign) => includePaused || campaign.status !== "PAUSED")
        .map((campaign) => ({
          campaignId: campaign.campaignId,
          campaignName: campaign.campaignName,
          currentDailyBudget: campaign.currentDailyBudget ?? null,
          dailyBudget: args.dailyBudget,
        }));
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    if (campaigns.length === 0) {
      return { ok: false, error: "No campaigns matched the requested bulk budget scope." };
    }

    const totalDaily = campaigns.reduce((s, c) => s + c.dailyBudget, 0);
    const rows = campaigns.map((campaign) => [
      campaign.campaignName,
      formatDailyBudget(campaign.currentDailyBudget),
      formatDailyBudget(campaign.dailyBudget),
      "—",
    ]);
    const internalMarkdown = buildInternalMarkdown({
      summary: args.summary,
      supportingNumbers: args.supportingNumbers,
      diffSection: `${mdTable(["Campaign", "Current daily budget", "New daily budget", "Bid strategy"], rows)}\n\n**Total daily across pushed campaigns:** $${totalDaily.toFixed(2)}`,
      applyEffect: `Will call Growth Tools \`campaign-budgets/push\` against customer ${customerId ?? "?"} for audit #${auditId ?? "?"} and stamp \`actualDailyBudget\` + \`lastPushedAt\` on each CMS row. Campaign rows were expanded from live Growth Tools data, not model-supplied names.`,
    });

    let approvalId: number;
    try {
      approvalId = await queueProposal({
        agentName: "optimate-google-ads",
        agentRunId: ctx.agentRunId,
        triggeredByUserId: ctx.context.userId as number | undefined,
        proposalType: "budget-push-live",
        title: `Push daily budgets to ${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"}`,
        clientId,
        proposalPayload: {
          auditId: auditId ?? null,
          campaigns,
          source: "agent-bulk-all-campaigns",
        },
        rendered: { internalMarkdown },
      });
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    return { ok: true, data: { approvalId, approvalUrl: agentApprovalPath(approvalId), campaignCount: campaigns.length } };
  },
};
