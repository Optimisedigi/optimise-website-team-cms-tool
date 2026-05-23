import type { ApplyHandler, ApplyHandlerResult } from "@/lib/agents/_shared/apply-dispatcher";

export const applyCampaignBidStrategyChange: ApplyHandler = async (payload): Promise<ApplyHandlerResult> => {
  const campaignId = String(payload.campaignId ?? "").trim();
  const recommendation = String(payload.recommendation ?? "").trim();
  if (!campaignId) throw new Error("campaign-bid-strategy-change payload missing campaignId");
  return {
    message: `Manual bid-strategy recommendation acknowledged for campaign ${campaignId}. No live Google Ads change was made.`,
    detail: {
      campaignId,
      campaignName: typeof payload.campaignName === "string" ? payload.campaignName : null,
      currentBidStrategy: typeof payload.currentBidStrategy === "string" ? payload.currentBidStrategy : null,
      recommendation,
      proposalOnly: true,
    },
  };
};
