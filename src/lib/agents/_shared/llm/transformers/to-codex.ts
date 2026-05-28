/**
 * Canonical CallLLMOptions -> Codex Responses API request body.
 *
 * The Codex backend (chatgpt.com/backend-api/codex/responses) takes a
 * Responses-API body, NOT Chat Completions, so this can't reuse to-openai.ts.
 * Two hard requirements verified against the real Codex CLI traffic
 * (openai/codex gpt_5_codex_prompt.md + Simon Willison's reverse-engineering
 * of the `--debug` request dump):
 *
 *   1. Top-level `instructions` MUST begin with the canonical Codex system
 *      prompt ("You are Codex, based on GPT-5. ..."). The endpoint rejects
 *      requests whose instructions don't start with it — OpenAI's auth gate
 *      validates the Codex-specific prompt.
 *   2. The caller's own system prompt is sent as a `developer`-role message at
 *      the FRONT of `input`, exactly as the CLI sends "You are a helpful
 *      assistant." there.
 *
 * Messages map to Responses `input` items:
 *   - user text   -> { type:"message", role:"user", content:[{type:"input_text"}] }
 *   - assistant text -> { type:"message", role:"assistant",
 *                         content:[{type:"output_text", annotations:[]}] }
 *   - tool_use    -> { type:"function_call", call_id, name, arguments }
 *   - tool_result -> { type:"function_call_output", call_id, output }
 *
 * Reasoning effort is set per-model from the registry's `effort` field via
 * `reasoning: { effort }`. This is how GPT-5.5 "levels" work — effort is a
 * per-request setting, not a separate model.
 */

import type { CallLLMOptions } from "../types";
import type { CodexEffort } from "../registry";
import { sanitizeToolUseId } from "./_tool-id";

/** Exact canonical Codex system prompt prefix the backend expects as the
 *  start of `instructions`. The auth gate validates that instructions begin
 *  with this sentence. Lifted verbatim from openai/codex's gpt_5_codex_prompt.md
 *  (the first two sentences are the stable invariant; the full prompt body can
 *  drift across versions, but the opening identity must match). Do not edit. */
export const CODEX_INSTRUCTIONS_PREFIX =
  "You are Codex, based on GPT-5. You are running as a coding agent in the Codex CLI on a user's computer.";

export class UnsupportedCodexImageInputError extends Error {
  constructor() {
    super(
      "Image attachments are only supported on Anthropic Claude models in OptiMate. Select a Claude model, or add Codex image-part support before sending screenshots.",
    );
    this.name = "UnsupportedCodexImageInputError";
  }
}

type CodexInputContentPart =
  | { type: "input_text"; text: string }
  | { type: "output_text"; text: string; annotations: [] };

type CodexInputItem =
  | { type: "message"; role: "developer" | "user" | "assistant"; content: CodexInputContentPart[] }
  | { type: "function_call"; call_id: string; name: string; arguments: string }
  | { type: "function_call_output"; call_id: string; output: string };

export interface CodexRequestBody {
  model: string;
  /** Codex backend never persists; we always send a one-shot request. */
  store: false;
  /** The endpoint streams SSE; the adapter assembles it to a single response. */
  stream: true;
  instructions: string;
  input: CodexInputItem[];
  tools?: Array<{
    type: "function";
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    strict: false;
  }>;
  tool_choice?: "auto";
  parallel_tool_calls?: boolean;
  temperature?: number;
  reasoning?: { effort: CodexEffort };
}

export function toCodex(
  opts: CallLLMOptions,
  providerModel: string,
  config: { effort: CodexEffort },
): CodexRequestBody {
  const input: CodexInputItem[] = [];

  // The caller's system prompt rides as a leading developer-role message,
  // matching how the real Codex CLI sends it. The canonical Codex identity
  // goes in `instructions` below, NOT here.
  if (opts.system) {
    input.push({
      type: "message",
      role: "developer",
      content: [{ type: "input_text", text: opts.system }],
    });
  }

  for (const m of opts.messages) {
    if (m.role === "system") {
      // Already lifted into the developer message / instructions; ignore
      // additional system messages mid-stream.
      continue;
    }

    if (m.role === "tool") {
      for (const part of m.content) {
        if (part.type === "tool_result") {
          input.push({
            type: "function_call_output",
            call_id: sanitizeToolUseId(part.toolUseId),
            output: part.content,
          });
        }
      }
      continue;
    }

    if (m.role === "assistant") {
      const textParts: string[] = [];
      const toolCalls: CodexInputItem[] = [];
      for (const part of m.content) {
        if (part.type === "text") {
          textParts.push(part.text);
        } else if (part.type === "tool_use") {
          toolCalls.push({
            type: "function_call",
            call_id: sanitizeToolUseId(part.id),
            name: part.name,
            arguments: JSON.stringify(part.input),
          });
        }
      }
      if (textParts.length > 0) {
        input.push({
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: textParts.join(""), annotations: [] }],
        });
      }
      input.push(...toolCalls);
      continue;
    }

    // user role
    for (const part of m.content) {
      if (part.type === "text") {
        input.push({
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: part.text }],
        });
      } else if (part.type === "image") {
        throw new UnsupportedCodexImageInputError();
      } else if (part.type === "tool_result") {
        input.push({
          type: "function_call_output",
          call_id: sanitizeToolUseId(part.toolUseId),
          output: part.content,
        });
      }
    }
  }

  const body: CodexRequestBody = {
    model: providerModel,
    store: false,
    stream: true,
    instructions: CODEX_INSTRUCTIONS_PREFIX,
    input,
    reasoning: { effort: config.effort },
  };
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools.map((t) => ({
      type: "function" as const,
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
      strict: false as const,
    }));
    body.tool_choice = "auto";
    body.parallel_tool_calls = true;
  }
  return body;
}
