/**
 * Optimate-Google-Ads — public entry. The chat route calls runChatTurn() with
 * the audit, the linked client, the conversation history, and an optional
 * model override picked by the user.
 */

import { runAgent, MAX_TOKENS_TRUNCATION_MARKER } from "../_shared/base-agent";
import type { CanonicalTool } from "../_shared/tool";
import type { CredentialSource, Message, ReasoningMode, Usage } from "../_shared/llm/types";
import { getOptiMateDefaultModels } from "../_shared/optimate-default-models";
import {
  AGENT_NAME,
  buildSystemPromptForAudit,
  buildSystemPromptForPortfolio,
  conversionActionCategoriesForClient,
  conversionActionsForClient,
} from "./config";
import { getAccountOverview } from "./tools/get-account-overview";
import { getCampaignPerformance } from "./tools/get-campaign-performance";
import { getAdGroupPerformance } from "./tools/get-ad-group-performance";
import { getSearchTerms } from "./tools/get-search-terms";
import { getNegativeKeywordLists } from "./tools/get-negative-keyword-lists";
import { getAdAssetPerformance } from "./tools/get-ad-asset-performance";
import { getBudgetManagementEmail } from "./tools/get-budget-management-email";
import { getWeeklyTrendNote } from "./tools/get-weekly-trend-note";
import { getWeeklyMetricTable } from "./tools/get-weekly-metric-table";
import { getMonthlyMetricTable } from "./tools/get-monthly-metric-table";
import { growthToolsRead } from "./tools/growth-tools-read";
import { createGmailDraftTool } from "./tools/create-gmail-draft";
import { proposeNegativeKeywords } from "./tools/propose-negative-keywords";
import { proposeNklCreate } from "./tools/propose-nkl-create";
import { proposeNklUpdate } from "./tools/propose-nkl-update";
import { proposeNklPushLive } from "./tools/propose-nkl-push-live";
import { proposeBudgetUpdate } from "./tools/propose-budget-update";
import { proposeBudgetPushLive } from "./tools/propose-budget-push-live";
import { proposeAllCampaignBudgetPush } from "./tools/propose-all-campaign-budget-push";
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
import { proposeGeoCampaignSplit } from "./tools/propose-geo-campaign-split";
import { proposeCampaignStatusChange } from "./tools/propose-campaign-status-change";
import { proposeAdGroupCreate } from "./tools/propose-ad-group-create";
import { proposeAdGroupStatusChange } from "./tools/propose-ad-group-status-change";
import { proposeKeywordsAdd } from "./tools/propose-keywords-add";
import { getCampaignProposalStatus } from "./tools/get-campaign-proposal-status";
import { listGoalRuns } from "./tools/list-goal-runs";
import { getGoalRun } from "./tools/get-goal-run";
import { getGoalProgressSummary } from "./tools/get-goal-progress-summary";
import { createGoalRun } from "./tools/create-goal-run";
import { createAccountEfficiencyGoalRun } from "./tools/create-account-efficiency-goal-run";
import { proposeScheduledTask } from "./tools/propose-scheduled-task";
import { listScheduledTasks } from "./tools/list-scheduled-tasks";
import { proposeScheduledTaskUpdate } from "./tools/propose-scheduled-task-update";
import { executeGoogleAdsAction } from "./tools/execute-google-ads-action";
import { executeGa4Action } from "./tools/execute-ga4-action";
import { executeGtmAction } from "./tools/execute-gtm-action";
import { reviewTrackingChanges } from "./tools/review-tracking-changes";
import { proposeStakeholderDeck } from "./tools/propose-stakeholder-deck";
import { proposeDeckFromTemplateTool } from "./tools/propose-deck-from-template";
import { requestConfirmTool } from "./tools/request-confirm";
import { remember } from "./tools/remember";
import { memorySearch } from "./tools/memory-search";
import { soulSet } from "./tools/soul-set";
import { getPortfolioAccountInventory } from "./tools/get-portfolio-account-inventory";
import { getPortfolioPerformanceSummary } from "./tools/get-portfolio-performance-summary";
import { getPortfolioSearchTermWastage } from "./tools/get-portfolio-search-term-wastage";
import { getSelectedClientDetails } from "./tools/get-selected-client-details";
import { getPortfolioWeeklyMetricTable } from "./tools/get-portfolio-weekly-metric-table";
import { getPortfolioMonthlyPerformanceBreakdown } from "./tools/get-portfolio-monthly-performance-breakdown";
import { resetProposalCounter } from "./tools/_propose-helpers";
import { readClientConnectionFlags } from "./tools/_client-tokens";
import { loadPinnedMemoryBlock } from "./memory-loader";
import { checkRunForCorrection, type CorrectionRequest } from "./post-run-checks";
import { logAgentStep } from "../_shared/activity-log";
import { memoryToolRoutingPrompt, shouldAttachMemoryTools } from "../_shared/memory-tool-routing";
import { getPayload } from "payload";
import payloadConfig from "@/payload.config";

export { AGENT_NAME, buildSystemPromptForAudit, buildSystemPromptForPortfolio };

const EXTERNAL_CONTEXT_BLOCKED_TOOL_NAMES = new Set([
  "create_gmail_draft",
  "remember",
  "soul_set",
  "propose_negative_keywords",
  "propose_nkl_create",
  "propose_nkl_update",
  "propose_nkl_push_live",
  "propose_budget_update",
  "propose_budget_push_live",
  "propose_all_campaign_budget_push",
  "propose_ad_copy_generate",
  "propose_ad_copy_deploy",
  "propose_campaign_restructure",
  "propose_campaign_build",
  "propose_geo_campaign_split",
  "propose_campaign_status_change",
  "propose_ad_group_create",
  "propose_ad_group_status_change",
  "propose_keywords_add",
  "create_goal_run",
  "create_account_efficiency_goal_run",
  "propose_scheduled_task",
  "propose_scheduled_task_update",
  "propose_stakeholder_deck",
  "propose_deck_from_template",
  "execute_google_ads_action",
  "execute_ga4_action",
  "execute_gtm_action",
  "review_tracking_changes",
]);

const TOOL_BUNDLE_NAMES = [
  "performance",
  "negative_keywords",
  "budget_email",
  "ad_copy",
  "seo_organic",
  "campaign_build",
  "goals",
  "scheduled_tasks",
  "decks",
  "actions",
  "memory",
] as const;

type GoogleMateToolBundleName = (typeof TOOL_BUNDLE_NAMES)[number];

const GOOGLEMATE_TOOL_ROUTER_PROMPT = `

Tool routing: you are starting with a lean GoogleMate tool set. If the user asks for specialist work and the needed tool is not visible, first call request_googlemate_tool_bundle with one or more bundles, then use the newly attached tools on the next turn. Available bundles: performance, negative_keywords, budget_email, ad_copy, seo_organic, campaign_build, goals, scheduled_tasks, decks, actions, memory. Use performance when the user asks a Google Ads/GA4/GSC data question and the exact built-in report is not visible; the performance bundle includes growth_tools_read as the future-proof read-only Growth Tools bridge. Use actions when the user asks to apply, create, update, pause, enable, publish, deploy, push, or set up live changes via Growth Tools.${memoryToolRoutingPrompt("GoogleMate")}`;

const requestGoogleMateToolBundle: CanonicalTool<{ bundles: GoogleMateToolBundleName[]; reason?: string }> = {
  name: "request_googlemate_tool_bundle",
  description:
    "Attach specialist GoogleMate tool schemas for this run. Use before specialist Google Ads, SEO, budget email, proposal, goal, schedule, deck, or explicit memory/soul work when the required tool is not already available.",
  inputSchema: {
    type: "object",
    properties: {
      bundles: {
        type: "array",
        minItems: 1,
        items: { type: "string", enum: [...TOOL_BUNDLE_NAMES] },
        description: "Specialist bundles to attach before the next assistant turn.",
      },
      reason: { type: "string", description: "Brief reason these bundles are needed." },
    },
    required: ["bundles"],
    additionalProperties: false,
  },
  validate(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Expected an object with bundles.");
    }
    const input = raw as Record<string, unknown>;
    if (!Array.isArray(input.bundles)) throw new Error("bundles must be an array.");
    const bundles = input.bundles.filter((b): b is GoogleMateToolBundleName =>
      typeof b === "string" && (TOOL_BUNDLE_NAMES as readonly string[]).includes(b),
    );
    if (bundles.length === 0) throw new Error("At least one valid bundle is required.");
    return {
      bundles: Array.from(new Set(bundles)),
      ...(typeof input.reason === "string" ? { reason: input.reason } : {}),
    };
  },
  async execute(args) {
    return {
      ok: true,
      data: {
        attachedBundles: args.bundles,
        message: "Specialist GoogleMate tools are attached for the next turn. Continue using the newly available tools.",
      },
    };
  },
};

function allAuditTools(options?: { attachMemoryTools?: boolean }): CanonicalTool<unknown>[] {
  return [
    getAccountOverview as unknown as CanonicalTool<unknown>,
    getCampaignPerformance as unknown as CanonicalTool<unknown>,
    getAdGroupPerformance as unknown as CanonicalTool<unknown>,
    getSearchTerms as unknown as CanonicalTool<unknown>,
    getNegativeKeywordLists as unknown as CanonicalTool<unknown>,
    getAdAssetPerformance as unknown as CanonicalTool<unknown>,
    getBudgetManagementEmail as unknown as CanonicalTool<unknown>,
    getWeeklyMetricTable as unknown as CanonicalTool<unknown>,
    getMonthlyMetricTable as unknown as CanonicalTool<unknown>,
    growthToolsRead as unknown as CanonicalTool<unknown>,
    getWeeklyTrendNote as unknown as CanonicalTool<unknown>,
    createGmailDraftTool as unknown as CanonicalTool<unknown>,
    proposeNegativeKeywords as unknown as CanonicalTool<unknown>,
    proposeNklCreate as unknown as CanonicalTool<unknown>,
    proposeNklUpdate as unknown as CanonicalTool<unknown>,
    proposeNklPushLive as unknown as CanonicalTool<unknown>,
    proposeBudgetUpdate as unknown as CanonicalTool<unknown>,
    proposeBudgetPushLive as unknown as CanonicalTool<unknown>,
    proposeAllCampaignBudgetPush as unknown as CanonicalTool<unknown>,
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
    proposeGeoCampaignSplit as unknown as CanonicalTool<unknown>,
    proposeCampaignStatusChange as unknown as CanonicalTool<unknown>,
    proposeAdGroupCreate as unknown as CanonicalTool<unknown>,
    proposeAdGroupStatusChange as unknown as CanonicalTool<unknown>,
    proposeKeywordsAdd as unknown as CanonicalTool<unknown>,
    getCampaignProposalStatus as unknown as CanonicalTool<unknown>,
    listGoalRuns as unknown as CanonicalTool<unknown>,
    getGoalRun as unknown as CanonicalTool<unknown>,
    getGoalProgressSummary as unknown as CanonicalTool<unknown>,
    createGoalRun as unknown as CanonicalTool<unknown>,
    createAccountEfficiencyGoalRun as unknown as CanonicalTool<unknown>,
    proposeScheduledTask as unknown as CanonicalTool<unknown>,
    listScheduledTasks as unknown as CanonicalTool<unknown>,
    proposeScheduledTaskUpdate as unknown as CanonicalTool<unknown>,
    proposeStakeholderDeck as unknown as CanonicalTool<unknown>,
    proposeDeckFromTemplateTool as unknown as CanonicalTool<unknown>,
    executeGoogleAdsAction as unknown as CanonicalTool<unknown>,
    executeGa4Action as unknown as CanonicalTool<unknown>,
    executeGtmAction as unknown as CanonicalTool<unknown>,
    reviewTrackingChanges as unknown as CanonicalTool<unknown>,
    requestConfirmTool as unknown as CanonicalTool<unknown>,
    ...(options?.attachMemoryTools
      ? [
          memorySearch as unknown as CanonicalTool<unknown>,
          remember as unknown as CanonicalTool<unknown>,
          soulSet as unknown as CanonicalTool<unknown>,
        ]
      : []),
  ];
}

export function getTools(options?: { restrictExternalContextActions?: boolean; attachMemoryTools?: boolean }): CanonicalTool<unknown>[] {
  return applyToolRestrictions(allAuditTools(options), options);
}

function applyToolRestrictions(
  tools: CanonicalTool<unknown>[],
  options?: { restrictExternalContextActions?: boolean },
): CanonicalTool<unknown>[] {
  if (!options?.restrictExternalContextActions) return tools;
  return tools.filter((tool) => !EXTERNAL_CONTEXT_BLOCKED_TOOL_NAMES.has(tool.name));
}

const AUDIT_TOOL_BUNDLES: Record<GoogleMateToolBundleName, CanonicalTool<unknown>[]> = {
  performance: [getCampaignPerformance, getAdGroupPerformance, getSearchTerms, getAdAssetPerformance, getWeeklyMetricTable, getMonthlyMetricTable, growthToolsRead, getWeeklyTrendNote] as unknown as CanonicalTool<unknown>[],
  negative_keywords: [getSearchTerms, getNegativeKeywordLists, proposeNegativeKeywords, proposeNklCreate, proposeNklUpdate, proposeNklPushLive] as unknown as CanonicalTool<unknown>[],
  budget_email: [getBudgetManagementEmail, getWeeklyTrendNote, getWeeklyMetricTable, getMonthlyMetricTable, createGmailDraftTool, proposeBudgetUpdate, proposeBudgetPushLive, proposeAllCampaignBudgetPush] as unknown as CanonicalTool<unknown>[],
  ad_copy: [getAdAssetPerformance, proposeAdCopyGenerate, proposeAdCopyDeploy] as unknown as CanonicalTool<unknown>[],
  seo_organic: [getGa4Overview, getGscOverview, getGscBrandedSplit, getGscIndexingStatus, getSerpDisplacement, getSerpDisplacementAlerts, getAiVisibility] as unknown as CanonicalTool<unknown>[],
  campaign_build: [proposeCampaignRestructure, proposeCampaignBuild, proposeGeoCampaignSplit, proposeCampaignStatusChange, proposeAdGroupCreate, proposeAdGroupStatusChange, proposeKeywordsAdd, getCampaignProposalStatus, requestConfirmTool] as unknown as CanonicalTool<unknown>[],
  goals: [listGoalRuns, getGoalRun, getGoalProgressSummary, createGoalRun, createAccountEfficiencyGoalRun] as unknown as CanonicalTool<unknown>[],
  scheduled_tasks: [proposeScheduledTask, listScheduledTasks, proposeScheduledTaskUpdate] as unknown as CanonicalTool<unknown>[],
  decks: [proposeStakeholderDeck, proposeDeckFromTemplateTool] as unknown as CanonicalTool<unknown>[],
  actions: [executeGoogleAdsAction, executeGa4Action, executeGtmAction, reviewTrackingChanges] as unknown as CanonicalTool<unknown>[],
  memory: [memorySearch, remember, soulSet] as unknown as CanonicalTool<unknown>[],
};

export function getGoogleMateInitialTools(messages: Message[], options?: { restrictExternalContextActions?: boolean }): CanonicalTool<unknown>[] {
  const baseTools = [
    requestGoogleMateToolBundle,
    getAccountOverview,
    growthToolsRead,
    getClientDetails,
  ] as unknown as CanonicalTool<unknown>[];
  const bundles = detectInitialToolBundles(messages);
  if (shouldAttachMemoryTools(messages)) bundles.push("memory");
  return dedupeTools([
    ...baseTools,
    ...toolsForBundles(bundles),
  ], options);
}

function toolsForBundles(bundleNames: GoogleMateToolBundleName[]): CanonicalTool<unknown>[] {
  return bundleNames.flatMap((bundleName) => AUDIT_TOOL_BUNDLES[bundleName] ?? []);
}

function dedupeTools(
  tools: CanonicalTool<unknown>[],
  options?: { restrictExternalContextActions?: boolean },
): CanonicalTool<unknown>[] {
  return applyToolRestrictions(
    Array.from(new Map(tools.map((tool) => [tool.name, tool])).values()),
    options,
  );
}

function detectInitialToolBundles(messages: Message[]): GoogleMateToolBundleName[] {
  const text = extractConversationText(messages).toLowerCase();
  const bundles = new Set<GoogleMateToolBundleName>();
  const addIf = (bundle: GoogleMateToolBundleName, pattern: RegExp) => {
    if (pattern.test(text)) bundles.add(bundle);
  };
  addIf("negative_keywords", /negative|nkl|search term|wast(e|ed)|irrelevant quer|exclude/);
  addIf("budget_email", /budget|spend|pacing|draft|email|gmail|push live|allocation/);
  addIf("ad_copy", /ad copy|rsa|headline|description|asset|creative/);
  addIf("seo_organic", /ga4|gsc|search console|organic|seo|serp|index|branded|ai visibility|overlap/);
  addIf("campaign_build", /campaign build|restructure|geo|location|status|pause|enable|ad group|keyword|proposal/);
  addIf("goals", /goal|objective|progress|goal run|efficiency/);
  addIf("scheduled_tasks", /schedule|scheduled task|remind|recurring|cron/);
  addIf("decks", /deck|slides|stakeholder|presentation|template/);
  addIf("actions", /\b(apply|execute|create|update|pause|enable|publish|deploy|push|set up|setup|make live|go live)\b|audience|key event|gtm|tag manager|tag|trigger|variable/);
  addIf("performance", /performance|campaign|ad group|metric|cpa|roas|conversion|click|impression|ctr|cpc|weekly|monthly|trend/);
  return Array.from(bundles);
}

function resolveGoogleMateToolBundles(
  event: { toolName: string; input: unknown },
  options?: { restrictExternalContextActions?: boolean },
): CanonicalTool<unknown>[] {
  if (event.toolName !== requestGoogleMateToolBundle.name) return [];
  const rawBundles = event.input && typeof event.input === "object" && !Array.isArray(event.input)
    ? (event.input as Record<string, unknown>).bundles
    : null;
  const bundles = Array.isArray(rawBundles)
    ? rawBundles.filter((b): b is GoogleMateToolBundleName => typeof b === "string" && (TOOL_BUNDLE_NAMES as readonly string[]).includes(b))
    : [];
  return dedupeTools(toolsForBundles(Array.from(new Set(bundles))), options);
}

function withGoogleMateToolRouterPrompt(systemPrompt: string): string {
  return `${systemPrompt}${GOOGLEMATE_TOOL_ROUTER_PROMPT}`;
}

export function getPortfolioTools(options?: { restrictExternalContextActions?: boolean; attachMemoryTools?: boolean }): CanonicalTool<unknown>[] {
  const tools = [
    getPortfolioAccountInventory as unknown as CanonicalTool<unknown>,
    getPortfolioPerformanceSummary as unknown as CanonicalTool<unknown>,
    getPortfolioSearchTermWastage as unknown as CanonicalTool<unknown>,
    getSelectedClientDetails as unknown as CanonicalTool<unknown>,
    getPortfolioWeeklyMetricTable as unknown as CanonicalTool<unknown>,
    getPortfolioMonthlyPerformanceBreakdown as unknown as CanonicalTool<unknown>,
    getBudgetManagementEmail as unknown as CanonicalTool<unknown>,
    createGmailDraftTool as unknown as CanonicalTool<unknown>,
    requestConfirmTool as unknown as CanonicalTool<unknown>,
    ...(options?.attachMemoryTools
      ? [
          memorySearch as unknown as CanonicalTool<unknown>,
          remember as unknown as CanonicalTool<unknown>,
          soulSet as unknown as CanonicalTool<unknown>,
        ]
      : []),
  ];
  if (!options?.restrictExternalContextActions) return tools;
  return tools.filter((tool) => !EXTERNAL_CONTEXT_BLOCKED_TOOL_NAMES.has(tool.name));
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
  googleAdsCustomerId?: string | null;
  ga4PropertyId?: string | null;
  ga4MeasurementId?: string | null;
  gtmContainerId?: string | null;
  expectedEvents?: string | null;
  dashboardConversionActions?: string | null;
  conversionActionCategories?: Array<{ label?: string; color?: string; actions?: string }> | null;
  phoneCallConversionActions?: string | null;
  formSubmitConversionActions?: string | null;
}

export interface RunChatTurnInput {
  audit: AuditDocLike;
  client: ClientDocLike | null;
  /** Full conversation history; the latest user message is the last entry. */
  messages: Message[];
  /** Canonical model name; falls back to the configured default when omitted
   *  (the OptiMate Settings global, or DEFAULT_CHAT_MODEL if unset). */
  modelOverride?: string;
  /**
   * True for unattended runs (scheduled tasks / cron). When set and no
   * modelOverride is given, the agent uses the configured *autonomous* default
   * model instead of the chat default. Ignored when modelOverride is present.
   */
  autonomous?: boolean;
  /**
   * Logged-in CMS user id. Threaded into the agent context so tools that
   * scope to ownership (e.g. list_scheduled_tasks, propose_scheduled_task)
   * can read the right rows and apply-handlers can stamp `createdBy`.
   * Required for scheduled-task tools; optional for everything else.
   */
  userId?: number;
  /** True when the latest user message includes untrusted external content, e.g. a fetched Gmail body. */
  restrictExternalContextActions?: boolean;
  /** Per-request reasoning mode. Defaults to off for routine chat turns. */
  reasoningMode?: ReasoningMode;
  /** Disable model failover for strict benchmark runs where fallback would invalidate the result. */
  disableFallbacks?: boolean;
}

export interface RunPortfolioChatTurnInput {
  messages: Message[];
  modelOverride?: string;
  userId?: number;
  restrictExternalContextActions?: boolean;
  reasoningMode?: ReasoningMode;
  selectedAccountRefs?: Array<string | number>;
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

const DEFAULT_FALLBACKS = ["kimi-k2.6", "minimax-m3"];

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

export async function runPortfolioChatTurn(input: RunPortfolioChatTurnInput): Promise<RunChatTurnResult> {
  const { messages, modelOverride, userId, restrictExternalContextActions, reasoningMode, selectedAccountRefs } = input;
  const pinnedMemory = await loadPinnedMemoryBlock([], { soulAgentKeys: ["google-ads"] });
  const systemPrompt = buildSystemPromptForPortfolio({
    pinnedMemoryBlock: pinnedMemory.text,
    recentMessages: messages,
  });
  let modelRequested: string;
  if (modelOverride) {
    modelRequested = modelOverride;
  } else {
    const defaults = await getOptiMateDefaultModels();
    modelRequested = defaults.defaultChatModel;
  }
  const result = await runAgent({
    agentName: AGENT_NAME,
    systemPrompt,
    tools: getPortfolioTools({
      restrictExternalContextActions,
      attachMemoryTools: shouldAttachMemoryTools(messages),
    }),
    initialMessages: messages,
    model: modelRequested,
    fallbackModels: DEFAULT_FALLBACKS,
    maxTokens: CHAT_MAX_TOKENS,
    reasoningMode,
    context: {
      mode: "portfolio",
      ...(selectedAccountRefs && selectedAccountRefs.length > 0 ? { selectedAccountRefs } : {}),
      ...(userId !== undefined ? { userId } : {}),
    },
  });
  const reply = extractReplyText(result.finalMessage);
  resetProposalCounter(result.runId);
  const proposals = await fetchProposalsForRun(result.runId);
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

export async function runChatTurn(input: RunChatTurnInput): Promise<RunChatTurnResult> {
  const { audit, client, messages, modelOverride, userId, restrictExternalContextActions, autonomous, reasoningMode, disableFallbacks } = input;
  if (!audit.customerId || !String(audit.customerId).trim()) {
    throw new Error("Audit has no Customer ID; cannot run agent.");
  }

  const connectionFlags = await readClientConnectionFlags(client?.id ?? null);
  // Lazy-loaded memory: only pinned (importance ≥ 80) facts for this client
  // plus all/general and Google Ads-scoped soul aspects. Everything else stays
  // in the DB and surfaces via the memory_search tool when the agent asks for it.
  const pinnedMemory = await loadPinnedMemoryBlock(
    client?.id !== undefined && client?.id !== null ? [client.id] : [],
    { soulAgentKeys: ["google-ads"] },
  );
  const systemPrompt = withGoogleMateToolRouterPrompt(buildSystemPromptForAudit(audit, client, connectionFlags, {
    pinnedMemoryBlock: pinnedMemory.text,
    recentMessages: messages,
  }));
  const conversionActions = conversionActionsForClient(client);
  const conversionActionCategories = conversionActionCategoriesForClient(client);

  // Resolve the effective model. Explicit override wins; otherwise use the
  // configured default (chat vs autonomous), which itself falls back to the
  // registry constants when the global is unset/stale.
  let modelRequested: string;
  if (modelOverride) {
    modelRequested = modelOverride;
  } else {
    const defaults = await getOptiMateDefaultModels();
    modelRequested = autonomous ? defaults.defaultAutonomousModel : defaults.defaultChatModel;
  }

  const effectiveCustomerId = String(client?.googleAdsCustomerId || audit.customerId).replace(/-/g, "");
  const agentContext = {
    customerId: effectiveCustomerId,
    clientId: client?.id,
    auditId: audit.id,
    clientName: client?.name ?? audit.businessName ?? null,
    ga4PropertyId: client?.ga4PropertyId ?? null,
    ga4MeasurementId: client?.ga4MeasurementId ?? null,
    gtmContainerId: client?.gtmContainerId ?? null,
    expectedEvents: client?.expectedEvents ?? null,
    conversionActions,
    conversionActionCategories,
    ...(userId !== undefined ? { userId } : {}),
  };

  let result = await runAgent({
    agentName: AGENT_NAME,
    systemPrompt,
    tools: getGoogleMateInitialTools(messages, { restrictExternalContextActions }),
    initialMessages: messages,
    model: modelRequested,
    fallbackModels: disableFallbacks ? [] : DEFAULT_FALLBACKS,
    maxTokens: CHAT_MAX_TOKENS,
    reasoningMode,
    context: agentContext,
    resolveToolBundles: (event) => resolveGoogleMateToolBundles(event, { restrictExternalContextActions }),
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
      tools: getGoogleMateInitialTools(retryMessages, { restrictExternalContextActions }),
      initialMessages: retryMessages,
      model: modelRequested,
      fallbackModels: disableFallbacks ? [] : DEFAULT_FALLBACKS,
      maxTokens: CHAT_MAX_TOKENS,
      reasoningMode,
      context: agentContext,
      resolveToolBundles: (event) => resolveGoogleMateToolBundles(event, { restrictExternalContextActions }),
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
    const text = messageText(m);
    if (text.trim().length > 0) return text;
  }
  return "";
}

function extractConversationText(messages: Message[]): string {
  return messages.map(messageText).join("\n");
}

function messageText(message: Message): string {
  return message.content
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");
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
