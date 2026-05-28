/**
 * Tool: list_goal_runs.
 *
 * Mocks `getPayload` to return a controllable `find` so we can assert both
 * the where-clause emitted to Payload and the shape of the row data returned
 * to the agent. The tool issues one find on `goal-runs` plus one follow-up
 * find on `goal-run-snapshots` per row — the mock distinguishes by
 * collection.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

interface FindCall {
  collection: string;
  where?: unknown;
  sort?: string;
  limit?: number;
  depth?: number;
  overrideAccess?: boolean;
}

const findCalls: FindCall[] = [];
const findImpl = vi.fn(async (args: FindCall) => {
  findCalls.push(args);
  // Goal-runs lookup: return whatever the test queued.
  if (args.collection === "goal-runs") {
    return { docs: nextGoalRunsDocs };
  }
  // Snapshot lookup: return the snapshot queued for this goalRun id.
  if (args.collection === "goal-run-snapshots") {
    const where = args.where as
      | { goalRun?: { equals?: number } }
      | undefined;
    const goalRunId = where?.goalRun?.equals;
    const snap = nextSnapshotsByGoalRunId.get(Number(goalRunId));
    return { docs: snap ?? [] };
  }
  return { docs: [] };
});

let nextGoalRunsDocs: Array<Record<string, unknown>> = [];
const nextSnapshotsByGoalRunId = new Map<
  number,
  Array<Record<string, unknown>>
>();

vi.mock("payload", () => ({
  getPayload: vi.fn(async () => ({ find: findImpl })),
}));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));

import { listGoalRuns } from "@/lib/agents/optimate-google-ads/tools/list-goal-runs";
import type { ToolContext } from "@/lib/agents/_shared/tool";

function makeCtx(extra: Partial<ToolContext["context"]> = {}): ToolContext {
  return {
    agentName: "optimate-google-ads",
    agentRunId: "run_list_goal_runs_test",
    context: { clientId: 42, ...extra },
    log: vi.fn(),
  };
}

beforeEach(() => {
  findCalls.length = 0;
  findImpl.mockClear();
  nextGoalRunsDocs = [];
  nextSnapshotsByGoalRunId.clear();
});

describe("list_goal_runs — validate()", () => {
  it("returns defaults for empty input", () => {
    const out = listGoalRuns.validate!({});
    expect(out.status).toBeUndefined();
    expect(out.limit).toBe(20);
    expect(out.includeCompleted).toBe(false);
  });

  it("treats non-object input as empty (returns defaults)", () => {
    const out = listGoalRuns.validate!(null);
    expect(out.limit).toBe(20);
    expect(out.includeCompleted).toBe(false);
  });

  it("rejects an unknown status", () => {
    expect(() => listGoalRuns.validate!({ status: "garbage" })).toThrow(
      /status must be one of/,
    );
  });

  it("accepts every legal status", () => {
    const statuses = [
      "awaiting_data",
      "analysing",
      "pending_approval",
      "executing",
      "measuring",
      "complete",
      "failed",
      "blocked",
    ] as const;
    for (const s of statuses) {
      const out = listGoalRuns.validate!({ status: s });
      expect(out.status).toBe(s);
    }
  });

  it("clamps a limit > 100 down to 100", () => {
    const out = listGoalRuns.validate!({ limit: 5000 });
    expect(out.limit).toBe(100);
  });

  it("throws when limit < 1", () => {
    expect(() => listGoalRuns.validate!({ limit: 0 })).toThrow(/limit/);
    expect(() => listGoalRuns.validate!({ limit: -3 })).toThrow(/limit/);
  });

  it("truncates a fractional limit to an integer", () => {
    const out = listGoalRuns.validate!({ limit: 7.9 });
    expect(out.limit).toBe(7);
  });

  it("coerces includeCompleted to false when missing or not a boolean", () => {
    expect(listGoalRuns.validate!({}).includeCompleted).toBe(false);
    expect(
      listGoalRuns.validate!({ includeCompleted: "yes" }).includeCompleted,
    ).toBe(false);
    expect(
      listGoalRuns.validate!({ includeCompleted: true }).includeCompleted,
    ).toBe(true);
  });
});

describe("list_goal_runs — execute()", () => {
  it("returns ok:false when no clientId is in the context", async () => {
    const args = listGoalRuns.validate!({});
    const res = await listGoalRuns.execute(args, makeCtx({ clientId: undefined }));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/client/i);
    // Should NOT have touched payload at all.
    expect(findImpl).not.toHaveBeenCalled();
  });

  it("returns rows with latestSnapshotAction populated from a per-row snapshot find", async () => {
    nextGoalRunsDocs = [
      {
        id: 1,
        goal: "search-term-waste-reducer",
        status: "analysing",
        tier: "yellow",
        iterationsCount: 2,
        nextCheckAt: "2026-05-23T00:00:00.000Z",
        createdAt: "2026-05-20T00:00:00.000Z",
        completedAt: null,
      },
      {
        id: 2,
        goal: "ad-ctr-improver",
        status: "executing",
        tier: "green",
        iterationsCount: 0,
        nextCheckAt: null,
        createdAt: "2026-05-19T00:00:00.000Z",
        completedAt: null,
      },
      {
        id: 3,
        goal: "budget-rebalancer",
        status: "measuring",
        tier: "red",
        iterationsCount: 5,
        nextCheckAt: "2026-05-22T08:00:00.000Z",
        createdAt: "2026-05-18T00:00:00.000Z",
        completedAt: null,
      },
    ];
    nextSnapshotsByGoalRunId.set(1, [
      { id: 91, step: 3, action: "nkl-push-live" },
    ]);
    nextSnapshotsByGoalRunId.set(2, [
      { id: 92, step: 1, action: "ad-copy-generate" },
    ]);
    nextSnapshotsByGoalRunId.set(3, [
      { id: 93, step: 7, action: "budget-reallocate" },
    ]);

    const args = listGoalRuns.validate!({});
    const res = await listGoalRuns.execute(args, makeCtx());

    expect(res.ok).toBe(true);
    const data = res.data as { rows: Array<{ id: number; latestSnapshotAction: string | null }> };
    expect(data.rows).toHaveLength(3);
    expect(data.rows[0].id).toBe(1);
    expect(data.rows[0].latestSnapshotAction).toBe("nkl-push-live");
    expect(data.rows[1].latestSnapshotAction).toBe("ad-copy-generate");
    expect(data.rows[2].latestSnapshotAction).toBe("budget-reallocate");

    // 1 goal-runs find + 3 snapshot finds (one per row).
    expect(findImpl).toHaveBeenCalledTimes(4);
    // Snapshot find shape: sorted by -step, limit 1, scoped to the goalRun id.
    const snapCalls = findCalls.filter(
      (c) => c.collection === "goal-run-snapshots",
    );
    expect(snapCalls).toHaveLength(3);
    expect(snapCalls[0].sort).toBe("-step");
    expect(snapCalls[0].limit).toBe(1);
    expect((snapCalls[0].where as { goalRun: { equals: number } }).goalRun.equals).toBe(1);
  });

  it("leaves latestSnapshotAction = null when no snapshots exist for a run", async () => {
    nextGoalRunsDocs = [
      {
        id: 99,
        goal: "search-term-waste-reducer",
        status: "awaiting_data",
        iterationsCount: 0,
        createdAt: "2026-05-22T00:00:00.000Z",
      },
    ];
    // No snapshot queued for id 99.

    const args = listGoalRuns.validate!({});
    const res = await listGoalRuns.execute(args, makeCtx());
    expect(res.ok).toBe(true);
    const data = res.data as { rows: Array<{ latestSnapshotAction: string | null }> };
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0].latestSnapshotAction).toBeNull();
  });

  it("scopes the goal-runs find to the context's clientId", async () => {
    const args = listGoalRuns.validate!({});
    await listGoalRuns.execute(args, makeCtx({ clientId: 777 }));

    const grCall = findCalls.find((c) => c.collection === "goal-runs");
    expect(grCall).toBeDefined();
    const where = grCall!.where as { and: Array<Record<string, unknown>> };
    expect(where.and[0]).toEqual({ client: { equals: 777 } });
    expect(grCall!.sort).toBe("-createdAt");
    expect(grCall!.depth).toBe(0);
    expect(grCall!.overrideAccess).toBe(true);
  });

  it("passes the status filter through to the where clause", async () => {
    const args = listGoalRuns.validate!({ status: "pending_approval" });
    await listGoalRuns.execute(args, makeCtx());
    const grCall = findCalls.find((c) => c.collection === "goal-runs");
    const where = grCall!.where as { and: Array<Record<string, unknown>> };
    // Must include both the client scope and the status filter — and must
    // NOT include the includeCompleted exclusion (that's bypassed when a
    // status filter is explicitly set).
    const hasStatusEquals = where.and.some(
      (c) => JSON.stringify(c) === JSON.stringify({ status: { equals: "pending_approval" } }),
    );
    expect(hasStatusEquals).toBe(true);
    const hasNotIn = where.and.some((c) => {
      const s = c.status as { not_in?: unknown } | undefined;
      return s?.not_in !== undefined;
    });
    expect(hasNotIn).toBe(false);
  });

  it("with includeCompleted=false (default), excludes complete/failed via status.not_in", async () => {
    const args = listGoalRuns.validate!({});
    await listGoalRuns.execute(args, makeCtx());
    const grCall = findCalls.find((c) => c.collection === "goal-runs");
    const where = grCall!.where as { and: Array<Record<string, unknown>> };
    const notInClause = where.and.find((c) => {
      const s = c.status as { not_in?: unknown } | undefined;
      return s?.not_in !== undefined;
    });
    expect(notInClause).toBeDefined();
    const notIn = (notInClause!.status as { not_in: string[] }).not_in;
    expect(notIn).toContain("complete");
    expect(notIn).toContain("failed");
  });

  it("with includeCompleted=true and no status, drops the not_in exclusion", async () => {
    const args = listGoalRuns.validate!({ includeCompleted: true });
    await listGoalRuns.execute(args, makeCtx());
    const grCall = findCalls.find((c) => c.collection === "goal-runs");
    const where = grCall!.where as { and: Array<Record<string, unknown>> };
    expect(where.and).toHaveLength(1);
    expect(where.and[0]).toEqual({ client: { equals: 42 } });
  });

  it("forwards limit to the goal-runs find", async () => {
    const args = listGoalRuns.validate!({ limit: 7 });
    await listGoalRuns.execute(args, makeCtx());
    const grCall = findCalls.find((c) => c.collection === "goal-runs");
    expect(grCall!.limit).toBe(7);
  });

  it("registers under the read-goals category", async () => {
    const { TOOL_CATEGORY_MAP } = await import(
      "@/lib/agents/optimate-google-ads/tool-catalog"
    );
    expect(TOOL_CATEGORY_MAP["list_goal_runs"]).toBe("read-goals");
  });
});
