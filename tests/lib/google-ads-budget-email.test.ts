/**
 * Tests for the shared Google Ads budget email module. Pure unit tests — no
 * Payload, no HTTP — to keep the suite fast.
 */

import { describe, it, expect } from "vitest";
import {
  generateBudgetEmailHtml,
  formatCostPerConv,
  calculateSmartDailyBudget,
  calculateMonthlySpend,
  type BudgetCampaign,
  type MonthlySpend,
} from "@/lib/google-ads-budget-email";

function makeCampaign(overrides: Partial<BudgetCampaign> = {}): BudgetCampaign {
  return {
    campaignId: "1",
    campaignName: "Brand Search",
    budgetPercentage: 50,
    calculatedDailyBudget: 100,
    bidStrategy: "manual_cpc",
    impressions: 1000,
    clicks: 80,
    avgCpc: 1.25,
    conversions: 5,
    mtdSpend: 200,
    enabled: true,
    ...overrides,
  };
}

describe("generateBudgetEmailHtml", () => {
  it("starts with the expected font wrapper div and embeds month + status text", () => {
    const campaigns = [
      makeCampaign({ campaignName: "Brand", budgetPercentage: 60, clicks: 200 }),
      makeCampaign({ campaignId: "2", campaignName: "Generic", budgetPercentage: 40, clicks: 50 }),
    ];
    const spend: MonthlySpend = {
      totalSpend: 500,
      dailyBudget: 33,
      daysElapsed: 15,
      daysRemaining: 15,
      dailyBurnRate: 33,
      remainingBudget: 500,
      maxBudget: 1000,
    };
    const html = generateBudgetEmailHtml(
      "Acme Plumbing",
      "April 2026",
      spend,
      campaigns,
      1000,
      "acme",
      "1234",
    );

    expect(html.startsWith('<div style="font-family:Arial')).toBe(true);
    expect(html).toContain("April 2026 (Month-to-Date)");
    // Status text is one of: Over Budget / On Track / Under Budget.
    // For 50% used at 15/30 days elapsed (~49% on track), expect "On Track".
    expect(html).toMatch(/On Track|Under Budget/);
    expect(html).toContain("Brand");
    expect(html).toContain("Generic");
    // Dashboard link with PIN
    expect(html).toContain("https://cms.optimisedigital.online/google-dashboard/acme");
    expect(html).toContain("PIN: 1234");
  });

  it("omits the dashboard link when no clientSlug is provided", () => {
    const spend: MonthlySpend = {
      totalSpend: 0,
      dailyBudget: 0,
      daysElapsed: 1,
      daysRemaining: 29,
      dailyBurnRate: 0,
      remainingBudget: 1000,
      maxBudget: 1000,
    };
    const html = generateBudgetEmailHtml("Acme", "April 2026", spend, [], 1000);
    expect(html).not.toContain("google-dashboard");
    expect(html).not.toContain("PIN:");
  });

  it("sorts campaigns by clicks descending in the breakdown table", () => {
    const campaigns = [
      makeCampaign({ campaignId: "low", campaignName: "Low", clicks: 10, budgetPercentage: 20 }),
      makeCampaign({ campaignId: "hi", campaignName: "Hi", clicks: 999, budgetPercentage: 80 }),
    ];
    const spend: MonthlySpend = {
      totalSpend: 100,
      dailyBudget: 33,
      daysElapsed: 1,
      daysRemaining: 29,
      dailyBurnRate: 100,
      remainingBudget: 900,
      maxBudget: 1000,
    };
    const html = generateBudgetEmailHtml("Acme", "April 2026", spend, campaigns, 1000);
    expect(html.indexOf(">Hi<")).toBeLessThan(html.indexOf(">Low<"));
  });
});

describe("formatCostPerConv", () => {
  it("returns em-dash when conversions are zero or negative", () => {
    expect(formatCostPerConv(100, 0)).toBe("\u2014");
    expect(formatCostPerConv(100, -1)).toBe("\u2014");
  });

  it("returns em-dash when computed CPL is non-finite", () => {
    expect(formatCostPerConv(0, 0)).toBe("\u2014");
  });

  it("returns $X.XX when CPL < $100", () => {
    expect(formatCostPerConv(200, 4)).toBe("$50.00");
    expect(formatCostPerConv(99, 1)).toBe("$99.00");
  });

  it("returns $X (rounded) when CPL >= $100", () => {
    expect(formatCostPerConv(1000, 5)).toBe("$200");
    expect(formatCostPerConv(1234, 10)).toBe("$123");
  });
});

describe("calculateSmartDailyBudget", () => {
  it("splits remaining budget by percentage over remaining days", () => {
    // monthly 3000, MTD 1000, remaining 2000. 50% share = 1000 over 10 days = 100/day.
    expect(calculateSmartDailyBudget(3000, 50, 1000, 10)).toBe(100);
  });

  it("returns zero when MTD spend has already met or exceeded the monthly budget", () => {
    expect(calculateSmartDailyBudget(1000, 100, 1000, 10)).toBe(0);
    expect(calculateSmartDailyBudget(1000, 100, 1500, 10)).toBe(0);
  });

  it("returns zero when zero days remain at zero MTD (edge: percentage=0)", () => {
    expect(calculateSmartDailyBudget(3000, 0, 0, 10)).toBe(0);
  });

  it("calculateMonthlySpend respects standalone exclusion from totals", () => {
    const campaigns: BudgetCampaign[] = [
      makeCampaign({ campaignId: "regular", mtdSpend: 500, standalone: false }),
      makeCampaign({ campaignId: "stand", mtdSpend: 999, standalone: true }),
    ];
    const result = calculateMonthlySpend(campaigns, 2000);
    // Standalone is excluded from totalSpend.
    expect(result.totalSpend).toBe(500);
    expect(result.maxBudget).toBe(2000);
    expect(result.remainingBudget).toBe(1500);
  });
});
