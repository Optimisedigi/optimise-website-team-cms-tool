/**
 * OpenAI Chat Completions response -> canonical LLMResponse.
 */

import type { LLMResponse, Message, StopReason, ContentPart, CredentialSource } from "../types";

interface OpenAIChoice {
  index: number;
  message: {
    role: "assistant";
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
  };
  finish_reason: string | null;
}

interface OpenAIResponse {
  id: string;
  model: string;
  choices: OpenAIChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
  };
}

function mapFinishReason(r: string | null): StopReason {
  switch (r) {
    case "stop":
      return "end_turn";
    case "tool_calls":
    case "function_call":
      return "tool_use";
    case "length":
      return "max_tokens";
    case "content_filter":
    case null:
      return "error";
    default:
      return "error";
  }
}

function safeParseJson(s: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(s);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function fromOpenAI(
  json: unknown,
  canonicalModel: string,
  source: CredentialSource,
): LLMResponse {
  const r = json as OpenAIResponse;
  const choice = r.choices?.[0];
  if (!choice) {
    return {
      message: { role: "assistant", content: [{ type: "text", text: "" }] },
      stopReason: "error",
      usage: { inputTokens: 0, outputTokens: 0 },
      model: canonicalModel,
      providerModel: r.model ?? canonicalModel,
      source,
    };
  }
  const content: ContentPart[] = [];
  if (choice.message.content) {
    content.push({ type: "text", text: choice.message.content });
  }
  for (const tc of choice.message.tool_calls ?? []) {
    content.push({
      type: "tool_use",
      id: tc.id,
      name: tc.function.name,
      input: safeParseJson(tc.function.arguments),
    });
  }
  const message: Message = { role: "assistant", content };
  return {
    message,
    stopReason: mapFinishReason(choice.finish_reason),
    usage: {
      inputTokens: r.usage?.prompt_tokens ?? 0,
      outputTokens: r.usage?.completion_tokens ?? 0,
      cacheReadTokens: r.usage?.prompt_tokens_details?.cached_tokens,
    },
    model: canonicalModel,
    providerModel: r.model ?? canonicalModel,
    source,
  };
}
