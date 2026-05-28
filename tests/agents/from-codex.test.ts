/**
 * from-codex transformer: Codex Responses SSE event list -> LLMResponse.
 *
 * Asserts assembled text + tool_use from a sample event stream, usage mapping
 * (cached subtracted from input), stop-reason mapping, and that terminal error
 * events throw.
 */

import { describe, it, expect } from "vitest";
import { fromCodex, type CodexEvent } from "@/lib/agents/_shared/llm/transformers/from-codex";

describe("fromCodex", () => {
  it("assembles text and usage from a completed text response", () => {
    const events: CodexEvent[] = [
      {
        type: "response.output_item.done",
        item: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Hello there." }],
        },
      },
      {
        type: "response.completed",
        response: {
          status: "completed",
          model: "gpt-5.5",
          usage: {
            input_tokens: 100,
            output_tokens: 20,
            total_tokens: 120,
            input_tokens_details: { cached_tokens: 30 },
          },
        },
      },
    ];
    const res = fromCodex(events, "gpt-5.5-codex-medium", "oauth");
    expect(res.message.content).toEqual([{ type: "text", text: "Hello there." }]);
    expect(res.stopReason).toBe("end_turn");
    expect(res.usage.inputTokens).toBe(70); // 100 - 30 cached
    expect(res.usage.outputTokens).toBe(20);
    expect(res.usage.cacheReadTokens).toBe(30);
    expect(res.model).toBe("gpt-5.5-codex-medium");
    expect(res.providerModel).toBe("gpt-5.5");
    expect(res.source).toBe("oauth");
  });

  it("assembles tool_use and reports tool_use stop reason", () => {
    const events: CodexEvent[] = [
      {
        type: "response.output_item.done",
        item: {
          type: "function_call",
          call_id: "call_42",
          name: "run_audit",
          arguments: '{"campaign":"X"}',
        },
      },
      { type: "response.completed", response: { status: "completed" } },
    ];
    const res = fromCodex(events, "gpt-5.5-codex-medium", "oauth");
    expect(res.message.content).toEqual([
      { type: "tool_use", id: "call_42", name: "run_audit", input: { campaign: "X" } },
    ]);
    expect(res.stopReason).toBe("tool_use");
  });

  it("maps an incomplete status to max_tokens", () => {
    const events: CodexEvent[] = [
      {
        type: "response.output_item.done",
        item: { type: "message", role: "assistant", content: [{ type: "output_text", text: "partial" }] },
      },
      { type: "response.completed", response: { status: "incomplete" } },
    ];
    const res = fromCodex(events, "gpt-5.5-codex-low", "oauth");
    expect(res.stopReason).toBe("max_tokens");
  });

  it("throws on a terminal error event", () => {
    const events: CodexEvent[] = [{ type: "error", message: "usage limit reached" }];
    expect(() => fromCodex(events, "gpt-5.5-codex-medium", "oauth")).toThrow(/usage limit reached/);
  });

  it("throws on response.failed", () => {
    const events: CodexEvent[] = [
      { type: "response.failed", response: { error: { code: "server_error", message: "boom" } } },
    ];
    expect(() => fromCodex(events, "gpt-5.5-codex-medium", "oauth")).toThrow(/boom/);
  });
});
