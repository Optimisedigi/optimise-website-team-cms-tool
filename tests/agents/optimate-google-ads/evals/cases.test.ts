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
});
