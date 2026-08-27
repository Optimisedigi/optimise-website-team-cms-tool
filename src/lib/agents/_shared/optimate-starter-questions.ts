export interface OptiMateStarterQuestion {
  question: string;
}

/**
 * Report chips must name their `components` explicitly. Both
 * `create_weekly_budget_gmail_draft` and `create_monthly_budget_gmail_draft`
 * return a clarification instead of a draft when `components` is empty, so a
 * chip that omits them stalls the conversation. Weekly supports only
 * keyword_relevancy and cpa_trend; monthly also supports quality_score and
 * top_converters.
 */
const GOOGLE_MATE_STANDARD_REPORT_QUESTIONS = [
  "Create a separate Gmail draft for each selected account's weekly Google Ads report, covering the last 4 completed Monday-Sunday weeks with a week-on-week summary at the top. One draft per account. Graphs: keyword_relevancy, cpa_trend.",
  "Create a separate Gmail draft for each selected account's report for last month, with a 4-month trend table and month-on-month summary on top. One draft per account. Components: keyword_relevancy, cpa_trend, quality_score, top_converters.",
] as const;

export const DEFAULT_GOOGLE_MATE_STARTER_QUESTIONS = [
  ...GOOGLE_MATE_STANDARD_REPORT_QUESTIONS,
  "Which campaigns are performing best this week?",
  "Are there any keywords wasting spend?",
] as const;

export const DEFAULT_GOOGLE_MATE_PORTFOLIO_STARTER_QUESTIONS = [
  ...GOOGLE_MATE_STANDARD_REPORT_QUESTIONS,
  "Create separate Gmail drafts for each selected account's budget pacing this month, each with a 1 sentence performance summary on top. Components: keyword_relevancy, cpa_trend, quality_score, top_converters.",
  "Find cross-account search-term waste",
] as const;

export const INVOICE_MATE_OVERDUE_CHASE_STARTER =
  "Draft chase emails for overdue invoices, show me the full emails, then ask if I want them as Gmail drafts";

const RETAINER_STARTER_KEYS = new Set([
  "create this month's retainer",
  "create this month’s retainer",
]);

export const DEFAULT_INVOICE_MATE_STARTER_QUESTIONS = [
  "Show unpaid invoices",
  "Show me overdue invoices",
  "Summarise outstanding invoices",
  "What invoices are scheduled to send?",
  INVOICE_MATE_OVERDUE_CHASE_STARTER,
  "How much do I owe in contractor cost?",
] as const;

const MAX_STARTER_QUESTIONS = 12;
const MAX_STARTER_QUESTION_LENGTH = 240;

export function resolveStarterQuestions(
  value: unknown,
  fallback: readonly string[],
): string[] {
  if (!Array.isArray(value)) return [...fallback];

  const questions: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const rawQuestion =
      typeof item === "string"
        ? item
        : item && typeof item === "object" && "question" in item
          ? (item as { question?: unknown }).question
          : undefined;

    if (typeof rawQuestion !== "string") continue;

    const normalised = rawQuestion.trim().replace(/\s+/g, " ").slice(0, MAX_STARTER_QUESTION_LENGTH);
    const question = RETAINER_STARTER_KEYS.has(normalised.toLowerCase())
      ? INVOICE_MATE_OVERDUE_CHASE_STARTER
      : normalised;
    const key = question.toLowerCase();
    if (!question || seen.has(key)) continue;

    seen.add(key);
    questions.push(question);
    if (questions.length >= MAX_STARTER_QUESTIONS) break;
  }

  return questions;
}

/** Keep saved chips, then append any new default chips that are not already present. */
export function mergeStarterQuestions(
  saved: readonly string[],
  defaults: readonly string[],
  max = MAX_STARTER_QUESTIONS,
): string[] {
  const seen = new Set(saved.map((question) => question.trim().toLowerCase()));
  const merged = [...saved];
  for (const question of defaults) {
    const key = question.trim().toLowerCase();
    if (!key || seen.has(key) || merged.length >= max) continue;
    seen.add(key);
    merged.push(question);
  }
  return merged;
}
