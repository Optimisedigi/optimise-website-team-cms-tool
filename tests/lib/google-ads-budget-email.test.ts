/**
 * Tests for the shared Google Ads budget email module. Pure unit tests — no
 * Payload, no HTTP — to keep the suite fast.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  generateBudgetEmailHtml,
  formatCostPerConv,
  calculateSmartDailyBudget,
  calculateMonthlySpend,
  calculateCompletedMonthSpend,
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

afterEach(() => {
  vi.useRealTimers();
});

describe("generateBudgetEmailHtml", () => {
  it("starts with the expected font wrapper div and embeds spend pacing status text", () => {
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
    expect(html).toContain("Spend to Budget");
    // Status text is one of: Over Budget / Ahead of Pace / Under Budget / On Track.
    // For 50% used at 15/30 days elapsed (~49% on track), expect a pacing-safe status.
    expect(html).toMatch(/On Track|Under Budget|Ahead of Pace/);
    expect(html).toContain("Brand");
    expect(html).toContain("Generic");
    expect(html).toContain("Target spend to date");
    expect(html).toContain("Pacing difference");
    expect(html).toContain("Actual spend");
    expect(html).toContain("Remaining");
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

  it("renders weekly time tracking with full-month day boxes and matching card height", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-10T12:00:00Z"));

    const spend: MonthlySpend = {
      totalSpend: 320,
      dailyBudget: 40,
      daysElapsed: 10,
      daysRemaining: 18,
      dailyBurnRate: 32,
      remainingBudget: 800,
      maxBudget: 1120,
    };

    const html = generateBudgetEmailHtml("Acme", "February 2026", spend, [makeCampaign()], 1120, undefined, undefined, { variant: "weekly" });
    const dayCells = (html.match(/title="Day \d+"/g) ?? []).length;

    expect(dayCells).toBe(28);
    expect(html).toContain('data-budget-time-tracking-card="1" style="padding:20px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;height:100%;box-sizing:border-box"');
    expect(html).toContain('data-budget-progress-card="1" style="padding:20px;background:');
    expect(html).toContain('Days Elapsed');
    expect(html).toContain('Days Remaining');
    expect(html).toContain('title="Day 28"');
    expect(html).not.toContain('title="Day 29"');
  });

  it("renders monthly without the time-tracking card and keeps the bordered half-width budget card", () => {
    const spend: MonthlySpend = {
      totalSpend: 165,
      dailyBudget: 200,
      daysElapsed: 1,
      daysRemaining: 29,
      dailyBurnRate: 165,
      remainingBudget: 5835,
      maxBudget: 6000,
    };

    const html = generateBudgetEmailHtml("Acme", "May 2026", spend, [makeCampaign()], 6000, undefined, undefined, { variant: "monthly" });

    expect(html).toContain('data-budget-progress-card="1" style="padding:20px;background:#f0fdf4;border-radius:12px;border:2px solid #059669;height:100%;box-sizing:border-box"');
    expect(html).toContain('data-budget-progress-cell="1" style="width:52%;vertical-align:top;padding-right:12px;height:100%"');
    expect(html).toContain('data-budget-time-tracking-cell="placeholder" style="width:48%;vertical-align:top;padding-left:0">&#8203;</td>');
    expect(html).not.toContain('data-budget-time-tracking-card="1"');
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

  it("calculateCompletedMonthSpend uses the full previous month instead of current MTD pacing", () => {
    const campaigns: BudgetCampaign[] = [makeCampaign({ mtdSpend: 360 })];
    const result = calculateCompletedMonthSpend(campaigns, 1000, "2026-06");

    expect(result.totalSpend).toBe(360);
    expect(result.daysElapsed).toBe(30);
    expect(result.daysRemaining).toBe(0);
    expect(result.dailyBudget).toBeCloseTo(1000 / 30, 5);
    expect(result.remainingBudget).toBe(640);
  });
});
