import { describe, expect, it } from "vitest";
import { AgentApprovalQueue } from "@/collections/AgentApprovalQueue";

describe("AgentApprovalQueue Collection", () => {
  it("raises no bell notifications on create or status change", () => {
    // Approvals are reviewed on /admin/agent-approvals; the bell fan-out was removed.
    expect(AgentApprovalQueue.hooks?.afterChange ?? []).toHaveLength(0);
  });
});
