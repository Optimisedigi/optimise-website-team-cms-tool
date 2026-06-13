export interface OptiMateStarterQuestion {
  question: string;
}

export const DEFAULT_GOOGLE_MATE_STARTER_QUESTIONS = [
  "How is my budget pacing this month?",
  "Which campaigns are performing best this week?",
  "Are there any keywords wasting spend?",
  "Give me a weekly performance summary",
] as const;

export const DEFAULT_GOOGLE_MATE_PORTFOLIO_STARTER_QUESTIONS = [
  "Show me the account inventory",
  "Summarise portfolio performance",
  "Find cross-account search-term waste",
  "Draft an account-priority email",
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
