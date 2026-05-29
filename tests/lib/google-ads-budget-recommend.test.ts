import {
  computeBudgetRecommendations,
  daysInPreviousMonth,
  type CampaignPerformance,
} from "@/lib/google-ads-budget-recommend";

function campaign(
  id: string,
  conversions: number,
  spend: number,
  enabled = true,
): CampaignPerformance {
  return { campaignId: id, campaignName: `Campaign ${id}`, enabled, conversions, spend };
}

describe("computeBudgetRecommendations", () => {
  it("returns one recommendation per enabled campaign and skips disabled", () => {
    const result = computeBudgetRecommendations({
      monthlyBudget: 3040,
      daysInMonth: 30.4,
      campaigns: [
        campaign("a", 10, 500),
        campaign("b", 5, 500),
        campaign("c", 0, 0, false),
      ],
    });
    expect(result.recommendations).toHaveLength(2);
    expect(result.recommendations.map((r) => r.campaignId)).toEqual(["a", "b"]);
  });

  it("favours the campaign with more conversions and lower CPA", () => {
    // A: 20 conv @ $1000 → CPA $50. B: 5 conv @ $1000 → CPA $200.
    // A should get a strictly larger recommended daily budget.
    const result = computeBudgetRecommendations({
      monthlyBudget: 6080,
      daysInMonth: 30.4,
      clampPct: 0, // disable clamp so the score split shows clearly
      campaigns: [campaign("a", 20, 1000), campaign("b", 5, 1000)],
    });
    const a = result.recommendations.find((r) => r.campaignId === "a")!;
    const b = result.recommendations.find((r) => r.campaignId === "b")!;
    expect(a.recommendedDailyBudget).toBeGreaterThan(b.recommendedDailyBudget);
    expect(a.basis.cpa).toBe(50);
    expect(b.basis.cpa).toBe(200);
  });

  it("splits evenly when there are no conversions and no spend", () => {
    const result = computeBudgetRecommendations({
      monthlyBudget: 3040,
      daysInMonth: 30.4,
      campaigns: [campaign("a", 0, 0), campaign("b", 0, 0)],
    });
    const [a, b] = result.recommendations;
    expect(a.recommendedDailyBudget).toBeCloseTo(b.recommendedDailyBudget, 2);
    // 3040 / 2 / 30.4 = 50/day each
    expect(a.recommendedDailyBudget).toBeCloseTo(50, 2);
  });

  it("does not starve a non-converting campaign that has recent spend", () => {
    const result = computeBudgetRecommendations({
      monthlyBudget: 3040,
      daysInMonth: 30.4,
      clampPct: 0,
      campaigns: [campaign("winner", 30, 1500), campaign("newbie", 0, 300)],
    });
    const newbie = result.recommendations.find((r) => r.campaignId === "newbie")!;
    expect(newbie.recommendedDailyBudget).toBeGreaterThan(0);
  });

  it("clamps a campaign's daily move to within ±clampPct of recent daily spend", () => {
    // One campaign would otherwise get the whole budget; clamp to +50% of its
    // recent daily spend. Recent spend $304 over 30.4 days = $10/day → cap $15.
    const result = computeBudgetRecommendations({
      monthlyBudget: 100000,
      daysInMonth: 30.4,
      clampPct: 0.5,
      campaigns: [campaign("only", 10, 304)],
    });
    const only = result.recommendations[0];
    expect(only.recommendedDailyBudget).toBeLessThanOrEqual(15.01);
    expect(only.recommendedDailyBudget).toBeGreaterThanOrEqual(5);
  });

  it("is deterministic for the same input", () => {
    const campaigns = [campaign("a", 12, 800), campaign("b", 7, 400), campaign("c", 0, 100)];
    const first = computeBudgetRecommendations({ monthlyBudget: 3040, campaigns });
    const second = computeBudgetRecommendations({ monthlyBudget: 3040, campaigns });
    expect(first).toEqual(second);
  });

  it("records basis inputs for the tooltip", () => {
    const result = computeBudgetRecommendations({
      monthlyBudget: 3040,
      campaigns: [campaign("a", 4, 200)],
    });
    expect(result.recommendations[0].basis).toMatchObject({
      conversions: 4,
      spend: 200,
      cpa: 50,
    });
  });
});

describe("daysInPreviousMonth", () => {
  it("returns 31 for the previous month when ref is in March", () => {
    // March 2026 → previous month February 2026 has 28 days.
    expect(daysInPreviousMonth(new Date(2026, 2, 15))).toBe(28);
  });

  it("returns 31 when previous month is January", () => {
    // February ref → January has 31 days.
    expect(daysInPreviousMonth(new Date(2026, 1, 10))).toBe(31);
  });

  it("handles leap-year February", () => {
    // March 2024 → February 2024 (leap) has 29 days.
    expect(daysInPreviousMonth(new Date(2024, 2, 1))).toBe(29);
  });
});
