import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Module mocks (set up before any SUT import) ───────────────────────────
const mockPayload = {
  find: vi.fn(),
  findByID: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  logger: { warn: vi.fn(), error: vi.fn() },
};

vi.mock("payload", () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}));

vi.mock("@/payload.config", () => ({
  default: Promise.resolve({}),
}));

// ─── Scheduler unit tests ──────────────────────────────────────────────────
describe("runGoalAgentsTick — scheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns processed:0 when no due rows are found", async () => {
    mockPayload.find.mockResolvedValueOnce({ docs: [] });

    const { runGoalAgentsTick } = await import(
      "@/lib/goal-agents/scheduler"
    );
    const summary = await runGoalAgentsTick(mockPayload as never);

    expect(summary.processed).toBe(0);
    expect(summary.advanced).toBe(0);
    expect(summary.failed).toBe(0);
    expect(summary.skipped).toBe(0);
    expect(summary.details).toEqual([]);

    // Sanity: the find query should pin status not_in [complete,failed].
    const call = mockPayload.find.mock.calls[0]?.[0] as
      | { where?: { and?: Array<Record<string, unknown>> } }
      | undefined;
    expect(call?.where?.and?.[0]).toEqual({
      status: { not_in: ["complete", "failed"] },
    });
  });

  it("invokes the registered handler exactly once for a due search-term-waste-reducer row", async () => {
    const handlerSpy = vi.fn(async () => ({
      status: "analysing" as const,
      nextCheckAt: "2024-06-01T01:00:00.000Z",
      note: "ok",
    }));

    vi.doMock("@/lib/goal-agents/goal-types", () => ({
      GOAL_TYPES: { "search-term-waste-reducer": handlerSpy },
    }));

    mockPayload.find.mockResolvedValueOnce({
      docs: [
        {
          id: 7,
          goal: "search-term-waste-reducer",
          status: "awaiting_data",
          client: 42,
          iterationsCount: 0,
          coolingOffUntil: null,
          nextCheckAt: null,
        },
      ],
    });
    mockPayload.update.mockResolvedValue({
      id: 7,
      status: "awaiting_data",
    });

    const { runGoalAgentsTick } = await import(
      "@/lib/goal-agents/scheduler"
    );
    const now = new Date("2024-06-01T00:00:00.000Z");
    const summary = await runGoalAgentsTick(mockPayload as never, now);

    expect(handlerSpy).toHaveBeenCalledTimes(1);
    const ctx = handlerSpy.mock.calls[0]?.[0] as {
      payload: unknown;
      goalRun: { id: number; goal: string; status: string };
      clientId: number;
      now: Date;
    };
    expect(ctx.clientId).toBe(42);
    expect(ctx.goalRun.id).toBe(7);
    expect(ctx.goalRun.goal).toBe("search-term-waste-reducer");
    expect(ctx.goalRun.status).toBe("awaiting_data");
    expect(ctx.now).toEqual(now);

    expect(summary.processed).toBe(1);
    // awaiting_data → analysing counts as advanced.
    expect(summary.advanced).toBe(1);
    expect(summary.skipped).toBe(0);
    expect(summary.failed).toBe(0);
    expect(summary.details[0]).toMatchObject({
      goalRunId: 7,
      goal: "search-term-waste-reducer",
      fromStatus: "awaiting_data",
      toStatus: "analysing",
    });

    // Scheduler must have persisted nextCheckAt onto the goal-runs row.
    const updateCall = mockPayload.update.mock.calls.find(
      (c) => c[0]?.collection === "goal-runs" && c[0]?.id === 7,
    );
    expect(updateCall).toBeDefined();
    expect(updateCall?.[0]?.data?.nextCheckAt).toBe("2024-06-01T01:00:00.000Z");
  });

  it("counts a handler returning the same status as 'skipped' rather than 'advanced'", async () => {
    const handlerSpy = vi.fn(async () => ({
      status: "awaiting_data" as const,
      nextCheckAt: "2024-06-01T06:00:00.000Z",
    }));

    vi.doMock("@/lib/goal-agents/goal-types", () => ({
      GOAL_TYPES: { "search-term-waste-reducer": handlerSpy },
    }));

    mockPayload.find.mockResolvedValueOnce({
      docs: [
        {
          id: 9,
          goal: "search-term-waste-reducer",
          status: "awaiting_data",
          client: 1,
          iterationsCount: 0,
        },
      ],
    });
    mockPayload.update.mockResolvedValue({ id: 9, status: "awaiting_data" });

    const { runGoalAgentsTick } = await import(
      "@/lib/goal-agents/scheduler"
    );
    const summary = await runGoalAgentsTick(
      mockPayload as never,
      new Date("2024-06-01T00:00:00.000Z"),
    );

    expect(summary.processed).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.advanced).toBe(0);
    expect(summary.failed).toBe(0);
  });

  it("marks the row failed and continues when the goal type is unknown", async () => {
    vi.doMock("@/lib/goal-agents/goal-types", () => ({
      GOAL_TYPES: {},
    }));

    mockPayload.find.mockResolvedValueOnce({
      docs: [
        {
          id: 13,
          goal: "totally-made-up-goal",
          status: "awaiting_data",
          client: 5,
          iterationsCount: 0,
        },
      ],
    });
    // markGoalRunStatus reads the current row, then updates it.
    mockPayload.findByID.mockResolvedValueOnce({
      id: 13,
      status: "awaiting_data",
    });
    mockPayload.update.mockResolvedValueOnce({ id: 13, status: "failed" });

    const { runGoalAgentsTick } = await import(
      "@/lib/goal-agents/scheduler"
    );
    const summary = await runGoalAgentsTick(mockPayload as never);

    expect(summary.processed).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.advanced).toBe(0);
    expect(summary.skipped).toBe(0);
    expect(summary.details[0]).toMatchObject({
      goalRunId: 13,
      goal: "totally-made-up-goal",
      toStatus: "failed",
      error: "Unknown goal type: totally-made-up-goal",
    });

    // Verify the row was actually updated to failed.
    const failUpdate = mockPayload.update.mock.calls.find(
      (c) => c[0]?.collection === "goal-runs" && c[0]?.id === 13,
    );
    expect(failUpdate?.[0]?.data?.status).toBe("failed");
  });

  it("marks the row failed when the handler throws and continues processing later rows", async () => {
    const thrower = vi.fn(async () => {
      throw new Error("handler exploded");
    });
    const goodHandler = vi.fn(async () => ({
      status: "analysing" as const,
      nextCheckAt: "2024-06-01T01:00:00.000Z",
    }));

    vi.doMock("@/lib/goal-agents/goal-types", () => ({
      GOAL_TYPES: {
        "search-term-waste-reducer": thrower,
        "other-goal": goodHandler,
      },
    }));

    const now = new Date("2024-06-01T00:00:00.000Z");
    mockPayload.find.mockResolvedValueOnce({
      docs: [
        {
          id: 100,
          goal: "search-term-waste-reducer",
          status: "awaiting_data",
          client: 1,
          iterationsCount: 0,
        },
        {
          id: 101,
          goal: "other-goal",
          status: "awaiting_data",
          client: 2,
          iterationsCount: 0,
        },
      ],
    });
    // For the failed row: markGoalRunStatus reads first, then updates.
    mockPayload.findByID.mockResolvedValueOnce({
      id: 100,
      status: "awaiting_data",
    });
    mockPayload.update.mockResolvedValue({ id: 100, status: "failed" });

    const { runGoalAgentsTick } = await import(
      "@/lib/goal-agents/scheduler"
    );
    const summary = await runGoalAgentsTick(mockPayload as never, now);

    // Both rows were attempted.
    expect(thrower).toHaveBeenCalledTimes(1);
    expect(goodHandler).toHaveBeenCalledTimes(1);

    expect(summary.processed).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.advanced).toBe(1);

    const failedDetail = summary.details.find((d) => d.goalRunId === 100);
    expect(failedDetail?.toStatus).toBe("failed");
    expect(failedDetail?.error).toBe("handler exploded");

    const failUpdate = mockPayload.update.mock.calls.find(
      (c) => c[0]?.collection === "goal-runs" && c[0]?.id === 100,
    );
    expect(failUpdate?.[0]?.data).toMatchObject({
      status: "failed",
      error: "handler exploded",
      completedAt: now.toISOString(),
    });
  });

  it("marks a run failed before handler invocation when the client relation is not resolvable", async () => {
    const handlerSpy = vi.fn(async () => ({
      status: "analysing" as const,
      nextCheckAt: "2024-06-01T01:00:00.000Z",
    }));

    vi.doMock("@/lib/goal-agents/goal-types", () => ({
      GOAL_TYPES: { "search-term-waste-reducer": handlerSpy },
    }));

    const now = new Date("2024-06-01T00:00:00.000Z");
    mockPayload.find.mockResolvedValueOnce({
      docs: [
        {
          id: 144,
          goal: "search-term-waste-reducer",
          status: "analysing",
          client: { id: "not-a-number" },
          iterationsCount: 3,
        },
      ],
    });
    mockPayload.findByID.mockResolvedValueOnce({ id: 144, status: "analysing" });
    mockPayload.update.mockResolvedValueOnce({ id: 144, status: "failed" });

    const { runGoalAgentsTick } = await import(
      "@/lib/goal-agents/scheduler"
    );
    const summary = await runGoalAgentsTick(mockPayload as never, now);

    expect(handlerSpy).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ processed: 1, failed: 1, advanced: 0 });
    expect(summary.details[0]).toMatchObject({
      goalRunId: 144,
      fromStatus: "analysing",
      toStatus: "failed",
      error: "goal-run 144 has no resolvable client id",
    });
    expect(mockPayload.update.mock.calls[0]?.[0]?.data).toMatchObject({
      status: "failed",
      error: "goal-run 144 has no resolvable client id",
      completedAt: now.toISOString(),
    });
  });

  it("does not count a metadata persistence failure as a failed goal-run", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const handlerSpy = vi.fn(async () => ({
      status: "analysing" as const,
      nextCheckAt: "2024-06-01T01:00:00.000Z",
      coolingOffUntil: "2024-06-01T00:30:00.000Z",
      iterationsCount: 6,
    }));

    vi.doMock("@/lib/goal-agents/goal-types", () => ({
      GOAL_TYPES: { "search-term-waste-reducer": handlerSpy },
    }));

    mockPayload.find.mockResolvedValueOnce({
      docs: [
        {
          id: 201,
          goal: "search-term-waste-reducer",
          status: "awaiting_data",
          client: "42",
          iterationsCount: 5,
        },
      ],
    });
    mockPayload.update.mockRejectedValueOnce(new Error("database locked"));

    const { runGoalAgentsTick } = await import(
      "@/lib/goal-agents/scheduler"
    );
    const summary = await runGoalAgentsTick(mockPayload as never);

    expect(summary).toMatchObject({ processed: 1, advanced: 1, failed: 0 });
    expect(summary.details[0]).toMatchObject({
      goalRunId: 201,
      toStatus: "analysing",
    });
    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "goal-runs",
        id: 201,
        data: expect.objectContaining({
          nextCheckAt: "2024-06-01T01:00:00.000Z",
          coolingOffUntil: "2024-06-01T00:30:00.000Z",
          iterationsCount: 6,
        }),
      }),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("failed to persist tick metadata"),
      expect.any(Error),
    );
    consoleErrorSpy.mockRestore();
  });
});

// ─── Route auth tests ──────────────────────────────────────────────────────
describe("GET /api/goal-agents/cron — CRON_SECRET auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("returns 500 when CRON_SECRET is missing from env", async () => {
    delete process.env.CRON_SECRET;

    vi.doMock("@/lib/goal-agents/scheduler", () => ({
      runGoalAgentsTick: vi.fn(),
    }));

    const { GET } = await import(
      "@/app/(frontend)/api/goal-agents/cron/route"
    );
    const { NextRequest } = await import("next/server");

    const req = new NextRequest("http://localhost:3001/api/goal-agents/cron", {
      method: "GET",
      headers: { Authorization: "Bearer anything" },
    });
    const res = await GET(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/CRON_SECRET/);
  });

  it("returns 401 when no Authorization header is supplied", async () => {
    process.env.CRON_SECRET = "test-cron-secret";

    vi.doMock("@/lib/goal-agents/scheduler", () => ({
      runGoalAgentsTick: vi.fn(),
    }));

    const { GET } = await import(
      "@/app/(frontend)/api/goal-agents/cron/route"
    );
    const { NextRequest } = await import("next/server");

    const req = new NextRequest("http://localhost:3001/api/goal-agents/cron", {
      method: "GET",
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 when the bearer token is wrong", async () => {
    process.env.CRON_SECRET = "test-cron-secret";

    vi.doMock("@/lib/goal-agents/scheduler", () => ({
      runGoalAgentsTick: vi.fn(),
    }));

    const { GET } = await import(
      "@/app/(frontend)/api/goal-agents/cron/route"
    );
    const { NextRequest } = await import("next/server");

    const req = new NextRequest("http://localhost:3001/api/goal-agents/cron", {
      method: "GET",
      headers: { Authorization: "Bearer wrong-token" },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 200 with the cron summary when the bearer token matches CRON_SECRET", async () => {
    process.env.CRON_SECRET = "test-cron-secret";

    const fakeSummary = {
      processed: 0,
      advanced: 0,
      failed: 0,
      skipped: 0,
      details: [],
    };
    vi.doMock("@/lib/goal-agents/scheduler", () => ({
      runGoalAgentsTick: vi.fn(() => Promise.resolve(fakeSummary)),
    }));

    const { GET } = await import(
      "@/app/(frontend)/api/goal-agents/cron/route"
    );
    const { NextRequest } = await import("next/server");

    const req = new NextRequest("http://localhost:3001/api/goal-agents/cron", {
      method: "GET",
      headers: { Authorization: "Bearer test-cron-secret" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.summary).toEqual(fakeSummary);
    expect(json.summary.processed).toBe(0);
  });
});
