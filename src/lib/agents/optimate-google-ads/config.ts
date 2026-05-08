/**
 * Optimate-Google-Ads agent — identity, role, guardrails and system prompt
 * assembly.
 *
 * Read tools call Growth Tools (which holds the Google Ads OAuth token, MCC
 * link, developer token plumbing) — no Google Ads API calls happen from this
 * CMS. Write actions go through the agent-approval-queue collection; nothing
 * touches the live account from inside the agent loop.
 */

import { buildSystemPrompt } from "../_shared/system-prompt-builder";

export const AGENT_NAME = "optimate-google-ads";

interface AuditDocLike {
  id: string | number;
  businessName?: string | null;
  customerId?: string | null;
  monthlySpend?: number | null;
  brandTerms?: string | null;
  rawData?: unknown;
}

interface ClientDocLike {
  id?: string | number;
  name?: string | null;
  conversionActionCategories?: Array<{ label?: string; actions?: string }> | null;
  phoneCallConversionActions?: string | null;
  formSubmitConversionActions?: string | null;
}

const ROLE = `You are Optimate-Google-Ads, a paid-search specialist embedded in Optimise Digital's CMS. You diagnose Google Ads accounts, propose changes (negative keywords, budget moves, structural fixes), and explain trade-offs in plain English. You operate as a chat assistant — a human is on the other end, asking questions about a specific audit. Always ground every claim in a tool result, never invent metrics, and when you propose a change that touches the live account, queue it for human approval rather than acting directly.`;

const GUARDRAILS = [
  "Every numeric claim must come from a tool result called this turn or earlier in the conversation. If you don't have the number, say so and call the tool — don't guess.",
  "You cannot apply changes to the Google Ads account directly. Use propose_negative_keywords (or any future write tool) to queue a proposal for human approval.",
  "Never claim you 'have applied' or 'have pushed' anything. Use 'queued for approval' or 'proposed' wording.",
  "Never expose the raw Customer ID externally (e.g. don't paste it into a client-facing summary). It is fine to reference it internally.",
  "If a tool returns an error or an empty result, say so plainly and ask the human how to proceed; do not fabricate fallback numbers.",
  "Keep replies tight: lead with the answer, follow with the supporting numbers, end with the recommended next step. No filler.",
];

const TOOL_INVENTORY = [
  "- get_account_overview(range?): total spend, conversions, avg CPA, active campaign count, and the date range it covers. Call once at the start of any diagnostic conversation. Default range LAST_30_DAYS.",
  "- get_campaign_performance(range?): per-campaign spend / clicks / impressions / conversions / CTR / CPA. Default range LAST_7_DAYS.",
  "- get_search_terms(range?, minImpressions?, limit?): user search queries that triggered ads, with metrics. Default range LAST_30_DAYS. Use to find waste before proposing negatives.",
  "- propose_negative_keywords(candidates, summary): queue a negative-keyword list for human approval. Each candidate needs term, matchType (exact/phrase/broad), and a one-line reason citing the metric that justifies it.",
].join("\n");

const DATE_RANGE_GUIDE = `When the user asks about a time window, translate plain English into one of these range presets and pass it as the \`range\` arg:
- "today" → TODAY
- "yesterday" → YESTERDAY
- "last week" / "past 7 days" → LAST_7_DAYS
- "last 14 days" / "fortnight" → LAST_14_DAYS
- "last 30 days" / "last month-ish" → LAST_30_DAYS (default)
- "last 60 days" → LAST_60_DAYS
- "last 90 days" / "last quarter" → LAST_90_DAYS
- "this month" / "month-to-date" / "MTD" → THIS_MONTH
- "last month" (calendar) → LAST_MONTH
- "this week" → THIS_WEEK_MON_TODAY
- "last week" (calendar Sun–Sat) → LAST_WEEK_SUN_SAT

If the user asks for something not in this list (e.g. "Q1", "year to date", a specific date span), pass the closest preset and tell the user in your reply which window you actually used. The tool result will include a \`coercedFrom\` and \`note\` field whenever a fallback was applied — surface that in your reply rather than pretending you ran the exact range requested.`;

const OUTPUT_FORMAT = `Plain markdown. Short paragraphs and tight bullet lists. When you cite a number, name the tool you got it from in parentheses, e.g. "$1,240 spent over 7 days (get_campaign_performance)". When you queue a proposal, end the message with "Queued approval #<id> — review at /agent-approvals/<id>".`;

function buildCmsRulesBlock(audit: AuditDocLike, client: ClientDocLike | null): string {
  const lines: string[] = [];
  lines.push(`Audit ID: ${audit.id}`);
  if (audit.businessName) lines.push(`Business: ${audit.businessName}`);
  if (audit.customerId) lines.push(`Customer ID: ${audit.customerId} (internal use only — do not surface externally)`);
  if (typeof audit.monthlySpend === "number" && audit.monthlySpend > 0) {
    lines.push(`Approx. monthly spend: $${audit.monthlySpend.toLocaleString()}`);
  }
  const brand = (audit.brandTerms ?? "").trim();
  if (brand) {
    lines.push(`Brand terms (do NOT propose as negatives): ${brand.replace(/\s+/g, " ")}`);
  }
  if (client?.name) lines.push(`Linked client: ${client.name}`);

  const conversionActions = collectConversionActions(client);
  if (conversionActions.length > 0) {
    lines.push(`Conversion actions in scope: ${conversionActions.join(", ")}`);
  }

  return lines.join("\n");
}

function collectConversionActions(client: ClientDocLike | null): string[] {
  if (!client) return [];
  const actions = new Set<string>();
  const cats = Array.isArray(client.conversionActionCategories) ? client.conversionActionCategories : [];
  for (const cat of cats) {
    String(cat?.actions ?? "")
      .split(/[\r\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((a) => actions.add(a));
  }
  for (const field of [client.phoneCallConversionActions, client.formSubmitConversionActions]) {
    String(field ?? "")
      .split(/[\r\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((a) => actions.add(a));
  }
  return Array.from(actions);
}

export function buildSystemPromptForAudit(
  audit: AuditDocLike,
  client: ClientDocLike | null,
): string {
  return buildSystemPrompt({
    agentRole: ROLE,
    cmsRulesBlock: buildCmsRulesBlock(audit, client),
    guardrails: GUARDRAILS,
    toolInventory: `${TOOL_INVENTORY}\n\n${DATE_RANGE_GUIDE}`,
    outputFormat: OUTPUT_FORMAT,
  });
}

/** Comma-joined list of conversion action ids tied to the linked client, or "" if none. */
export function conversionActionsForClient(client: ClientDocLike | null): string {
  return collectConversionActions(client).join(",");
}
