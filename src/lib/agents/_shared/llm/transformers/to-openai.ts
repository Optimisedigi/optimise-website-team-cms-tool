/**
 * Canonical -> OpenAI Chat Completions API request body.
 *
 * Used by the OpenAI-compatible adapter for Kimi (Moonshot) and MiniMax.
 * Tool calls map to `tool_calls` array on assistant messages; tool results
 * map to messages with role='tool' and tool_call_id.
 */

import type { CallLLMOptions } from "../types";

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export interface OpenAIRequestBody {
  model: string;
  max_tokens: number;
  temperature?: number;
  messages: OpenAIMessage[];
  tools?: Array<{
    type: "function";
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }>;
}

export function toOpenAI(opts: CallLLMOptions, providerModel: string): OpenAIRequestBody {
  const messages: OpenAIMessage[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });

  for (const m of opts.messages) {
    if (m.role === "system") {
      // Already injected above; ignore additional system messages mid-stream.
      continue;
    }

    if (m.role === "tool") {
      // Each tool_result becomes its own role:'tool' message.
      for (const part of m.content) {
        if (part.type === "tool_result") {
          messages.push({
            role: "tool",
            tool_call_id: part.toolUseId,
            content: part.content,
          });
        }
      }
      continue;
    }

    if (m.role === "assistant") {
      const textParts: string[] = [];
      const toolCalls: NonNullable<OpenAIMessage["tool_calls"]> = [];
      for (const part of m.content) {
        if (part.type === "text") textParts.push(part.text);
        else if (part.type === "tool_use") {
          toolCalls.push({
            id: part.id,
            type: "function",
            function: { name: part.name, arguments: JSON.stringify(part.input) },
          });
        }
      }
      const message: OpenAIMessage = {
        role: "assistant",
        content: textParts.length > 0 ? textParts.join("") : null,
      };
      if (toolCalls.length > 0) message.tool_calls = toolCalls;
      messages.push(message);
      continue;
    }

    // user role
    const userTextParts: string[] = [];
    const userToolResults: OpenAIMessage[] = [];
    for (const part of m.content) {
      if (part.type === "text") userTextParts.push(part.text);
      else if (part.type === "tool_result") {
        // tool_result on a user message: emit as separate role:'tool' message
        userToolResults.push({
          role: "tool",
          tool_call_id: part.toolUseId,
          content: part.content,
        });
      }
    }
    if (userTextParts.length > 0) {
      messages.push({ role: "user", content: userTextParts.join("") });
    }
    messages.push(...userToolResults);
  }

  const body: OpenAIRequestBody = {
    model: providerModel,
    max_tokens: opts.maxTokens ?? 4096,
    messages,
  };
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));
  }
  return body;
}
