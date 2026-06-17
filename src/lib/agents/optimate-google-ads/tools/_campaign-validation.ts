import { ensureCustomerId, growthToolsGet } from "./_growth-tools";

export interface CampaignIdentity {
  campaignId: string;
  campaignName: string;
  status?: string;
  currentDailyBudget?: number | null;
}

interface LiveCampaignRow {
  campaignId?: string;
  campaignName?: string;
  name?: string;
  status?: string;
  dailyBudget?: number | null;
}

interface LiveCampaignEnvelope {
  metrics?: LiveCampaignRow[];
}

export async function fetchCampaignsForCustomer(rawCustomerId: string | undefined): Promise<CampaignIdentity[]> {
  const customerId = ensureCustomerId(rawCustomerId);
  const qs = new URLSearchParams({ customerId, dateRange: "LAST_7_DAYS" });
  const res = await growthToolsGet<LiveCampaignEnvelope>(
    `/api/google-ads/campaign-budgets/get-metrics?${qs.toString()}`,
  );
  if (!res.ok) {
    throw new Error(`Could not verify campaign IDs: ${res.error}`);
  }

  const campaigns = (res.data?.metrics ?? [])
    .map((row): CampaignIdentity | null => {
      const campaignId = String(row.campaignId ?? "").trim();
      if (!campaignId) return null;
      const campaignName = String(row.campaignName ?? row.name ?? campaignId).trim() || campaignId;
      const status = typeof row.status === "string" && row.status.trim() ? row.status.trim() : undefined;
      const dailyBudget = Number(row.dailyBudget);
      const currentDailyBudget = Number.isFinite(dailyBudget) ? dailyBudget : null;
      return { campaignId, campaignName, currentDailyBudget, ...(status ? { status } : {}) };
    })
    .filter((campaign): campaign is CampaignIdentity => campaign !== null);

  if (campaigns.length === 0) {
    throw new Error("Could not verify campaign IDs: Growth Tools returned no live campaigns.");
  }

  return campaigns;
}

export async function assertCampaignsExistForCustomer<T extends { campaignId: string; campaignName: string }>(
  rawCustomerId: string | undefined,
  campaigns: T[],
): Promise<T[]> {
  const liveCampaigns = await fetchCampaignsForCustomer(rawCustomerId);
  const liveById = new Map(liveCampaigns.map((campaign) => [campaign.campaignId, campaign]));
  const unknown = campaigns.filter((campaign) => !liveById.has(campaign.campaignId));

  if (unknown.length > 0) {
    const sample = unknown
      .slice(0, 5)
      .map((campaign) => `${campaign.campaignName} (${campaign.campaignId})`)
      .join(", ");
    throw new Error(
      `Budget push rejected: ${unknown.length} campaign ID${unknown.length === 1 ? "" : "s"} ` +
        `were not found in the linked Google Ads account. Use get_campaign_performance and retry with exact campaign IDs. Unknown: ${sample}`,
    );
  }

  return campaigns.map((campaign) => {
    const live = liveById.get(campaign.campaignId);
    return {
      ...campaign,
      campaignName: live?.campaignName ?? campaign.campaignName,
      currentDailyBudget: live?.currentDailyBudget ?? null,
    };
  });
}
