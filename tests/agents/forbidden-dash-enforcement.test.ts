import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetToken, mockCreateDraft, mockCallLLM } = vi.hoisted(() => ({
  mockGetToken: vi.fn(),
  mockCreateDraft: vi.fn(),
  mockCallLLM: vi.fn(),
}));

vi.mock("@/lib/agents/_shared/user-gmail-tokens", () => ({
  getValidGmailToken: mockGetToken,
}));
vi.mock("@/lib/gmail-service", () => ({
  createGmailDraft: mockCreateDraft,
}));
vi.mock("@/lib/agents/_shared/activity-log", () => ({
  logAgentStep: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/agents/_shared/llm", () => ({
  callLLM: mockCallLLM,
}));

import { runAgent } from "@/lib/agents/_shared/base-agent";
import { removeForbiddenDashes } from "@/lib/agents/_shared/forbidden-dash-sanitizer";
import { stageEmailReplyTool } from "@/lib/agents/optimate-email/tools/stage-email-reply";
import { createGmailDraftTool } from "@/lib/agents/optimate-google-ads/tools/create-gmail-draft";

describe("OptiMate forbidden dash enforcement", () => {
  beforeEach(() => {
    mockCallLLM.mockReset();
    mockGetToken.mockReset();
    mockCreateDraft.mockReset();
  });

  it("removes EM and EN dashes from EmailMate staged email bodies and subjects", () => {
    const staged = stageEmailReplyTool.validate!({
      subject: "Update — August",
      body: "Hi Helena — the search campaign – and display campaign are live.",
    });

    expect(staged).toEqual({
      subject: "Update, August",
      body: "Hi Helena, the search campaign, and display campaign are live.",
    });
  });

  it("removes EM and EN dashes from the Gmail draft boundary shared by EmailMate and GoogleMate", () => {
    const draft = createGmailDraftTool.validate!({
      subject: "GoogleMate — August update",
      htmlBody: "<p>Spend – $2,000</p>",
    });

    expect(draft).toEqual({
      subject: "GoogleMate, August update",
      htmlBody: "<p>Spend, $2,000</p>",
    });
  });

  it("removes EM and EN dashes from GoogleMate final chat output", async () => {
    mockCallLLM.mockResolvedValueOnce({
      message: {
        role: "assistant",
        content: [{ type: "text", text: "GoogleMate — spend is up – 12%." }],
      },
      stopReason: "end_turn",
      usage: { inputTokens: 1, outputTokens: 1 },
      model: "kimi-k2.6",
      providerModel: "kimi-k2.6",
      source: "api-key",
    });

    const result = await runAgent({
      agentName: "optimate-google-ads",
      systemPrompt: "test",
      tools: [],
      context: {},
      initialMessages: [{ role: "user", content: [{ type: "text", text: "test" }] }],
      model: "kimi-k2.6",
    });

    expect(result.finalMessage.content).toEqual([
      { type: "text", text: "GoogleMate, spend is up, 12%." },
    ]);
  });

  it("removes EM and EN dashes from InvoiceMate response text", () => {
    expect(removeForbiddenDashes("InvoiceMate — invoice 42 – is ready.")).toBe(
      "InvoiceMate, invoice 42, is ready.",
    );
  });
});
