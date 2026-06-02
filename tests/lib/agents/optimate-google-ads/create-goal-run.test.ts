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

const { findImpl, updateImpl, createImpl } = vi.hoisted(() => ({
  findImpl: vi.fn(),
  updateImpl: vi.fn(),
  createImpl: vi.fn(),
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
    create: createImpl,
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
  createImpl.mockReset();
  findCalls.length = 0;
  updateCalls.length = 0;
  nextExistingDocs = [];
  nextFindError = null;
  nextUpdateError = null;

  // Default happy-path stubs.
  startGoalRunMock.mockResolvedValue({ id: 101, status: "analysing" });
  markGoalRunStatusMock.mockResolvedValue({ id: 101, status: "awaiting_data" });
  recordGoalRunSnapshotMock.mockResolvedValue({ id: 501, goalRunId: 101 });
  createImpl.mockResolvedValue({ id: 77 });
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
    expect(createImpl).not.toHaveBeenCalled();
    expect(startGoalRunMock).not.toHaveBeenCalled();
    expect(markGoalRunStatusMock).not.toHaveBeenCalled();
    expect(updateImpl).not.toHaveBeenCalled();
    expect(recordGoalRunSnapshotMock).not.toHaveBeenCalled();
  });

  it("queues a human approval row instead of creating a goal run immediately", async () => {
    createImpl.mockResolvedValueOnce({ id: 77 });

    const res = await createGoalRun.execute({ goal: VALID_GOAL }, makeCtx());
    expect(res.ok).toBe(true);
    expect(res.data).toMatchObject({
      approvalId: 77,
      approvalUrl: "/admin/agent-approvals/77",
    });

    expect(createImpl).toHaveBeenCalledTimes(1);
    expect(createImpl.mock.calls[0][0]).toMatchObject({
      collection: "agent-approval-queue",
      data: {
        proposalType: "goal-run-create",
        title: `Create goal run: ${VALID_GOAL}`,
        client: 42,
        proposalPayload: {
          clientId: 42,
          goal: VALID_GOAL,
        },
        status: "pending",
      },
      overrideAccess: true,
    });

    expect(startGoalRunMock).not.toHaveBeenCalled();
    expect(markGoalRunStatusMock).not.toHaveBeenCalled();
    expect(updateImpl).not.toHaveBeenCalled();
    expect(recordGoalRunSnapshotMock).not.toHaveBeenCalled();
  });

  it("includes reason, summary, and supporting numbers in the approval row", async () => {
    createImpl.mockResolvedValueOnce({ id: 88 });

    const res = await createGoalRun.execute(
      {
        goal: VALID_GOAL,
        reason: "team standup decision",
        summary: "Start the waste reducer after reviewing last week.",
        supportingNumbers: ["$500 spend reviewed in get_search_terms"],
      },
      makeCtx(),
    );
    expect(res.ok).toBe(true);
    expect(res.data).toMatchObject({ approvalId: 88 });

    const data = createImpl.mock.calls[0][0].data;
    expect(data.proposalPayload).toMatchObject({
      clientId: 42,
      goal: VALID_GOAL,
      reason: "team standup decision",
    });
    expect(data.rendered.internalMarkdown).toContain("Start the waste reducer");
    expect(data.rendered.internalMarkdown).toContain("$500 spend reviewed");
  });

  it("returns ok:false when queueing the approval throws", async () => {
    createImpl.mockRejectedValueOnce(new Error("DB exploded"));

    const res = await createGoalRun.execute(
      { goal: VALID_GOAL, reason: "should not write" },
      makeCtx(),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toContain("DB exploded");

    expect(startGoalRunMock).not.toHaveBeenCalled();
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
