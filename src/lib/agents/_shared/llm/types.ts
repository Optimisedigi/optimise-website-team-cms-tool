/**
 * Canonical LLM types.
 *
 * Provider-agnostic shapes the agent code sees. Adapters and transformers
 * are the only modules that ever speak provider dialects; everything else
 * (the agent loop, the tool layer, the activity log) reads and writes
 * these canonical shapes.
 */

export type Role = "system" | "user" | "assistant" | "tool";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean };

export interface Message {
  role: Role;
  content: ContentPart[];
  /**
   * Provider-emitted reasoning text (Kimi/Moonshot `reasoning_content`).
   * Captured on assistant messages when the provider runs in thinking mode
   * and required to be replayed in the next request — Kimi K2.5+ throws
   * 400 "thinking is enabled but reasoning_content is missing" if an
   * assistant message with tool_calls is replayed without it.
   *
   * Anthropic uses a different mechanism (thinking blocks) so this stays
   * provider-internal: only OpenAI-compatible adapters read/write it.
   */
  reasoningContent?: string;
}

export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema, generated from a Zod schema by tool.ts */
  inputSchema: Record<string, unknown>;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

export type StopReason =
  | "end_turn"
  | "tool_use"
  | "max_tokens"
  | "stop_sequence"
  | "error";

export type CredentialSource = "oauth" | "api-key" | "api-key-fallback";

export interface LLMResponse {
  message: Message;
  stopReason: StopReason;
  usage: Usage;
  /** Canonical model name from the registry. */
  model: string;
  /** Raw model id the provider returned (for logs / audits). */
  providerModel: string;
  source: CredentialSource;
}

export interface CallLLMOptions {
  /** Canonical model name (key into MODEL_REGISTRY). */
  model: string;
  messages: Message[];
  system?: string;
  tools?: ToolDef[];
  maxTokens?: number;
  temperature?: number;
  /** If primary fails, try these in order. Each is a canonical model name. */
  fallbackModels?: string[];
  /** Hard limit on total wall time across primary + fallbacks. Default 60_000. */
  timeoutMs?: number;
}
