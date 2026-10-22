/**
 * GmailMate read consent: the agent never opens an email the user did not ask
 * for. Enforced in code, not only in the prompt:
 *
 * - The Gmail-read tools load only from the user's own typed words
 *   (tool-bundles.ts); the model cannot attach them itself.
 * - Inbox search returns sender, subject and date only (no body snippet), so
 *   finding emails does not read them.
 * - Each user message allows opening ONE email or thread. Opening more needs
 *   the user's typed approval ("read them all", "open all 3", "yes, all of
 *   them"); without it the tool refuses and the model has to ask which one.
 *
 * The budget lives in the run's own context object (one per chat turn), never
 * in module state.
 */

export const GMAIL_READ_BUDGET_KEY = "gmailReadBudget";

/** Emails a single approved "read them all" may open in one turn. */
export const MAX_APPROVED_READS = 10;

export interface GmailReadBudget {
  remaining: number;
  approvedAll: boolean;
  opened: string[];
}

/** The user's own typed text approves opening several emails at once. */
export function userApprovedReadingAll(typedText: string): boolean {
  const text = typedText.toLowerCase();
  return (
    /\b(read|open|check|summari[sz]e|look at|go through)\b[^.?!\n]{0,40}\b(all|every|each|both|them all|all of them)\b/.test(text) ||
    /\b(yes|yep|ok|okay|sure|go ahead)\b[^.?!\n]{0,20}\b(all|both|them all|all of them|every one)\b/.test(text)
  );
}

export function createGmailReadBudget(approvedAll: boolean): GmailReadBudget {
  return { remaining: approvedAll ? MAX_APPROVED_READS : 1, approvedAll, opened: [] };
}

/**
 * Spend one read for `id` (a message or thread id). Re-reading the same id is
 * free. Without a budget in context (the voice bridge), reads are allowed.
 */
export function takeGmailRead(context: Record<string, unknown>, id: string): { ok: true } | { ok: false; error: string } {
  const budget = context[GMAIL_READ_BUDGET_KEY] as GmailReadBudget | undefined;
  if (!budget) return { ok: true };
  if (budget.opened.includes(id)) return { ok: true };
  if (budget.remaining <= 0) {
    return {
      ok: false,
      error: budget.approvedAll
        ? `You have already opened ${budget.opened.length} emails this turn, the most allowed at once. Tell the user what you found and ask before opening more.`
        : "Not opened: the user has approved opening only one email this turn. List the other candidates (sender, subject, date) and ask which one to open, or ask the user to approve opening them all.",
    };
  }
  budget.remaining -= 1;
  budget.opened.push(id);
  return { ok: true };
}
