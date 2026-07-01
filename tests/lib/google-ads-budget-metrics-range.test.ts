import { describe, expect, it } from "vitest";

import {
  getGrowthToolsMetricsRequest,
  getLast180DaysRequest,
  parseBudgetMetricsRange,
} from "@/lib/google-ads-budget-metrics-range";

describe("google-ads budget metrics ranges", () => {
  it("defaults unknown values to THIS_MONTH", () => {
    expect(parseBudgetMetricsRange(null)).toBe("THIS_MONTH");
    expect(parseBudgetMetricsRange("NOPE")).toBe("THIS_MONTH");
  });

  it("keeps preset Growth Tools ranges unchanged", () => {
    expect(getGrowthToolsMetricsRequest("THIS_MONTH")).toEqual({ dateRange: "THIS_MONTH" });
    expect(getGrowthToolsMetricsRequest("LAST_60_DAYS")).toEqual({ dateRange: "LAST_60_DAYS" });
  });

  it("converts LAST_180_DAYS into an explicit custom date range", () => {
    const now = new Date("2026-07-01T15:45:00.000Z");

    expect(getLast180DaysRequest(now)).toEqual({
      dateRange: "2026-01-03,2026-07-01",
    });
    expect(getGrowthToolsMetricsRequest("LAST_180_DAYS")).toMatchObject({
      dateRange: expect.stringMatching(/^\d{4}-\d{2}-\d{2},\d{4}-\d{2}-\d{2}$/),
    });
  });
});
