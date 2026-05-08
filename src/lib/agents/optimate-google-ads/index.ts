/**
 * Optimate-Google-Ads — public entry. The chat route calls runChatTurn() with
 * the audit, the linked client, the conversation history, and an optional
 * model override picked by the user.
 */

import { runAgent } from "../_shared/base-agent";
import type { CanonicalTool } from "../_shared/tool";
import type { CredentialSource, Message, Usage } from "../_shared/llm/types";
import { DEFAULT_CHAT_MODEL } from "../_shared/llm/registry";
import { AGENT_NAME, buildSystemPromptForAudit, conversionActionsForClient } from "./config";
import { getAccountOverview } from "./tools/get-account-overview";
import { getCampaignPerformance } from "./tools/get-campaign-performance";
import { getSearchTerms } from "./tools/get-search-terms";
import { proposeNegativeKeywords } from "./tools/propose-negative-keywords";

export { AGENT_NAME, buildSystemPromptForAudit };

export function getTools(): CanonicalTool<unknown>[] {
  return [
    getAccountOverview as unknown as CanonicalTool<unknown>,
    getCampaignPerformance as unknown as CanonicalTool<unknown>,
    getSearchTerms as unknown as CanonicalTool<unknown>,
    proposeNegativeKeywords as unknown as CanonicalTool<unknown>,
  ];
}

interface AuditDocLike {
  id: string | number;
  businessName?: string | null;
  customerId?: string | null;
  monthlySpend?: number | null;
  brandTerms?: string | null;
}

interface ClientDocLike {
  id?: string | number;
  name?: string | null;
  conversionActionCategories?: Array<{ label?: string; actions?: string }> | null;
  phoneCallConversionActions?: string | null;
  formSubmitConversionActions?: string | null;
}

export interface RunChatTurnInput {
  audit: AuditDocLike;
  client: ClientDocLike | null;
  /** Full conversation history; the latest user message is the last entry. */
  messages: Message[];
  /** Canonical model name; falls back to DEFAULT_CHAT_MODEL when omitted. */
  modelOverride?: string;
}

export interface RunChatTurnResult {
  reply: string;
  runId: string;
  modelUsed: string;
  source: CredentialSource;
  totalUsage: Usage;
}

const DEFAULT_FALLBACKS = ["kimi-k2.6", "minimax-m2.7"];

export async function runChatTurn(input: RunChatTurnInput): Promise<RunChatTurnResult> {
  const { audit, client, messages, modelOverride } = input;
  if (!audit.customerId || !String(audit.customerId).trim()) {
    throw new Error("Audit has no Customer ID; cannot run agent.");
  }

  const systemPrompt = buildSystemPromptForAudit(audit, client);
  const conversionActions = conversionActionsForClient(client);

  const result = await runAgent({
    agentName: AGENT_NAME,
    systemPrompt,
    tools: getTools(),
    initialMessages: messages,
    model: modelOverride ?? DEFAULT_CHAT_MODEL,
    fallbackModels: DEFAULT_FALLBACKS,
    context: {
      customerId: String(audit.customerId).replace(/-/g, ""),
      clientId: client?.id,
      auditId: audit.id,
      conversionActions,
    },
  });

  const reply = result.finalMessage.content
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim();

  return {
    reply,
    runId: result.runId,
    modelUsed: result.modelUsed,
    source: result.source,
    totalUsage: result.totalUsage,
  };
}
