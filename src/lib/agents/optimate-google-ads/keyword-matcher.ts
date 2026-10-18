/**
 * Keyword-matcher: decides whether to include a heavy guide block in the
 * system prompt based on the last few messages of the conversation.
 *
 * Pure helper, no payload/Next dependencies — kept in its own module so the
 * unit tests can exercise it without bootstrapping payload.config.
 *
 * Used by `buildSystemPromptForAudit` to conditionally inject heavy workflow
 * guides. Most turns that don't mention those workflows shrink the prompt;
 * turns that do still get the full guide.
 *
 * Matching is:
 *   - case-insensitive
 *   - substring (so "schedules" matches the "schedule" trigger)
 *   - windowed to the last MAX_WINDOW messages (current + 3 prior) so a
 *     multi-turn deck conversation keeps the guide loaded even when the
 *     latest user message no longer mentions "deck".
 */

import type { Message } from "../_shared/llm/types";

const MAX_WINDOW = 4;

/**
 * Trigger phrases for the SCHEDULED_TASKS_GUIDE. Matched as case-insensitive
 * substrings against message text. Includes per-day "every monday/tuesday/..."
 * so user phrasing like "every friday" hits regardless of which day they pick.
 */
export const SCHEDULED_TASKS_TRIGGERS: readonly string[] = [
  "schedule",
  "scheduled",
  "recurring",
  "repeat",
  "repeatedly",
  "every day",
  "every monday",
  "every tuesday",
  "every wednesday",
  "every thursday",
  "every friday",
  "every saturday",
  "every sunday",
  "every weekday",
  "every weekend",
  "every fortnight",
  "every month",
  "every week",
  "weekly",
  "monthly",
  "fortnightly",
  "daily",
  "cron",
  "each morning",
  "each evening",
  "each monday",
  "each tuesday",
  "each wednesday",
  "each thursday",
  "each friday",
  "each saturday",
  "each sunday",
  // Pausing/resuming a scheduled report, not a campaign ("pause the brand
  // campaign" used to load this guide).
  "pause the report",
  "pause the task",
  "pause my",
  "resume the report",
  "resume the task",
  "resume my",
  "list tasks",
  "list my tasks",
  "what reports am i getting",
  "which reports",
  "my scheduled",
];

/**
 * Trigger phrases for the DECK_GUIDE.
 */
export const DECK_TRIGGERS: readonly string[] = [
  "deck",
  "slide",
  "slides",
  "presentation",
  "recap",
  "stakeholder",
  "owner update",
  "client update",
  "monthly review",
  "quarterly review",
  "what we shipped",
  "month-end review",
  "eom review",
  "wrap-up",
  "1-month review",
  "90-day review",
  "show the owner",
  "show the client",
];

/**
 * Trigger phrases for the GEO_WALKTHROUGH campaign-structure workflow.
 */
export const GEO_WALKTHROUGH_TRIGGERS: readonly string[] = [
  "near-me",
  "near me",
  "geo",
  "location",
  "locations",
  "city",
  "cities",
  "suburb",
  "suburbs",
  "split campaign",
  "split campaigns",
  "geo split",
  "campaign split",
  "campaign structure",
  "structure campaign",
  "structure campaigns",
  "restructure",
  "rebuild campaign",
  "rebuild campaigns",
  "build campaign",
  "build campaigns",
  "new campaign",
  "new ad group",
  "add ad group",
  "add keywords",
  "campaign build",
  "campaign proposal",
];

/**
 * Trigger phrases for the GMAIL_DRAFT_GUIDE (one-off Gmail drafts plus budget
 * management emails and reports). "mail" covers email, e-mail, Gmail and the
 * attached-email block header. Kept broad on purpose: a false positive only
 * loads the guide, a miss drops the draft rules for that turn.
 */
export const GMAIL_DRAFT_TRIGGERS: readonly string[] = [
  "mail",
  "draft",
  "inbox",
  "budget management",
  "budget report",
  "budget update",
  "weekly report",
  "monthly report",
];

/** Specialist GoogleMate tool bundles the model can request mid-run. */
export const GOOGLEMATE_TOOL_BUNDLE_NAMES = [
  "performance",
  "negative_keywords",
  "budget_email",
  "budget_changes",
  "keyword_research",
  "ad_copy",
  "seo_organic",
  "campaign_build",
  "goals",
  "scheduled_tasks",
  "decks",
  "actions",
  "memory",
] as const;

export type GoogleMateToolBundleName = (typeof GOOGLEMATE_TOOL_BUNDLE_NAMES)[number];

export function isGoogleMateToolBundleName(value: unknown): value is GoogleMateToolBundleName {
  return typeof value === "string" && (GOOGLEMATE_TOOL_BUNDLE_NAMES as readonly string[]).includes(value);
}

/**
 * Pre-load patterns, matched against the user's own messages only. Bundles
 * the model actually used (production activity log, Jul to Oct 2026:
 * performance, budget_email, negative_keywords, goals) keep broad triggers.
 * Bundles it never used in that window only pre-load on explicit phrasing;
 * the model can still attach any of them mid-run via
 * request_googlemate_tool_bundle. Memory tools are routed separately
 * (shouldAttachMemoryTools).
 */
const TOOL_BUNDLE_PATTERNS: ReadonlyArray<readonly [GoogleMateToolBundleName, RegExp]> = [
  ["negative_keywords", /negative|nkl|search term|wast(e|ed)|irrelevant quer|exclude/],
  ["budget_email", /budget|spend|pacing|draft|email|gmail|push live|allocation/],
  [
    "budget_changes",
    /push live|push (the |all )?budgets?|budget (change|increase|decrease|cut|reallocation)|(change|increase|decrease|cut|raise|lower|reallocate|shift|set) (the |our |their |this |daily |campaign |monthly )*budgets?/,
  ],
  ["keyword_research", /keyword planner|keyword idea|search volume|keyword research/],
  ["ad_copy", /ad copy|\brsas?\b|responsive search ad|headline|creative/],
  ["seo_organic", /\bga4\b|\bgsc\b|search console|organic|\bseo\b|\bserp\b|indexing|ai visibility/],
  [
    "campaign_build",
    /campaign build|build (a |the |new )?campaigns?|new campaigns?|restructure|\bgeo\b|split (the )?campaigns?|campaign split|new ad groups?|add (an? |new )?ad groups?|add keywords|proposal status/,
  ],
  ["goals", /goal|objective|progress|goal run|efficiency/],
  ["scheduled_tasks", /schedule|scheduled task|remind|recurring|cron/],
  ["decks", /\bdecks?\b|\bslides?\b|stakeholder|presentation/],
  [
    "actions",
    /\b(pause|enable|reactivate|publish|deploy)\b|turn (it |this |them )?(on|off)|make (it |this |them )?live|go live|key event|\bgtm\b|tag manager/,
  ],
  ["performance", /performance|campaign|ad group|metric|cpa|roas|conversion|click|impression|ctr|cpc|weekly|monthly|trend/],
];

/**
 * Bundles to attach before the first model call. Reads user messages only:
 * assistant replies mention campaigns, budgets and emails constantly, so
 * scanning them loaded nearly every bundle as a conversation went on.
 */
export function detectGoogleMateToolBundles(messages: Message[] | undefined): GoogleMateToolBundleName[] {
  if (!messages || messages.length === 0) return [];
  const text = messages
    .filter((message) => message.role === "user")
    .map(extractText)
    .join("\n")
    .toLowerCase();
  if (!text.trim()) return [];
  return TOOL_BUNDLE_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([bundle]) => bundle);
}

function extractText(message: Message): string {
  if (!message || !Array.isArray(message.content)) return "";
  const parts: string[] = [];
  for (const part of message.content) {
    if (part && typeof part === "object" && part.type === "text" && typeof part.text === "string") {
      parts.push(part.text);
    }
  }
  return parts.join("\n");
}

/**
 * Returns true if any of the last MAX_WINDOW messages (current + 3 prior)
 * contains any of the trigger substrings (case-insensitive).
 *
 * Empty / undefined `messages` returns false so callers that don't pass a
 * conversation get the "no guide" path by default.
 */
export function shouldIncludeGuide(
  messages: Message[] | undefined,
  triggers: readonly string[],
): boolean {
  if (!messages || messages.length === 0) return false;
  if (triggers.length === 0) return false;
  const lowered = triggers.map((t) => t.toLowerCase());
  const window = messages.slice(-MAX_WINDOW);
  for (const msg of window) {
    const text = extractText(msg).toLowerCase();
    if (text.length === 0) continue;
    for (const trigger of lowered) {
      if (text.includes(trigger)) return true;
    }
  }
  return false;
}
