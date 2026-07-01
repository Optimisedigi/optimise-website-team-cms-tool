import { describe, expect, it } from "vitest";

import { canPushGoogleAdsBudget } from "@/lib/google-ads-budget-push";
import type { BudgetCampaign } from "@/lib/google-ads-budget-email";

function makeCampaign(overrides: Partial<BudgetCampaign> = {}): BudgetCampaign {
  return {
    campaignId: "1",
    campaignName: "Search - Generic",
    budgetPercentage: 60,
    calculatedDailyBudget: 100,
    actualDailyBudget: 80,
    bidStrategy: "manual_cpc",
    impressions: 1000,
    clicks: 100,
    avgCpc: 5,
    conversions: 10,
    mtdSpend: 500,
    enabled: true,
    campaignStatus: "ENABLED",
    campaignStartDate: null,
    campaignEndDate: null,
    ...overrides,
  };
}

describe("canPushGoogleAdsBudget", () => {
  it("allows push when allocations are over 100% if monthly budget is set and an eligible campaign has a positive daily budget", () => {
    const campaigns: BudgetCampaign[] = [
      makeCampaign({ campaignId: "1", budgetPercentage: 70, calculatedDailyBudget: 120 }),
      makeCampaign({ campaignId: "2", budgetPercentage: 55, calculatedDailyBudget: 90 }),
    ];

    expect(canPushGoogleAdsBudget(campaigns, 5000)).toBe(true);
  });

  it("blocks push when monthly budget is 0 even if an eligible campaign has a positive daily budget", () => {
    const campaigns: BudgetCampaign[] = [makeCampaign({ calculatedDailyBudget: 120 })];

    expect(canPushGoogleAdsBudget(campaigns, 0)).toBe(false);
  });

  it("blocks push when enabled shared campaign allocations are below 100%", () => {
    const campaigns: BudgetCampaign[] = [
      makeCampaign({ campaignId: "1", budgetPercentage: 60, calculatedDailyBudget: 120 }),
      makeCampaign({ campaignId: "2", budgetPercentage: 35, calculatedDailyBudget: 90 }),
    ];

    expect(canPushGoogleAdsBudget(campaigns, 5000)).toBe(false);
  });

  it("blocks push when no eligible campaign has a positive daily budget", () => {
    const campaigns: BudgetCampaign[] = [
      makeCampaign({ campaignId: "1", budgetPercentage: 50, calculatedDailyBudget: 0 }),
      makeCampaign({ campaignId: "2", budgetPercentage: 50, enabled: false, calculatedDailyBudget: 150 }),
      makeCampaign({ campaignId: "3", budgetPercentage: 0, campaignStatus: "PAUSED", calculatedDailyBudget: 75 }),
    ];

    expect(canPushGoogleAdsBudget(campaigns, 5000)).toBe(false);
  });
});
