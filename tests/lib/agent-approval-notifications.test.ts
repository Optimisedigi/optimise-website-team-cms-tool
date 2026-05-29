import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fanOutApprovalNotifications,
  clearApprovalNotifications,
} from "@/lib/agent-approval-notifications";

interface MockPayload {
  find: ReturnType<typeof vi.fn>;
  findByID: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  logger: { error: ReturnType<typeof vi.fn> };
}

function makePayload(): MockPayload {
  return {
    find: vi.fn(),
    findByID: vi.fn(),
    create: vi.fn().mockResolvedValue({ id: 1 }),
    delete: vi.fn().mockResolvedValue({ docs: [] }),
    logger: { error: vi.fn() },
  };
}

describe("fanOutApprovalNotifications", () => {
  let payload: MockPayload;

  beforeEach(() => {
    payload = makePayload();
  });

  it("creates one notification per user with the caller's email in the body", async () => {
    payload.find.mockImplementation((args: { collection: string }) => {
      if (args.collection === "optimate-chat-turns") {
        return Promise.resolve({
          docs: [{ user: { email: "alex@example.com" } }],
        });
      }
      if (args.collection === "users") {
        return Promise.resolve({
          docs: [{ id: 1 }, { id: 2 }, { id: 3 }],
        });
      }
      return Promise.resolve({ docs: [] });
    });

    const count = await fanOutApprovalNotifications(payload as never, {
      approvalId: 42,
      agentRunId: "run-xyz",
      agentName: "optimate-google-ads",
      proposalType: "phrase-match-additions",
      title: "Add 5 negative phrases",
    });

    expect(count).toBe(3);
    expect(payload.create).toHaveBeenCalledTimes(3);

    const firstCall = payload.create.mock.calls[0][0];
    expect(firstCall.collection).toBe("notifications");
    expect(firstCall.data.recipient).toBe(1);
    expect(firstCall.data.kind).toBe("agent-approval-pending");
    expect(firstCall.data.relatedApproval).toBe(42);
    expect(firstCall.data.url).toBe("/admin/agent-approvals/42");
    expect(firstCall.data.body).toContain("alex@example.com");
    expect(firstCall.data.title).toContain("Add 5 negative phrases");
  });

  it("falls back to the agent name when no chat turn is found", async () => {
    payload.find.mockImplementation((args: { collection: string }) => {
      if (args.collection === "optimate-chat-turns") {
        return Promise.resolve({ docs: [] });
      }
      if (args.collection === "users") {
        return Promise.resolve({ docs: [{ id: 7 }] });
      }
      return Promise.resolve({ docs: [] });
    });

    const count = await fanOutApprovalNotifications(payload as never, {
      approvalId: 99,
      agentRunId: "scheduled-run",
      agentName: "optimate-google-ads",
      proposalType: "budget-reallocation",
      title: "Move $50/day from Brand to NB",
    });

    expect(count).toBe(1);
    const body = payload.create.mock.calls[0][0].data.body;
    expect(body).toContain("optimate-google-ads");
  });

  it("hydrates user via findByID when chat-turn user is an id reference", async () => {
    payload.find.mockImplementation((args: { collection: string }) => {
      if (args.collection === "optimate-chat-turns") {
        return Promise.resolve({ docs: [{ user: 12 }] });
      }
      if (args.collection === "users") {
        return Promise.resolve({ docs: [{ id: 1 }] });
      }
      return Promise.resolve({ docs: [] });
    });
    payload.findByID.mockResolvedValue({ email: "deep@example.com" });

    await fanOutApprovalNotifications(payload as never, {
      approvalId: 5,
      agentRunId: "run-id-only",
      agentName: "optimate-google-ads",
      proposalType: "ad-copy",
      title: "Headline updates",
    });

    expect(payload.findByID).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "users", id: 12 }),
    );
    expect(payload.create.mock.calls[0][0].data.body).toContain(
      "deep@example.com",
    );
  });

  it("continues fan-out when a single recipient create fails", async () => {
    payload.find.mockImplementation((args: { collection: string }) => {
      if (args.collection === "optimate-chat-turns") {
        return Promise.resolve({ docs: [] });
      }
      if (args.collection === "users") {
        return Promise.resolve({ docs: [{ id: 1 }, { id: 2 }] });
      }
      return Promise.resolve({ docs: [] });
    });
    payload.create
      .mockRejectedValueOnce(new Error("db down for user 1"))
      .mockResolvedValueOnce({ id: 99 });

    const count = await fanOutApprovalNotifications(payload as never, {
      approvalId: 1,
      agentRunId: "r",
      agentName: "a",
      proposalType: "t",
      title: "Y",
    });

    expect(count).toBe(1);
    expect(payload.logger.error).toHaveBeenCalled();
  });

  it("includes relatedClient when clientId is supplied", async () => {
    payload.find.mockImplementation((args: { collection: string }) => {
      if (args.collection === "users") {
        return Promise.resolve({ docs: [{ id: 1 }] });
      }
      return Promise.resolve({ docs: [] });
    });

    await fanOutApprovalNotifications(payload as never, {
      approvalId: 1,
      agentRunId: "r",
      agentName: "a",
      proposalType: "t",
      title: "Y",
      clientId: 33,
    });

    expect(payload.create.mock.calls[0][0].data.relatedClient).toBe(33);
  });
});

describe("clearApprovalNotifications", () => {
  it("deletes notifications matching the approval id and returns the count", async () => {
    const payload = makePayload();
    payload.delete.mockResolvedValue({ docs: [{ id: 1 }, { id: 2 }, { id: 3 }] });

    const count = await clearApprovalNotifications(payload as never, 42);

    expect(count).toBe(3);
    const call = payload.delete.mock.calls[0][0];
    expect(call.collection).toBe("notifications");
    expect(call.where).toEqual({
      and: [
        { kind: { equals: "agent-approval-pending" } },
        { relatedApproval: { equals: 42 } },
      ],
    });
  });

  it("returns 0 and logs on delete failure", async () => {
    const payload = makePayload();
    payload.delete.mockRejectedValue(new Error("db error"));

    const count = await clearApprovalNotifications(payload as never, 7);

    expect(count).toBe(0);
    expect(payload.logger.error).toHaveBeenCalled();
  });
});
