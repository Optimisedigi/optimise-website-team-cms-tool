/**
 * Canonical -> Anthropic Messages API request body.
 *
 * Maps Message[] to Anthropic's content-block shape, applies a single
 * cache_control breakpoint at the end of the system prompt for prompt
 * caching (the system prompt is stable across an agent run, so caching it
 * is the highest-leverage cost reduction).
 */

import type { CallLLMOptions } from "../types";

interface AnthropicMessage {
  role: "user" | "assistant";
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
    | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
  >;
}

interface AnthropicSystemBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

export interface AnthropicRequestBody {
  model: string;
  max_tokens: number;
  temperature?: number;
  system?: AnthropicSystemBlock[];
  messages: AnthropicMessage[];
  tools?: Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }>;
}

export function toAnthropic(opts: CallLLMOptions, providerModel: string): AnthropicRequestBody {
  // Anthropic doesn't support 'system' or 'tool' as a message role; system goes
  // in the top-level system field, tool messages are user messages with
  // tool_result content blocks.
  const messages: AnthropicMessage[] = [];
  for (const m of opts.messages) {
    if (m.role === "system") continue; // Should be lifted into opts.system instead
    if (m.role === "tool") {
      messages.push({
        role: "user",
        content: m.content
          .filter((p) => p.type === "tool_result")
          .map((p) => {
            // narrowed by filter
            const part = p as Extract<typeof p, { type: "tool_result" }>;
            return {
              type: "tool_result" as const,
              tool_use_id: part.toolUseId,
              content: part.content,
              ...(part.isError ? { is_error: true } : {}),
            };
          }),
      });
      continue;
    }
    messages.push({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content.map((part) => {
        if (part.type === "text") return { type: "text", text: part.text };
        if (part.type === "tool_use") {
          return { type: "tool_use", id: part.id, name: part.name, input: part.input };
        }
        // tool_result on non-tool message: treat as user content
        return {
          type: "tool_result",
          tool_use_id: part.toolUseId,
          content: part.content,
          ...(part.isError ? { is_error: true } : {}),
        };
      }),
    });
  }

  const body: AnthropicRequestBody = {
    model: providerModel,
    max_tokens: opts.maxTokens ?? 4096,
    messages,
  };
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  if (opts.system) {
    body.system = [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }];
  }
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));
  }
  return body;
}
