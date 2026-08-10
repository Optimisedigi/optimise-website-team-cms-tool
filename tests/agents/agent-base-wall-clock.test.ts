/**
 * Tests for wall-clock budget guard and parallel tool execution in the
 * base agent loop.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies that touch external services.
vi.mock("@/lib/agents/_shared/llm/auth/resolver", () => ({
  resolveCredential: vi.fn().mockResolvedValue({
    authHeader: { "x-api-key": "test-key" },
    source: "api-key",
    credential: { kind: "api-key", provider: "anthropic", apiKey: "test" },
  }),
  OAuthFailedError: class extends Error {},
}));

vi.mock("@/lib/agents/_shared/activity-log", () => ({
  logAgentStep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/agents/_shared/llm/auth/events", () => ({
  recordAuthEvent: vi.fn().mockResolvedValue(undefined),
}));

import { runAgent } from "@/lib/agents/_shared/base-agent";
import type { AgentRunOptions } from "@/lib/agents/_shared/types";
import type { CanonicalTool, ToolContext } from "@/lib/agents/_shared/tool";
import type { Message } from "@/lib/agents/_shared/llm/types";
import * as llmModule from "@/lib/agents/_shared/llm";

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeTool(
  name: string,
  executeResult: { ok: boolean; data?: unknown; error?: string },
  delayMs = 0,
): CanonicalTool {
  return {
    name,
    description: `Test tool ${name}`,
    inputSchema: { type: "object", properties: {} },
    execute: async (_args: unknown, _ctx: ToolContext) => {
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      return executeResult;
    },
  };
}

function mockCallLLMSequence(
  responses: Array<{
    message: Message;
    model?: string;
    source?: string;
    stopReason?: string;
    usage?: { inputTokens: number; outputTokens: number };
  }>,
) {
  let callIndex = 0;
  vi.spyOn(llmModule, "callLLM").mockImplementation(async () => {
    const r = responses[callIndex] ?? responses[responses.length - 1]!;
    callIndex++;
    return {
      message: r.message,
      model: r.model ?? "test-model",
      source: (r.source as any) ?? "api-key",
      stopReason: r.stopReason ?? "end_turn",
      usage: r.usage ?? { inputTokens: 100, outputTokens: 50 },
    };
  });
}

describe("runAgent — wall-clock budget guard", () => {
  it("forces synthesis when deadlineMs is within 45 seconds", async () => {
    // Set deadline to 30s from now — well within the 45s guard window
    const deadlineMs = Date.now() + 30_000;

    mockCallLLMSequence([
      {
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Here is the summary." }],
        },
        stopReason: "end_turn",
      },
    ]);

    const opts: AgentRunOptions = {
      agentName: "test-agent",
      systemPrompt: "You are a test.",
      tools: [],
      initialMessages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
      model: "test-model",
      context: {},
      deadlineMs,
    };

    const result = await runAgent(opts);

    expect(result.finalMessage.content[0]).toMatchObject({
      type: "text",
      text: "Here is the summary.",
    });

    // The LLM should have been called once with no tools (forced synthesis)
    expect(llmModule.callLLM).toHaveBeenCalledTimes(1);
    const callArgs = (llmModule.callLLM as any).mock.calls[0][0];
    expect(callArgs.tools).toEqual([]);

    // Verify a synthetic "time budget exhausted" user message was pushed.
    // The messages array is passed by reference so it gets mutated after
    // callLLM returns (the assistant message is appended). We check the
    // second-to-last entry which is the user message we pushed.
    const userMsg = callArgs.messages[callArgs.messages.length - 2];
    expect(userMsg.role).toBe("user");
    const text =
      typeof userMsg.content === "string"
        ? userMsg.content
        : userMsg.content.find((p: any) => p.type === "text")?.text;
    expect(text).toContain("Time budget exhausted");
  });

  it("does NOT trigger the guard when deadlineMs is far away", async () => {
    // Deadline 5 minutes from now — well beyond 45s guard
    const deadlineMs = Date.now() + 300_000;

    mockCallLLMSequence([
      {
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Normal reply" }],
        },
        stopReason: "end_turn",
      },
    ]);

    const opts: AgentRunOptions = {
      agentName: "test-agent",
      systemPrompt: "You are a test.",
      tools: [],
      initialMessages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
      model: "test-model",
      context: {},
      deadlineMs,
    };

    const result = await runAgent(opts);

    // Should be a normal reply, not a synthesis
    expect(result.finalMessage.content[0]).toMatchObject({
      type: "text",
      text: "Normal reply",
    });

    // LLM should be called with the normal tool set (empty in this case, but NOT the forced-synthesis path)
    expect(llmModule.callLLM).toHaveBeenCalledTimes(1);
    // The last message should NOT be the synthetic "time budget exhausted" message
    const callArgs = (llmModule.callLLM as any).mock.calls[0][0];
    const lastMsg = callArgs.messages[callArgs.messages.length - 1];
    const text =
      typeof lastMsg.content === "string"
        ? lastMsg.content
        : lastMsg.content.find((p: any) => p.type === "text")?.text ?? "";
    expect(text).not.toContain("Time budget exhausted");
  });
});

describe("runAgent — parallel tool execution", () => {
  it("executes multiple tools in parallel within a single turn", async () => {
    const toolAResolved: number[] = [];
    const toolBResolved: number[] = [];

    const toolA: CanonicalTool = {
      name: "tool_a",
      description: "Tool A",
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        const start = Date.now();
        await new Promise((r) => setTimeout(r, 100));
        toolAResolved.push(Date.now() - start);
        return { ok: true, data: { result: "A" } };
      },
    };

    const toolB: CanonicalTool = {
      name: "tool_b",
      description: "Tool B",
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        const start = Date.now();
        await new Promise((r) => setTimeout(r, 100));
        toolBResolved.push(Date.now() - start);
        return { ok: true, data: { result: "B" } };
      },
    };

    // Turn 1: model calls both tools. Turn 2: model produces final reply.
    mockCallLLMSequence([
      {
        message: {
          role: "assistant",
          content: [
            { type: "tool_use", id: "tu_a", name: "tool_a", input: {} },
            { type: "tool_use", id: "tu_b", name: "tool_b", input: {} },
          ],
        },
        stopReason: "tool_use",
      },
      {
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Both tools done." }],
        },
        stopReason: "end_turn",
      },
    ]);

    const startWall = Date.now();
    const result = await runAgent({
      agentName: "test-agent",
      systemPrompt: "You are a test.",
      tools: [toolA, toolB],
      initialMessages: [{ role: "user", content: [{ type: "text", text: "run both" }] }],
      model: "test-model",
      context: {},
    });
    const wallDuration = Date.now() - startWall;

    expect(result.finalMessage.content[0]).toMatchObject({
      type: "text",
      text: "Both tools done.",
    });

    // Both tools should have been called
    expect(toolAResolved.length).toBe(1);
    expect(toolBResolved.length).toBe(1);

    // If tools ran in parallel, total wall time should be ~100ms + overhead,
    // not ~200ms (sequential). Use 180ms as a generous threshold.
    expect(wallDuration).toBeLessThan(180);
  });

  it("passes deadlineMs to tools via ToolContext", async () => {
    let capturedDeadline: number | undefined;
    const deadlineMs = Date.now() + 120_000;

    const spyTool: CanonicalTool = {
      name: "spy_tool",
      description: "Captures deadlineMs from ctx",
      inputSchema: { type: "object", properties: {} },
      execute: async (_args, ctx) => {
        capturedDeadline = ctx.deadlineMs;
        return { ok: true, data: {} };
      },
    };

    mockCallLLMSequence([
      {
        message: {
          role: "assistant",
          content: [
            { type: "tool_use", id: "tu1", name: "spy_tool", input: {} },
          ],
        },
        stopReason: "tool_use",
      },
      {
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Done." }],
        },
        stopReason: "end_turn",
      },
    ]);

    await runAgent({
      agentName: "test-agent",
      systemPrompt: "You are a test.",
      tools: [spyTool],
      initialMessages: [{ role: "user", content: [{ type: "text", text: "spy" }] }],
      model: "test-model",
      context: {},
      deadlineMs,
    });

    expect(capturedDeadline).toBe(deadlineMs);
  });
});
