/**
 * Tool: propose_ad_copy_deploy
 *
 * Queues "push approved RSAs to Google Ads (PAUSED)" for human approval. On
 * Apply, dispatcher calls Growth Tools `deploy-ad-copy/cms` which mints the
 * ads against the linked customer ID. Defaults to PAUSED so the human flips
 * them on manually in Google Ads.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { agentApprovalPath } from "@/lib/agents/_shared/admin-paths";
import { queueProposal, buildInternalMarkdown } from "./_propose-helpers";

type AdStatus = "PAUSED" | "ENABLED";

interface ProposeAdCopyDeployArgs {
  adLabel?: string;
  adStatus?: AdStatus;
  summary: string;
  supportingNumbers?: string[];
}

const VALID_STATUSES: AdStatus[] = ["PAUSED", "ENABLED"];

export const proposeAdCopyDeploy: CanonicalTool<ProposeAdCopyDeployArgs> = {
  name: "propose_ad_copy_deploy",
  description:
    "Queue a deployment of approved ad copy (RSAs) to Google Ads for human approval. The audit's adCopyStatus must be 'approved' before this can be Applied. Defaults to PAUSED for safety — human flips ads on in Google Ads.",
  inputSchema: {
    type: "object",
    properties: {
      adLabel: { type: "string", maxLength: 80, description: "Label applied to all created ads. Default: 'OD RSA YYYY-MM-DD'." },
      adStatus: { type: "string", enum: VALID_STATUSES, description: "Default PAUSED." },
      summary: { type: "string", minLength: 10, maxLength: 600 },
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
    const out: ProposeAdCopyDeployArgs = { summary };
    if (typeof obj.adLabel === "string" && obj.adLabel.trim()) out.adLabel = obj.adLabel.trim();
    if (typeof obj.adStatus === "string") {
      const upper = obj.adStatus.toUpperCase();
      if (!VALID_STATUSES.includes(upper as AdStatus)) throw new Error("adStatus must be PAUSED or ENABLED");
      out.adStatus = upper as AdStatus;
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
    const customerId = ctx.context.customerId as string | undefined;

    const adStatus: AdStatus = args.adStatus ?? "PAUSED";
    const adLabel = args.adLabel ?? `OD RSA ${new Date().toISOString().slice(0, 10)}`;

    const internalMarkdown = buildInternalMarkdown({
      summary: args.summary,
      supportingNumbers: args.supportingNumbers,
      diffSection: `Deploy approved RSAs to Google Ads customer ${customerId ?? "?"}.\n\n- Label: **${adLabel}**\n- Status: **${adStatus}**${adStatus === "PAUSED" ? " (recommended — human flips on)" : " (live immediately)"}`,
      applyEffect: `Will call Growth Tools \`deploy-ad-copy/cms\` for audit #${auditId ?? "?"}. Audit's adCopyStatus must be "approved" first; otherwise apply rejects.`,
    });

    let approvalId: number;
    try {
      approvalId = await queueProposal({
        agentName: "optimate-google-ads",
        agentRunId: ctx.agentRunId,
        triggeredByUserId: ctx.context.userId as number | undefined,
        proposalType: "ad-copy-deploy",
        title: `Deploy ad copy (${adStatus}) — audit #${auditId ?? "?"}`,
        clientId,
        proposalPayload: { auditId: auditId ?? null, adLabel, adStatus },
        rendered: { internalMarkdown },
      });
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    return { ok: true, data: { approvalId, approvalUrl: agentApprovalPath(approvalId) } };
  },
};
