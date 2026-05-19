/**
 * Keyword-matcher: decides whether to include a heavy guide block in the
 * system prompt based on the last few messages of the conversation.
 *
 * Pure helper, no payload/Next dependencies — kept in its own module so the
 * unit tests can exercise it without bootstrapping payload.config.
 *
 * Used by `buildSystemPromptForAudit` to conditionally inject the
 * SCHEDULED_TASKS_GUIDE and DECK_GUIDE blocks (~1,800 tokens combined). The
 * 90% of turns that don't mention scheduled tasks or decks shrink the prompt
 * by that much; the 10% that do still get the full guide.
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
  "pause the",
  "resume the",
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
