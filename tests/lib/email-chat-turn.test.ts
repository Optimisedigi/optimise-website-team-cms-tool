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
    expect(call.systemPrompt).toContain("call request_email_tools with its bundle first");
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
