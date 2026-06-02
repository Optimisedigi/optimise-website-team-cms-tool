import { describe, expect, it, vi, beforeEach } from "vitest";
import { AgentApprovalQueue } from "@/collections/AgentApprovalQueue";
import {
  clearApprovalNotifications,
  fanOutApprovalNotifications,
} from "@/lib/agent-approval-notifications";

vi.mock("@/lib/agent-approval-notifications", () => ({
  fanOutApprovalNotifications: vi.fn().mockResolvedValue(1),
  clearApprovalNotifications: vi.fn().mockResolvedValue(1),
}));

function getAfterChangeHooks() {
  return AgentApprovalQueue.hooks?.afterChange ?? [];
}

describe("AgentApprovalQueue Collection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fans out bell notifications when an approval is created pending", async () => {
    const hook = getAfterChangeHooks()[0];
    expect(hook).toBeDefined();

    await hook({
      doc: {
        id: 42,
        status: "pending",
        agentRunId: "run-123",
        agentName: "optimate-google-ads",
        proposalType: "budget-reallocation",
        title: "Move budget to high-intent search",
        client: 7,
      },
      operation: "create",
      req: { payload: { id: "payload" } },
    } as any);

    expect(fanOutApprovalNotifications).toHaveBeenCalledWith(
      { id: "payload" },
      {
        approvalId: 42,
        agentRunId: "run-123",
        agentName: "optimate-google-ads",
        proposalType: "budget-reallocation",
        title: "Move budget to high-intent search",
        clientId: 7,
      },
    );
    expect(clearApprovalNotifications).not.toHaveBeenCalled();
  });

  it("clears related bell notifications when an approval is actioned", async () => {
    const hook = getAfterChangeHooks()[0];

    await hook({
      doc: {
        id: 42,
        status: "approved",
        agentRunId: "run-123",
        agentName: "optimate-google-ads",
        proposalType: "budget-reallocation",
        title: "Move budget",
      },
      operation: "update",
      req: { payload: { id: "payload" } },
    } as any);

    expect(clearApprovalNotifications).toHaveBeenCalledWith({ id: "payload" }, 42);
    expect(fanOutApprovalNotifications).not.toHaveBeenCalled();
  });
});
