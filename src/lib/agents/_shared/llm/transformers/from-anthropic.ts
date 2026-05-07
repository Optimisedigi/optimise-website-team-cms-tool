/**
 * Anthropic Messages API response -> canonical LLMResponse.
 */

import type { LLMResponse, Message, StopReason, ContentPart, CredentialSource } from "../types";

interface AnthropicResponse {
  id: string;
  type: "message";
  role: "assistant";
  model: string;
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  >;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

function mapStopReason(r: string | null): StopReason {
  switch (r) {
    case "end_turn":
      return "end_turn";
    case "tool_use":
      return "tool_use";
    case "max_tokens":
      return "max_tokens";
    case "stop_sequence":
      return "stop_sequence";
    default:
      return "error";
  }
}

export function fromAnthropic(
  json: unknown,
  canonicalModel: string,
  source: CredentialSource,
): LLMResponse {
  const r = json as AnthropicResponse;
  const content: ContentPart[] = r.content.map((c) => {
    if (c.type === "text") return { type: "text", text: c.text };
    return { type: "tool_use", id: c.id, name: c.name, input: c.input };
  });
  const message: Message = { role: "assistant", content };
  return {
    message,
    stopReason: mapStopReason(r.stop_reason),
    usage: {
      inputTokens: r.usage.input_tokens,
      outputTokens: r.usage.output_tokens,
      cacheCreationTokens: r.usage.cache_creation_input_tokens,
      cacheReadTokens: r.usage.cache_read_input_tokens,
    },
    model: canonicalModel,
    providerModel: r.model,
    source,
  };
}
