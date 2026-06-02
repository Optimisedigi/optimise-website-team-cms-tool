/**
 * Top-level shapes the agent loop produces and consumes.
 */

import type { Message, Usage, CredentialSource, ReasoningMode } from "./llm/types";
import type { CanonicalTool } from "./tool";

export interface AgentRunOptions {
  systemPrompt: string;
  tools: CanonicalTool<unknown>[];
  initialMessages: Message[];
  /** Canonical model name. */
  model: string;
  /** If primary model fails, try these. */
  fallbackModels?: string[];
  /** Tagged onto every activity-log entry. */
  agentName: string;
  /** Per-run context handed to every tool's execute(). */
  context: Record<string, unknown>;
  /** Hard cap on agent turns; default 20. */
  maxTurns?: number;
  /**
   * Max output tokens per LLM call. When omitted the transformer default
   * (4096) applies. Chat turns lower this to ~2,300 to bound the blast
   * radius of a hallucinated reply (Sonnet 4.6 has occasionally produced
   * ~3,000-word off-topic responses; a 2,300-token cap caps such replies
   * at ~1,800 words, still ~3× the largest legitimate reply observed).
   */
  maxTokens?: number;
  /** Optional cancellation. */
  signal?: AbortSignal;
  /** Per-provider request timeout in ms. Default lives in provider adapters. */
  timeoutMs?: number;
  /** Per-request reasoning mode. Defaults to off for routine chat turns. */
  reasoningMode?: ReasoningMode;
  /** Optional pre-allocated run id; useful for chaining log entries. */
  runId?: string;
}

export interface AgentStep {
  step: number;
  type: "reasoning" | "tool-call" | "final-output" | "error" | "auth-event";
  toolName?: string;
  input?: unknown;
  output?: unknown;
  reasoning?: string;
  model?: string;
  source?: CredentialSource;
  durationMs?: number;
  timestamp: string;
}

export interface AgentRunResult {
  finalMessage: Message;
  steps: AgentStep[];
  totalUsage: Usage;
  /** Which model in the chain actually served the run (last successful one). */
  modelUsed: string;
  source: CredentialSource;
  runId: string;
}
