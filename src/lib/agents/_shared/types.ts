/**
 * Top-level shapes the agent loop produces and consumes.
 */

import type { Message, Usage, CredentialSource } from "./llm/types";
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
  /** Optional cancellation. */
  signal?: AbortSignal;
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
