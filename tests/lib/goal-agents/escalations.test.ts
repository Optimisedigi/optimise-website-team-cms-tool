import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fanOutGoalRunEscalation,
  clearGoalRunEscalations,
} from "@/lib/goal-agents/escalations";

interface MockPayload {
  find: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  logger: { error: ReturnType<typeof vi.fn> };
}

function makePayload(): MockPayload {
  return {
    find: vi.fn(),
    create: vi.fn().mockResolvedValue({ id: 1 }),
    delete: vi.fn().mockResolvedValue({ docs: [] }),
    logger: { error: vi.fn() },
  };
}

describe("fanOutGoalRunEscalation", () => {
  let payload: MockPayload;

  beforeEach(() => {
    payload = makePayload();
  });

  it("creates one notification per user for pending_approval transitions", async () => {
    payload.find.mockResolvedValue({
      docs: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });

    const count = await fanOutGoalRunEscalation({
      payload: payload as never,
      goalRunId: 42,
      goal: "search-term-waste-reducer",
      clientId: 7,
      toStatus: "pending_approval",
      reason: "5 negative phrases need approval",
    });

    expect(count).toBe(3);
    expect(payload.create).toHaveBeenCalledTimes(3);

    const firstCall = payload.create.mock.calls[0][0];
    expect(firstCall.collection).toBe("notifications");
    expect(firstCall.data.recipient).toBe(1);
    expect(firstCall.data.kind).toBe("goal-run-escalation");
    expect(firstCall.data.title).toBe(
      "Goal run needs attention: search-term-waste-reducer",
    );
    expect(firstCall.data.body).toBe("5 negative phrases need approval");
    expect(firstCall.data.url).toBe("/admin/collections/goal-runs/42");
    expect(firstCall.data.relatedGoalRun).toBe(42);
    expect(firstCall.data.relatedClient).toBe(7);

    // Recipients are unique across the fan-out.
    const recipientIds = payload.create.mock.calls.map(
      (c) => c[0].data.recipient,
    );
    expect(recipientIds).toEqual([1, 2, 3]);
  });

  it("falls back to a status-derived body when no reason is supplied (failed)", async () => {
    payload.find.mockResolvedValue({ docs: [{ id: 1 }, { id: 2 }] });

    const count = await fanOutGoalRunEscalation({
      payload: payload as never,
      goalRunId: 99,
      goal: "ad-ctr-improver",
      clientId: 12,
      toStatus: "failed",
    });

    expect(count).toBe(2);
    expect(payload.create).toHaveBeenCalledTimes(2);

    const firstCall = payload.create.mock.calls[0][0];
    expect(firstCall.data.kind).toBe("goal-run-escalation");
    expect(firstCall.data.title).toBe(
      "Goal run needs attention: ad-ctr-improver",
    );
    expect(firstCall.data.body).toBe("Status: failed");
    expect(firstCall.data.url).toBe("/admin/collections/goal-runs/99");
    expect(firstCall.data.relatedGoalRun).toBe(99);
    expect(firstCall.data.relatedClient).toBe(12);
  });

  it("continues fan-out when a single recipient create fails", async () => {
    payload.find.mockResolvedValue({
      docs: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });
    payload.create
      .mockRejectedValueOnce(new Error("db down for user 1"))
      .mockResolvedValueOnce({ id: 11 })
      .mockResolvedValueOnce({ id: 12 });

    const count = await fanOutGoalRunEscalation({
      payload: payload as never,
      goalRunId: 5,
      goal: "search-term-waste-reducer",
      clientId: 3,
      toStatus: "pending_approval",
    });

    expect(count).toBe(2);
    expect(payload.create).toHaveBeenCalledTimes(3);
    expect(payload.logger.error).toHaveBeenCalledTimes(1);
    const loggedArg = payload.logger.error.mock.calls[0][0];
    expect(loggedArg.msg).toBe("goal-run-escalation notification create failed");
    expect(loggedArg.recipientId).toBe(1);
    expect(loggedArg.goalRunId).toBe(5);
  });

  it("queries all users via the users collection", async () => {
    payload.find.mockResolvedValue({ docs: [{ id: 1 }] });

    await fanOutGoalRunEscalation({
      payload: payload as never,
      goalRunId: 1,
      goal: "g",
      clientId: 1,
      toStatus: "pending_approval",
    });

    const findArg = payload.find.mock.calls[0][0];
    expect(findArg.collection).toBe("users");
    expect(findArg.overrideAccess).toBe(true);
  });
});

describe("clearGoalRunEscalations", () => {
  it("deletes notifications matching the goal-run id and returns the count", async () => {
    const payload = makePayload();
    payload.delete.mockResolvedValue({
      docs: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });

    const count = await clearGoalRunEscalations(payload as never, 42);

    expect(count).toBe(3);
    const call = payload.delete.mock.calls[0][0];
    expect(call.collection).toBe("notifications");
    expect(call.where).toEqual({
      and: [
        { kind: { equals: "goal-run-escalation" } },
        { relatedGoalRun: { equals: 42 } },
      ],
    });
    expect(call.overrideAccess).toBe(true);
  });

  it("returns 0 and logs on delete failure", async () => {
    const payload = makePayload();
    payload.delete.mockRejectedValue(new Error("db error"));

    const count = await clearGoalRunEscalations(payload as never, 7);

    expect(count).toBe(0);
    expect(payload.logger.error).toHaveBeenCalled();
    const loggedArg = payload.logger.error.mock.calls[0][0];
    expect(loggedArg.msg).toBe(
      "goal-run-escalation notification cleanup failed",
    );
    expect(loggedArg.goalRunId).toBe(7);
  });

  it("returns 0 when the delete result has no docs array", async () => {
    const payload = makePayload();
    payload.delete.mockResolvedValue({});

    const count = await clearGoalRunEscalations(payload as never, 1);
    expect(count).toBe(0);
  });
});
