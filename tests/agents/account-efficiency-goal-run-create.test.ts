import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetCampaignSnapshot, mockStartGoalRun, mockMarkGoalRunStatus, mockRecordGoalRunSnapshot } = vi.hoisted(() => ({
  mockGetCampaignSnapshot: vi.fn(),
  mockStartGoalRun: vi.fn(),
  mockMarkGoalRunStatus: vi.fn(),
  mockRecordGoalRunSnapshot: vi.fn(),
}));

vi.mock("@/lib/google-ads-snapshots", () => ({
  getCampaignSnapshot: mockGetCampaignSnapshot,
}));

vi.mock("@/lib/goal-agents/goal-run-audit", () => ({
  startGoalRun: mockStartGoalRun,
  markGoalRunStatus: mockMarkGoalRunStatus,
  recordGoalRunSnapshot: mockRecordGoalRunSnapshot,
}));

import { applyAccountEfficiencyGoalRunCreate } from "@/lib/agents/optimate-google-ads/apply-handlers/account-efficiency-goal-run-create";
import { createAccountEfficiencyGoalRun } from "@/lib/agents/optimate-google-ads/tools/create-account-efficiency-goal-run";
import type { ApplyHandlerContext } from "@/lib/agents/_shared/apply-dispatcher";

interface FakeState {
  audits: Array<Record<string, unknown>>;
  updates: Array<{ collection: string; id: number | string; data: Record<string, unknown> }>;
}

function makePayload(state: FakeState) {
  return {
    find: vi.fn(async (args: { collection: string }) => {
      if (args.collection === "goal-runs") return { docs: [] };
      if (args.collection === "google-ads-audits") return { docs: state.audits };
      return { docs: [] };
    }),
    update: vi.fn(async (args: { collection: string; id: number | string; data: Record<string, unknown> }) => {
      state.updates.push(args);
      return { id: args.id, ...args.data };
    }),
  } as unknown as ApplyHandlerContext["payload"];
}

beforeEach(() => {
  mockGetCampaignSnapshot.mockReset();
  mockStartGoalRun.mockReset();
  mockMarkGoalRunStatus.mockReset();
  mockRecordGoalRunSnapshot.mockReset();
  mockGetCampaignSnapshot.mockResolvedValue({ rows: [{ searchImpressionShare: 80 }] });
  mockStartGoalRun.mockResolvedValue({ id: 321, status: "analysing" });
  mockMarkGoalRunStatus.mockResolvedValue({ id: 321, status: "awaiting_data" });
  mockRecordGoalRunSnapshot.mockResolvedValue({ id: 1, goalRunId: 321 });
});

describe("applyAccountEfficiencyGoalRunCreate — monthly budget overwrite", () => {
  it("overwrites google-ads-audits.monthlyBudget and records the prior value", async () => {
    const state: FakeState = {
      audits: [{ id: 777, client: 7, monthlyBudget: 1000 }],
      updates: [],
    };
    const payload = makePayload(state);
    const ctx: ApplyHandlerContext = { payload, approvalId: 5, userId: 9 };

    const result = await applyAccountEfficiencyGoalRunCreate(
      { clientId: 7, parameters: { monthlyBudget: 3000 } },
      ctx,
    );

    const budgetUpdate = state.updates.find(
      (u) => u.collection === "google-ads-audits" && u.id === 777,
    );
    expect(budgetUpdate?.data.monthlyBudget).toBe(3000);
    expect(result.message).toContain("Overwrote monthly budget");

    const snapshotCall = mockRecordGoalRunSnapshot.mock.calls[0]![1] as { proposedPayload: Record<string, unknown> };
    const overwrite = snapshotCall.proposedPayload.monthlyBudgetOverwrite as Record<string, unknown>;
    expect(overwrite.priorMonthlyBudget).toBe(1000);
    expect(overwrite.newMonthlyBudget).toBe(3000);
  });

  it("errors clearly when a monthly budget is supplied but no audit row exists", async () => {
    const state: FakeState = { audits: [], updates: [] };
    const payload = makePayload(state);
    const ctx: ApplyHandlerContext = { payload, approvalId: 5, userId: 9 };

    await expect(
      applyAccountEfficiencyGoalRunCreate({ clientId: 7, parameters: { monthlyBudget: 3000 } }, ctx),
    ).rejects.toThrow(/no google-ads-audits row exists/);
  });

  it("skips the overwrite (backward compatible) when no monthly budget is supplied", async () => {
    const state: FakeState = {
      audits: [{ id: 777, client: 7, monthlyBudget: 1000 }],
      updates: [],
    };
    const payload = makePayload(state);
    const ctx: ApplyHandlerContext = { payload, approvalId: 5, userId: 9 };

    await applyAccountEfficiencyGoalRunCreate({ clientId: 7, parameters: {} }, ctx);
    const budgetUpdate = state.updates.find(
      (u) => u.collection === "google-ads-audits",
    );
    expect(budgetUpdate).toBeUndefined();
  });
});

describe("create_account_efficiency_goal_run — required monthly budget prerequisite", () => {
  it("rejects creation when monthlyBudget is missing", () => {
    expect(() => createAccountEfficiencyGoalRun.validate?.({ parameters: {} })).toThrow(/monthlyBudget is a required prerequisite/);
  });

  it("accepts a valid monthly budget and minRecipientConversions", () => {
    const validated = createAccountEfficiencyGoalRun.validate?.({
      parameters: { monthlyBudget: 3000, minRecipientConversions: 8 },
    }) as { parameters?: { monthlyBudget: number; minRecipientConversions: number } };
    expect(validated.parameters?.monthlyBudget).toBe(3000);
    expect(validated.parameters?.minRecipientConversions).toBe(8);
  });

  it("rejects a negative monthly budget", () => {
    expect(() => createAccountEfficiencyGoalRun.validate?.({ parameters: { monthlyBudget: -5 } })).toThrow(/non-negative/);
  });
});
