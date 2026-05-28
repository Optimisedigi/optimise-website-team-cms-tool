/**
 * Tool: get_goal_run.
 *
 * Mocks `getPayload` to return controllable `findByID` and `find` impls so we
 * can assert:
 *   - validate() coerces / rejects goalRunId correctly,
 *   - Payload NotFound surfaces as a clean ok:false,
 *   - cross-client access is blocked when ctx.context.clientId is set,
 *   - happy path returns the goal-run row + ordered snapshots,
 *   - missing ctx.context.clientId disables scoping (admin-style call).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

interface FindByIDArgs {
  collection: string;
  id: number | string;
  depth?: number;
  overrideAccess?: boolean;
}
interface FindArgs {
  collection: string;
  where?: unknown;
  sort?: string;
  limit?: number;
  depth?: number;
  overrideAccess?: boolean;
}

let nextGoalRunDoc: Record<string, unknown> | null = null;
let nextFindByIDError: Error | null = null;
let nextSnapshots: Array<Record<string, unknown>> = [];

const findByIDCalls: FindByIDArgs[] = [];
const findCalls: FindArgs[] = [];

const findByIDImpl = vi.fn(async (args: FindByIDArgs) => {
  findByIDCalls.push(args);
  if (nextFindByIDError) throw nextFindByIDError;
  if (!nextGoalRunDoc) {
    // Mimic Payload's NotFound throw.
    throw new Error("Not Found");
  }
  return nextGoalRunDoc;
});

const findImpl = vi.fn(async (args: FindArgs) => {
  findCalls.push(args);
  if (args.collection === "goal-run-snapshots") {
    return { docs: nextSnapshots };
  }
  return { docs: [] };
});

vi.mock("payload", () => ({
  getPayload: vi.fn(async () => ({
    findByID: findByIDImpl,
    find: findImpl,
  })),
}));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));

import { getGoalRun } from "@/lib/agents/optimate-google-ads/tools/get-goal-run";
import type { ToolContext } from "@/lib/agents/_shared/tool";

function makeCtx(extra: Partial<ToolContext["context"]> = {}): ToolContext {
  return {
    agentName: "optimate-google-ads",
    agentRunId: "run_get_goal_run_test",
    context: { clientId: 42, ...extra },
    log: vi.fn(),
  };
}

beforeEach(() => {
  findByIDCalls.length = 0;
  findCalls.length = 0;
  findByIDImpl.mockClear();
  findImpl.mockClear();
  nextGoalRunDoc = null;
  nextFindByIDError = null;
  nextSnapshots = [];
});

describe("get_goal_run — validate()", () => {
  it("throws when goalRunId is missing", () => {
    expect(() => getGoalRun.validate!({})).toThrow(/goalRunId/);
  });

  it("throws when goalRunId is null", () => {
    expect(() => getGoalRun.validate!({ goalRunId: null })).toThrow(/goalRunId/);
  });

  it("throws when goalRunId is not a number-like value", () => {
    expect(() => getGoalRun.validate!({ goalRunId: "abc" })).toThrow();
  });

  it("throws when goalRunId is < 1", () => {
    expect(() => getGoalRun.validate!({ goalRunId: 0 })).toThrow(/>= 1/);
    expect(() => getGoalRun.validate!({ goalRunId: -5 })).toThrow(/>= 1/);
  });

  it("accepts a positive integer", () => {
    expect(getGoalRun.validate!({ goalRunId: 7 })).toEqual({ goalRunId: 7 });
  });

  it("coerces a numeric string into an integer", () => {
    expect(getGoalRun.validate!({ goalRunId: "12" })).toEqual({ goalRunId: 12 });
  });

  it("truncates a fractional value to an integer", () => {
    expect(getGoalRun.validate!({ goalRunId: 7.9 })).toEqual({ goalRunId: 7 });
  });
});

describe("get_goal_run — execute()", () => {
  it("returns ok:false with a 'not found' error when findByID throws", async () => {
    // No goal-run doc queued → findByIDImpl throws.
    const res = await getGoalRun.execute({ goalRunId: 999 }, makeCtx());
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/goal-run 999 not found/);
    // We should NOT have touched the snapshots collection.
    expect(findImpl).not.toHaveBeenCalled();
  });

  it("blocks cross-client access when the run belongs to a different client", async () => {
    nextGoalRunDoc = {
      id: 5,
      client: 10,
      goal: "search-term-waste-reducer",
      status: "analysing",
    };
    const res = await getGoalRun.execute(
      { goalRunId: 5 },
      makeCtx({ clientId: 20 }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/different client/i);
    // Snapshots must not be loaded once scoping fails.
    expect(findImpl).not.toHaveBeenCalled();
  });

  it("blocks cross-client access when the run's client comes back as a populated relation", async () => {
    nextGoalRunDoc = {
      id: 5,
      client: { id: 10, name: "Other Co" },
      goal: "search-term-waste-reducer",
      status: "analysing",
    };
    const res = await getGoalRun.execute(
      { goalRunId: 5 },
      makeCtx({ clientId: 20 }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/different client/i);
  });

  it("returns ok:true with goal-run row + ordered snapshots on the happy path", async () => {
    nextGoalRunDoc = {
      id: 5,
      client: 42,
      goal: "search-term-waste-reducer",
      status: "measuring",
      tier: "yellow",
      iterationsCount: 3,
      nextCheckAt: "2026-05-23T00:00:00.000Z",
      coolingOffUntil: null,
      createdAt: "2026-05-20T00:00:00.000Z",
      completedAt: null,
      error: null,
    };
    nextSnapshots = [
      {
        id: 101,
        step: 1,
        action: "fetch-search-terms",
        riskTier: "green",
        status: "complete",
        blockReason: null,
        measuredResult: null,
        createdAt: "2026-05-20T00:01:00.000Z",
      },
      {
        id: 102,
        step: 2,
        action: "propose-nkl-update",
        riskTier: "yellow",
        status: "pending_approval",
        blockReason: null,
        measuredResult: null,
        createdAt: "2026-05-20T00:02:00.000Z",
      },
      {
        id: 103,
        step: 3,
        action: "nkl-push-live",
        riskTier: "yellow",
        status: "executing",
        blockReason: null,
        measuredResult: { wastedSpendBefore: 1200, wastedSpendAfter: 300 },
        createdAt: "2026-05-20T00:03:00.000Z",
      },
    ];

    const res = await getGoalRun.execute({ goalRunId: 5 }, makeCtx());
    expect(res.ok).toBe(true);
    const data = res.data as {
      goalRun: {
        id: number;
        goal: string;
        status: string;
        tier: string;
        iterationsCount: number;
      };
      snapshots: Array<{
        id: number;
        step: number;
        action: string;
        riskTier: string;
        status: string;
        measuredResult: unknown;
      }>;
    };
    expect(data.goalRun.id).toBe(5);
    expect(data.goalRun.goal).toBe("search-term-waste-reducer");
    expect(data.goalRun.status).toBe("measuring");
    expect(data.goalRun.tier).toBe("yellow");
    expect(data.goalRun.iterationsCount).toBe(3);

    expect(data.snapshots).toHaveLength(3);
    expect(data.snapshots.map((s) => s.step)).toEqual([1, 2, 3]);
    expect(data.snapshots[0].action).toBe("fetch-search-terms");
    expect(data.snapshots[2].action).toBe("nkl-push-live");
    expect(data.snapshots[2].measuredResult).toEqual({
      wastedSpendBefore: 1200,
      wastedSpendAfter: 300,
    });

    // Snapshot find shape: scoped to the goalRun id, sorted by step asc.
    expect(findCalls).toHaveLength(1);
    const snapCall = findCalls[0];
    expect(snapCall.collection).toBe("goal-run-snapshots");
    expect(snapCall.sort).toBe("step");
    expect(snapCall.depth).toBe(0);
    expect(snapCall.overrideAccess).toBe(true);
    expect(
      (snapCall.where as { goalRun: { equals: number } }).goalRun.equals,
    ).toBe(5);

    // findByID was issued with depth:0 + overrideAccess for the right collection/id.
    expect(findByIDCalls).toHaveLength(1);
    expect(findByIDCalls[0].collection).toBe("goal-runs");
    expect(findByIDCalls[0].id).toBe(5);
    expect(findByIDCalls[0].depth).toBe(0);
    expect(findByIDCalls[0].overrideAccess).toBe(true);
  });

  it("does not enforce scoping when ctx has no clientId (admin-style call)", async () => {
    nextGoalRunDoc = {
      id: 5,
      client: 10, // some other client
      goal: "search-term-waste-reducer",
      status: "complete",
    };
    nextSnapshots = [
      {
        id: 101,
        step: 1,
        action: "fetch-search-terms",
        status: "complete",
      },
    ];

    const res = await getGoalRun.execute(
      { goalRunId: 5 },
      makeCtx({ clientId: undefined }),
    );
    expect(res.ok).toBe(true);
    const data = res.data as { goalRun: { id: number }; snapshots: unknown[] };
    expect(data.goalRun.id).toBe(5);
    expect(data.snapshots).toHaveLength(1);
  });

  it("registers under the read-goals category", async () => {
    const { TOOL_CATEGORY_MAP } = await import(
      "@/lib/agents/optimate-google-ads/tool-catalog"
    );
    expect(TOOL_CATEGORY_MAP["get_goal_run"]).toBe("read-goals");
  });
});
