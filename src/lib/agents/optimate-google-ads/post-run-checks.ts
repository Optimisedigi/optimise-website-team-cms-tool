/**
 * Post-run safety checks for OptiMate.
 *
 * Sonnet 4.6 (and other agentic models) occasionally drop the ball at the
 * final step: they gather data, then return a text reply CLAIMING they did
 * the action without actually calling the tool. The "Building the draft
 * now" phrasing with no `create_gmail_draft` call in the run is the
 * canonical example.
 *
 * Two checks cover the failure modes we've seen:
 *
 *  1. Zero-tool-call-on-action: the user message contains an action verb
 *     ("create", "draft", "push", "send", etc.) but the run made NO tool
 *     calls at all. The Azores hallucination is the classic case; the
 *     model went off-topic and emitted prose instead of doing anything.
 *
 *  2. Promised-but-not-delivered: the reply claims an action ("Building
 *     the draft now", "Queueing the proposal", etc.) but the corresponding
 *     tool was NOT called this run. Tool calls earlier in the run mean
 *     check #1 doesn't fire, but the model still narrated intent instead
 *     of finishing the job.
 *
 * Both checks are pure: input is `(userMessage, finalReply, toolNamesCalledThisRun)`,
 * output is `null` (no problem) or a `CorrectionRequest` with a system note
 * the caller can replay into a one-shot retry.
 */

/**
 * Detected problem requiring a retry. `reason` is for logging; `correctionNote`
 * is the synthetic user-message text appended to the conversation before the
 * retry runs. Phrasing is direct and imperative because that's what works
 * best at correcting Sonnet drift in our tests.
 */
export interface CorrectionRequest {
  /** Stable identifier for logging/metrics. */
  reason:
    | "zero_tool_call_on_action"
    | "promised_but_not_delivered"
    | "budget_email_without_template"
    | "unverified_metric_breakdown"
    | "unverified_google_ads_data";
  /** Synthetic user message replayed to the agent for one corrective retry. */
  correctionNote: string;
}

/**
 * Action verbs in the USER message that signal "do something, not just answer".
 * Matched as case-insensitive whole-word substrings. Tuned to avoid false
 * positives: "what's our spend?" should NOT trigger.
 *
 * If you add a verb here, also map any tool the verb implies into
 * ACTION_CLAIM_TO_TOOL below so promised-but-not-delivered catches that
 * flow too.
 */
const ACTION_VERBS: readonly string[] = [
  "create",
  "draft",
  "push to gmail",
  "push it to gmail",
  "send me a draft",
  "send it as a draft",
  "save to gmail",
  "save as a draft",
  "save as draft",
  "drop into gmail",
  "drop this in gmail",
  "drop it in gmail",
  "make me a draft",
  "make a draft",
  "queue",
  "propose",
  "schedule a",
  "schedule the",
  "set up a",
  "add a negative",
  "add negatives",
  "build the",
  "restructure",
  "pause",
  "enable",
  "activate",
  "reactivate",
  "turn on",
  "turn off",
  "turn back on",
  "remember that",
  "save that to memory",
  "budget management email",
  "budget email",
  "budget pacing email",
  "mtd spend to budget email",
  "budget update email",
  "monthly budget management report",
];

/**
 * Action-claim phrases the AGENT might emit in its REPLY when it lies about
 * having done something. Mapped to the tool(s) it should have called.
 *
 * Matching is case-insensitive substring. If the reply contains any phrase
 * here AND none of the mapped tools were called this run, fire the
 * promised-but-not-delivered correction.
 *
 * Phrasings live here rather than in the prompt because the prompt already
 * tells the model what to do; this check is the safety net for when it
 * ignores the prompt.
 */
const ACTION_CLAIMS: ReadonlyArray<{
  phrases: readonly string[];
  tools: readonly string[];
  /** Used in the correction note to tell the model what to do. */
  expectedToolHint: string;
}> = [
  {
    phrases: [
      "building the draft",
      "creating the draft",
      "creating the gmail draft",
      "creating a draft",
      "drafting the email",
      "drafting it now",
      "saving the draft",
      "saving to gmail",
      "pushing to gmail",
      "pushing it to gmail",
      "dropping it into gmail",
      "dropping in gmail",
      "i'll draft",
      "i will draft",
      "i'll create the draft",
      "i will create the draft",
      "i'm building the draft",
      "i am building the draft",
      // Future-tense "about to do it" narrations. These are the canonical
      // Sonnet-4.6 lie: the model agrees to the action, narrates the next
      // step, then returns text instead of calling the tool. Real example
      // from the chat log: "Now I'll build the callout with the four-week
      // trend and push to Gmail." Without these the safety net misses any
      // future-tense claim because every existing phrase above is either
      // present-continuous ("building the draft") or already mid-action
      // ("i'm building").
      "i'll push to gmail",
      "i will push to gmail",
      "i'll push it to gmail",
      "i will push it to gmail",
      "i'll save to gmail",
      "i will save to gmail",
      "i'll save it to gmail",
      "i will save it to gmail",
      "i'll save as a draft",
      "i will save as a draft",
      "i'll save it as a draft",
      "i will save it as a draft",
      "i'll drop it into gmail",
      "i will drop it into gmail",
      "i'll drop it in gmail",
      "i will drop it in gmail",
      "i'll build the callout",
      "i will build the callout",
      "i'll build the email",
      "i will build the email",
      "now i'll build",
      "now i will build",
      "now i'll push",
      "now i will push",
      "now i'll save",
      "now i will save",
      "now i'll draft",
      "now i will draft",
      "now i'll create",
      "now i will create",
    ],
    tools: ["create_gmail_draft", "create_weekly_budget_gmail_draft", "create_monthly_budget_gmail_draft"],
    expectedToolHint:
      "Call the correct Gmail draft tool now. For weekly budget drafts use create_weekly_budget_gmail_draft. For monthly budget drafts with explicit components use create_monthly_budget_gmail_draft. For other drafts use create_gmail_draft with the HTML and subject you already pulled. Do not return text until the tool call has been made.",
  },
  {
    phrases: [
      "queueing the proposal",
      "queueing for approval",
      "queueing approval",
      "queued approval",
      "queued for approval",
      "queued the proposal",
      "queuing the proposal",
      "queuing for approval",
      "i've queued",
      "i have queued",
      "i'll queue",
      "i will queue",
    ],
    // Any propose_* tool counts; if none of them fired, we have a lie.
    // Indicator-only: we treat presence of ANY tool name starting with
    // `propose_` as satisfying this requirement (see check fn below).
    tools: ["__any_propose__"],
    expectedToolHint:
      "Call the relevant propose_* tool now with the data you already gathered. Do not return text until the tool call has been made.",
  },
  {
    phrases: [
      "pausing the campaign",
      "paused the campaign",
      "pausing campaign",
      "paused campaign",
      "enabling the campaign",
      "enabled the campaign",
      "activating the campaign",
      "activated the campaign",
      "turning the campaign on",
      "turned the campaign on",
      "turning the campaign off",
      "turned the campaign off",
      "i'll pause the campaign",
      "i will pause the campaign",
      "i'll enable the campaign",
      "i will enable the campaign",
      "i'll activate the campaign",
      "i will activate the campaign",
    ],
    tools: ["propose_campaign_status_change"],
    expectedToolHint:
      "Call propose_campaign_status_change now with exact campaign IDs and supporting numbers. Do not claim a live change was applied; queue it for approval and wait for the approvalId.",
  },
  {
    phrases: [
      "pausing the ad group",
      "paused the ad group",
      "pausing ad group",
      "paused ad group",
      "enabling the ad group",
      "enabled the ad group",
      "activating the ad group",
      "activated the ad group",
      "turning the ad group on",
      "turned the ad group on",
      "turning the ad group off",
      "turned the ad group off",
      "i'll pause the ad group",
      "i will pause the ad group",
      "i'll enable the ad group",
      "i will enable the ad group",
      "i'll activate the ad group",
      "i will activate the ad group",
    ],
    tools: ["propose_ad_group_status_change"],
    expectedToolHint:
      "Call propose_ad_group_status_change now with exact campaign/ad group IDs and supporting numbers. Do not claim a live change was applied; queue it for approval and wait for the approvalId.",
  },
  {
    phrases: [
      "scheduling the task",
      "scheduling a task",
      "setting up the schedule",
      "setting up a recurring",
      "i'll schedule",
      "i will schedule",
    ],
    tools: ["propose_scheduled_task"],
    expectedToolHint:
      "Call propose_scheduled_task now with the cron schedule and prompt you would set up. Do not return text until the tool call has been made.",
  },
  {
    phrases: [
      "saving that to memory",
      "saving to memory",
      "i'll remember",
      "i will remember",
      "i'll save that",
      "i will save that",
      "noting that for future",
    ],
    tools: ["remember"],
    expectedToolHint:
      "Call remember now with the fact you said you'd save. Do not return text until the tool call has been made.",
  },
];

/**
 * Case-insensitive substring match. Tiny helper so the two detectors share
 * one matching rule.
 */
function containsAnyPhrase(haystack: string, needles: readonly string[]): boolean {
  const lower = haystack.toLowerCase();
  return needles.some((n) => lower.includes(n.toLowerCase()));
}

/**
 * Check #1. Returns a CorrectionRequest when the user clearly asked for an
 * action but the agent run made zero tool calls.
 *
 * Returns null when:
 *   - The user message has no action verb (it's a question, not a do-it request).
 *   - At least one tool was called (even if it's the wrong one — that's a
 *     separate problem the model can recover from on its own).
 */
export function detectZeroToolCallOnAction(
  userMessage: string,
  toolNamesCalledThisRun: readonly string[],
): CorrectionRequest | null {
  if (toolNamesCalledThisRun.length > 0) return null;
  if (!containsAnyPhrase(userMessage, ACTION_VERBS)) return null;
  return {
    reason: "zero_tool_call_on_action",
    correctionNote:
      "Your previous reply made no tool calls. The user asked you to take an action, not just answer a question. " +
      "Identify the right tool from the inventory (e.g. create_gmail_draft for a one-off Gmail draft, get_budget_management_email to fetch the email HTML first, propose_* tools for changes that need approval) and call it now. " +
      "Do not return text until the tool call has been made. Do not narrate what you are about to do, just do it.",
  };
}

/**
 * Check #2. Returns a CorrectionRequest when the agent's reply claims an
 * action ("Building the draft now") but the corresponding tool was NOT
 * called in this run.
 *
 * Returns null when:
 *   - The reply has no recognised action-claim phrase.
 *   - The action claim was honoured (the right tool was called this run).
 *
 * The first matching claim wins. If the model lied about multiple things
 * in one reply (rare), we surface the first one and trust the retry to
 * sort the rest.
 */
export function detectPromisedButNotDelivered(
  reply: string,
  toolNamesCalledThisRun: readonly string[],
): CorrectionRequest | null {
  if (!reply || reply.length === 0) return null;
  const calledSet = new Set(toolNamesCalledThisRun);
  const calledAnyPropose = toolNamesCalledThisRun.some((t) => t.startsWith("propose_"));

  for (const claim of ACTION_CLAIMS) {
    if (!containsAnyPhrase(reply, claim.phrases)) continue;
    // Was at least one of the required tools called?
    const satisfied = claim.tools.some((t) => {
      if (t === "__any_propose__") return calledAnyPropose;
      return calledSet.has(t);
    });
    if (satisfied) continue;
    // Found a phrase, none of the required tools were called: that's a lie.
    return {
      reason: "promised_but_not_delivered",
      correctionNote:
        `Your previous reply claimed an action but you did not call the tool that performs it. ${claim.expectedToolHint}`,
    };
  }
  return null;
}

const MONTHLY_METRIC_PHRASES: readonly string[] = [
  "by month",
  "monthly",
  "month by month",
  "month-by-month",
  "each month",
];

const WEEKLY_METRIC_PHRASES: readonly string[] = [
  "by week",
  "weekly",
  "week by week",
  "week-by-week",
  "week-on-week",
  "wow",
];

const RATE_METRIC_PHRASES: readonly string[] = [
  "ctr",
  "cpc",
  "cpa",
  "cpl",
  "cost per lead",
  "cost/lead",
  "conversion rate",
  "conv rate",
];

const GOOGLE_ADS_DATA_PHRASES: readonly string[] = [
  "google ads",
  "campaign",
  "ad group",
  "search term",
  "spend",
  "clicks",
  "impressions",
  "conversions",
  "leads",
  "ctr",
  "cpc",
  "cpa",
  "cpl",
  "cost per lead",
  "conversion rate",
  "performance",
  "trend",
  "by month",
  "by week",
];

const GOOGLE_ADS_READ_TOOLS = new Set([
  "get_account_overview",
  "get_campaign_performance",
  "get_ad_group_performance",
  "get_search_terms",
  "get_ad_asset_performance",
  "get_weekly_metric_table",
  "get_weekly_trend_note",
  "get_monthly_metric_table",
  "get_portfolio_performance_summary",
  "get_portfolio_search_term_wastage",
  "get_portfolio_weekly_metric_table",
  "get_portfolio_monthly_performance_breakdown",
]);

function replyContainsMetricTable(reply: string): boolean {
  return /\d+(?:\.\d+)?%/.test(reply) || /\$\d/.test(reply) || /\|/.test(reply);
}

function replyContainsNumber(reply: string): boolean {
  const withoutApprovalIds = reply
    .replace(/\bapproval\s*#?\s*\d+\b/gi, "")
    .replace(/\/admin\/agent-approvals\/\d+\b/gi, "");
  return /(?:\$\s*)?\d[\d,]*(?:\.\d+)?%?/.test(withoutApprovalIds);
}

function calledGoogleAdsReadTool(toolNamesCalledThisRun: readonly string[]): boolean {
  return toolNamesCalledThisRun.some((toolName) => GOOGLE_ADS_READ_TOOLS.has(toolName));
}

const BUDGET_EMAIL_PHRASES: readonly string[] = [
  "budget management email",
  "budget email",
  "budget pacing email",
  "mtd spend to budget email",
  "mtd budget update",
  "budget update email",
  "monthly budget management report",
  "spend to budget",
];

export function detectBudgetEmailWithoutTemplate(
  userMessage: string,
  toolNamesCalledThisRun: readonly string[],
): CorrectionRequest | null {
  if (!containsAnyPhrase(userMessage, BUDGET_EMAIL_PHRASES)) return null;
  if (
    toolNamesCalledThisRun.includes("get_budget_management_email") ||
    toolNamesCalledThisRun.includes("create_weekly_budget_gmail_draft") ||
    toolNamesCalledThisRun.includes("create_monthly_budget_gmail_draft")
  ) return null;
  return {
    reason: "budget_email_without_template",
    correctionNote:
      "The user asked for a Budget Management email. You must call get_budget_management_email with mode='this_month' to verify the canonical HTML/template is available, unless this is a one-off weekly/monthly Gmail draft handled by create_weekly_budget_gmail_draft or create_monthly_budget_gmail_draft. If they only asked to see/give the email, reply with the subject and requested short summary, then ask if they want it saved as a Gmail draft. Never paste raw HTML in chat.",
  };
}

export function detectUnverifiedGoogleAdsData(
  userMessage: string,
  reply: string,
  toolNamesCalledThisRun: readonly string[],
): CorrectionRequest | null {
  if (!replyContainsNumber(reply)) return null;
  if (calledGoogleAdsReadTool(toolNamesCalledThisRun)) return null;
  if (!containsAnyPhrase(userMessage, GOOGLE_ADS_DATA_PHRASES)) return null;
  return {
    reason: "unverified_google_ads_data",
    correctionNote:
      "Your previous reply included Google Ads numbers without calling a Google Ads read tool in this run. Call the relevant read tool now, then answer only from its returned data. Do not reuse the previous numbers unless the tool confirms them.",
  };
}

export function detectUnverifiedMetricBreakdown(
  userMessage: string,
  reply: string,
  toolNamesCalledThisRun: readonly string[],
): CorrectionRequest | null {
  if (!replyContainsMetricTable(reply)) return null;
  const userAskedRate = containsAnyPhrase(userMessage, RATE_METRIC_PHRASES);
  if (!userAskedRate) return null;

  const calledSet = new Set(toolNamesCalledThisRun);
  if (containsAnyPhrase(userMessage, MONTHLY_METRIC_PHRASES) && !calledSet.has("get_monthly_metric_table") && !calledSet.has("get_portfolio_monthly_performance_breakdown")) {
    return {
      reason: "unverified_metric_breakdown",
      correctionNote:
        "Your previous reply gave monthly rate metrics without the canonical monthly validation tool. Call get_monthly_metric_table for the requested months and metrics, then answer from its rows. For CTR, use the Google Ads CTR returned by the tool and cite the clicks/impressions totals for reconciliation. Do not reuse the previous numbers unless the tool confirms them.",
    };
  }

  if (
    containsAnyPhrase(userMessage, WEEKLY_METRIC_PHRASES) &&
    !calledSet.has("get_weekly_metric_table") &&
    !calledSet.has("get_weekly_trend_note") &&
    !calledSet.has("get_portfolio_weekly_metric_table")
  ) {
    return {
      reason: "unverified_metric_breakdown",
      correctionNote:
        "Your previous reply gave weekly rate metrics without the canonical weekly validation tool. Call get_weekly_metric_table for the requested weeks and metrics, then answer from its rows. For CTR, use the Google Ads CTR returned by the tool and cite the clicks/impressions totals for reconciliation. Do not reuse the previous numbers unless the tool confirms them.",
    };
  }

  return null;
}

/**
 * Convenience wrapper: runs both checks in order and returns the first
 * correction needed, or null if the run was clean.
 *
 * Order matters: zero-tool-call is the more egregious failure mode (the
 * Azores case) so we report it first. The promised-but-not-delivered case
 * only fires when at least one tool WAS called (otherwise check #1 would
 * have caught it), so the two never overlap in practice.
 */
export function checkRunForCorrection(
  userMessage: string,
  reply: string,
  toolNamesCalledThisRun: readonly string[],
): CorrectionRequest | null {
  return (
    detectZeroToolCallOnAction(userMessage, toolNamesCalledThisRun) ??
    detectPromisedButNotDelivered(reply, toolNamesCalledThisRun) ??
    detectBudgetEmailWithoutTemplate(userMessage, toolNamesCalledThisRun) ??
    detectUnverifiedMetricBreakdown(userMessage, reply, toolNamesCalledThisRun) ??
    detectUnverifiedGoogleAdsData(userMessage, reply, toolNamesCalledThisRun)
  );
}
