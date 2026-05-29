import { calculateBlendedScenario, calculateOrganicScenario, calculatePaidScenario, formatScenarioBands } from "@/lib/forecast-lab";

describe("forecast-lab", () => {
  it("calculates paid scenario bands from spend and CPA", () => {
    const output = calculatePaidScenario({ targetMonthlyAdSpend: 5000, targetCpa: 100, leadCloseRate: 0.2, averageClientValue: 1000 });
    expect(output.base.leads).toBe(50);
    expect(output.base.revenue).toBe(10000);
    expect(output.conservative.leads).toBe(37.5);
    expect(output.optimistic.leads).toBe(62.5);
  });

  it("calculates organic leads from clicks and conversion rate", () => {
    const output = calculateOrganicScenario({ baselineOrganicClicks: 1000, organicClickGrowthPct: 20, conversionRate: 0.05, averageOrderValue: 200 });
    expect(output.base.organicClicks).toBe(1200);
    expect(output.base.leads).toBe(60);
    expect(output.base.revenue).toBe(12000);
  });

  it("adds paid and organic leads for blended scenarios", () => {
    const output = calculateBlendedScenario({ targetMonthlyAdSpend: 1000, targetCpa: 100, baselineOrganicClicks: 100, conversionRate: 0.1, averageOrderValue: 10 });
    expect(output.base.leads).toBe(20);
  });

  it("formats scenario bands for display", () => {
    expect(formatScenarioBands(calculatePaidScenario({ targetMonthlyAdSpend: 100, targetCpa: 100, averageOrderValue: 10 }))[1]).toContain("1 lead");
  });
});
