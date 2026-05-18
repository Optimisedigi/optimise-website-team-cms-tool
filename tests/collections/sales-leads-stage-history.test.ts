import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SalesLeads } from "@/collections/SalesLeads";

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/access", () => ({
  canAccess: () => () => true,
  adminOnlyDelete: () => true,
  hideUnlessFeature: () => () => false,
}));

// ─── Helpers ───────────────────────────────────────────────────
const mockPayload = {
  find: vi.fn(),
  create: vi.fn(),
  update: vi.fn().mockResolvedValue({}),
  findByID: vi.fn(),
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
};

const mockReq = (overrides: Record<string, any> = {}) => ({
  payload: mockPayload,
  user: { id: 1, email: "admin@test.com", role: "admin" },
  context: {},
  ...overrides,
});

function getBeforeChangeHooks() {
  return SalesLeads.hooks?.beforeChange ?? [];
}

function getAfterChangeHooks() {
  return SalesLeads.hooks?.afterChange ?? [];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── beforeChange: must NOT mutate stageHistory ──────────────
describe("SalesLeads: beforeChange does not mutate stageHistory", () => {
  it("has no beforeChange hooks that touch stageHistory (moved to afterChange)", async () => {
    const hooks = getBeforeChangeHooks();

    // If any beforeChange hooks exist, none of them should mutate stageHistory
    // when stage changes — that was the root cause of phantom-dirty admin forms.
    const originalDoc = {
      id: 1,
      stage: "qualified",
      stageHistory: [{ fromStage: "new", toStage: "qualified", transitionDate: "2024-01-01" }],
    };
    const data: Record<string, any> = { stage: "lost" };

    for (const hook of hooks) {
      const result = await (hook as any)({
        data,
        originalDoc,
        operation: "update",
        req: mockReq(),
      });
      const out = result ?? data;
      // Either the hook left stageHistory alone, OR it never appeared.
      expect(out.stageHistory).toBeUndefined();
    }
  });
});

// ─── afterChange: defers stageHistory write ──────────────────
describe("SalesLeads: afterChange defers stageHistory write", () => {
  // The activity-log hook is the only afterChange hook in this collection;
  // it now also schedules the deferred stageHistory + proposal-sync work.
  function getActivityHook() {
    const hooks = getAfterChangeHooks();
    expect(hooks.length).toBeGreaterThanOrEqual(1);
    return hooks[0] as any;
  }

  it("schedules a deferred update with the new stageHistory entry on stage change", async () => {
    const hook = getActivityHook();
    const previousDoc = {
      id: 42,
      stage: "qualified",
      stageHistory: [
        { fromStage: "new", toStage: "qualified", transitionDate: "2024-01-01T00:00:00.000Z" },
      ],
    };
    const doc = {
      id: 42,
      businessName: "Acme Co",
      stage: "lost",
      stageHistory: previousDoc.stageHistory,
    };

    await hook({
      doc,
      previousDoc,
      operation: "update",
      req: mockReq(),
    });

    // Deferred 500ms — nothing should have fired yet.
    expect(mockPayload.update).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);

    expect(mockPayload.update).toHaveBeenCalledTimes(1);
    const call = mockPayload.update.mock.calls[0]![0];
    expect(call.collection).toBe("sales-leads");
    expect(call.id).toBe(42);
    expect(call.overrideAccess).toBe(true);
    expect(call.context).toEqual({ skipStageHistory: true });

    const history = call.data.stageHistory;
    expect(Array.isArray(history)).toBe(true);
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ fromStage: "qualified", toStage: "lost" });
    expect(typeof history[0].transitionDate).toBe("string");
    // Existing entries preserved after the new one
    expect(history[1]).toMatchObject({ fromStage: "new", toStage: "qualified" });
  });

  it("does not schedule a deferred update when stage didn't change", async () => {
    const hook = getActivityHook();
    await hook({
      doc: { id: 1, businessName: "Acme", stage: "qualified", stageHistory: [] },
      previousDoc: { id: 1, stage: "qualified", stageHistory: [] },
      operation: "update",
      req: mockReq(),
    });
    await vi.advanceTimersByTimeAsync(600);
    expect(mockPayload.update).not.toHaveBeenCalled();
  });

  it("short-circuits when req.context.skipStageHistory is true (recursion guard)", async () => {
    const hook = getActivityHook();
    await hook({
      doc: { id: 9, businessName: "Acme", stage: "lost", stageHistory: [] },
      previousDoc: { id: 9, stage: "qualified", stageHistory: [] },
      operation: "update",
      req: mockReq({ context: { skipStageHistory: true } }),
    });
    await vi.advanceTimersByTimeAsync(600);
    expect(mockPayload.update).not.toHaveBeenCalled();
  });

  it("does not schedule a deferred update on create", async () => {
    const hook = getActivityHook();
    await hook({
      doc: { id: 1, businessName: "Acme", stage: "new", stageHistory: [] },
      operation: "create",
      req: mockReq(),
    });
    await vi.advanceTimersByTimeAsync(600);
    expect(mockPayload.update).not.toHaveBeenCalled();
  });
});
