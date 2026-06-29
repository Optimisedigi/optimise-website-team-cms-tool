import { describe, expect, it } from "vitest";
import { fromCodex } from "../src/lib/agents/_shared/llm/transformers/from-codex";
import { remapCodexId, toCodex } from "../src/lib/agents/_shared/llm/transformers/to-codex";
import type { CallLLMOptions } from "../src/lib/agents/_shared/llm/types";

const baseOptions = (overrides: Partial<CallLLMOptions> = {}): CallLLMOptions => ({
  model: "gpt-5.5-codex",
  system: "You are OptiMate.",
  messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
  ...overrides,
});

describe("Codex transformers", () => {
  it("always sends GG-AI Codex reasoning and encrypted-content request fields", () => {
    const body = toCodex(baseOptions({ reasoningMode: "off" }), "gpt-5.5", { reasoningMode: "off" });

    expect(body.include).toEqual(["reasoning.encrypted_content"]);
    expect(body.reasoning).toEqual({ effort: "none", summary: "auto" });
    expect(body.store).toBe(false);
    expect(body.stream).toBe(true);
    expect(body.tool_choice).toBe("auto");
    expect(body.parallel_tool_calls).toBe(true);
  });

  it("sanitizes Codex tool IDs, splits composite IDs, and avoids collisions", () => {
    const idMap = new Map<string, string>();
    const usedIds = new Set<string>();

    expect(remapCodexId("toolu_call.1|item.9", idMap, usedIds)).toBe("fc_call_1");
    expect(remapCodexId("toolu_call/1", idMap, usedIds)).toBe("fc_call_1_2");
    expect(remapCodexId("toolu_call.1|item.9", idMap, usedIds)).toBe("fc_call_1");
    expect(remapCodexId("fc_existing", idMap, usedIds)).toBe("fc_existing");
  });

  it("preserves encrypted Codex reasoning before related tool calls and replays it", () => {
    const response = fromCodex(
      [
        {
          type: "response.output_item.done",
          item: {
            type: "reasoning",
            id: "rs_123",
            encrypted_content: "encrypted-reasoning",
          },
        },
        {
          type: "response.output_item.done",
          item: {
            type: "function_call",
            call_id: "fc_tool.1",
            name: "lookup",
            arguments: '{"query":"cms"}',
          },
        },
        {
          type: "response.completed",
          response: {
            status: "completed",
            model: "gpt-5.5",
            usage: {
              input_tokens: 125,
              output_tokens: 20,
              input_tokens_details: { cached_tokens: 25 },
            },
          },
        },
      ],
      "gpt-5.5-codex",
      "oauth",
    );

    expect(response.message.content[0]).toEqual({
      type: "raw",
      provider: "openai-codex",
      value: { type: "reasoning", id: "rs_123", encrypted_content: "encrypted-reasoning" },
    });
    expect(response.message.content[1]).toEqual({
      type: "tool_use",
      id: "fc_tool_1",
      name: "lookup",
      input: { query: "cms" },
    });
    expect(response.stopReason).toBe("tool_use");
    expect(response.usage).toEqual({ inputTokens: 100, outputTokens: 20, cacheReadTokens: 25 });

    const replay = toCodex(
      baseOptions({
        messages: [response.message],
        reasoningMode: "off",
      }),
      "gpt-5.5",
      { reasoningMode: "off" },
    );

    expect(replay.input[0]).toEqual({ type: "reasoning", id: "rs_123", encrypted_content: "encrypted-reasoning" });
    expect(replay.input[1]).toMatchObject({ type: "function_call", call_id: "fc_tool_1" });
  });
});
