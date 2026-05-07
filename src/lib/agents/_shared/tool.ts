/**
 * CanonicalTool. The shape every Optimate agent tool implements.
 *
 * Designed to interop with Zod schemas without making Zod a Phase 0
 * dependency. A tool author imports zod, declares `parameters: z.object(...)`
 * and a `toJsonSchema()` helper (e.g. zod-to-json-schema), and assigns the
 * result to `inputSchema`. The agent loop never inspects the schema beyond
 * passing it to the LLM and (if a validator is provided) running it on input
 * before execute().
 */

export interface ToolContext {
  agentName: string;
  agentRunId: string;
  /** Per-run context the agent passed in (e.g. clientId, customerId). */
  context: Record<string, unknown>;
  log: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface ToolResultPayload {
  ok: boolean;
  /** Serialisable result. JSON-stringified before passing back to the LLM. */
  data?: unknown;
  /** Human-readable error message if ok=false. */
  error?: string;
}

/**
 * A tool the agent can call. `inputSchema` is the JSON Schema the LLM sees;
 * `validate` is optional and runs against the parsed input before execute()
 * to catch bad LLM-emitted args. Either Zod (`schema.safeParse(args)`),
 * or a hand-written validator function.
 */
export interface CanonicalTool<TInput = Record<string, unknown>> {
  name: string;
  description: string;
  /** JSON Schema, surfaced to the LLM. */
  inputSchema: Record<string, unknown>;
  /** Optional runtime validator. Throw on invalid input or return a typed value. */
  validate?: (raw: unknown) => TInput;
  execute: (args: TInput, ctx: ToolContext) => Promise<ToolResultPayload>;
}

import type { ToolDef } from "./llm/types";

/** Convert a CanonicalTool to the ToolDef the LLM layer needs. */
export function toToolDef(tool: CanonicalTool<unknown>): ToolDef {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  };
}
