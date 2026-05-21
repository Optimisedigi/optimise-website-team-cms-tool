/**
 * Optimate-Google-Ads — public entry. The chat route calls runChatTurn() with
 * the audit, the linked client, the conversation history, and an optional
 * model override picked by the user.
 */

import { runAgent, MAX_TOKENS_TRUNCATION_MARKER } from "../_shared/base-agent";
import type { CanonicalTool } from "../_shared/tool";
import type { CredentialSource, Message, Usage } from "../_shared/llm/types";
import { DEFAULT_CHAT_MODEL } from "../_shared/llm/registry";
import { AGENT_NAME, buildSystemPromptForAudit, conversionActionsForClient } from "./config";
import { getAccountOverview } from "./tools/get-account-overview";
import { getCampaignPerformance } from "./tools/get-campaign-performance";
import { getSearchTerms } from "./tools/get-search-terms";
import { getBudgetManagementEmail } from "./tools/get-budget-management-email";
import { createGmailDraftTool } from "./tools/create-gmail-draft";
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
import { getSerpDisplacement } from "./tools/get-serp-displacement";
import { getSerpDisplacementAlerts } from "./tools/get-serp-displacement-alerts";
import { getAiVisibility } from "./tools/get-ai-visibility";
import { getClientDetails } from "./tools/get-client-details";
import { proposeCampaignRestructure } from "./tools/propose-campaign-restructure";
import { proposeCampaignBuild } from "./tools/propose-campaign-build";
import { proposeAdGroupCreate } from "./tools/propose-ad-group-create";
import { proposeKeywordsAdd } from "./tools/propose-keywords-add";
import { getCampaignProposalStatus } from "./tools/get-campaign-proposal-status";
import { proposeScheduledTask } from "./tools/propose-scheduled-task";
import { listScheduledTasks } from "./tools/list-scheduled-tasks";
import { proposeScheduledTaskUpdate } from "./tools/propose-scheduled-task-update";
import { proposeStakeholderDeck } from "./tools/propose-stakeholder-deck";
import { proposeDeckFromTemplateTool } from "./tools/propose-deck-from-template";
import { requestConfirmTool } from "./tools/request-confirm";
import { remember } from "./tools/remember";
import { memorySearch } from "./tools/memory-search";
import { soulSet } from "./tools/soul-set";
import { resetProposalCounter } from "./tools/_propose-helpers";
import { readClientConnectionFlags } from "./tools/_client-tokens";
import { loadPinnedMemoryBlock } from "./memory-loader";
import { checkRunForCorrection, type CorrectionRequest } from "./post-run-checks";
import { logAgentStep } from "../_shared/activity-log";
import { getPayload } from "payload";
import payloadConfig from "@/payload.config";

export { AGENT_NAME, buildSystemPromptForAudit };

export function getTools(): CanonicalTool<unknown>[] {
  return [
    getAccountOverview as unknown as CanonicalTool<unknown>,
    getCampaignPerformance as unknown as CanonicalTool<unknown>,
    getSearchTerms as unknown as CanonicalTool<unknown>,
    getBudgetManagementEmail as unknown as CanonicalTool<unknown>,
    createGmailDraftTool as unknown as CanonicalTool<unknown>,
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
    getSerpDisplacement as unknown as CanonicalTool<unknown>,
    getSerpDisplacementAlerts as unknown as CanonicalTool<unknown>,
    getAiVisibility as unknown as CanonicalTool<unknown>,
    getClientDetails as unknown as CanonicalTool<unknown>,
    proposeCampaignRestructure as unknown as CanonicalTool<unknown>,
    proposeCampaignBuild as unknown as CanonicalTool<unknown>,
    proposeAdGroupCreate as unknown as CanonicalTool<unknown>,
    proposeKeywordsAdd as unknown as CanonicalTool<unknown>,
    getCampaignProposalStatus as unknown as CanonicalTool<unknown>,
    proposeScheduledTask as unknown as CanonicalTool<unknown>,
    listScheduledTasks as unknown as CanonicalTool<unknown>,
    proposeScheduledTaskUpdate as unknown as CanonicalTool<unknown>,
    proposeStakeholderDeck as unknown as CanonicalTool<unknown>,
    proposeDeckFromTemplateTool as unknown as CanonicalTool<unknown>,
    requestConfirmTool as unknown as CanonicalTool<unknown>,
    remember as unknown as CanonicalTool<unknown>,
    memorySearch as unknown as CanonicalTool<unknown>,
    soulSet as unknown as CanonicalTool<unknown>,
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

export interface ConfirmRequestSummary {
  /** Server-minted UUID; mirrors what the chat UI receives. */
  confirmId: string;
  /** Which propose tool the agent intends to call next. */
  proposalType: "campaign-restructure" | "campaign-build";
  /** Sentence shown next to the Yes/No buttons. */
  wording: string;
  /** Settings the agent would replay verbatim to the propose tool on Yes. */
  draftSettings: Record<string, unknown>;
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
  /** request_confirm payloads emitted during this turn, in call order. */
  confirmRequests: ConfirmRequestSummary[];
}

const DEFAULT_FALLBACKS = ["kimi-k2.6", "minimax-m2.7"];

/**
 * Max output tokens per LLM call for chat turns.
 *
 * Raised from 2,300 to 8,192 after the "push to Gmail" silent-failure
 * incident (May 2026): 2,300 was clobbering legitimate tool-heavy turns
 * mid-emission, producing assistant messages with truncated tool_use
 * blocks. The corrective-retry path then 400'd with "tool_use ids were
 * found without tool_result blocks immediately after" and the user saw
 * the model promise an action it never delivered.
 *
 * 8,192 matches the upper end of what Sonnet 4.6 + adaptive thinking
 * needs to emit a Gmail draft tool call containing the full budget email
 * HTML plus a comparison callout, without forcing truncation recovery to
 * run on the hot path. Worst-case extra spend per turn vs. 2,300 is
 * ~$0.09 at Sonnet 4.6 output pricing, and only on turns the model
 * actually wants to fill — most stay well below 2,300.
 *
 * Hallucination blast-radius bounding (the original reason for 2,300)
 * moves to post-run-checks, which is the right layer: that detector
 * catches the Azores-style misfire after the fact and replays a
 * corrective turn, without breaking legitimate large emissions.
 */
const CHAT_MAX_TOKENS = 8192;

export async function runChatTurn(input: RunChatTurnInput): Promise<RunChatTurnResult> {
  const { audit, client, messages, modelOverride, userId } = input;
  if (!audit.customerId || !String(audit.customerId).trim()) {
    throw new Error("Audit has no Customer ID; cannot run agent.");
  }

  const connectionFlags = await readClientConnectionFlags(client?.id ?? null);
  // Lazy-loaded memory: only pinned (importance ≥ 80) facts for this client
  // plus all soul aspects. Everything else stays in the DB and surfaces via
  // the memory_search tool when the agent asks for it.
  const pinnedMemory = await loadPinnedMemoryBlock(
    client?.id !== undefined && client?.id !== null ? [client.id] : [],
  );
  const systemPrompt = buildSystemPromptForAudit(audit, client, connectionFlags, {
    pinnedMemoryBlock: pinnedMemory.text,
    recentMessages: messages,
  });
  const conversionActions = conversionActionsForClient(client);

  const modelRequested = modelOverride ?? DEFAULT_CHAT_MODEL;

  const agentContext = {
    customerId: String(audit.customerId).replace(/-/g, ""),
    clientId: client?.id,
    auditId: audit.id,
    conversionActions,
    ...(userId !== undefined ? { userId } : {}),
  };

  let result = await runAgent({
    agentName: AGENT_NAME,
    systemPrompt,
    tools: getTools(),
    initialMessages: messages,
    model: modelRequested,
    fallbackModels: DEFAULT_FALLBACKS,
    maxTokens: CHAT_MAX_TOKENS,
    context: agentContext,
  });

  let reply = extractReplyText(result.finalMessage);

  // Post-run safety net. Sonnet 4.6 occasionally returns a final text reply
  // without making the tool call the user actually asked for ("Building the
  // draft now" with no create_gmail_draft call) or, worse, goes fully
  // off-topic with no tool calls at all (the Azores misfire). When that
  // happens, replay the conversation with a corrective synthetic user
  // message and let the agent retry once. Most retries succeed because the
  // model now has explicit feedback about its mistake.
  const lastUserText = extractLastUserText(messages);
  const toolNamesCalled = extractToolNamesCalled(result.steps);
  const correction = checkRunForCorrection(lastUserText, reply, toolNamesCalled);
  if (correction) {
    await logCorrectionRetry({
      agentRunId: result.runId,
      reason: correction.reason,
      clientId: client?.id,
    });
    // Fix A: scrub any tool_use blocks out of the prior assistant message
    // before splicing a plain-text user message after it. Without this,
    // any orphan or truncated tool_use that snuck through (e.g. from a
    // model that emitted tool_use AND text but base-agent's max_tokens
    // recovery missed it) would cause Anthropic to 400 the retry with
    // "tool_use ids were found without tool_result blocks immediately
    // after". base-agent already handles the canonical max_tokens case;
    // this is the belt-and-braces second layer.
    const sanitizedFinal: Message = {
      role: result.finalMessage.role,
      content: result.finalMessage.content
        .filter((p) => p.type !== "tool_use")
        .map((p) => p),
    };
    if (sanitizedFinal.content.length === 0) {
      sanitizedFinal.content = [
        { type: "text", text: MAX_TOKENS_TRUNCATION_MARKER },
      ];
    }
    const retryMessages: Message[] = [
      ...messages,
      sanitizedFinal,
      { role: "user", content: [{ type: "text", text: correction.correctionNote }] },
    ];
    result = await runAgent({
      agentName: AGENT_NAME,
      systemPrompt,
      tools: getTools(),
      initialMessages: retryMessages,
      model: modelRequested,
      fallbackModels: DEFAULT_FALLBACKS,
      maxTokens: CHAT_MAX_TOKENS,
      context: agentContext,
      // Reuse the original runId so the activity-log timeline shows the
      // retry as a continuation, not a fresh run.
      runId: result.runId,
    });
    reply = extractReplyText(result.finalMessage);
  }

  // Drain the per-turn proposal counter so a long-lived process doesn't leak
  // entries. Safe even if the run threw — we always reach this point because
  // runAgent surfaces errors via thrown exceptions, in which case we never
  // get here. Successful turns clear their bucket.
  resetProposalCounter(result.runId);

  // Query the approval queue for rows produced during this run so the chat
  // route can show inline proposal cards. We key off agentRunId rather than
  // a timestamp window because runs can be slower than the wall-clock skew
  // between Payload’s SQLite writes and our `new Date()` capture.
  const proposals = await fetchProposalsForRun(result.runId);

  // Extract any request_confirm tool calls from this run so the chat client
  // can render Yes/No bubbles. The base agent stringifies each tool result
  // before passing it back to the LLM; we parse it back here.
  const confirmRequests = extractConfirmRequests(result.steps);

  return {
    reply,
    runId: result.runId,
    modelRequested,
    modelUsed: result.modelUsed,
    source: result.source,
    totalUsage: result.totalUsage,
    proposals,
    confirmRequests,
  };
}

/**
 * Pull the assistant's user-visible text out of the final Message. We
 * filter to text parts because tool_use parts can also appear in a final
 * message when the model wants to call a tool one more time — those
 * shouldn't end up in the chat reply.
 */
function extractReplyText(finalMessage: { content: Array<{ type: string; text?: string }> }): string {
  return finalMessage.content
    .filter((p): p is { type: "text"; text: string } => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n")
    .trim();
}

/**
 * Pull the text of the most recent user message out of the conversation
 * history. The post-run checks need it to look for action verbs. We walk
 * backwards so we get the latest turn even if assistant messages are
 * interleaved.
 */
function extractLastUserText(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.role !== "user") continue;
    const text = m.content
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n");
    if (text.trim().length > 0) return text;
  }
  return "";
}

/**
 * Enumerate tool names called this run. Used by the post-run checks to
 * detect promised-but-not-delivered actions.
 */
function extractToolNamesCalled(
  steps: Array<{ type: string; toolName?: string }>,
): string[] {
  const out: string[] = [];
  for (const step of steps) {
    if (step.type === "tool-call" && typeof step.toolName === "string") {
      out.push(step.toolName);
    }
  }
  return out;
}

/**
 * Log a retry to the activity-log so we can audit how often the safety net
 * fires. Best-effort — the run already succeeded by this point, we just
 * want a forensics breadcrumb.
 */
async function logCorrectionRetry(opts: {
  agentRunId: string;
  reason: CorrectionRequest["reason"];
  clientId?: string | number;
}): Promise<void> {
  try {
    await logAgentStep({
      agentRunId: opts.agentRunId,
      agentName: AGENT_NAME,
      step: 99,
      type: "agent_error",
      title: `optimate-google-ads retry triggered: ${opts.reason}`,
      description: `Post-run safety net fired (${opts.reason}); replaying the conversation with a corrective system note.`,
      clientId: opts.clientId,
    });
  } catch (err) {
    console.warn("[optimate] Failed to log correction retry:", (err as Error).message);
  }
}

function extractConfirmRequests(
  steps: Array<{ type: string; toolName?: string; output?: unknown }>,
): ConfirmRequestSummary[] {
  const out: ConfirmRequestSummary[] = [];
  for (const step of steps) {
    if (step.type !== "tool-call" || step.toolName !== "request_confirm") continue;
    if (typeof step.output !== "string") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(step.output);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const p = parsed as Record<string, unknown>;
    const confirmId = typeof p.confirmId === "string" ? p.confirmId : null;
    const proposalType = p.proposalType;
    const wording = typeof p.wording === "string" ? p.wording : null;
    const draftSettings = p.draftSettings;
    if (!confirmId || !wording) continue;
    if (proposalType !== "campaign-restructure" && proposalType !== "campaign-build") continue;
    if (!draftSettings || typeof draftSettings !== "object" || Array.isArray(draftSettings)) continue;
    out.push({
      confirmId,
      proposalType,
      wording,
      draftSettings: draftSettings as Record<string, unknown>,
    });
  }
  return out;
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
