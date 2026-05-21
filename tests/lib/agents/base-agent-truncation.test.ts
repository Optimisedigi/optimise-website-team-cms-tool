/**
 * Base agent: max_tokens-truncation recovery.
 *
 * Locks in the exact behaviour the chat-log incident hinges on. When the
 * model emits an assistant message with `stopReason: max_tokens` AND a
 * `tool_use` block (i.e. it ran out of room mid-tool-call), the loop:
 *
 *   1. First detection: replay the SAME turn once with doubled maxTokens.
 *   2. If the replay also truncates mid-tool-use, return a finalMessage
 *      whose content is ONLY a text part with MAX_TOKENS_TRUNCATION_MARKER.
 *      Crucially the tool_use block is stripped \u2014 returning it would
 *      poison the conversation (Anthropic 400: "tool_use ids were found
 *      without tool_result blocks immediately after").
 *
 * The test does NOT exercise a real LLM; it stubs callLLM directly.
 * That keeps the assertion focused on the loop's pairing-safety logic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// PAYLOAD_SECRET is set globally in tests/setup.ts so payload.config
// (loaded transitively via llm/auth/events) doesn't throw at import.

// activity-log writes to Payload; mock it out so the test stays in-memory.
vi.mock("@/lib/agents/_shared/activity-log", () => ({
  logAgentStep: vi.fn().mockResolvedValue(undefined),
}));

// Mock the LLM call so we control stopReason / content per turn.
vi.mock("@/lib/agents/_shared/llm", () => ({
  callLLM: vi.fn(),
}));

import { runAgent, MAX_TOKENS_TRUNCATION_MARKER } from "@/lib/agents/_shared/base-agent";
import { callLLM } from "@/lib/agents/_shared/llm";
import type { CanonicalTool } from "@/lib/agents/_shared/tool";

const callLLMMock = vi.mocked(callLLM);

function makeAssistantWithToolUse() {
  // Realistic shape: a brief text part followed by a tool_use block that
  // got truncated (Anthropic returns it with whatever id it minted before
  // running out of tokens).
  return {
    message: {
      role: "assistant" as const,
      content: [
        { type: "text" as const, text: "Building the draft now." },
        {
          type: "tool_use" as const,
          id: "toolu_01TgXZwBG2seWV5j5xECRK54",
          name: "create_gmail_draft",
          input: {} as Record<string, unknown>,
        },
      ],
    },
    stopReason: "max_tokens" as const,
    usage: { inputTokens: 100, outputTokens: 50 },
    model: "claude-sonnet-4.6",
    providerModel: "claude-sonnet-4-6-20251022",
    source: "api-key" as const,
  };
}

function makeAssistantTextOnly(text: string) {
  return {
    message: {
      role: "assistant" as const,
      content: [{ type: "text" as const, text }],
    },
    stopReason: "end_turn" as const,
    usage: { inputTokens: 100, outputTokens: 50 },
    model: "claude-sonnet-4.6",
    providerModel: "claude-sonnet-4-6-20251022",
    source: "api-key" as const,
  };
}

const dummyTool: CanonicalTool<{ subject: string }> = {
  name: "create_gmail_draft",
  description: "Create a Gmail draft",
  schema: {
    parse: (i: unknown) => i as { subject: string },
  } as unknown as CanonicalTool<{ subject: string }>["schema"],
  validate: (i: unknown) => i as { subject: string },
  execute: async () => ({ ok: true, data: { id: "draft-1" } }),
};

beforeEach(() => {
  callLLMMock.mockReset();
});

describe("runAgent max_tokens-truncation recovery", () => {
  it("retries the same turn with doubled maxTokens when truncated mid-tool-use", async () => {
    // Turn 1: truncated mid-tool-use. Turn 1-retry: succeeds with text only.
    callLLMMock
      .mockResolvedValueOnce(makeAssistantWithToolUse())
      .mockResolvedValueOnce(makeAssistantTextOnly("Done."));

    const result = await runAgent({
      agentName: "test",
      systemPrompt: "test system",
      tools: [dummyTool as unknown as CanonicalTool<unknown>],
      initialMessages: [{ role: "user", content: [{ type: "text", text: "go" }] }],
      model: "claude-sonnet-4.6",
      maxTokens: 2300,
      context: {},
    });

    expect(callLLMMock).toHaveBeenCalledTimes(2);
    // Doubled budget on the retry.
    expect(callLLMMock.mock.calls[1][0].maxTokens).toBe(4600);
    // Final message is the clean text-only one.
    expect(result.finalMessage.content).toEqual([{ type: "text", text: "Done." }]);
  });

  it("strips orphan tool_use and substitutes the marker when the retry also truncates", async () => {
    // Both attempts truncate mid-tool-use.
    callLLMMock
      .mockResolvedValueOnce(makeAssistantWithToolUse())
      .mockResolvedValueOnce(makeAssistantWithToolUse());

    const result = await runAgent({
      agentName: "test",
      systemPrompt: "test system",
      tools: [dummyTool as unknown as CanonicalTool<unknown>],
      initialMessages: [{ role: "user", content: [{ type: "text", text: "go" }] }],
      model: "claude-sonnet-4.6",
      maxTokens: 2300,
      context: {},
    });

    expect(callLLMMock).toHaveBeenCalledTimes(2);
    // CRITICAL: no tool_use parts in the returned finalMessage. If any
    // leak through, the OptiMate corrective-retry path will splice a
    // user text message after them and Anthropic will 400.
    const toolUseParts = result.finalMessage.content.filter(
      (p) => p.type === "tool_use",
    );
    expect(toolUseParts).toHaveLength(0);
    // Single text part = the user-readable marker.
    expect(result.finalMessage.content).toEqual([
      { type: "text", text: MAX_TOKENS_TRUNCATION_MARKER },
    ]);
  });

  it("does NOT trigger recovery when max_tokens hits on a text-only turn", async () => {
    // No tool_use means the message is harmless to replay \u2014 we just return
    // it. No double-budget retry, no marker substitution.
    callLLMMock.mockResolvedValueOnce({
      message: {
        role: "assistant",
        content: [{ type: "text", text: "long answer, cut off" }],
      },
      stopReason: "max_tokens",
      usage: { inputTokens: 100, outputTokens: 50 },
      model: "claude-sonnet-4.6",
      providerModel: "claude-sonnet-4-6-20251022",
      source: "api-key",
    });

    const result = await runAgent({
      agentName: "test",
      systemPrompt: "test system",
      tools: [dummyTool as unknown as CanonicalTool<unknown>],
      initialMessages: [{ role: "user", content: [{ type: "text", text: "go" }] }],
      model: "claude-sonnet-4.6",
      maxTokens: 2300,
      context: {},
    });

    expect(callLLMMock).toHaveBeenCalledTimes(1);
    expect(result.finalMessage.content).toEqual([
      { type: "text", text: "long answer, cut off" },
    ]);
  });
});
