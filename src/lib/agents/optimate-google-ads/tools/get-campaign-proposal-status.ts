/**
 * Tool: get_campaign_proposal_status
 *
 * Reads the audit's pipeline statuses so the agent can answer "is the
 * proposal ready yet?" / "did the build finish?" without dispatching another
 * write. Returns campaignProposalStatus, campaignBuildStatus, adCopyStatus,
 * and adCopyDeployStatus.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { getPayload } from "payload";
import payloadConfig from "@/payload.config";

type EmptyArgs = Record<string, never>;

interface AuditStatusFields {
  id: number;
  campaignProposalStatus?: string | null;
  campaignBuildStatus?: string | null;
  campaignBuildStartedAt?: string | null;
  campaignBuildError?: string | null;
  adCopyStatus?: string | null;
  adCopyDeployStatus?: string | null;
  adCopyDeployError?: string | null;
}

export const getCampaignProposalStatus: CanonicalTool<EmptyArgs> = {
  name: "get_campaign_proposal_status",
  description:
    "Returns the current pipeline statuses on the linked audit: campaignProposalStatus (none/pending/running/ready_for_review/approved/failed), campaignBuildStatus, adCopyStatus, adCopyDeployStatus. Use to answer 'is the proposal ready?' or 'did the build finish?' without dispatching another action.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  validate: () => ({} as EmptyArgs),
  execute: async (_args, ctx) => {
    const auditId = ctx.context.auditId as string | number | undefined;
    if (!auditId) return { ok: false, error: "No auditId in agent context" };

    try {
      const cfg = await payloadConfig;
      const payload = await getPayload({ config: cfg });
      const audit = (await payload.findByID({
        collection: "google-ads-audits",
        id: auditId,
        overrideAccess: true,
        depth: 0,
      })) as unknown as AuditStatusFields;

      return {
        ok: true,
        data: {
          auditId: audit.id,
          campaignProposalStatus: audit.campaignProposalStatus ?? "none",
          campaignBuildStatus: audit.campaignBuildStatus ?? "none",
          ...(audit.campaignBuildStartedAt ? { campaignBuildStartedAt: audit.campaignBuildStartedAt } : {}),
          ...(audit.campaignBuildError ? { campaignBuildError: audit.campaignBuildError } : {}),
          adCopyStatus: audit.adCopyStatus ?? "none",
          adCopyDeployStatus: audit.adCopyDeployStatus ?? "none",
          ...(audit.adCopyDeployError ? { adCopyDeployError: audit.adCopyDeployError } : {}),
        },
      };
    } catch (err) {
      return { ok: false, error: `Failed to read audit status: ${(err as Error).message}` };
    }
  },
};
