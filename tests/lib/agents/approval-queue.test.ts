import { beforeEach, describe, expect, it, vi } from "vitest";

const { create, findByID, fanOut, getPayload } = vi.hoisted(() => ({
  create: vi.fn(),
  findByID: vi.fn(),
  fanOut: vi.fn(),
  getPayload: vi.fn(),
}));

vi.mock("payload", () => ({ getPayload }));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));
vi.mock("@/lib/agent-approval-notifications", () => ({ fanOutApprovalNotifications: fanOut }));

import { queueForApproval } from "@/lib/agents/_shared/approval-queue";

const proposal = {
  agentName: "optimate-google-ads",
  agentRunId: "run-123",
  proposalType: "account-efficiency-goal-run-create",
  title: "Create Account Efficiency goal run",
  clientId: 7,
  proposalPayload: { monthlyBudget: 1500 },
};

describe("queueForApproval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPayload.mockResolvedValue({ create, findByID, logger: { error: vi.fn() } });
    create.mockResolvedValue({ id: 86 });
    findByID.mockResolvedValue({ id: 86, agentRunId: "run-123" });
    fanOut.mockResolvedValue(1);
  });

  it("requests a nontransactional create and reads the row before notifying", async () => {
    await expect(queueForApproval(proposal)).resolves.toBe(86);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      collection: "agent-approval-queue",
      disableTransaction: true,
      context: { deferApprovalNotifications: true },
    }));
    expect(findByID).toHaveBeenCalledWith(expect.objectContaining({
      collection: "agent-approval-queue",
      id: 86,
    }));
    expect(create.mock.invocationCallOrder[0]).toBeLessThan(findByID.mock.invocationCallOrder[0]);
    expect(findByID.mock.invocationCallOrder[0]).toBeLessThan(fanOut.mock.invocationCallOrder[0]);
  });

  it("never reports success or sends notifications if the row is missing", async () => {
    findByID.mockRejectedValue(new Error("not found"));
    await expect(queueForApproval(proposal)).rejects.toThrow("not found");
    expect(fanOut).not.toHaveBeenCalled();
  });
});
