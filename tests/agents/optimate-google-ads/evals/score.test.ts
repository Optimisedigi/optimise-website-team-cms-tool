import { describe, expect, it } from "vitest";
import { scoreEvalRun } from "../../../../src/lib/agents/optimate-google-ads/evals/score";
import { OPTIMATE_GOOGLE_ADS_EVAL_CASES } from "../../../../src/lib/agents/optimate-google-ads/evals/cases";

const baseResult = {
  reply: "Spend was $100 with 10 conversions. Queued approval #123, review at /admin/agent-approvals/123",
  runId: "run-1",
  modelRequested: "claude-sonnet-4.6",
  modelUsed: "claude-sonnet-4.6",
  source: "oauth" as const,
  totalUsage: { inputTokens: 100, outputTokens: 50 },
  proposals: [{ id: 123, title: "Test", proposalType: "campaign-status-change", status: "pending" }],
  confirmRequests: [],
};

describe("scoreEvalRun", () => {
  it("rewards expected tools and matching proposals", () => {
    const testCase = OPTIMATE_GOOGLE_ADS_EVAL_CASES.find((item) => item.id === "pause-campaign")!;
    const score = scoreEvalRun({
      testCase,
      result: baseResult,
      activityRows: [{ toolName: "get_campaign_performance" }, { toolName: "propose_campaign_status_change" }],
      durationMs: 1000,
    });

    expect(score.total).toBeGreaterThan(80);
    expect(score.flags).not.toContain("missing_expected_tools:get_campaign_performance,propose_campaign_status_change");
  });

  it("flags forbidden tools, raw customer IDs, em dashes, and fabricated approval links", () => {
    const testCase = OPTIMATE_GOOGLE_ADS_EVAL_CASES.find((item) => item.id === "wasted-search-terms")!;
    const score = scoreEvalRun({
      testCase,
      result: {
        ...baseResult,
        reply: "I pushed it — customer 123-456-7890. Review /admin/agent-approvals/999",
        proposals: [],
      },
      activityRows: [{ toolName: "propose_nkl_create" }],
      durationMs: 1000,
    });

    expect(score.flags).toContain("raw_customer_id_exposed");
    expect(score.flags).toContain("em_or_en_dash");
    expect(score.flags).toContain("fabricated_approval_link:999");
    expect(score.flags.some((flag) => flag.startsWith("used_forbidden_tools"))).toBe(true);
  });

  it("invalidates fair scoring when fallback is used", () => {
    const testCase = OPTIMATE_GOOGLE_ADS_EVAL_CASES.find((item) => item.id === "account-health-last-30")!;
    const score = scoreEvalRun({
      testCase,
      result: { ...baseResult, modelUsed: "kimi-k2.6", proposals: [], reply: "Spend was $100 with 10 conversions." },
      activityRows: [{ toolName: "get_account_overview" }],
      durationMs: 1000,
    });

    expect(score.flags).toContain("model_fallback");
    expect(score.dimensions.latencyReliability).toBe(3);
  });
});
