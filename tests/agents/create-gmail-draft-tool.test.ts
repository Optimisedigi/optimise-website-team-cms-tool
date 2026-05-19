/**
 * create_gmail_draft tool.
 *
 * Mocks `getValidGmailToken` (auth) and `createGmailDraft` (the Gmail API
 * call) so the test stays offline. Verifies:
 *   - Missing userId in context → ok:false (no Gmail call attempted).
 *   - Gmail not connected → ok:false with the underlying reason.
 *   - Happy path → ok:true with draftId + messageId + gmailUrl + subject + to.
 *   - Validator rejects empty subject + empty htmlBody.
 *   - Validator preserves `to` when supplied, drops it when blank.
 *   - Gmail 401/403 surface as a re-connect message.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetToken, mockCreateDraft } = vi.hoisted(() => ({
  mockGetToken: vi.fn(),
  mockCreateDraft: vi.fn(),
}));

vi.mock("@/lib/agents/_shared/user-gmail-tokens", () => ({
  getValidGmailToken: mockGetToken,
}));
vi.mock("@/lib/gmail-service", () => ({
  createGmailDraft: mockCreateDraft,
}));

import { createGmailDraftTool } from "@/lib/agents/optimate-google-ads/tools/create-gmail-draft";
import type { ToolContext } from "@/lib/agents/_shared/tool";

/**
 * `baseCtx()` returns a ctx with userId=7 set.
 * `baseCtx(null)` returns a ctx with no userId at all (for the no-user test).
 * We deliberately don't use `undefined` because TS default-parameter semantics
 * would re-substitute the default value.
 */
const baseCtx = (userId: number | null = 7): ToolContext => ({
  agentName: "optimate-google-ads",
  agentRunId: "run_test_draft",
  context: userId === null ? {} : { userId },
  log: vi.fn(),
});

beforeEach(() => {
  mockGetToken.mockReset();
  mockCreateDraft.mockReset();
});

describe("create_gmail_draft — validator", () => {
  it("rejects missing subject", () => {
    expect(() =>
      createGmailDraftTool.validate!({ subject: "", htmlBody: "<p>hi</p>" }),
    ).toThrow(/subject/);
  });

  it("rejects empty htmlBody", () => {
    expect(() =>
      createGmailDraftTool.validate!({ subject: "Hello", htmlBody: "   " }),
    ).toThrow(/htmlBody/);
  });

  it("rejects subject longer than 998 chars (RFC 5322)", () => {
    expect(() =>
      createGmailDraftTool.validate!({
        subject: "x".repeat(999),
        htmlBody: "<p>hi</p>",
      }),
    ).toThrow(/998/);
  });

  it("preserves a non-empty `to` recipient", () => {
    const out = createGmailDraftTool.validate!({
      subject: "Hello",
      htmlBody: "<p>hi</p>",
      to: "ops@example.com",
    });
    expect(out.to).toBe("ops@example.com");
  });

  it("drops a blank `to` so the agent doesn't pass empty strings through", () => {
    const out = createGmailDraftTool.validate!({
      subject: "Hello",
      htmlBody: "<p>hi</p>",
      to: "   ",
    });
    expect(out.to).toBeUndefined();
  });
});

describe("create_gmail_draft — execute", () => {
  it("returns ok:false when no userId is in context", async () => {
    const args = createGmailDraftTool.validate!({
      subject: "Hello",
      htmlBody: "<p>hi</p>",
    });
    const result = await createGmailDraftTool.execute(args, baseCtx(null));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/user/i);
    expect(mockGetToken).not.toHaveBeenCalled();
    expect(mockCreateDraft).not.toHaveBeenCalled();
  });

  it("returns ok:false with the underlying reason when Gmail isn't connected", async () => {
    mockGetToken.mockResolvedValueOnce({
      ok: false,
      reason: "Gmail not connected for this user.",
    });
    const args = createGmailDraftTool.validate!({
      subject: "Hello",
      htmlBody: "<p>hi</p>",
    });
    const result = await createGmailDraftTool.execute(args, baseCtx());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Gmail not connected/);
    expect(mockCreateDraft).not.toHaveBeenCalled();
  });

  it("creates a draft and returns the Gmail deep-link on success", async () => {
    mockGetToken.mockResolvedValueOnce({
      ok: true,
      accessToken: "tok-123",
    });
    mockCreateDraft.mockResolvedValueOnce({
      draftId: "d-999",
      messageId: "m-abc",
    });

    const args = createGmailDraftTool.validate!({
      subject: "Acme — Budget Report — May 2026",
      htmlBody: "<p>Hello</p>",
      to: "owner@acme.com",
    });
    const result = await createGmailDraftTool.execute(args, baseCtx(7));

    expect(result.ok).toBe(true);
    expect(mockCreateDraft).toHaveBeenCalledWith("tok-123", {
      to: "owner@acme.com",
      subject: "Acme — Budget Report — May 2026",
      htmlBody: "<p>Hello</p>",
    });
    const data = result.data as Record<string, unknown>;
    expect(data.draftId).toBe("d-999");
    expect(data.messageId).toBe("m-abc");
    expect(data.gmailUrl).toBe("https://mail.google.com/mail/u/0/#drafts/m-abc");
    expect(data.subject).toBe("Acme — Budget Report — May 2026");
    expect(data.to).toBe("owner@acme.com");
  });

  it("defaults `to` to empty when omitted (Gmail forces user to pick a recipient)", async () => {
    mockGetToken.mockResolvedValueOnce({ ok: true, accessToken: "tok" });
    mockCreateDraft.mockResolvedValueOnce({ draftId: "d", messageId: "m" });
    const args = createGmailDraftTool.validate!({
      subject: "Hi",
      htmlBody: "<p>x</p>",
    });
    await createGmailDraftTool.execute(args, baseCtx(7));
    expect(mockCreateDraft).toHaveBeenCalledWith("tok", {
      to: "",
      subject: "Hi",
      htmlBody: "<p>x</p>",
    });
  });

  it("surfaces a 401 from Gmail as a re-connect error", async () => {
    mockGetToken.mockResolvedValueOnce({ ok: true, accessToken: "tok" });
    const err = new Error("Insufficient permission") as Error & { code: number };
    err.code = 401;
    mockCreateDraft.mockRejectedValueOnce(err);

    const args = createGmailDraftTool.validate!({
      subject: "Hi",
      htmlBody: "<p>x</p>",
    });
    const result = await createGmailDraftTool.execute(args, baseCtx(7));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/reconnect Gmail/i);
  });

  it("surfaces a generic Gmail failure with the underlying message", async () => {
    mockGetToken.mockResolvedValueOnce({ ok: true, accessToken: "tok" });
    mockCreateDraft.mockRejectedValueOnce(new Error("network down"));

    const args = createGmailDraftTool.validate!({
      subject: "Hi",
      htmlBody: "<p>x</p>",
    });
    const result = await createGmailDraftTool.execute(args, baseCtx(7));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/network down/);
  });
});
