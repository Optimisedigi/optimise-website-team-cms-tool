/**
 * Canonical types roundtrip: build a canonical Message[] containing text +
 * tool_use + tool_result, transform through to-anthropic + from-anthropic
 * (and to-openai + from-openai), confirm the structurally-relevant pieces
 * survive both directions.
 *
 * Catches transformer drift: if either side changes a field name or a
 * shape, this test breaks before any agent run does.
 */

import { describe, it, expect } from "vitest";
import { toAnthropic } from "@/lib/agents/_shared/llm/transformers/to-anthropic";
import { fromAnthropic } from "@/lib/agents/_shared/llm/transformers/from-anthropic";
import { toOpenAI } from "@/lib/agents/_shared/llm/transformers/to-openai";
import { fromOpenAI } from "@/lib/agents/_shared/llm/transformers/from-openai";
import type { CallLLMOptions, Message } from "@/lib/agents/_shared/llm/types";

const baseOpts: CallLLMOptions = {
  model: "claude-sonnet-4.5",
  system: "You are a test agent.",
  messages: [
    {
      role: "user",
      content: [{ type: "text", text: "Run the diagnostic for client X." }],
    },
    {
      role: "assistant",
      content: [
        { type: "text", text: "Calling the diagnostic tool now." },
        {
          type: "tool_use",
          id: "toolu_01",
          name: "run_diagnostic",
          input: { customerId: "1840834992", windowDays: 25 },
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool_result",
          toolUseId: "toolu_01",
          content: '{"ok":true,"summary":{"siteWideEventDetected":false}}',
        },
      ],
    },
  ],
  tools: [
    {
      name: "run_diagnostic",
      description: "Run the account performance diagnostic.",
      inputSchema: {
        type: "object",
        properties: {
          customerId: { type: "string" },
          windowDays: { type: "number" },
        },
        required: ["customerId"],
      },
    },
  ],
  maxTokens: 2048,
};

describe("Anthropic transformer", () => {
  it("converts canonical request to Anthropic shape", () => {
    const body = toAnthropic(baseOpts, "claude-sonnet-4-5");
    expect(body.model).toBe("claude-sonnet-4-5");
    expect(body.max_tokens).toBe(2048);
    expect(body.system).toEqual([
      { type: "text", text: "You are a test agent.", cache_control: { type: "ephemeral" } },
    ]);
    expect(body.messages).toHaveLength(3); // user, assistant (with tool_use), tool-result-as-user
    expect(body.messages[1].content).toEqual([
      { type: "text", text: "Calling the diagnostic tool now." },
      { type: "tool_use", id: "toolu_01", name: "run_diagnostic", input: { customerId: "1840834992", windowDays: 25 } },
    ]);
    expect(body.messages[2].role).toBe("user");
    expect(body.messages[2].content[0]).toMatchObject({
      type: "tool_result",
      tool_use_id: "toolu_01",
    });
    expect(body.tools?.[0]).toEqual({
      name: "run_diagnostic",
      description: "Run the account performance diagnostic.",
      input_schema: baseOpts.tools![0].inputSchema,
    });
  });

  it("converts Anthropic response to canonical LLMResponse", () => {
    const fakeResponse = {
      id: "msg_01",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-4-5",
      content: [
        { type: "text", text: "All done." },
        { type: "tool_use", id: "toolu_02", name: "draft_report", input: { format: "html" } },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 1234, output_tokens: 56, cache_read_input_tokens: 800 },
    };
    const canonical = fromAnthropic(fakeResponse, "claude-sonnet-4.5", "oauth");
    expect(canonical.model).toBe("claude-sonnet-4.5");
    expect(canonical.providerModel).toBe("claude-sonnet-4-5");
    expect(canonical.source).toBe("oauth");
    expect(canonical.stopReason).toBe("tool_use");
    expect(canonical.usage.inputTokens).toBe(1234);
    expect(canonical.usage.outputTokens).toBe(56);
    expect(canonical.usage.cacheReadTokens).toBe(800);
    expect(canonical.message.content).toEqual([
      { type: "text", text: "All done." },
      { type: "tool_use", id: "toolu_02", name: "draft_report", input: { format: "html" } },
    ]);
  });
});

describe("OpenAI-compatible transformer", () => {
  it("converts canonical request to OpenAI shape", () => {
    const body = toOpenAI(baseOpts, "kimi-k2.6");
    expect(body.model).toBe("kimi-k2.6");
    expect(body.messages[0]).toEqual({ role: "system", content: "You are a test agent." });
    expect(body.messages[1]).toEqual({ role: "user", content: "Run the diagnostic for client X." });
    expect(body.messages[2]).toMatchObject({
      role: "assistant",
      content: "Calling the diagnostic tool now.",
      tool_calls: [
        {
          id: "toolu_01",
          type: "function",
          function: {
            name: "run_diagnostic",
            arguments: JSON.stringify({ customerId: "1840834992", windowDays: 25 }),
          },
        },
      ],
    });
    expect(body.messages[3]).toEqual({
      role: "tool",
      tool_call_id: "toolu_01",
      content: '{"ok":true,"summary":{"siteWideEventDetected":false}}',
    });
    expect(body.tools?.[0]).toEqual({
      type: "function",
      function: {
        name: "run_diagnostic",
        description: "Run the account performance diagnostic.",
        parameters: baseOpts.tools![0].inputSchema,
      },
    });
  });

  it("converts OpenAI response to canonical LLMResponse", () => {
    const fakeResponse = {
      id: "chatcmpl-1",
      model: "kimi-k2.6",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "Investigation complete.",
            tool_calls: [
              {
                id: "call_42",
                type: "function",
                function: {
                  name: "draft_report",
                  arguments: JSON.stringify({ format: "html" }),
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: {
        prompt_tokens: 800,
        completion_tokens: 40,
        total_tokens: 840,
        prompt_tokens_details: { cached_tokens: 600 },
      },
    };
    const canonical = fromOpenAI(fakeResponse, "kimi-k2.6", "api-key");
    expect(canonical.model).toBe("kimi-k2.6");
    expect(canonical.providerModel).toBe("kimi-k2.6");
    expect(canonical.source).toBe("api-key");
    expect(canonical.stopReason).toBe("tool_use");
    expect(canonical.usage.inputTokens).toBe(800);
    expect(canonical.usage.cacheReadTokens).toBe(600);
    expect(canonical.message.content).toEqual([
      { type: "text", text: "Investigation complete." },
      { type: "tool_use", id: "call_42", name: "draft_report", input: { format: "html" } },
    ]);
  });
});

describe("Roundtrip integrity", () => {
  it("Anthropic roundtrip preserves message structure", () => {
    const body = toAnthropic(baseOpts, "claude-sonnet-4-5");
    // Simulate Anthropic echoing the assistant turn back as a fresh response.
    const echoed = {
      id: "msg_99",
      type: "message",
      role: "assistant",
      model: body.model,
      content: body.messages[1].content,
      stop_reason: "tool_use",
      usage: { input_tokens: 1, output_tokens: 1 },
    };
    const canonical = fromAnthropic(echoed, "claude-sonnet-4.5", "oauth");
    expect(canonical.message.content).toEqual([
      { type: "text", text: "Calling the diagnostic tool now." },
      { type: "tool_use", id: "toolu_01", name: "run_diagnostic", input: { customerId: "1840834992", windowDays: 25 } },
    ]);
  });

  it("OpenAI roundtrip survives null assistant content with tool calls", () => {
    const opts: CallLLMOptions = {
      ...baseOpts,
      messages: [
        baseOpts.messages[0],
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "tc_1",
              name: "run_diagnostic",
              input: { customerId: "x" },
            },
          ],
        } as Message,
      ],
    };
    const body = toOpenAI(opts, "kimi-k2.6");
    expect(body.messages[2].content).toBeNull();
    expect(body.messages[2].tool_calls?.[0]?.function.name).toBe("run_diagnostic");
  });
});
