import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  startGoalRun,
  recordGoalRunSnapshot,
  markGoalRunStatus,
  attachMeasurement,
} from "@/lib/goal-agents/goal-run-audit";
import { IllegalTransitionError } from "@/lib/goal-agents/state-machine";

// ─── Mock payload ───────────────────────────────────────────────────────────
interface MockPayload {
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  findByID: ReturnType<typeof vi.fn>;
}

function makePayload(): MockPayload {
  return {
    create: vi.fn(),
    update: vi.fn(),
    findByID: vi.fn(),
  };
}

// ─── startGoalRun ──────────────────────────────────────────────────────────
describe("startGoalRun", () => {
  let payload: MockPayload;

  beforeEach(() => {
    payload = makePayload();
  });

  it("creates a goal-runs row with status: 'analysing'", async () => {
    payload.create.mockResolvedValue({ id: 5, status: "analysing", goal: "test-goal" });

    const result = await startGoalRun(payload as never, {
      clientId: 12,
      goal: "test-goal",
    });

    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "goal-runs",
        data: expect.objectContaining({
          client: 12,
          goal: "test-goal",
          status: "analysing",
        }),
        overrideAccess: true,
      }),
    );
    expect(result).toEqual({ id: 5, status: "analysing" });
  });

  it("passes the tier through when provided", async () => {
    payload.create.mockResolvedValue({ id: 7, status: "analysing", tier: "yellow" });

    await startGoalRun(payload as never, {
      clientId: 12,
      goal: "test-goal",
      tier: "yellow",
    });

    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tier: "yellow" }),
      }),
    );
  });

  it("does not include tier in the payload when omitted", async () => {
    payload.create.mockResolvedValue({ id: 8, status: "analysing" });

    await startGoalRun(payload as never, { clientId: 12, goal: "test-goal" });

    const callData = payload.create.mock.calls[0][0].data as Record<string, unknown>;
    expect("tier" in callData).toBe(false);
  });
});

// ─── recordGoalRunSnapshot ─────────────────────────────────────────────────
describe("recordGoalRunSnapshot", () => {
  let payload: MockPayload;

  beforeEach(() => {
    payload = makePayload();
  });

  it("creates a goal-run-snapshots row with all required fields", async () => {
    payload.create.mockResolvedValue({
      id: 99,
      goalRun: 5,
      step: 1,
      action: "nkl-push-live",
      riskTier: "green",
      status: "proposed",
    });

    const proposedPayload = { keywords: ["foo"], action: "add" };
    const result = await recordGoalRunSnapshot(payload as never, {
      goalRunId: 5,
      step: 1,
      action: "nkl-push-live",
      riskTier: "green",
      status: "proposed",
      proposedPayload,
    });

    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "goal-run-snapshots",
        data: expect.objectContaining({
          goalRun: 5,
          step: 1,
          action: "nkl-push-live",
          riskTier: "green",
          status: "proposed",
          proposedPayload,
          modifiedPayload: null,
          blockReason: null,
        }),
        overrideAccess: true,
      }),
    );
    expect(result).toEqual({ id: 99, goalRunId: 5 });
  });

  it("maps campaignIds array to Payload's sub-table shape", async () => {
    payload.create.mockResolvedValue({ id: 10, goalRun: 3, campaignIds: [{ campaignId: "111" }, { campaignId: "222" }] });

    await recordGoalRunSnapshot(payload as never, {
      goalRunId: 3,
      step: 2,
      action: "budget-reallocate",
      riskTier: "yellow",
      status: "approved",
      campaignIds: ["111", "222"],
      proposedPayload: {},
    });

    const callData = payload.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(callData.campaignIds).toEqual([
      { campaignId: "111" },
      { campaignId: "222" },
    ]);
  });

  it("sets approval relationship when approvalId is provided", async () => {
    payload.create.mockResolvedValue({ id: 11, goalRun: 3 });

    await recordGoalRunSnapshot(payload as never, {
      goalRunId: 3,
      step: 1,
      action: "test",
      riskTier: "red",
      status: "proposed",
      approvalId: 44,
      proposedPayload: {},
    });

    const callData = payload.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(callData.approval).toBe(44);
  });

  it("omits campaignIds when array is empty", async () => {
    payload.create.mockResolvedValue({ id: 12, goalRun: 3 });

    await recordGoalRunSnapshot(payload as never, {
      goalRunId: 3,
      step: 1,
      action: "test",
      riskTier: "green",
      status: "proposed",
      campaignIds: [],
      proposedPayload: {},
    });

    const callData = payload.create.mock.calls[0][0].data as Record<string, unknown>;
    expect("campaignIds" in callData).toBe(false);
  });

  it("stores modifiedPayload verbatim when provided", async () => {
    const modified = { keywords: ["bar"], action: "add" };
    payload.create.mockResolvedValue({ id: 13, goalRun: 3 });

    await recordGoalRunSnapshot(payload as never, {
      goalRunId: 3,
      step: 1,
      action: "nkl-push-live",
      riskTier: "green",
      status: "approved",
      proposedPayload: { keywords: ["foo"] },
      modifiedPayload: modified,
    });

    const callData = payload.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(callData.modifiedPayload).toEqual(modified);
  });

  it("persists blockReason when status is blocked_by_contract", async () => {
    const reason = "Campaign 111 is protected by Account Health Contract rule #3";
    payload.create.mockResolvedValue({ id: 14, goalRun: 3 });

    await recordGoalRunSnapshot(payload as never, {
      goalRunId: 3,
      step: 1,
      action: "budget-increase",
      riskTier: "red",
      status: "blocked_by_contract",
      blockReason: reason,
      proposedPayload: { amount: 5000 },
    });

    const callData = payload.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(callData.blockReason).toBe(reason);
    expect(callData.status).toBe("blocked_by_contract");
    expect(callData.modifiedPayload).toBe(null);
  });
});

// ─── markGoalRunStatus ─────────────────────────────────────────────────────
describe("markGoalRunStatus", () => {
  let payload: MockPayload;

  beforeEach(() => {
    payload = makePayload();
  });

  it("updates the goal-runs row to the new status", async () => {
    payload.findByID.mockResolvedValue({ id: 5, status: "analysing" });
    payload.update.mockResolvedValue({ id: 5, status: "pending_approval" });

    const result = await markGoalRunStatus(payload as never, {
      goalRunId: 5,
      status: "pending_approval",
    });

    expect(payload.findByID).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "goal-runs",
        id: 5,
        depth: 0,
        overrideAccess: true,
      }),
    );
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "goal-runs",
        id: 5,
        data: expect.objectContaining({ status: "pending_approval" }),
        overrideAccess: true,
      }),
    );
    expect(result).toEqual({ id: 5, status: "pending_approval" });
  });

  it("sets completedAt when provided", async () => {
    payload.findByID.mockResolvedValue({ id: 5, status: "measuring" });
    payload.update.mockResolvedValue({ id: 5, status: "complete", completedAt: "2026-06-01T12:00:00Z" });

    await markGoalRunStatus(payload as never, {
      goalRunId: 5,
      status: "complete",
      completedAt: "2026-06-01T12:00:00Z",
    });

    const callData = payload.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(callData.completedAt).toBe("2026-06-01T12:00:00Z");
  });

  it("sets error when provided (failed status)", async () => {
    payload.findByID.mockResolvedValue({ id: 5, status: "executing" });
    payload.update.mockResolvedValue({ id: 5, status: "failed", error: "Growth Tools timeout" });

    await markGoalRunStatus(payload as never, {
      goalRunId: 5,
      status: "failed",
      error: "Growth Tools timeout",
    });

    const callData = payload.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(callData.error).toBe("Growth Tools timeout");
  });

  it("sets both completedAt and error when transitioning to failed", async () => {
    payload.findByID.mockResolvedValue({ id: 5, status: "executing" });
    payload.update.mockResolvedValue({ id: 5, status: "failed" });

    await markGoalRunStatus(payload as never, {
      goalRunId: 5,
      status: "failed",
      error: "oops",
      completedAt: "2026-06-01T10:00:00Z",
    });

    const callData = payload.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(callData.status).toBe("failed");
    expect(callData.error).toBe("oops");
    expect(callData.completedAt).toBe("2026-06-01T10:00:00Z");
  });

  it("rejects illegal transitions before writing", async () => {
    payload.findByID.mockResolvedValue({ id: 5, status: "complete" });

    await expect(
      markGoalRunStatus(payload as never, {
        goalRunId: 5,
        status: "analysing",
      }),
    ).rejects.toBeInstanceOf(IllegalTransitionError);

    expect(payload.update).not.toHaveBeenCalled();
  });

  it("does not persist terminal-state failure metadata for an illegal failed → failed escape attempt", async () => {
    payload.findByID.mockResolvedValue({ id: 5, status: "complete" });

    await expect(
      markGoalRunStatus(payload as never, {
        goalRunId: 5,
        status: "failed",
        error: "late scheduler failure",
        completedAt: "2026-06-01T10:00:00Z",
      }),
    ).rejects.toMatchObject({
      from: "complete",
      to: "failed",
    });

    expect(payload.update).not.toHaveBeenCalled();
  });

  it("allows identity re-save (status === current)", async () => {
    payload.findByID.mockResolvedValue({ id: 5, status: "analysing" });
    payload.update.mockResolvedValue({ id: 5, status: "analysing" });

    await expect(
      markGoalRunStatus(payload as never, { goalRunId: 5, status: "analysing" }),
    ).resolves.toEqual({ id: 5, status: "analysing" });
  });

  it("propagates the underlying error when the row is missing", async () => {
    const notFound = new Error("NotFound: goal-runs id=5");
    payload.findByID.mockRejectedValue(notFound);

    await expect(
      markGoalRunStatus(payload as never, { goalRunId: 5, status: "failed" }),
    ).rejects.toBe(notFound);

    expect(payload.update).not.toHaveBeenCalled();
  });

  it("allows the full happy-path sequence analysing → pending_approval → executing → measuring → complete", async () => {
    const steps: Array<{ from: "analysing" | "pending_approval" | "executing" | "measuring"; to: "pending_approval" | "executing" | "measuring" | "complete" }> = [
      { from: "analysing", to: "pending_approval" },
      { from: "pending_approval", to: "executing" },
      { from: "executing", to: "measuring" },
      { from: "measuring", to: "complete" },
    ];
    for (const step of steps) {
      payload.findByID.mockResolvedValueOnce({ id: 5, status: step.from });
      payload.update.mockResolvedValueOnce({ id: 5, status: step.to });
      const result = await markGoalRunStatus(payload as never, {
        goalRunId: 5,
        status: step.to,
      });
      expect(result.status).toBe(step.to);
    }
    expect(payload.update).toHaveBeenCalledTimes(steps.length);
  });
});

// ─── attachMeasurement ─────────────────────────────────────────────────────
describe("attachMeasurement", () => {
  let payload: MockPayload;

  beforeEach(() => {
    payload = makePayload();
  });

  it("updates the snapshot with measuredAt and measuredResult", async () => {
    payload.update.mockResolvedValue({ id: 42, goalRun: 5, measuredAt: "2026-06-15T00:00:00Z" });
    const measuredResult = { wastedSpendReduction: -0.31, clicksDelta: 142 };

    const result = await attachMeasurement(payload as never, {
      snapshotId: 42,
      measuredAt: "2026-06-15T00:00:00Z",
      measuredResult,
    });

    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "goal-run-snapshots",
        id: 42,
        data: {
          measuredAt: "2026-06-15T00:00:00Z",
          measuredResult,
        },
        overrideAccess: true,
      }),
    );
    expect(result.id).toBe(42);
    expect(result.measuredAt).toBe("2026-06-15T00:00:00Z");
  });

  it("passes the goalRunId through in the return", async () => {
    payload.update.mockResolvedValue({ id: 7, goalRun: 5 });

    const result = await attachMeasurement(payload as never, {
      snapshotId: 7,
      measuredAt: "2026-06-15T00:00:00Z",
      measuredResult: {},
    });

    expect(result.goalRunId).toBe(5);
  });
});
