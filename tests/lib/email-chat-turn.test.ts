import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRunAgent } = vi.hoisted(() => ({ mockRunAgent: vi.fn() }));

vi.mock("@/lib/agents/_shared/base-agent", () => ({ runAgent: mockRunAgent }));
vi.mock("@/lib/agents/optimate-google-ads/memory-loader", () => ({
  loadPinnedMemoryBlock: vi.fn(async () => ({ text: "" })),
}));

import { detectEmailToolBundles, getEmailRealtimeToolDefinitions, runEmailChatTurn } from "@/lib/agents/optimate-email";

const stagedResult = {
  finalMessage: { role: "assistant", content: [{ type: "text", text: "Tightened the opening." }] },
  steps: [{
    step: 1,
    type: "tool-call",
    toolName: "stage_email_reply",
    output: { body: "Hi Sam,\n\nThanks for the update." },
    timestamp: "2026-10-18T00:00:00.000Z",
  }],
  totalUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  modelUsed: "grok-4.6",
  source: "oauth",
  runId: "run-1",
};

const userMessage = (text: string) => ({ role: "user" as const, content: [{ type: "text" as const, text }] });

describe("GmailMate text-chat tool loading", () => {
  beforeEach(() => mockRunAgent.mockReset());

  it("sends only stage_email_reply up front and attaches Gmail tools on request", async () => {
    mockRunAgent.mockResolvedValueOnce(stagedResult);
    await runEmailChatTurn({ messages: [userMessage("make this friendlier")], modelOverride: "grok-4.6", toolBundles: [] });

    const call = mockRunAgent.mock.calls[0][0];
    expect(call.tools.map((tool: { name: string }) => tool.name)).toEqual(["request_email_tools", "stage_email_reply"]);
    expect(call.systemPrompt).toContain("call request_email_tools with gmail_save first");
    const attached = call.resolveToolBundles({ toolName: "request_email_tools", input: { bundles: ["gmail_save"] }, isError: false });
    expect(attached.map((tool: { name: string }) => tool.name)).toEqual(["create_gmail_draft"]);
  });

  it("loads the matching bundle when the user asks for it", () => {
    expect(detectEmailToolBundles(["find the last email from Sam"])).toEqual(["gmail_read"]);
    expect(detectEmailToolBundles(["save it to my Gmail drafts"])).toEqual(["gmail_save"]);
    expect(detectEmailToolBundles(["draft a polite reply"])).toEqual([]);
  });

  it("keeps every tool for voice mode", () => {
    const names = getEmailRealtimeToolDefinitions().map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining([
      "stage_email_reply",
      "summarize_email_thread",
      "search_gmail_inbox",
      "read_gmail_message",
      "create_gmail_draft",
    ]));
    expect(names).not.toContain("request_email_tools");
  });
});

describe("GmailMate read consent", () => {
  beforeEach(() => mockRunAgent.mockReset());

  it("cannot attach the Gmail-read tools itself; only the user's words load them", async () => {
    mockRunAgent.mockResolvedValueOnce(stagedResult);
    await runEmailChatTurn({ messages: [userMessage("make this friendlier")], modelOverride: "grok-4.6", toolBundles: [] });
    const call = mockRunAgent.mock.calls[0][0];
    const requestTool = call.tools.find((tool: { name: string }) => tool.name === "request_email_tools");
    expect(() => requestTool.validate({ bundles: ["gmail_read"] })).toThrow(/only read when the user asks/);
    expect(call.resolveToolBundles({ toolName: "request_email_tools", input: { bundles: ["gmail_read"] }, isError: false })).toEqual([]);
    expect(call.systemPrompt).toContain("Never open, read or summarise an email the user did not ask about");
  });

  it("opens one email per user message unless the user approved reading them all", async () => {
    const { takeGmailRead, createGmailReadBudget, GMAIL_READ_BUDGET_KEY, userApprovedReadingAll } = await import(
      "@/lib/agents/optimate-email/read-consent"
    );
    const context = { [GMAIL_READ_BUDGET_KEY]: createGmailReadBudget(false) };
    expect(takeGmailRead(context, "message:a")).toEqual({ ok: true });
    expect(takeGmailRead(context, "message:a")).toEqual({ ok: true });
    expect(takeGmailRead(context, "message:b")).toMatchObject({ ok: false, error: expect.stringContaining("ask which one") });

    expect(userApprovedReadingAll("yes, read them all")).toBe(true);
    expect(userApprovedReadingAll("open all 3")).toBe(true);
    expect(userApprovedReadingAll("find the email from Sam")).toBe(false);
    expect(userApprovedReadingAll("what did they all say? reply to Sam")).toBe(false);

    mockRunAgent.mockResolvedValueOnce(stagedResult);
    await runEmailChatTurn({ messages: [userMessage("read the email from Sam")], modelOverride: "grok-4.6", toolBundles: ["gmail_read"] });
    const budget = mockRunAgent.mock.calls[0][0].context[GMAIL_READ_BUDGET_KEY];
    expect(budget).toMatchObject({ remaining: 1, approvedAll: false });
  });

  it("search returns sender, subject and date only, never the body snippet", async () => {
    vi.resetModules();
    vi.doMock("@/lib/agents/_shared/user-gmail-tokens", () => ({ getValidGmailToken: async () => ({ ok: true, accessToken: "tok" }) }));
    vi.doMock("@/lib/gmail-search", () => ({
      searchInbox: async () => ({ results: [{ messageId: "m1", threadId: "t1", subject: "Hi", from: "Sam <s@x.com>", date: "2026-10-20", snippet: "SECRET-BODY" }] }),
    }));
    const { searchGmailInboxTool } = await import("@/lib/agents/optimate-email/tools/search-gmail-inbox");
    const result = await searchGmailInboxTool.execute({ query: "from:sam" }, { agentName: "x", agentRunId: "r", context: { userId: 1 }, log: () => undefined });
    expect(JSON.stringify(result)).not.toContain("SECRET-BODY");
    expect(result).toMatchObject({ ok: true, data: { count: 1, results: [{ messageId: "m1", subject: "Hi" }] } });
    vi.doUnmock("@/lib/agents/_shared/user-gmail-tokens");
    vi.doUnmock("@/lib/gmail-search");
  });
});
