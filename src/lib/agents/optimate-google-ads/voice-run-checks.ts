export type VoiceCorrectionReason =
  | "zero_tool_call_on_action"
  | "promised_but_not_delivered"
  | "proposal_claim_without_approval"
  | "unverified_metric_breakdown"
  | "unverified_google_ads_data";

export interface VoiceToolCallRecord {
  name: string;
  ok?: boolean;
  result?: unknown;
}

export interface VoiceCorrectionRequest {
  reason: VoiceCorrectionReason;
  correctionNote: string;
  spokenFallback: string;
}

const ACTION_VERBS = [
  "create", "draft", "push to gmail", "save to gmail", "queue", "propose", "schedule a", "schedule the",
  "set up a", "build the", "restructure", "pause", "enable", "activate", "reactivate", "turn on", "turn off", "turn back on",
] as const;

const PROPOSAL_CLAIMS = [
  "queued approval", "queued for approval", "queued the proposal", "queueing the proposal", "queuing the proposal",
  "proposed the", "i've queued", "i have queued", "approval #", "review at /admin/agent-approvals/",
] as const;

const GOOGLE_ADS_DATA_PHRASES = [
  "google ads", "campaign", "ad group", "search term", "spend", "clicks", "impressions", "conversions", "leads", "ctr", "cpc", "cpa", "cpl", "cost per lead", "conversion rate", "performance", "trend", "by month", "by week",
] as const;

const MONTHLY_METRIC_PHRASES = ["by month", "monthly", "month by month", "month-by-month", "each month"] as const;
const WEEKLY_METRIC_PHRASES = ["by week", "weekly", "week by week", "week-by-week", "week-on-week", "wow"] as const;
const RATE_METRIC_PHRASES = ["ctr", "cpc", "cpa", "cpl", "cost per lead", "cost/lead", "conversion rate", "conv rate"] as const;

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

function containsAnyPhrase(haystack: string, needles: readonly string[]): boolean {
  const lower = haystack.toLowerCase();
  return needles.some((needle) => lower.includes(needle.toLowerCase()));
}

function replyContainsMetricTable(reply: string): boolean {
  return /\d+(?:\.\d+)?%/.test(reply) || /\$\d/.test(reply) || /\|/.test(reply);
}

function replyContainsNumber(reply: string): boolean {
  const withoutApprovalIds = reply
    .replace(/\bapproval\s*#?\s*\d+\b/gi, "")
    .replace(/\/admin\/agent-approvals\/\d+\b/gi, "");
  return /(?:\$\s*)?\d[\d,]*(?:\.\d+)?%?/.test(withoutApprovalIds);
}

function toolNames(toolCalls: readonly VoiceToolCallRecord[]): string[] {
  return toolCalls.map((call) => call.name);
}

function resultHasApproval(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const obj = result as Record<string, unknown>;
  const data = obj.data && typeof obj.data === "object" ? obj.data as Record<string, unknown> : obj;
  return Boolean(data.approvalId || data.approvalUrl);
}

export function checkVoiceRunForCorrection(args: {
  userMessage: string;
  reply: string;
  toolCalls: readonly VoiceToolCallRecord[];
}): VoiceCorrectionRequest | null {
  const names = toolNames(args.toolCalls);
  const calledSet = new Set(names);
  const calledAnyPropose = args.toolCalls.some((call) => call.name.startsWith("propose_"));
  const successfulProposalWithApproval = args.toolCalls.some((call) => call.name.startsWith("propose_") && call.ok !== false && resultHasApproval(call.result));

  if (names.length === 0 && containsAnyPhrase(args.userMessage, ACTION_VERBS)) {
    return {
      reason: "zero_tool_call_on_action",
      correctionNote: "Your previous spoken reply made no tool calls. The user asked for an action. Call the correct tool now: use propose_campaign_status_change or propose_ad_group_status_change for pause/enable/activate requests, create_gmail_draft for Gmail drafts, and read tools for metrics. Do not narrate, call the tool.",
      spokenFallback: "I did not actually run the tool yet, so I cannot say that is queued or verified.",
    };
  }

  if (containsAnyPhrase(args.reply, PROPOSAL_CLAIMS) && !successfulProposalWithApproval) {
    return {
      reason: calledAnyPropose ? "proposal_claim_without_approval" : "promised_but_not_delivered",
      correctionNote: "Your previous spoken reply claimed an approval was queued, but there is no successful propose_* tool result with an approvalId. Call the relevant propose_* tool now and wait for its output. If it fails, say the approval was not queued.",
      spokenFallback: "I need to correct that: the approval was not confirmed as queued.",
    };
  }

  const campaignStatusClaim = containsAnyPhrase(args.reply, ["paused the campaign", "enabled the campaign", "activated the campaign", "turning the campaign", "pausing the campaign", "enabling the campaign"]);
  if (campaignStatusClaim && !calledSet.has("propose_campaign_status_change")) {
    return {
      reason: "promised_but_not_delivered",
      correctionNote: "You claimed or promised a campaign status change without calling propose_campaign_status_change. Call it now with exact campaign IDs and supportingNumbers. Do not claim a live change was applied.",
      spokenFallback: "I need to correct that: I have not queued the campaign status change yet.",
    };
  }

  const adGroupStatusClaim = containsAnyPhrase(args.reply, ["paused the ad group", "enabled the ad group", "activated the ad group", "turning the ad group", "pausing the ad group", "enabling the ad group"]);
  if (adGroupStatusClaim && !calledSet.has("propose_ad_group_status_change")) {
    return {
      reason: "promised_but_not_delivered",
      correctionNote: "You claimed or promised an ad group status change without calling propose_ad_group_status_change. Call it now with exact campaign/ad group IDs and supportingNumbers. Do not claim a live change was applied.",
      spokenFallback: "I need to correct that: I have not queued the ad group status change yet.",
    };
  }

  const calledGoogleAdsReadTool = names.some((name) => GOOGLE_ADS_READ_TOOLS.has(name));
  if (replyContainsMetricTable(args.reply) && containsAnyPhrase(args.userMessage, RATE_METRIC_PHRASES)) {
    if (containsAnyPhrase(args.userMessage, MONTHLY_METRIC_PHRASES) && !calledSet.has("get_monthly_metric_table") && !calledSet.has("get_portfolio_monthly_performance_breakdown")) {
      return {
        reason: "unverified_metric_breakdown",
        correctionNote: "Your previous spoken reply gave monthly rate metrics without the canonical monthly validation tool. Call get_monthly_metric_table, then answer only from its rows.",
        spokenFallback: "I need to verify those monthly numbers before treating them as correct.",
      };
    }
    if (containsAnyPhrase(args.userMessage, WEEKLY_METRIC_PHRASES) && !calledSet.has("get_weekly_metric_table") && !calledSet.has("get_weekly_trend_note") && !calledSet.has("get_portfolio_weekly_metric_table")) {
      return {
        reason: "unverified_metric_breakdown",
        correctionNote: "Your previous spoken reply gave weekly rate metrics without the canonical weekly validation tool. Call get_weekly_metric_table, then answer only from its rows.",
        spokenFallback: "I need to verify those weekly numbers before treating them as correct.",
      };
    }
  }

  if (replyContainsNumber(args.reply) && !calledGoogleAdsReadTool && containsAnyPhrase(args.userMessage, GOOGLE_ADS_DATA_PHRASES)) {
    return {
      reason: "unverified_google_ads_data",
      correctionNote: "Your previous spoken reply included Google Ads numbers without calling a Google Ads read tool in this turn. Call the relevant read tool now, then answer only from its returned data.",
      spokenFallback: "I need to verify those Google Ads numbers before treating them as correct.",
    };
  }

  return null;
}
