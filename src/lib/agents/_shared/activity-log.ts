/**
 * Thin helpers over the activity-log Payload collection for agent step rows.
 * Build plan: every tool call, every reasoning chunk, every final output,
 * every auth event gets one row. Reasoning is hidden by default in the admin
 * UI but stored alongside everything else so debugging is one query away.
 */

import { getPayload } from "payload";
import config from "@/payload.config";
import type { CredentialSource } from "./llm/types";

export type AgentStepType =
  | "agent_tool_call"
  | "agent_reasoning"
  | "agent_final_output"
  | "agent_error"
  | "agent_auth_event";

export interface LogStepInput {
  agentRunId: string;
  agentName: string;
  step: number;
  type: AgentStepType;
  /** Required by Payload; one-line summary the human sees. */
  title: string;
  description?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  reasoning?: string;
  model?: string;
  source?: CredentialSource;
  durationMs?: number;
  /** Optional CMS Clients ID to link the step to a client. */
  clientId?: string | number;
}

export async function logAgentStep(entry: LogStepInput): Promise<void> {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  await payload.create({
    collection: "activity-log",
    data: {
      type: entry.type,
      title: entry.title,
      description: entry.description,
      agentRunId: entry.agentRunId,
      agentName: entry.agentName,
      step: entry.step,
      toolName: entry.toolName,
      input: entry.input,
      output: entry.output,
      reasoning: entry.reasoning,
      model: entry.model,
      source: entry.source,
      durationMs: entry.durationMs,
      ...(entry.clientId !== undefined ? { client: entry.clientId } : {}),
    } as any,
    overrideAccess: true,
  });
}
