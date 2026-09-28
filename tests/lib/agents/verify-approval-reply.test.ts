import { describe, expect, it } from "vitest";
import { verifyApprovalReply } from "../../../src/lib/agents/optimate-google-ads/verify-approval-reply";

describe("verifyApprovalReply", () => {
  const reply = "Queued approval #86, review at /admin/agent-approvals/86";

  it("does not claim a missing approval exists", () => {
    const checked = verifyApprovalReply(reply, []);
    expect(checked).toContain("couldn't verify");
    expect(checked).not.toContain("/admin/agent-approvals/86");
    expect(checked).not.toContain("Queued approval #86");
  });

  it("keeps a link for a persisted approval from this run", () => {
    expect(verifyApprovalReply(reply, [{ id: 86 }])).toBe(reply);
  });

  it("does not alter unrelated replies or references to old approvals", () => {
    expect(verifyApprovalReply("Approval #86 is missing", [])).toBe("Approval #86 is missing");
  });
});
