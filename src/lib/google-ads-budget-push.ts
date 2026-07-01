import { isBudgetAllocationCampaign, isBudgetPushEligible, type BudgetCampaign } from "@/lib/google-ads-budget-email";

const PUSH_MIN_SHARED_ALLOCATION_PERCENT = 99.5;

export function canPushGoogleAdsBudget(campaigns: BudgetCampaign[], monthlyTotal: number): boolean {
  if (monthlyTotal <= 0) return false;

  const enabledSharedCampaigns = campaigns.filter(isBudgetAllocationCampaign);
  const sharedAllocationPercent = enabledSharedCampaigns.reduce(
    (sum, campaign) => sum + campaign.budgetPercentage,
    0,
  );

  if (enabledSharedCampaigns.length > 0 && sharedAllocationPercent < PUSH_MIN_SHARED_ALLOCATION_PERCENT) {
    return false;
  }

  return campaigns.some((campaign) => isBudgetPushEligible(campaign) && campaign.calculatedDailyBudget > 0);
}
