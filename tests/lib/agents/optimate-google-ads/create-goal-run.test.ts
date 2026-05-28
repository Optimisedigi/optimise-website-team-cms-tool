/**
 * Tool: create_goal_run.
 *
 * Mocks `getPayload` and the goal-run-audit helpers so we can assert:
 *   - validate() rejects missing goal, unknown goal (with helpful message),
 *     and accepts valid ones from the registry.
 *   - execute() refuses when no client is linked to the chat context.
 *   - execute() refuses (with the existing id) when an active run already
 *     exists for this client/goal.
 *   - happy path: startGoalRun → markGoalRunStatus(awaiting_data) →
 *     update(nextCheckAt) are called in order and the response carries
 *     goalRunId + status="awaiting_data".
 *   - reason: when supplied, recordGoalRunSnapshot is called once with the
 *     expected args.
 *   - startGoalRun throws → ok:false; no follow-up calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks for goal-run-audit helpers ──────────────────────────────
const { startGoalRunMock, markGoalRunStatusMock, recordGoalRunSnapshotMock } =
  vi.hoisted(() => ({
    startGoalRunMock: vi.fn(),
    markGoalRunStatusMock: vi.fn(),
    recordGoalRunSnapshotMock: vi.fn(),
  }));

vi.mock("@/lib/goal-agents/goal-run-audit", () => ({
  startGoalRun: startGoalRunMock,
  markGoalRunStatus: markGoalRunStatusMock,
  recordGoalRunSnapshot: recordGoalRunSnapshotMock,
}));

// ─── Hoisted mock for payload ──────────────────────────────────────────────
interface FindArgs {
  collection: string;
  where?: unknown;
  limit?: number;
  depth?: number;
  overrideAccess?: boolean;
}

interface UpdateArgs {
  collection: string;
  id: number | string;
  data: Record<string, unknown>;
  overrideAccess?: boolean;
}

let nextExistingDocs: Array<Record<string, unknown>> = [];
let nextFindError: Error | null = null;
let nextUpdateError: Error | null = null;
const findCalls: FindArgs[] = [];
const updateCalls: UpdateArgs[] = [];

const { findImpl, updateImpl } = vi.hoisted(() => ({
  findImpl: vi.fn(),
  updateImpl: vi.fn(),
}));

findImpl.mockImplementation(async (args: FindArgs) => {
  findCalls.push(args);
  if (nextFindError) throw nextFindError;
  return { docs: nextExistingDocs };
});

updateImpl.mockImplementation(async (args: UpdateArgs) => {
  updateCalls.push(args);
  if (nextUpdateError) throw nextUpdateError;
  return { id: args.id };
});

vi.mock("payload", () => ({
  getPayload: vi.fn(async () => ({
    find: findImpl,
    update: updateImpl,
  })),
}));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));

import { createGoalRun } from "@/lib/agents/optimate-google-ads/tools/create-goal-run";
import type { ToolContext } from "@/lib/agents/_shared/tool";
import { GOAL_TYPES } from "@/lib/goal-agents/goal-types";

function makeCtx(extra: Partial<ToolContext["context"]> = {}): ToolContext {
  return {
    agentName: "optimate-google-ads",
    agentRunId: "run_create_goal_run_test",
    context: { clientId: 42, ...extra },
    log: vi.fn(),
  };
}

beforeEach(() => {
  startGoalRunMock.mockReset();
  markGoalRunStatusMock.mockReset();
  recordGoalRunSnapshotMock.mockReset();
  findImpl.mockClear();
  updateImpl.mockClear();
  findCalls.length = 0;
  updateCalls.length = 0;
  nextExistingDocs = [];
  nextFindError = null;
  nextUpdateError = null;

  // Default happy-path stubs.
  startGoalRunMock.mockResolvedValue({ id: 101, status: "analysing" });
  markGoalRunStatusMock.mockResolvedValue({ id: 101, status: "awaiting_data" });
  recordGoalRunSnapshotMock.mockResolvedValue({ id: 501, goalRunId: 101 });
});

describe("create_goal_run — validate()", () => {
  it("throws when goal is missing", () => {
    expect(() => createGoalRun.validate!({})).toThrow(/goal is required/);
  });

  it("throws when goal is an empty string", () => {
    expect(() => createGoalRun.validate!({ goal: "   " })).toThrow(/goal is required/);
  });

  it("throws on unknown goal with a message listing the valid registry keys", () => {
    const keys = Object.keys(GOAL_TYPES);
    try {
      createGoalRun.validate!({ goal: "not-a-real-goal" });
      throw new Error("should have thrown");
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toMatch(/Unknown goal/);
      expect(msg).toContain("not-a-real-goal");
      for (const k of keys) {
        expect(msg).toContain(k);
      }
    }
  });

  it("accepts a valid registered goal and returns it as args", () => {
    const validKey = Object.keys(GOAL_TYPES)[0];
    expect(createGoalRun.validate!({ goal: validKey })).toEqual({
      goal: validKey,
    });
  });

  it("trims an optional reason and includes it", () => {
    const validKey = Object.keys(GOAL_TYPES)[0];
    expect(
      createGoalRun.validate!({ goal: validKey, reason: "  fresh setup  " }),
    ).toEqual({ goal: validKey, reason: "fresh setup" });
  });

  it("drops an empty reason (whitespace only)", () => {
    const validKey = Object.keys(GOAL_TYPES)[0];
    expect(createGoalRun.validate!({ goal: validKey, reason: "   " })).toEqual({
      goal: validKey,
    });
  });

  it("rejects a non-string reason", () => {
    const validKey = Object.keys(GOAL_TYPES)[0];
    expect(() =>
      createGoalRun.validate!({ goal: validKey, reason: 123 }),
    ).toThrow(/reason must be a string/);
  });
});

describe("create_goal_run — execute()", () => {
  const VALID_GOAL = Object.keys(GOAL_TYPES)[0];

  it("returns ok:false when no clientId is linked in the chat context", async () => {
    const res = await createGoalRun.execute(
      { goal: VALID_GOAL },
      makeCtx({ clientId: undefined }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/No client linked/);
    // Nothing should have been written.
    expect(startGoalRunMock).not.toHaveBeenCalled();
    expect(markGoalRunStatusMock).not.toHaveBeenCalled();
    expect(updateImpl).not.toHaveBeenCalled();
    expect(recordGoalRunSnapshotMock).not.toHaveBeenCalled();
  });

  it("refuses with the existing id when an active run already exists for this client/goal", async () => {
    nextExistingDocs = [{ id: 77, goal: VALID_GOAL, status: "analysing" }];

    const res = await createGoalRun.execute({ goal: VALID_GOAL }, makeCtx());
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/active/);
    expect(res.error).toContain(VALID_GOAL);
    expect(res.error).toContain("77");
    expect(res.error).toMatch(/get_goal_run/);

    // The dup-check query must scope by client + goal + non-terminal status.
    expect(findCalls).toHaveLength(1);
    const w = findCalls[0].where as {
      and: Array<Record<string, { equals?: unknown; not_in?: unknown }>>;
    };
    expect(w.and).toHaveLength(3);
    expect(w.and[0].client?.equals).toBe(42);
    expect(w.and[1].goal?.equals).toBe(VALID_GOAL);
    expect(w.and[2].status?.not_in).toEqual(["complete", "failed"]);

    // No writes should have happened.
    expect(startGoalRunMock).not.toHaveBeenCalled();
    expect(markGoalRunStatusMock).not.toHaveBeenCalled();
    expect(updateImpl).not.toHaveBeenCalled();
    expect(recordGoalRunSnapshotMock).not.toHaveBeenCalled();
  });

  it("happy path: calls startGoalRun → markGoalRunStatus → update(nextCheckAt) in order and returns awaiting_data", async () => {
    const before = Date.now();
    const res = await createGoalRun.execute({ goal: VALID_GOAL }, makeCtx());
    const after = Date.now();

    expect(res.ok).toBe(true);
    const data = res.data as {
      goalRunId: number;
      goal: string;
      status: string;
      nextCheckAt: string;
      message: string;
    };
    expect(data.goalRunId).toBe(101);
    expect(data.goal).toBe(VALID_GOAL);
    expect(data.status).toBe("awaiting_data");
    expect(data.message).toMatch(/scheduler/i);

    // nextCheckAt should be ISO-string and "now"-ish.
    const ts = Date.parse(data.nextCheckAt);
    expect(Number.isFinite(ts)).toBe(true);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);

    // Call order assertions via invocationCallOrder.
    expect(startGoalRunMock).toHaveBeenCalledTimes(1);
    expect(markGoalRunStatusMock).toHaveBeenCalledTimes(1);
    expect(updateImpl).toHaveBeenCalledTimes(1);

    const startOrder = startGoalRunMock.mock.invocationCallOrder[0];
    const markOrder = markGoalRunStatusMock.mock.invocationCallOrder[0];
    const updateOrder = updateImpl.mock.invocationCallOrder[0];
    expect(startOrder).toBeLessThan(markOrder);
    expect(markOrder).toBeLessThan(updateOrder);

    // startGoalRun args
    expect(startGoalRunMock.mock.calls[0][1]).toEqual({
      clientId: 42,
      goal: VALID_GOAL,
    });
    // markGoalRunStatus args
    expect(markGoalRunStatusMock.mock.calls[0][1]).toEqual({
      goalRunId: 101,
      status: "awaiting_data",
    });
    // update(goal-runs, nextCheckAt)
    const upd = updateCalls[0];
    expect(upd.collection).toBe("goal-runs");
    expect(upd.id).toBe(101);
    expect(upd.data.nextCheckAt).toBe(data.nextCheckAt);
    expect(upd.overrideAccess).toBe(true);

    // No snapshot when no reason provided.
    expect(recordGoalRunSnapshotMock).not.toHaveBeenCalled();
  });

  it("with reason: also calls recordGoalRunSnapshot once with the right args", async () => {
    const res = await createGoalRun.execute(
      { goal: VALID_GOAL, reason: "team standup decision" },
      makeCtx(),
    );
    expect(res.ok).toBe(true);

    expect(recordGoalRunSnapshotMock).toHaveBeenCalledTimes(1);
    const snapArgs = recordGoalRunSnapshotMock.mock.calls[0][1];
    expect(snapArgs).toEqual({
      goalRunId: 101,
      step: 1,
      action: "create_goal_run",
      riskTier: "green",
      status: "proposed",
      proposedPayload: {
        reason: "team standup decision",
        createdBy: "optimate-chat",
      },
    });

    // Snapshot is recorded AFTER the row is created and queued.
    const recOrder = recordGoalRunSnapshotMock.mock.invocationCallOrder[0];
    const updOrder = updateImpl.mock.invocationCallOrder[0];
    expect(recOrder).toBeGreaterThan(updOrder);
  });

  it("returns ok:false when startGoalRun throws and never issues follow-up calls", async () => {
    startGoalRunMock.mockRejectedValueOnce(new Error("DB exploded"));

    const res = await createGoalRun.execute(
      { goal: VALID_GOAL, reason: "should not write" },
      makeCtx(),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Failed to create goal run/);
    expect(res.error).toContain("DB exploded");

    expect(markGoalRunStatusMock).not.toHaveBeenCalled();
    expect(updateImpl).not.toHaveBeenCalled();
    expect(recordGoalRunSnapshotMock).not.toHaveBeenCalled();
  });

  it("registers under the actions category", async () => {
    const { TOOL_CATEGORY_MAP } = await import(
      "@/lib/agents/optimate-google-ads/tool-catalog"
    );
    expect(TOOL_CATEGORY_MAP["create_goal_run"]).toBe("actions");
  });
});
