import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  tick,
  GOAL_KEY,
  type GoalRunDoc,
} from "@/lib/goal-agents/goal-types/account-efficiency";
import { registerApplyHandler } from "@/lib/agents/_shared/apply-dispatcher";

interface FindArgs {
  collection: string;
  where?: Record<string, unknown>;
  sort?: string;
  limit?: number;
}
interface FindByIDArgs { collection: string; id: number | string }
interface CreateArgs { collection: string; data: Record<string, unknown> }
interface UpdateArgs { collection: string; id: number | string; data: Record<string, unknown> }
interface MockState {
  byId: Map<string, Record<string, unknown>>;
  finds: Map<string, Array<Record<string, unknown>>>;
  createCalls: CreateArgs[];
  updateCalls: UpdateArgs[];
}

const NOW = new Date("2026-06-15T12:00:00.000Z");

function key(collection: string, id: number | string): string {
  return `${collection}#${id}`;
}

function makePayload(state: MockState) {
  return {
    find: vi.fn(async (args: FindArgs) => {
      let docs = state.finds.get(args.collection) ?? [];
      const where = args.where ?? {};
      const and = Array.isArray((where as { and?: unknown }).and) ? (where as { and: Array<Record<string, unknown>> }).and : [];
      for (const condition of and) {
        if (condition.client && typeof condition.client === "object" && "equals" in condition.client) {
          docs = docs.filter((d) => d.client === (condition.client as { equals: unknown }).equals);
        }
        if (condition.level && typeof condition.level === "object" && "equals" in condition.level) {
          docs = docs.filter((d) => d.level === (condition.level as { equals: unknown }).equals);
        }
      }
      if (where.goalRun && typeof where.goalRun === "object" && "equals" in where.goalRun) {
        docs = docs.filter((d) => {
          const rawGoalRun = d.goalRun;
          const goalRunId = typeof rawGoalRun === "object" && rawGoalRun !== null && "id" in rawGoalRun
            ? (rawGoalRun as { id: unknown }).id
            : rawGoalRun;
          return Number(goalRunId) === Number((where.goalRun as { equals: unknown }).equals);
        });
      }
      if (where.client && typeof where.client === "object" && "equals" in where.client) {
        docs = docs.filter((d) => d.client === (where.client as { equals: unknown }).equals);
      }
      if (args.sort === "-createdAt") docs = [...docs].reverse();
      return { docs: args.limit === 0 ? [] : docs.slice(0, args.limit ?? docs.length), totalDocs: docs.length };
    }),
    findByID: vi.fn(async (args: FindByIDArgs) => {
      const doc = state.byId.get(key(args.collection, args.id));
      if (!doc) throw new Error(`Not found: ${args.collection}#${args.id}`);
      return doc;
    }),
    create: vi.fn(async (args: CreateArgs) => {
      state.createCalls.push(args);
      const id = state.createCalls.length * 1000 + 1;
      const doc = { id, createdAt: new Date().toISOString(), ...args.data };
      state.byId.set(key(args.collection, id), doc);
      state.finds.set(args.collection, [...(state.finds.get(args.collection) ?? []), doc]);
      return doc;
    }),
    update: vi.fn(async (args: UpdateArgs) => {
      state.updateCalls.push(args);
      const existing = state.byId.get(key(args.collection, args.id)) ?? { id: args.id };
      const merged = { ...existing, ...args.data };
      state.byId.set(key(args.collection, args.id), merged);
      const docs = state.finds.get(args.collection) ?? [];
      const next = docs.map((d) => Number(d.id) === Number(args.id) ? merged : d);
      if (!docs.some((d) => Number(d.id) === Number(args.id))) next.push(merged);
      state.finds.set(args.collection, next);
      return merged;
    }),
  };
}

function makeState(): MockState {
  const state: MockState = { byId: new Map(), finds: new Map(), createCalls: [], updateCalls: [] };
  const goalRun = makeGoalRun("analysing") as unknown as Record<string, unknown>;
  state.byId.set(key("goal-runs", 500), goalRun);
  state.finds.set("goal-runs", [goalRun]);
  const client = {
    id: 42,
    spendPolicy: { conversionTrackingEnabledFrom: "2026-04-01T00:00:00.000Z" },
    protectedCampaignIds: [],
    brandCampaignIds: [],
  };
  state.byId.set(key("clients", 42), client);
  state.finds.set("google-ads-audits", [{ id: 777, client: 42, monthlyBudget: 3000 }]);
  state.byId.set(key("google-ads-audits", 777), { id: 777, client: 42, customerId: "1234567890", monthlyBudget: 3000 });
  state.finds.set("goal-risk-tiers", [
    { id: 1, tier: "yellow", maxBudgetImpactDollars: 500, allowedActionTypes: [{ actionType: "budget-update" }], requiresApproval: true, autoExecute: false },
    { id: 2, tier: "red", maxBudgetImpactDollars: null, allowedActionTypes: [{ actionType: "ad-group-pause" }], requiresApproval: true, autoExecute: false },
    { id: 3, tier: "yellow", maxBudgetImpactDollars: null, allowedActionTypes: [{ actionType: "keyword-pause" }], requiresApproval: true, autoExecute: false },
    { id: 4, tier: "red", maxBudgetImpactDollars: null, allowedActionTypes: [{ actionType: "campaign-target-cpa-update" }], requiresApproval: true, autoExecute: false },
    { id: 5, tier: "red", maxBudgetImpactDollars: null, allowedActionTypes: [{ actionType: "campaign-bid-strategy-change" }], requiresApproval: true, autoExecute: false },
  ]);
  state.finds.set("google-ads-snapshots", [
    {
      id: 901,
      client: 42,
      level: "campaign",
      capturedAt: NOW.toISOString(),
      customerId: "1234567890",
      rowCount: 3,
      rows: [
        { campaignId: "D", name: "Donor", status: "ENABLED", spend: 280, clicks: 20, impressions: 1000, conversions: 0, ctr: 2, cpa: null, searchImpressionShare: 80, searchBudgetLostIS: 0, searchRankLostIS: 5, bidStrategy: "target_cpa", targetCpaMicros: 50_000_000 },
        { campaignId: "R", name: "Recipient", status: "ENABLED", spend: 700, clicks: 50, impressions: 1500, conversions: 8, ctr: 3, cpa: 87.5, searchImpressionShare: 65, searchBudgetLostIS: 0, searchRankLostIS: 5, bidStrategy: "target_cpa", targetCpaMicros: 40_000_000 },
        { campaignId: "S", name: "Strategy", status: "ENABLED", spend: 500, clicks: 100, impressions: 3000, conversions: 8, ctr: 3, cpa: 62.5, searchImpressionShare: 70, searchBudgetLostIS: 0, searchRankLostIS: 5, bidStrategy: "maximize_clicks" },
      ],
    },
    {
      id: 902,
      client: 42,
      level: "ad_group",
      capturedAt: NOW.toISOString(),
      customerId: "1234567890",
      rowCount: 2,
      rows: [
        { campaignId: "D", adGroupId: "A1", name: "Waste Ad Group", status: "ENABLED", spend: 250, clicks: 25, impressions: 500, conversions: 0, searchRankLostIS: 10 },
        { campaignId: "R", adGroupId: "A2", name: "Efficient Rank Lost", status: "ENABLED", spend: 120, clicks: 40, impressions: 700, conversions: 6, searchRankLostIS: 35 },
      ],
    },
    {
      id: 903,
      client: 42,
      level: "keyword",
      capturedAt: NOW.toISOString(),
      customerId: "1234567890",
      rowCount: 1,
      rows: [
        { campaignId: "D", adGroupId: "A1", keywordId: "K1", text: "generic waste", matchType: "PHRASE", spend: 150, clicks: 15, impressions: 300, conversions: 0 },
      ],
    },
  ]);
  return state;
}

function makeGoalRun(status: GoalRunDoc["status"]): GoalRunDoc {
  return {
    id: 500,
    goal: GOAL_KEY,
    status,
    client: 42,
    iterationsCount: 0,
    parameters: {
      enabledLevers: ["budget_shift", "ad_group_pause", "keyword_pause", "bid_adjust", "strategy_alert"],
      campaignWindowDays: 7,
      minAdGroupSpend: 200,
      minKeywordSpend: 100,
      minConvertingAdGroupConversions: 5,
      maxTargetCpaUpliftPercent: 10,
      measurementDays: 1,
    },
  };
}

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());

beforeEach(() => {
  registerApplyHandler("budget-update", async () => ({ message: "budget-update ok" }));
  registerApplyHandler("budget-push-live", async () => ({ message: "budget-push ok" }));
  registerApplyHandler("ad-group-pause", async () => ({ message: "ad-group-pause ok" }));
  registerApplyHandler("keyword-pause", async () => ({ message: "keyword-pause ok" }));
  registerApplyHandler("campaign-target-cpa-update", async () => ({ message: "target-cpa ok" }));
  registerApplyHandler("campaign-bid-strategy-change", async () => ({ message: "strategy ack" }));
});

describe("account-efficiency CPA flow harness", () => {
  it("queues proposals, handles mixed approvals, executes approved actions, and records measurement", async () => {
    const state = makeState();
    const payload = makePayload(state);

    const analysing = await tick({ payload: payload as never, goalRun: makeGoalRun("analysing"), clientId: 42, now: NOW });
    expect(analysing.status).toBe("pending_approval");
    const approvals = state.finds.get("agent-approval-queue") ?? [];
    expect(approvals).toHaveLength(4);
    const snapshots = state.finds.get("goal-run-snapshots") ?? [];
    expect(new Set(snapshots.map((s) => s.action))).toEqual(new Set(["ad-group-pause", "keyword-pause", "bid-adjust", "strategy-alert"]));

    const firstApproval = approvals[0]!;
    state.byId.set(key("agent-approval-queue", firstApproval.id as number), { ...firstApproval, status: "rejected" });
    state.finds.set("agent-approval-queue", approvals.map((approval, index) => {
      const updated = { ...approval, status: index === 0 ? "rejected" : "approved" };
      state.byId.set(key("agent-approval-queue", approval.id as number), updated);
      return updated;
    }));

    const pending = await tick({ payload: payload as never, goalRun: makeGoalRun("pending_approval"), clientId: 42, now: NOW });
    expect(pending.status).toBe("executing");

    const approvedApprovalIds = new Set(approvals.slice(1).map((approval) => Number(approval.id)));
    state.finds.set("goal-run-snapshots", (state.finds.get("goal-run-snapshots") ?? []).map((snapshot) => {
      const approvalId = Number(snapshot.approval);
      const updated = approvedApprovalIds.has(approvalId) ? { ...snapshot, status: "approved" } : snapshot;
      state.byId.set(key("goal-run-snapshots", updated.id as number), updated);
      return updated;
    }));

    const executing = await tick({ payload: payload as never, goalRun: makeGoalRun("executing"), clientId: 42, now: NOW });
    expect(executing.status).toBe("measuring");
    const appliedSnapshots = (state.finds.get("goal-run-snapshots") ?? []).filter((s) => s.status === "applied");
    expect(appliedSnapshots.map((s) => s.action)).toEqual(["keyword-pause", "bid-adjust", "strategy-alert"]);

    const measuringRun = { ...makeGoalRun("measuring"), coolingOffUntil: "2026-06-15T11:00:00.000Z" };
    const measuring = await tick({ payload: payload as never, goalRun: measuringRun, clientId: 42, now: NOW });
    expect(measuring.status).toBe("complete");
    expect(state.updateCalls.some((call) => call.collection === "goal-run-snapshots" && call.data.measuredResult)).toBe(true);
  });
});
