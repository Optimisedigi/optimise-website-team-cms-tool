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
import { proposeNklCreate } from "./tools/propose-nkl-create";
import { proposeNklUpdate } from "./tools/propose-nkl-update";
import { proposeNklPushLive } from "./tools/propose-nkl-push-live";
import { proposeBudgetUpdate } from "./tools/propose-budget-update";
import { proposeBudgetPushLive } from "./tools/propose-budget-push-live";
import { proposeAdCopyGenerate } from "./tools/propose-ad-copy-generate";
import { proposeAdCopyDeploy } from "./tools/propose-ad-copy-deploy";
import { getGa4Overview } from "./tools/get-ga4-overview";
import { getGscOverview } from "./tools/get-gsc-overview";
import { getGscBrandedSplit } from "./tools/get-gsc-branded-split";
import { getGscIndexingStatus } from "./tools/get-gsc-indexing-status";
import { proposeCampaignRestructure } from "./tools/propose-campaign-restructure";
import { proposeCampaignBuild } from "./tools/propose-campaign-build";
import { getCampaignProposalStatus } from "./tools/get-campaign-proposal-status";
import { proposeScheduledTask } from "./tools/propose-scheduled-task";
import { listScheduledTasks } from "./tools/list-scheduled-tasks";
import { proposeScheduledTaskUpdate } from "./tools/propose-scheduled-task-update";
import { resetProposalCounter } from "./tools/_propose-helpers";
import { readClientConnectionFlags } from "./tools/_client-tokens";
import { getPayload } from "payload";
import payloadConfig from "@/payload.config";

export { AGENT_NAME, buildSystemPromptForAudit };

export function getTools(): CanonicalTool<unknown>[] {
  return [
    getAccountOverview as unknown as CanonicalTool<unknown>,
    getCampaignPerformance as unknown as CanonicalTool<unknown>,
    getSearchTerms as unknown as CanonicalTool<unknown>,
    proposeNegativeKeywords as unknown as CanonicalTool<unknown>,
    proposeNklCreate as unknown as CanonicalTool<unknown>,
    proposeNklUpdate as unknown as CanonicalTool<unknown>,
    proposeNklPushLive as unknown as CanonicalTool<unknown>,
    proposeBudgetUpdate as unknown as CanonicalTool<unknown>,
    proposeBudgetPushLive as unknown as CanonicalTool<unknown>,
    proposeAdCopyGenerate as unknown as CanonicalTool<unknown>,
    proposeAdCopyDeploy as unknown as CanonicalTool<unknown>,
    getGa4Overview as unknown as CanonicalTool<unknown>,
    getGscOverview as unknown as CanonicalTool<unknown>,
    getGscBrandedSplit as unknown as CanonicalTool<unknown>,
    getGscIndexingStatus as unknown as CanonicalTool<unknown>,
    proposeCampaignRestructure as unknown as CanonicalTool<unknown>,
    proposeCampaignBuild as unknown as CanonicalTool<unknown>,
    getCampaignProposalStatus as unknown as CanonicalTool<unknown>,
    proposeScheduledTask as unknown as CanonicalTool<unknown>,
    listScheduledTasks as unknown as CanonicalTool<unknown>,
    proposeScheduledTaskUpdate as unknown as CanonicalTool<unknown>,
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
  /**
   * Logged-in CMS user id. Threaded into the agent context so tools that
   * scope to ownership (e.g. list_scheduled_tasks, propose_scheduled_task)
   * can read the right rows and apply-handlers can stamp `createdBy`.
   * Required for scheduled-task tools; optional for everything else.
   */
  userId?: number;
}

export interface ProposalSummary {
  id: number;
  title: string;
  proposalType: string;
  status: string;
}

export interface RunChatTurnResult {
  reply: string;
  runId: string;
  /** Model the user asked for (or our default). */
  modelRequested: string;
  /** Model that actually served the reply. Differs from modelRequested
   *  whenever the fallback chain kicked in (e.g. Anthropic 429 → Kimi). */
  modelUsed: string;
  source: CredentialSource;
  totalUsage: Usage;
  proposals: ProposalSummary[];
}

const DEFAULT_FALLBACKS = ["kimi-k2.6", "minimax-m2.7"];

export async function runChatTurn(input: RunChatTurnInput): Promise<RunChatTurnResult> {
  const { audit, client, messages, modelOverride, userId } = input;
  if (!audit.customerId || !String(audit.customerId).trim()) {
    throw new Error("Audit has no Customer ID; cannot run agent.");
  }

  const connectionFlags = await readClientConnectionFlags(client?.id ?? null);
  const systemPrompt = buildSystemPromptForAudit(audit, client, connectionFlags);
  const conversionActions = conversionActionsForClient(client);

  const modelRequested = modelOverride ?? DEFAULT_CHAT_MODEL;

  const result = await runAgent({
    agentName: AGENT_NAME,
    systemPrompt,
    tools: getTools(),
    initialMessages: messages,
    model: modelRequested,
    fallbackModels: DEFAULT_FALLBACKS,
    context: {
      customerId: String(audit.customerId).replace(/-/g, ""),
      clientId: client?.id,
      auditId: audit.id,
      conversionActions,
      ...(userId !== undefined ? { userId } : {}),
    },
  });

  // Drain the per-turn proposal counter so a long-lived process doesn't leak
  // entries. Safe even if the run threw — we always reach this point because
  // runAgent surfaces errors via thrown exceptions, in which case we never
  // get here. Successful turns clear their bucket.
  resetProposalCounter(result.runId);

  const reply = result.finalMessage.content
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim();

  // Query the approval queue for rows produced during this run so the chat
  // route can show inline proposal cards. We key off agentRunId rather than
  // a timestamp window because runs can be slower than the wall-clock skew
  // between Payload’s SQLite writes and our `new Date()` capture.
  const proposals = await fetchProposalsForRun(result.runId);

  return {
    reply,
    runId: result.runId,
    modelRequested,
    modelUsed: result.modelUsed,
    source: result.source,
    totalUsage: result.totalUsage,
    proposals,
  };
}

async function fetchProposalsForRun(agentRunId: string): Promise<ProposalSummary[]> {
  try {
    const cfg = await payloadConfig;
    const payload = await getPayload({ config: cfg });
    const result = await payload.find({
      collection: "agent-approval-queue" as never,
      where: { agentRunId: { equals: agentRunId } } as never,
      limit: 20,
      sort: "createdAt",
      overrideAccess: true,
    });
    return (result.docs as unknown as Array<{ id: number; title: string; proposalType: string; status: string }>).map((d) => ({
      id: d.id,
      title: d.title,
      proposalType: d.proposalType,
      status: d.status,
    }));
  } catch {
    return [];
  }
}
