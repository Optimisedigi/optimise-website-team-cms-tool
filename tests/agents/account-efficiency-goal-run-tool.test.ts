import { describe, expect, it } from "vitest";

import { createAccountEfficiencyGoalRun } from "@/lib/agents/optimate-google-ads/tools/create-account-efficiency-goal-run";

describe("create_account_efficiency_goal_run — ROAS safety", () => {
  it("rejects ROAS mode until conversion-value snapshots and Growth Tools schemas are verified", () => {
    expect(() =>
      createAccountEfficiencyGoalRun.validate?.({
        parameters: {
          optimisationMetric: "roas",
          enabledLevers: ["budget_shift"],
        },
      }),
    ).toThrow(/conversion-value data isn't in the snapshots yet/i);
  });
});
