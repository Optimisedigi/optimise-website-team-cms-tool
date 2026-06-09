import { describe, it, expect } from "vitest";

import {
  partitionChangeReview,
  type ChangeReviewSnapshotInput,
} from "@/lib/goal-agents/change-review";

function input(overrides: Partial<ChangeReviewSnapshotInput>): ChangeReviewSnapshotInput {
  return {
    id: 1,
    step: 1,
    action: "budget-shift",
    status: "approved",
    riskTier: "yellow",
    campaignIds: [],
    blockReason: null,
    proposedPayload: null,
    modifiedPayload: null,
    measuredResult: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    approvalMarkdown: null,
    ...overrides,
  };
}

describe("partitionChangeReview", () => {
  it("partitions approved/applied vs rejected/blocked and drops pending", () => {
    const result = partitionChangeReview([
      input({ id: 1, step: 1, status: "approved" }),
      input({ id: 2, step: 2, status: "applied" }),
      input({ id: 3, step: 3, status: "rejected" }),
      input({ id: 4, step: 4, status: "blocked_by_scope" }),
      input({ id: 5, step: 5, status: "proposed" }), // pending — omitted
    ]);
    expect(result.approved.map((r) => r.id)).toEqual([1, 2]);
    expect(result.disapproved.map((r) => r.id)).toEqual([3, 4]);
  });

  it("uses blockReason as the reason for blocked rows", () => {
    const result = partitionChangeReview([
      input({ id: 9, status: "blocked_by_scope", blockReason: "Daily-budget conservation violated" }),
    ]);
    expect(result.disapproved[0]!.reason).toBe("Daily-budget conservation violated");
  });

  it("falls back to a payload summary for approved rows without markdown", () => {
    const result = partitionChangeReview([
      input({
        id: 7,
        action: "keyword-pause",
        status: "approved",
        approvalMarkdown: null,
        proposedPayload: { keywordText: "emergency plumber" },
      }),
    ]);
    expect(result.approved[0]!.reason).toContain("emergency plumber");
  });

  it("uses the approval markdown headline when present", () => {
    const result = partitionChangeReview([
      input({
        id: 8,
        status: "approved",
        approvalMarkdown: "**Budget reallocation proposed.**\n\n- Donors: 1",
      }),
    ]);
    expect(result.approved[0]!.reason).toBe("Budget reallocation proposed.");
  });

  it("sorts deterministically by step then id", () => {
    const result = partitionChangeReview([
      input({ id: 30, step: 3, status: "approved" }),
      input({ id: 10, step: 1, status: "approved" }),
      input({ id: 20, step: 2, status: "approved" }),
    ]);
    expect(result.approved.map((r) => r.id)).toEqual([10, 20, 30]);
  });
});
