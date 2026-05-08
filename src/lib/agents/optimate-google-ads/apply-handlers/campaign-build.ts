/**
 * Apply handler: campaign-build
 *
 * Builds the approved campaign structure into Google Ads PAUSED. Mirrors
 * POST /api/google-ads-audits/[id]/build-campaigns — same Growth Tools
 * endpoint, same status flips, same customer-id verification.
 */

import type { ApplyHandler, ApplyHandlerResult } from "@/lib/agents/_shared/apply-dispatcher";
import { resolveCustomerId, postGrowthTools } from "./_helpers";

interface AuditForBuild {
  websiteUrl?: string;
  businessName?: string;
  campaignProposalStatus?: string;
  campaignProposal?: unknown;
  generatedAdCopy?: unknown;
}

export const applyCampaignBuild: ApplyHandler = async (payload, ctx): Promise<ApplyHandlerResult> => {
  const { payload: pl } = ctx;
  const auditId = payload.auditId as string | number | undefined;
  if (!auditId) throw new Error("campaign-build payload missing auditId");
  const auditIdNum = typeof auditId === "string" ? Number(auditId) : auditId;
  if (!Number.isFinite(auditIdNum)) throw new Error("campaign-build: auditId must be numeric");

  const audit = (await pl.findByID({
    collection: "google-ads-audits",
    id: auditIdNum as number,
    overrideAccess: true,
  })) as AuditForBuild;

  if (audit.campaignProposalStatus !== "approved") {
    throw new Error(`campaign-build: campaignProposalStatus is "${audit.campaignProposalStatus ?? "none"}", must be "approved" first`);
  }
  if (!audit.websiteUrl || !audit.businessName) {
    throw new Error("campaign-build: audit is missing websiteUrl or businessName");
  }

  const proposalData = typeof audit.campaignProposal === "string"
    ? JSON.parse(audit.campaignProposal)
    : audit.campaignProposal;
  const proposedCampaigns = (proposalData as { proposedCampaigns?: unknown[] } | null)?.proposedCampaigns ?? [];
  if (!Array.isArray(proposedCampaigns) || proposedCampaigns.length === 0) {
    throw new Error("campaign-build: no proposedCampaigns on the audit's campaignProposal");
  }

  const { customerId } = await resolveCustomerId(pl, auditIdNum as number);

  const adCopy = (typeof audit.generatedAdCopy === "string"
    ? JSON.parse(audit.generatedAdCopy)
    : audit.generatedAdCopy) as Record<string, Record<string, { headlines?: unknown[]; descriptions?: unknown[] }>> | null;

  const campaigns = (proposedCampaigns as Array<Record<string, unknown>>).map((camp) => {
    const name = String(camp.name ?? "");
    const adGroups = Array.isArray(camp.adGroups) ? (camp.adGroups as Array<Record<string, unknown>>) : [];
    return {
      name,
      campaignType: camp.campaignType ?? "generic",
      channelType: camp.channelType ?? "SEARCH",
      status: "PAUSED",
      adGroups: adGroups.map((ag) => {
        const agName = String(ag.name ?? "");
        const keywords = Array.isArray(ag.keywords) ? (ag.keywords as Array<Record<string, unknown>>) : [];
        return {
          name: agName,
          theme: ag.theme ?? agName,
          keywords: keywords.map((kw) => ({
            text: String(kw.text ?? ""),
            matchType: kw.matchType ?? "PHRASE",
            ...(kw.existingCampaign ? { existingCampaign: kw.existingCampaign } : {}),
            ...(kw.existingAdGroup ? { existingAdGroup: kw.existingAdGroup } : {}),
          })),
          landingPage: ag.landingPage ?? { url: null, status: "exists" },
          adCopy: adCopy?.[name]?.[agName] ?? { headlines: [], descriptions: [] },
        };
      }),
    };
  });

  const dbClient = (pl.db as unknown as { client?: { execute: (q: { sql: string; args: unknown[] }) => Promise<unknown> } }).client;
  if (dbClient) {
    try {
      await dbClient.execute({
        sql: "UPDATE google_ads_audits SET campaign_build_status = ?, campaign_build_started_at = ?, campaign_build_error = NULL WHERE id = ?",
        args: ["building", new Date().toISOString(), auditIdNum],
      });
    } catch (err) {
      throw new Error(`campaign-build: failed to set building status: ${(err as Error).message}`);
    }
  }

  const res = await postGrowthTools("/api/google-ads/campaign-builder/cms", {
    auditDocId: auditIdNum,
    customerId,
    businessName: audit.businessName,
    websiteUrl: audit.websiteUrl,
    mergeStrategy: "hybrid",
    campaigns,
  });

  if (!res.ok) {
    if (dbClient) {
      try {
        await dbClient.execute({
          sql: "UPDATE google_ads_audits SET campaign_build_status = ?, campaign_build_error = ? WHERE id = ?",
          args: [null, res.error.slice(0, 4000), auditIdNum],
        });
      } catch { /* best effort */ }
    }
    throw new Error(`Growth Tools campaign-builder failed: ${res.error}`);
  }

  return {
    message: `Building ${campaigns.length} campaigns into Google Ads (PAUSED). Status will flip to "completed" when Growth Tools finishes.`,
    detail: { auditId: auditIdNum, customerId, campaignCount: campaigns.length },
  };
};
