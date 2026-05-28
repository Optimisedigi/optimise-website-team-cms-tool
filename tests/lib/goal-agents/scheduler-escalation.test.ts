/**
 * Scheduler ↔ escalation fan-out integration tests.
 *
 * Verifies that `runGoalAgentsTick` raises a bell-notification fan-out on
 * transitions INTO escalated states (`pending_approval`, `failed`) and clears
 * them on transitions OUT — without ever aborting the tick on side-effect
 * errors.
 *
 * The fan-out helpers are spied via `vi.mock` so we can assert call shape
 * without touching the notifications collection at all.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Module mocks (must be declared before the SUT import) ─────────────────

const fanOutSpy = vi.fn(async () => 0);
const clearSpy = vi.fn(async () => 0);

vi.mock("@/lib/goal-agents/escalations", () => ({
  fanOutGoalRunEscalation: (...args: unknown[]) => fanOutSpy(...args),
  clearGoalRunEscalations: (...args: unknown[]) => clearSpy(...args),
}));

// ─── Shared payload mock ───────────────────────────────────────────────────

const mockPayload = {
  find: vi.fn(),
  findByID: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  logger: { warn: vi.fn(), error: vi.fn() },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  // Re-bind the mock so it survives resetModules — vi.mock with a factory
  // applies again on next import, but we need the spies to be fresh.
  vi.doMock("@/lib/goal-agents/escalations", () => ({
    fanOutGoalRunEscalation: (...args: unknown[]) => fanOutSpy(...args),
    clearGoalRunEscalations: (...args: unknown[]) => clearSpy(...args),
  }));
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe("scheduler escalation fan-out", () => {
  it("fans out when handler transitions a run into pending_approval", async () => {
    const handler = vi.fn(async () => ({
      status: "pending_approval" as const,
      nextCheckAt: "2024-06-01T06:00:00.000Z",
      note: "Risk tier yellow",
    }));

    vi.doMock("@/lib/goal-agents/goal-types", () => ({
      GOAL_TYPES: { "search-term-waste-reducer": handler },
    }));

    mockPayload.find.mockResolvedValueOnce({
      docs: [
        {
          id: 7,
          goal: "search-term-waste-reducer",
          status: "analysing",
          client: 42,
          iterationsCount: 0,
        },
      ],
    });
    mockPayload.update.mockResolvedValue({ id: 7, status: "analysing" });

    const { runGoalAgentsTick } = await import("@/lib/goal-agents/scheduler");
    const summary = await runGoalAgentsTick(
      mockPayload as never,
      new Date("2024-06-01T00:00:00.000Z"),
    );

    expect(summary.processed).toBe(1);
    expect(summary.advanced).toBe(1);

    // Fan-out called exactly once with the right shape.
    expect(fanOutSpy).toHaveBeenCalledTimes(1);
    const arg = fanOutSpy.mock.calls[0]?.[0] as {
      payload: unknown;
      goalRunId: number;
      goal: string;
      clientId: number;
      toStatus: string;
      reason?: string;
    };
    expect(arg.goalRunId).toBe(7);
    expect(arg.goal).toBe("search-term-waste-reducer");
    expect(arg.clientId).toBe(42);
    expect(arg.toStatus).toBe("pending_approval");
    expect(arg.reason).toBe("Risk tier yellow");

    // From "analysing" — no cleanup needed.
    expect(clearSpy).not.toHaveBeenCalled();
  });

  it("fans out with toStatus='failed' when the handler throws", async () => {
    const thrower = vi.fn(async () => {
      throw new Error("handler exploded");
    });

    vi.doMock("@/lib/goal-agents/goal-types", () => ({
      GOAL_TYPES: { "search-term-waste-reducer": thrower },
    }));

    mockPayload.find.mockResolvedValueOnce({
      docs: [
        {
          id: 100,
          goal: "search-term-waste-reducer",
          status: "awaiting_data",
          client: 9,
          iterationsCount: 0,
        },
      ],
    });
    // markGoalRunStatus reads the row, then updates it.
    mockPayload.findByID.mockResolvedValueOnce({
      id: 100,
      status: "awaiting_data",
    });
    mockPayload.update.mockResolvedValue({ id: 100, status: "failed" });

    const { runGoalAgentsTick } = await import("@/lib/goal-agents/scheduler");
    const summary = await runGoalAgentsTick(mockPayload as never);

    expect(thrower).toHaveBeenCalledTimes(1);
    expect(summary.failed).toBe(1);

    expect(fanOutSpy).toHaveBeenCalledTimes(1);
    const arg = fanOutSpy.mock.calls[0]?.[0] as {
      goalRunId: number;
      clientId: number;
      toStatus: string;
      reason?: string;
    };
    expect(arg.goalRunId).toBe(100);
    expect(arg.clientId).toBe(9);
    expect(arg.toStatus).toBe("failed");
    expect(arg.reason).toBe("handler exploded");

    // fromStatus was "awaiting_data" — nothing to clear.
    expect(clearSpy).not.toHaveBeenCalled();
  });

  it("clears escalations when a run leaves pending_approval", async () => {
    const handler = vi.fn(async () => ({
      status: "executing" as const,
      nextCheckAt: "2024-06-01T01:00:00.000Z",
    }));

    vi.doMock("@/lib/goal-agents/goal-types", () => ({
      GOAL_TYPES: { "search-term-waste-reducer": handler },
    }));

    mockPayload.find.mockResolvedValueOnce({
      docs: [
        {
          id: 55,
          goal: "search-term-waste-reducer",
          status: "pending_approval",
          client: 12,
          iterationsCount: 1,
        },
      ],
    });
    mockPayload.update.mockResolvedValue({ id: 55, status: "pending_approval" });

    const { runGoalAgentsTick } = await import("@/lib/goal-agents/scheduler");
    const summary = await runGoalAgentsTick(mockPayload as never);

    expect(summary.advanced).toBe(1);

    // pending_approval → executing: clear, do NOT fan out again.
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(clearSpy).toHaveBeenCalledWith(mockPayload, 55);
    expect(fanOutSpy).not.toHaveBeenCalled();
  });

  it("does nothing when toStatus equals fromStatus (skipped tick)", async () => {
    const handler = vi.fn(async () => ({
      status: "awaiting_data" as const,
      nextCheckAt: "2024-06-01T06:00:00.000Z",
    }));

    vi.doMock("@/lib/goal-agents/goal-types", () => ({
      GOAL_TYPES: { "search-term-waste-reducer": handler },
    }));

    mockPayload.find.mockResolvedValueOnce({
      docs: [
        {
          id: 77,
          goal: "search-term-waste-reducer",
          status: "awaiting_data",
          client: 3,
          iterationsCount: 0,
        },
      ],
    });
    mockPayload.update.mockResolvedValue({ id: 77, status: "awaiting_data" });

    const { runGoalAgentsTick } = await import("@/lib/goal-agents/scheduler");
    const summary = await runGoalAgentsTick(mockPayload as never);

    expect(summary.skipped).toBe(1);
    expect(fanOutSpy).not.toHaveBeenCalled();
    expect(clearSpy).not.toHaveBeenCalled();
  });

  it("swallows fan-out errors and keeps processing remaining rows", async () => {
    fanOutSpy.mockImplementationOnce(async () => {
      throw new Error("notifications offline");
    });

    const escalating = vi.fn(async () => ({
      status: "pending_approval" as const,
      nextCheckAt: "2024-06-01T06:00:00.000Z",
      note: "needs approval",
    }));
    const advancing = vi.fn(async () => ({
      status: "analysing" as const,
      nextCheckAt: "2024-06-01T01:00:00.000Z",
    }));

    vi.doMock("@/lib/goal-agents/goal-types", () => ({
      GOAL_TYPES: {
        "search-term-waste-reducer": escalating,
        "other-goal": advancing,
      },
    }));

    mockPayload.find.mockResolvedValueOnce({
      docs: [
        {
          id: 200,
          goal: "search-term-waste-reducer",
          status: "analysing",
          client: 1,
          iterationsCount: 0,
        },
        {
          id: 201,
          goal: "other-goal",
          status: "awaiting_data",
          client: 2,
          iterationsCount: 0,
        },
      ],
    });
    mockPayload.update.mockResolvedValue({ id: 200, status: "analysing" });

    const { runGoalAgentsTick } = await import("@/lib/goal-agents/scheduler");
    const summary = await runGoalAgentsTick(mockPayload as never);

    // Both rows processed despite the fan-out error.
    expect(escalating).toHaveBeenCalledTimes(1);
    expect(advancing).toHaveBeenCalledTimes(1);
    expect(summary.processed).toBe(2);
    expect(summary.advanced).toBe(2);
    expect(summary.failed).toBe(0);

    // Fan-out attempted for row 200; error was logged, not thrown.
    expect(fanOutSpy).toHaveBeenCalledTimes(1);
    expect(mockPayload.logger.error).toHaveBeenCalled();
    const loggedArg = mockPayload.logger.error.mock.calls[0]?.[0] as {
      msg?: string;
      goalRunId?: number;
      error?: string;
    };
    expect(loggedArg?.msg).toMatch(/escalation fanout failed/);
    expect(loggedArg?.goalRunId).toBe(200);
    expect(loggedArg?.error).toBe("notifications offline");
  });
});
