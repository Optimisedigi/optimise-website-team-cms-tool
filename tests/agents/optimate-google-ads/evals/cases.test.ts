import { describe, expect, it } from "vitest";
import { getEvalCases, OPTIMATE_GOOGLE_ADS_EVAL_CASES } from "../../../../src/lib/agents/optimate-google-ads/evals/cases";

describe("OptiMate eval cases", () => {
  it("excludes action cases unless allowActions is true", () => {
    expect(getEvalCases({ categories: ["actions"] })).toHaveLength(0);
    expect(getEvalCases({ categories: ["actions"], allowActions: true }).length).toBeGreaterThan(0);
  });

  it("marks action cases as not parallel safe", () => {
    const actionCases = OPTIMATE_GOOGLE_ADS_EVAL_CASES.filter((testCase) => testCase.requiresAllowActions);
    expect(actionCases.length).toBeGreaterThan(0);
    expect(actionCases.every((testCase) => !testCase.parallelSafe)).toBe(true);
  });

  it("includes the frequent eight-week performance story prompt as read-only", () => {
    const testCase = OPTIMATE_GOOGLE_ADS_EVAL_CASES.find((item) => item.id === "eight-week-performance-story");
    expect(testCase).toMatchObject({
      category: "read-only",
      expectedTools: ["get_weekly_metric_table"],
      requiresAllowActions: false,
      parallelSafe: true,
    });
    expect(testCase?.prompt).toContain("last eight weeks performance");
    expect(testCase?.prompt).toContain("two-sentence summary");
  });
});
