/**
 * Tool: propose_campaign_build
 *
 * Queues "build the approved campaign structure into Google Ads PAUSED" for
 * human approval. On Apply, the dispatcher mirrors the build-campaigns route:
 * stamps build status + posts to Growth Tools campaign-builder.
 *
 * The audit's `campaignProposalStatus` must be "approved" before this can be
 * applied.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { queueProposal, buildInternalMarkdown } from "./_propose-helpers";

interface ProposeCampaignBuildArgs {
  summary: string;
  supportingNumbers?: string[];
}

export const proposeCampaignBuild: CanonicalTool<ProposeCampaignBuildArgs> = {
  name: "propose_campaign_build",
  description:
    "Queue a build of the approved campaign structure into Google Ads (PAUSED) for human approval. The audit's campaignProposalStatus must be 'approved' before this can be Applied. Always ships PAUSED \u2014 a human flips campaigns on in Google Ads after a sanity check.",
  inputSchema: {
    type: "object",
    properties: {
      summary: { type: "string", minLength: 10, maxLength: 800 },
      supportingNumbers: {
        type: "array",
        items: { type: "string", maxLength: 240 },
        maxItems: 12,
      },
    },
    required: ["summary"],
    additionalProperties: false,
  },
  validate: (raw) => {
    if (!raw || typeof raw !== "object") throw new Error("input must be an object");
    const obj = raw as Record<string, unknown>;
    const summary = String(obj.summary ?? "").trim();
    if (summary.length < 10) throw new Error("summary must be at least 10 characters");
    const out: ProposeCampaignBuildArgs = { summary };
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

    const internalMarkdown = buildInternalMarkdown({
      summary: args.summary,
      supportingNumbers: args.supportingNumbers,
      diffSection: `Build the approved campaign structure on audit #${auditId ?? "?"} into Google Ads customer ${customerId ?? "?"}.\n\n- All campaigns ship **PAUSED**\n- Human verifies in Google Ads UI then enables manually`,
      applyEffect: `Will call Growth Tools \`campaign-builder/cms\` for audit #${auditId ?? "?"}. Audit's campaignProposalStatus must be \"approved\" first; otherwise apply rejects.`,
    });

    let approvalId: number;
    try {
      approvalId = await queueProposal({
        agentName: "optimate-google-ads",
        agentRunId: ctx.agentRunId,
        triggeredByUserId: ctx.context.userId as number | undefined,
        proposalType: "campaign-build",
        title: `Build campaigns (PAUSED) \u2014 audit #${auditId ?? "?"}`,
        clientId,
        proposalPayload: { auditId: auditId ?? null },
        rendered: { internalMarkdown },
      });
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    return { ok: true, data: { approvalId, approvalUrl: `/agent-approvals/${approvalId}` } };
  },
};
