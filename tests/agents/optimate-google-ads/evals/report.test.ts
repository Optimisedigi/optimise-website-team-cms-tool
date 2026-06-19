import { describe, expect, it } from "vitest";
import { buildEvalReportSummary } from "../../../../src/lib/agents/optimate-google-ads/evals/report";
import type { EvalSuiteResult } from "../../../../src/lib/agents/optimate-google-ads/evals/runner";

const suite: EvalSuiteResult = {
  suiteId: "suite-1",
  generatedAt: "2026-06-19T00:00:00.000Z",
  auditId: 1,
  models: ["claude-sonnet-4.6", "kimi-k2.6"],
  cases: [],
  runs: [
    {
      id: "1",
      caseId: "account-health-last-30",
      caseCategory: "read-only",
      modelRequested: "claude-sonnet-4.6",
      modelUsed: "claude-sonnet-4.6",
      repeatIndex: 0,
      status: "passed",
      startedAt: "2026-06-19T00:00:00.000Z",
      completedAt: "2026-06-19T00:00:01.000Z",
      durationMs: 1000,
      activityRows: [],
      score: { total: 90, dimensions: {} as never, flags: [], toolNames: [] },
    },
    {
      id: "2",
      caseId: "account-health-last-30",
      caseCategory: "read-only",
      modelRequested: "kimi-k2.6",
      modelUsed: "kimi-k2.6",
      repeatIndex: 0,
      status: "passed",
      startedAt: "2026-06-19T00:00:00.000Z",
      completedAt: "2026-06-19T00:00:03.000Z",
      durationMs: 3000,
      activityRows: [],
      score: { total: 80, dimensions: {} as never, flags: ["em_or_en_dash"], toolNames: [] },
    },
  ],
};

describe("eval report", () => {
  it("aggregates model scoreboards and recommendations", () => {
    const summary = buildEvalReportSummary(suite);
    expect(summary.overall[0]?.model).toBe("claude-sonnet-4.6");
    expect(summary.byCategory["read-only"]?.length).toBe(2);
    expect(summary.recommendations["deep diagnosis"]).toBe("claude-sonnet-4.6");
  });
});
