import type { ApplyHandler, ApplyHandlerResult } from "@/lib/agents/_shared/apply-dispatcher";
import { postGrowthTools, resolveCustomerId } from "./_helpers";

interface CampaignStatusPayload {
  auditId?: string | number | null;
  campaigns?: Array<{
    campaignId?: string | number;
    campaignName?: string;
    operation?: string;
    expectedStatus?: string;
  }>;
}

export const applyCampaignStatusChange: ApplyHandler = async (payload, ctx): Promise<ApplyHandlerResult> => {
  const typed = payload as CampaignStatusPayload;
  const auditId = typed.auditId;
  if (!auditId) throw new Error("campaign-status-change payload missing auditId");
  const auditIdNum = typeof auditId === "string" ? Number(auditId) : auditId;
  if (!Number.isFinite(auditIdNum)) throw new Error("campaign-status-change: auditId must be numeric");

  const campaigns = Array.isArray(typed.campaigns) ? typed.campaigns.map((campaign, index) => {
    const campaignId = String(campaign.campaignId ?? "").trim();
    const operation = String(campaign.operation ?? "").trim();
    if (!campaignId) throw new Error(`campaign-status-change campaigns[${index}] missing campaignId`);
    if (operation !== "pause" && operation !== "enable") {
      throw new Error(`campaign-status-change campaigns[${index}] operation must be pause or enable`);
    }
    return {
      campaignId,
      campaignName: campaign.campaignName,
      operation,
      expectedStatus: campaign.expectedStatus,
    };
  }) : [];
  if (campaigns.length === 0) throw new Error("campaign-status-change payload missing campaigns");

  const { customerId } = await resolveCustomerId(ctx.payload, auditIdNum as number);
  const res = await postGrowthTools("/api/google-ads/campaigns/status", { customerId, campaigns });
  if (!res.ok) {
    throw new Error(`Growth Tools campaign status change failed: ${res.error}`);
  }

  const changedCount = Array.isArray((res.data as { changed?: unknown[] } | null)?.changed)
    ? ((res.data as { changed?: unknown[] }).changed ?? []).length
    : campaigns.length;

  return {
    message: `Applied campaign status change for ${changedCount} campaign${changedCount === 1 ? "" : "s"}.`,
    detail: { auditId: auditIdNum, customerId, campaigns, response: res.data as Record<string, unknown> | null },
  };
};
