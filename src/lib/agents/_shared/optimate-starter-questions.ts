export interface OptiMateStarterQuestion {
  question: string;
}

export const DEFAULT_GOOGLE_MATE_STARTER_QUESTIONS = [
  "Draft the budget pacing this month with a 1 sentence performance summary on top, then save it as a Gmail draft.",
  "How is my budget pacing this month? Include percent used, target spend to date, and days remaining.",
  "Which campaigns are performing best this week?",
  "Are there any keywords wasting spend?",
] as const;

export const DEFAULT_GOOGLE_MATE_PORTFOLIO_STARTER_QUESTIONS = [
  "Create separate Gmail drafts for each selected account using the last 4 completed Monday-Sunday weeks. Summarise last week against prior weeks, then include current-month Budget Management pacing components. Keep the performance report weekly.",
  "Show me the account inventory",
  "Summarise portfolio performance",
  "Find cross-account search-term waste",
] as const;

export const DEFAULT_INVOICE_MATE_STARTER_QUESTIONS = [
  "Show me overdue invoices",
  "Summarise outstanding invoices",
  "What invoices are scheduled to send?",
  "Create this month’s retainer",
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

    const question = rawQuestion.trim().replace(/\s+/g, " ").slice(0, MAX_STARTER_QUESTION_LENGTH);
    const key = question.toLocaleLowerCase();
    if (!question || seen.has(key)) continue;

    seen.add(key);
    questions.push(question);
    if (questions.length >= MAX_STARTER_QUESTIONS) break;
  }

  return questions;
}
