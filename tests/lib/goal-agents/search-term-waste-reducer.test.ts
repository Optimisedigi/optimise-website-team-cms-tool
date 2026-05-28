import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from "vitest";

import {
  tick,
  GOAL_KEY,
  type SearchTermWasteContext,
  type GoalRunDoc,
} from "@/lib/goal-agents/goal-types/search-term-waste-reducer";
import {
  registerApplyHandler,
  type ApplyHandler,
} from "@/lib/agents/_shared/apply-dispatcher";
import type { SearchTermSnapshotRow } from "@/lib/google-ads-snapshots";

// ─── Test doubles ──────────────────────────────────────────────────────────

/**
 * In-memory Payload double. Only the methods the handler actually uses are
 * implemented; everything else throws so a regression that adds a new DB
 * call is loud rather than silent.
 */
interface FindArgs {
  collection: string;
  where?: Record<string, unknown>;
  sort?: string;
  limit?: number;
  depth?: number;
}
interface FindByIDArgs {
  collection: string;
  id: number | string;
}
interface CreateArgs {
  collection: string;
  data: Record<string, unknown>;
}
interface UpdateArgs {
  collection: string;
  id: number | string;
  data: Record<string, unknown>;
}

interface MockState {
  /** Pre-loaded docs keyed by `${collection}#${id}`. */
  byId: Map<string, Record<string, unknown>>;
  /** Pre-loaded find-result lists keyed by collection. */
  finds: Map<string, Array<Record<string, unknown>>>;
  /** Records every create/update so tests can assert. */
  createCalls: Array<CreateArgs>;
  updateCalls: Array<UpdateArgs>;
}

function key(collection: string, id: number | string): string {
  return `${collection}#${id}`;
}

function makePayload(state: MockState) {
  return {
    find: vi.fn(async (args: FindArgs) => {
      const docs = state.finds.get(args.collection) ?? [];
      // Honour a goalRun.equals filter (used by findLatestSnapshotForRun).
      let filtered = docs;
      const w = (args.where ?? {}) as Record<string, unknown>;
      if (w.goalRun && typeof w.goalRun === "object" && "equals" in (w.goalRun as object)) {
        const target = (w.goalRun as { equals: unknown }).equals;
        filtered = docs.filter((d) => d.goalRun === target);
      }
      // Honour sort: "-createdAt" by reversing if order-insensitive.
      if (args.sort === "-createdAt") {
        filtered = [...filtered].reverse();
      }
      return {
        docs: filtered,
        totalDocs: filtered.length,
        page: 1,
        totalPages: 1,
        limit: args.limit ?? 10,
      };
    }),
    findByID: vi.fn(async (args: FindByIDArgs) => {
      const doc = state.byId.get(key(args.collection, args.id));
      if (!doc) {
        throw Object.assign(new Error("NotFound"), { name: "NotFound" });
      }
      return doc;
    }),
    create: vi.fn(async (args: CreateArgs) => {
      state.createCalls.push(args);
      // Auto-assign an id so callers can chain.
      const id = state.createCalls.length * 1000 + 1;
      const doc = { id, ...args.data };
      state.byId.set(key(args.collection, id), doc);
      const list = state.finds.get(args.collection) ?? [];
      list.push(doc);
      state.finds.set(args.collection, list);
      return doc;
    }),
    update: vi.fn(async (args: UpdateArgs) => {
      state.updateCalls.push(args);
      const existing = state.byId.get(key(args.collection, args.id));
      if (!existing) throw new Error(`update: ${args.collection}#${args.id} not found`);
      const merged = { ...existing, ...args.data };
      state.byId.set(key(args.collection, args.id), merged);
      return merged;
    }),
  };
}

// ─── Fixtures ──────────────────────────────────────────────────────────────

const NOW = new Date("2024-06-15T12:00:00.000Z");

// Freeze the system clock at NOW for the whole file so the snapshot reader
// (which calls Date.now() internally to compute staleness) agrees with the
// `now` we pass into the handler context.
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterAll(() => {
  vi.useRealTimers();
});

/**
 * 5-row search-term snapshot matching the §5.1 spec:
 *   - 2 zero-conv waste candidates ("blue widget reviews"? — no, plain waste)
 *   - 1 brand term (excluded — contains "acme")
 *   - 1 low-volume <3 clicks (excluded)
 *   - 1 high-intent zero-conv ("buy")
 *
 * NOTE: "review" / "reviews" / "best" etc are high-intent tokens in the
 * classifier, so the two waste candidates avoid those tokens entirely.
 */
const SEARCH_TERM_ROWS: SearchTermSnapshotRow[] = [
  // candidate 1: pure waste — 12 clicks, 0 conv, no high-intent tokens
  {
    term: "widget froobnitz",
    campaignName: "Generic — Widgets",
    impressions: 200,
    clicks: 12,
    spend: 35,
    conversions: 0,
    cpa: null,
  },
  // candidate 2: pure waste — 5 clicks, 0 conv
  {
    term: "widget zorblax",
    campaignName: "Generic — Widgets",
    impressions: 90,
    clicks: 5,
    spend: 18,
    conversions: 0,
    cpa: null,
  },
  // brand term — excluded
  {
    term: "acme widgets login",
    campaignName: "Brand",
    impressions: 50,
    clicks: 8,
    spend: 12,
    conversions: 0,
    cpa: null,
  },
  // low-volume — excluded (<3 clicks)
  {
    term: "widget tiny",
    campaignName: "Generic — Widgets",
    impressions: 30,
    clicks: 2,
    spend: 4,
    conversions: 0,
    cpa: null,
  },
  // high-intent, zero conv — escalated, not negated
  {
    term: "buy widget online",
    campaignName: "Generic — Widgets",
    impressions: 80,
    clicks: 6,
    spend: 22,
    conversions: 0,
    cpa: null,
  },
];

function makeSnapshotDoc(opts: { capturedAt: string; rows?: SearchTermSnapshotRow[] }) {
  const rows = opts.rows ?? SEARCH_TERM_ROWS;
  return {
    id: 7001,
    client: 42,
    level: "search_term",
    capturedAt: opts.capturedAt,
    customerId: "123-456-7890",
    rowCount: rows.length,
    rows,
  };
}

function makeClientDoc(overrides: Partial<{ brandKeywords: string; competitorKeywords: string }> = {}) {
  return {
    id: 42,
    brandKeywords: overrides.brandKeywords ?? "acme",
    competitorKeywords: overrides.competitorKeywords ?? "",
  };
}

function makeGoalRun(overrides: Partial<GoalRunDoc> = {}): GoalRunDoc {
  return {
    id: 500,
    goal: GOAL_KEY,
    status: overrides.status ?? "awaiting_data",
    client: 42,
    iterationsCount: 0,
    coolingOffUntil: null,
    nextCheckAt: null,
    ...overrides,
  };
}

/** Build a fresh-but-empty state and pre-seed common docs. */
function makeState(opts: {
  goalRun: GoalRunDoc;
  snapshotCapturedAt?: string;
  snapshotRows?: SearchTermSnapshotRow[];
  greenTier?: boolean;
  approvalStatus?: string;
  approvalId?: number;
  /** Pre-recorded goal-run-snapshots (used by pending_approval/executing/measuring tests). */
  preSnapshots?: Array<Record<string, unknown>>;
  freshSnapshotRows?: SearchTermSnapshotRow[];
}): MockState {
  const state: MockState = {
    byId: new Map(),
    finds: new Map(),
    createCalls: [],
    updateCalls: [],
  };

  // goal-runs row.
  state.byId.set(
    key("goal-runs", opts.goalRun.id),
    { ...opts.goalRun },
  );

  // clients row.
  state.byId.set(key("clients", 42), makeClientDoc());

  // google-ads-snapshots: search-term latest.
  if (opts.snapshotCapturedAt !== undefined) {
    state.finds.set("google-ads-snapshots", [
      makeSnapshotDoc({
        capturedAt: opts.snapshotCapturedAt,
        rows: opts.freshSnapshotRows ?? opts.snapshotRows,
      }),
    ]);
  }

  // goal-risk-tiers
  if (opts.greenTier) {
    state.finds.set("goal-risk-tiers", [
      {
        id: 1,
        tier: "green",
        maxBudgetImpactDollars: null,
        allowedActionTypes: [{ actionType: "nkl-push-live" }],
        requiresApproval: false,
        autoExecute: true,
      },
    ]);
  } else {
    // Yellow tier requiring approval.
    state.finds.set("goal-risk-tiers", [
      {
        id: 2,
        tier: "yellow",
        maxBudgetImpactDollars: 100,
        allowedActionTypes: [{ actionType: "nkl-push-live" }],
        requiresApproval: true,
        autoExecute: false,
      },
    ]);
  }

  // Pre-recorded snapshots if provided.
  if (opts.preSnapshots) {
    state.finds.set("goal-run-snapshots", opts.preSnapshots);
    for (const s of opts.preSnapshots) {
      if (typeof s.id === "number") {
        state.byId.set(key("goal-run-snapshots", s.id), s);
      }
    }
  }

  // Optional pre-seeded approval row.
  if (opts.approvalId !== undefined && opts.approvalStatus) {
    state.byId.set(key("agent-approval-queue", opts.approvalId), {
      id: opts.approvalId,
      status: opts.approvalStatus,
    });
  }

  return state;
}

function makeCtx(state: MockState, goalRun: GoalRunDoc): SearchTermWasteContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload = makePayload(state) as any;
  return { payload, goalRun, clientId: 42, now: NOW };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("search-term-waste-reducer — handleAwaitingData", () => {
  it("stale snapshot → stays in awaiting_data and sets backoff", async () => {
    const goalRun = makeGoalRun({ status: "awaiting_data" });
    // 36h old → stale (default 24h threshold).
    const staleCapturedAt = new Date(NOW.getTime() - 36 * 3600 * 1000).toISOString();
    const state = makeState({ goalRun, snapshotCapturedAt: staleCapturedAt });

    const result = await tick(makeCtx(state, goalRun));

    expect(result.status).toBe("awaiting_data");
    const next = new Date(result.nextCheckAt).getTime();
    // Should be ~6h ahead of NOW.
    expect(next - NOW.getTime()).toBeGreaterThan(5 * 3600 * 1000);
    expect(next - NOW.getTime()).toBeLessThan(7 * 3600 * 1000);
    // No status mutation issued.
    expect(state.updateCalls.filter((c) => c.collection === "goal-runs")).toHaveLength(0);
  });

  it("missing snapshot → stays in awaiting_data", async () => {
    const goalRun = makeGoalRun({ status: "awaiting_data" });
    const state = makeState({ goalRun }); // no snapshot seeded

    const result = await tick(makeCtx(state, goalRun));

    expect(result.status).toBe("awaiting_data");
    expect(state.updateCalls.filter((c) => c.collection === "goal-runs")).toHaveLength(0);
  });

  it("fresh snapshot → transitions to analysing with immediate re-tick", async () => {
    const goalRun = makeGoalRun({ status: "awaiting_data" });
    const freshCapturedAt = new Date(NOW.getTime() - 60 * 1000).toISOString();
    const state = makeState({ goalRun, snapshotCapturedAt: freshCapturedAt });

    const result = await tick(makeCtx(state, goalRun));

    expect(result.status).toBe("analysing");
    expect(result.nextCheckAt).toBe(NOW.toISOString());
    // A status update on goal-runs row should have fired.
    const goalRunUpdates = state.updateCalls.filter((c) => c.collection === "goal-runs");
    expect(goalRunUpdates).toHaveLength(1);
    expect(goalRunUpdates[0].data.status).toBe("analysing");
  });
});

describe("search-term-waste-reducer — handleAnalysing", () => {
  it("classifies the 5-row fixture into exactly 2 candidates and queues approval (yellow tier)", async () => {
    const goalRun = makeGoalRun({ status: "analysing" });
    const freshCapturedAt = new Date(NOW.getTime() - 60 * 1000).toISOString();
    const state = makeState({ goalRun, snapshotCapturedAt: freshCapturedAt });

    const result = await tick(makeCtx(state, goalRun));

    expect(result.status).toBe("pending_approval");

    // An approval row was created with exactly 2 candidates.
    const approvalCreates = state.createCalls.filter(
      (c) => c.collection === "agent-approval-queue",
    );
    expect(approvalCreates).toHaveLength(1);
    const proposalPayload = approvalCreates[0].data.proposalPayload as {
      keywords: Array<{ keyword: string }>;
      summary: { negate: number; rejectBrand: number; escalateHighIntent: number; skipLowClicks: number };
      baselineWasted: number;
    };
    expect(proposalPayload.keywords.map((k) => k.keyword).sort()).toEqual(
      ["widget froobnitz", "widget zorblax"].sort(),
    );
    expect(proposalPayload.summary.negate).toBe(2);
    expect(proposalPayload.summary.rejectBrand).toBe(1);
    expect(proposalPayload.summary.escalateHighIntent).toBe(1);
    expect(proposalPayload.summary.skipLowClicks).toBe(1);
    // Baseline = $35 + $18 = $53
    expect(proposalPayload.baselineWasted).toBe(53);

    // A goal-run-snapshots row was created with the approval id linked.
    const snapshotCreates = state.createCalls.filter(
      (c) => c.collection === "goal-run-snapshots",
    );
    expect(snapshotCreates).toHaveLength(1);
    expect(snapshotCreates[0].data.action).toBe("nkl-push-live");
    expect(snapshotCreates[0].data.status).toBe("proposed");
    expect(snapshotCreates[0].data.approval).toBeTypeOf("number");

    // goal-runs transitioned to pending_approval.
    const goalRunUpdates = state.updateCalls.filter((c) => c.collection === "goal-runs");
    expect(goalRunUpdates).toHaveLength(1);
    expect(goalRunUpdates[0].data.status).toBe("pending_approval");
  });

  it("green-tier auto-executes — transitions directly to executing", async () => {
    const goalRun = makeGoalRun({ status: "analysing" });
    const freshCapturedAt = new Date(NOW.getTime() - 60 * 1000).toISOString();
    const state = makeState({
      goalRun,
      snapshotCapturedAt: freshCapturedAt,
      greenTier: true,
    });

    const result = await tick(makeCtx(state, goalRun));

    expect(result.status).toBe("executing");
    // No approval queue row created.
    expect(
      state.createCalls.filter((c) => c.collection === "agent-approval-queue"),
    ).toHaveLength(0);
    // A goal-run-snapshots row was created with status "approved" (auto).
    const snapshotCreates = state.createCalls.filter(
      (c) => c.collection === "goal-run-snapshots",
    );
    expect(snapshotCreates).toHaveLength(1);
    expect(snapshotCreates[0].data.status).toBe("approved");
    expect(snapshotCreates[0].data.riskTier).toBe("green");
  });
});

describe("search-term-waste-reducer — handlePendingApproval", () => {
  it("approval still pending → stays in pending_approval", async () => {
    const goalRun = makeGoalRun({ status: "pending_approval" });
    const preSnapshot = {
      id: 9001,
      goalRun: goalRun.id,
      action: "nkl-push-live",
      status: "proposed",
      approval: 88,
      proposedPayload: { keywords: [{ keyword: "widget zorblax", matchType: "PHRASE" }] },
    };
    const state = makeState({
      goalRun,
      preSnapshots: [preSnapshot],
      approvalId: 88,
      approvalStatus: "pending",
    });

    const result = await tick(makeCtx(state, goalRun));

    expect(result.status).toBe("pending_approval");
    expect(state.updateCalls.filter((c) => c.collection === "goal-runs")).toHaveLength(0);
  });

  it("approval approved → transitions to executing", async () => {
    const goalRun = makeGoalRun({ status: "pending_approval" });
    const preSnapshot = {
      id: 9002,
      goalRun: goalRun.id,
      action: "nkl-push-live",
      status: "proposed",
      approval: 99,
      proposedPayload: { keywords: [{ keyword: "widget zorblax", matchType: "PHRASE" }] },
    };
    const state = makeState({
      goalRun,
      preSnapshots: [preSnapshot],
      approvalId: 99,
      approvalStatus: "approved",
    });

    const result = await tick(makeCtx(state, goalRun));

    expect(result.status).toBe("executing");
    const goalRunUpdates = state.updateCalls.filter((c) => c.collection === "goal-runs");
    expect(goalRunUpdates.at(-1)?.data.status).toBe("executing");
  });

  it("approval rejected → goal-run transitions to failed", async () => {
    const goalRun = makeGoalRun({ status: "pending_approval" });
    const preSnapshot = {
      id: 9003,
      goalRun: goalRun.id,
      action: "nkl-push-live",
      status: "proposed",
      approval: 77,
      proposedPayload: { keywords: [{ keyword: "x", matchType: "PHRASE" }] },
    };
    const state = makeState({
      goalRun,
      preSnapshots: [preSnapshot],
      approvalId: 77,
      approvalStatus: "rejected",
    });

    const result = await tick(makeCtx(state, goalRun));

    expect(result.status).toBe("failed");
    const goalRunUpdates = state.updateCalls.filter((c) => c.collection === "goal-runs");
    expect(goalRunUpdates.at(-1)?.data.status).toBe("failed");
    expect(goalRunUpdates.at(-1)?.data.error).toMatch(/rejected/i);
  });
});

// ─── handleExecuting — uses a fake apply-handler ──────────────────────────

describe("search-term-waste-reducer — handleExecuting", () => {
  let nklHandlerMock: ReturnType<typeof vi.fn>;
  let originalHandler: ApplyHandler | undefined;

  beforeEach(() => {
    nklHandlerMock = vi.fn(async () => ({
      message: "Pushed 2/2 keywords",
      detail: { successCount: 2 },
    }));
    // Register our mock under "nkl-push-live" — last registration wins.
    registerApplyHandler("nkl-push-live", nklHandlerMock as unknown as ApplyHandler);
  });

  afterEach(() => {
    // Restore by re-registering a thrower so subsequent suites can't
    // accidentally re-use our mock. (The real handler will be re-registered
    // by its own importer at runtime.)
    if (originalHandler) {
      registerApplyHandler("nkl-push-live", originalHandler);
    }
  });

  it("invokes the dispatcher with the proposedPayload and transitions to measuring", async () => {
    const goalRun = makeGoalRun({ status: "executing" });
    const preSnapshot = {
      id: 9100,
      goalRun: goalRun.id,
      action: "nkl-push-live",
      status: "approved",
      approval: 555,
      proposedPayload: {
        action: "nkl-push-live",
        keywords: [
          { keyword: "widget froobnitz", matchType: "PHRASE" },
          { keyword: "widget zorblax", matchType: "PHRASE" },
        ],
        baselineWasted: 53,
      },
    };
    const state = makeState({
      goalRun,
      preSnapshots: [preSnapshot],
      approvalId: 555,
      approvalStatus: "approved",
    });

    const result = await tick(makeCtx(state, goalRun));

    expect(result.status).toBe("measuring");

    // Apply-handler called with the proposed payload + a context.
    expect(nklHandlerMock).toHaveBeenCalledTimes(1);
    const [payloadArg, ctxArg] = nklHandlerMock.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(payloadArg).toMatchObject({
      action: "nkl-push-live",
      baselineWasted: 53,
    });
    expect((payloadArg.keywords as Array<unknown>).length).toBe(2);
    expect(ctxArg.approvalId).toBe(555);

    // Snapshot row was updated to status: "applied".
    const snapUpdates = state.updateCalls.filter(
      (c) => c.collection === "goal-run-snapshots",
    );
    expect(snapUpdates.at(-1)?.data.status).toBe("applied");

    // coolingOffUntil set ~7 days ahead.
    expect(result.coolingOffUntil).toBeDefined();
    const cooling = new Date(result.coolingOffUntil!).getTime();
    expect(cooling - NOW.getTime()).toBeGreaterThan(6.5 * 24 * 3600 * 1000);
    expect(cooling - NOW.getTime()).toBeLessThan(7.5 * 24 * 3600 * 1000);
  });

  it("dispatch error → transitions to failed", async () => {
    // Re-register handler that throws.
    registerApplyHandler(
      "nkl-push-live",
      (async () => {
        throw new Error("Growth Tools 502");
      }) as unknown as ApplyHandler,
    );

    const goalRun = makeGoalRun({ status: "executing" });
    const preSnapshot = {
      id: 9101,
      goalRun: goalRun.id,
      action: "nkl-push-live",
      status: "approved",
      proposedPayload: {
        action: "nkl-push-live",
        keywords: [{ keyword: "widget zorblax", matchType: "PHRASE" }],
        baselineWasted: 18,
      },
    };
    const state = makeState({ goalRun, preSnapshots: [preSnapshot] });

    const result = await tick(makeCtx(state, goalRun));

    expect(result.status).toBe("failed");
    const goalRunUpdates = state.updateCalls.filter((c) => c.collection === "goal-runs");
    expect(goalRunUpdates.at(-1)?.data.status).toBe("failed");
    expect(goalRunUpdates.at(-1)?.data.error).toMatch(/Growth Tools 502/);
  });
});

// ─── handleMeasuring ──────────────────────────────────────────────────────

describe("search-term-waste-reducer — handleMeasuring", () => {
  it("inside cooling-off → stays in measuring with nextCheckAt = coolingOffUntil", async () => {
    const coolingOffUntil = new Date(NOW.getTime() + 3 * 24 * 3600 * 1000).toISOString();
    const goalRun = makeGoalRun({ status: "measuring", coolingOffUntil });
    const state = makeState({ goalRun });

    const result = await tick(makeCtx(state, goalRun));

    expect(result.status).toBe("measuring");
    expect(result.nextCheckAt).toBe(coolingOffUntil);
    expect(state.updateCalls.filter((c) => c.collection === "goal-runs")).toHaveLength(0);
  });

  it("after cooling-off with reduction ≥ 30% → transitions to complete + attachMeasurement", async () => {
    const coolingOffUntil = new Date(NOW.getTime() - 24 * 3600 * 1000).toISOString();
    const goalRun = makeGoalRun({
      status: "measuring",
      coolingOffUntil,
      iterationsCount: 0,
    });

    const preSnapshot = {
      id: 9200,
      goalRun: goalRun.id,
      action: "nkl-push-live",
      status: "applied",
      proposedPayload: {
        keywords: [
          { keyword: "widget froobnitz", matchType: "PHRASE" },
          { keyword: "widget zorblax", matchType: "PHRASE" },
        ],
        baselineWasted: 53,
      },
    };

    // Fresh snapshot has the negated terms at ~$0 spend (negation worked).
    const freshRows: SearchTermSnapshotRow[] = [
      {
        term: "widget froobnitz",
        impressions: 0,
        clicks: 0,
        spend: 0,
        conversions: 0,
        cpa: null,
      },
      {
        term: "widget zorblax",
        impressions: 0,
        clicks: 0,
        spend: 0,
        conversions: 0,
        cpa: null,
      },
      // unrelated rows that should not be counted toward wasted spend
      {
        term: "other thing",
        impressions: 50,
        clicks: 4,
        spend: 9,
        conversions: 1,
        cpa: 9,
      },
    ];

    const state = makeState({
      goalRun,
      preSnapshots: [preSnapshot],
      snapshotCapturedAt: new Date(NOW.getTime() - 30 * 1000).toISOString(),
      freshSnapshotRows: freshRows,
    });

    const result = await tick(makeCtx(state, goalRun));

    expect(result.status).toBe("complete");
    expect(result.iterationsCount).toBe(1);

    // attachMeasurement updated the snapshot row with measuredResult.
    const snapUpdates = state.updateCalls.filter(
      (c) => c.collection === "goal-run-snapshots",
    );
    expect(snapUpdates).toHaveLength(1);
    const measured = snapUpdates[0].data.measuredResult as {
      wastedSpendReduction: number;
      baselineWasted: number;
      currentWasted: number;
      measuredAtIteration: number;
    };
    expect(measured.baselineWasted).toBe(53);
    expect(measured.currentWasted).toBe(0);
    expect(measured.wastedSpendReduction).toBe(1); // 100% reduction
    expect(measured.measuredAtIteration).toBe(1);

    // goal-runs transitioned to complete.
    const goalRunUpdates = state.updateCalls.filter((c) => c.collection === "goal-runs");
    expect(goalRunUpdates.at(-1)?.data.status).toBe("complete");
  });

  it("after cooling-off with insufficient reduction & iteration budget left → loops to analysing", async () => {
    const coolingOffUntil = new Date(NOW.getTime() - 24 * 3600 * 1000).toISOString();
    const goalRun = makeGoalRun({
      status: "measuring",
      coolingOffUntil,
      iterationsCount: 0,
    });

    const preSnapshot = {
      id: 9300,
      goalRun: goalRun.id,
      action: "nkl-push-live",
      status: "applied",
      proposedPayload: {
        keywords: [{ keyword: "widget froobnitz", matchType: "PHRASE" }],
        baselineWasted: 100,
      },
    };

    // Negated term still spending $90 → only 10% reduction (below 30% target).
    const freshRows: SearchTermSnapshotRow[] = [
      {
        term: "widget froobnitz",
        impressions: 100,
        clicks: 5,
        spend: 90,
        conversions: 0,
        cpa: null,
      },
    ];
    const state = makeState({
      goalRun,
      preSnapshots: [preSnapshot],
      snapshotCapturedAt: new Date(NOW.getTime() - 30 * 1000).toISOString(),
      freshSnapshotRows: freshRows,
    });

    const result = await tick(makeCtx(state, goalRun));

    expect(result.status).toBe("analysing");
    expect(result.iterationsCount).toBe(1);
    const goalRunUpdates = state.updateCalls.filter((c) => c.collection === "goal-runs");
    // Last status update should be "analysing".
    expect(goalRunUpdates.at(-1)?.data.status).toBe("analysing");
  });

  it("iteration cap reached → completes regardless of reduction", async () => {
    const coolingOffUntil = new Date(NOW.getTime() - 60 * 1000).toISOString();
    const goalRun = makeGoalRun({
      status: "measuring",
      coolingOffUntil,
      iterationsCount: 2, // will become 3 after this tick — hits MAX_ITERATIONS=3
    });

    const preSnapshot = {
      id: 9400,
      goalRun: goalRun.id,
      action: "nkl-push-live",
      status: "applied",
      proposedPayload: {
        keywords: [{ keyword: "widget froobnitz", matchType: "PHRASE" }],
        baselineWasted: 100,
      },
    };

    // Still under target reduction.
    const freshRows: SearchTermSnapshotRow[] = [
      {
        term: "widget froobnitz",
        impressions: 100,
        clicks: 5,
        spend: 95,
        conversions: 0,
        cpa: null,
      },
    ];
    const state = makeState({
      goalRun,
      preSnapshots: [preSnapshot],
      snapshotCapturedAt: new Date(NOW.getTime() - 30 * 1000).toISOString(),
      freshSnapshotRows: freshRows,
    });

    const result = await tick(makeCtx(state, goalRun));

    expect(result.status).toBe("complete");
    expect(result.iterationsCount).toBe(3);
  });
});
