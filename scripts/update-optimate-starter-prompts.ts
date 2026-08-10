/**
 * Rewrite the saved OptiMate Google Ads starter prompts in the
 * `optimate-settings` global so the deterministic draft tools stop stalling on
 * a clarification question.
 *
 * `create_weekly_budget_gmail_draft` and `create_monthly_budget_gmail_draft`
 * both refuse to create a draft when `components` is empty, and none of the
 * saved chips named a component. Each report chip now names its components
 * explicitly:
 *
 *   weekly  -> keyword_relevancy, cpa_trend            (the only two supported)
 *   monthly -> keyword_relevancy, cpa_trend, quality_score, top_converters
 *
 * Prompts must survive `resolveStarterQuestions`, which truncates at 240 chars,
 * and must still match `classifyPortfolioGmailDraftIntent` so the >=2-account
 * shortcut keeps firing. Both are asserted before anything is written.
 *
 * Usage:
 *   npm run optimate:fix-prompts            # dry run, prints the diff
 *   npm run optimate:fix-prompts -- --apply # writes to the configured DB
 */

import { getPayload } from "payload";
import config from "@/payload.config";
import { classifyPortfolioGmailDraftIntent } from "@/lib/agents/optimate-google-ads/portfolio-gmail-draft-intent";

const MAX_STARTER_QUESTION_LENGTH = 240;

const NEW_INDIVIDUAL_QUESTIONS = [
  "Create a Gmail draft for the weekly Google Ads budget report covering the last 4 completed Monday-Sunday weeks. Include both graphs: keyword_relevancy and cpa_trend.",
  "Create a Gmail draft for the monthly Google Ads budget report. Include these components: keyword_relevancy, cpa_trend, quality_score, top_converters.",
  "Which campaigns are performing best this week?",
  "Are there any keywords wasting spend?",
];

const NEW_PORTFOLIO_QUESTIONS = [
  "Create separate Gmail drafts for each selected account's budget pacing this month, each with a 1 sentence performance summary on top. Components: keyword_relevancy, cpa_trend, quality_score, top_converters.",
  "Create a separate Gmail draft for each selected account's weekly report covering the last 4 completed Monday-Sunday weeks. Add 1 sentence on weekly performance and pacing. Never use monthly or MTD data. Graphs: keyword_relevancy, cpa_trend.",
  "Create a separate Gmail draft for each selected account's last-month performance, with a two-sentence summary above the tables. Components: keyword_relevancy, cpa_trend, quality_score, top_converters.",
  "Find cross-account search-term waste",
];

/**
 * Portfolio chips that must keep classifying to a deterministic intent, so
 * adding component text cannot silently disable the multi-account shortcut.
 */
const EXPECTED_PORTFOLIO_INTENTS: Array<{ index: number; kind: "weekly" | "monthly"; detail: string }> = [
  { index: 0, kind: "monthly", detail: "this_month" },
  { index: 1, kind: "weekly", detail: "4" },
  { index: 2, kind: "monthly", detail: "last_month" },
];

function assertPrompts(): void {
  const failures: string[] = [];

  for (const [label, list] of [
    ["individual", NEW_INDIVIDUAL_QUESTIONS],
    ["portfolio", NEW_PORTFOLIO_QUESTIONS],
  ] as const) {
    list.forEach((question, i) => {
      if (question.length > MAX_STARTER_QUESTION_LENGTH) {
        failures.push(
          `${label}#${i + 1} is ${question.length} chars, over the ${MAX_STARTER_QUESTION_LENGTH} limit (would be truncated).`,
        );
      }
      if (question.trim() !== question || /\s{2,}/.test(question)) {
        failures.push(`${label}#${i + 1} has stray whitespace and would be normalised on read.`);
      }
    });
  }

  for (const expected of EXPECTED_PORTFOLIO_INTENTS) {
    const prompt = NEW_PORTFOLIO_QUESTIONS[expected.index];
    const intent = classifyPortfolioGmailDraftIntent(prompt);
    if (!intent) {
      failures.push(`portfolio#${expected.index + 1} no longer matches any deterministic intent.`);
      continue;
    }
    if (intent.kind !== expected.kind) {
      failures.push(
        `portfolio#${expected.index + 1} classified as "${intent.kind}", expected "${expected.kind}".`,
      );
      continue;
    }
    const detail = intent.kind === "weekly" ? String(intent.weeks) : intent.period;
    if (detail !== expected.detail) {
      failures.push(
        `portfolio#${expected.index + 1} classified as ${intent.kind}/${detail}, expected ${expected.kind}/${expected.detail}.`,
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(`Prompt validation failed:\n  - ${failures.join("\n  - ")}`);
  }
  console.log("Prompt validation passed: lengths within limit, portfolio intents unchanged.\n");
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  assertPrompts();

  const payload = await getPayload({ config });
  const current = (await payload.findGlobal({
    slug: "optimate-settings" as never,
    overrideAccess: true,
  })) as Record<string, unknown>;

  const before = {
    individual: toQuestionList(current.googleMateStarterQuestions),
    portfolio: toQuestionList(current.googleMatePortfolioStarterQuestions),
  };

  printDiff("Google Mate account questions", before.individual, NEW_INDIVIDUAL_QUESTIONS);
  printDiff("Google Mate portfolio questions", before.portfolio, NEW_PORTFOLIO_QUESTIONS);

  if (!apply) {
    console.log("Dry run. Re-run with --apply to write these changes.");
    return;
  }

  await payload.updateGlobal({
    slug: "optimate-settings" as never,
    data: {
      googleMateStarterQuestions: NEW_INDIVIDUAL_QUESTIONS.map((question) => ({ question })),
      googleMatePortfolioStarterQuestions: NEW_PORTFOLIO_QUESTIONS.map((question) => ({ question })),
    } as never,
    overrideAccess: true,
  });

  const after = (await payload.findGlobal({
    slug: "optimate-settings" as never,
    overrideAccess: true,
  })) as Record<string, unknown>;

  const writtenIndividual = toQuestionList(after.googleMateStarterQuestions);
  const writtenPortfolio = toQuestionList(after.googleMatePortfolioStarterQuestions);

  const mismatches: string[] = [];
  NEW_INDIVIDUAL_QUESTIONS.forEach((q, i) => {
    if (writtenIndividual[i] !== q) mismatches.push(`individual#${i + 1} readback mismatch`);
  });
  NEW_PORTFOLIO_QUESTIONS.forEach((q, i) => {
    if (writtenPortfolio[i] !== q) mismatches.push(`portfolio#${i + 1} readback mismatch`);
  });
  if (mismatches.length > 0) {
    throw new Error(`Write verification failed:\n  - ${mismatches.join("\n  - ")}`);
  }

  console.log("Applied and verified by readback.");
}

function toQuestionList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) =>
      typeof item === "string"
        ? item
        : item && typeof item === "object" && "question" in item
          ? String((item as { question?: unknown }).question ?? "")
          : "",
    )
    .filter(Boolean);
}

function printDiff(label: string, before: string[], after: string[]): void {
  console.log(`=== ${label}`);
  const max = Math.max(before.length, after.length);
  for (let i = 0; i < max; i += 1) {
    const b = before[i] ?? "(none)";
    const a = after[i] ?? "(none)";
    if (b === a) {
      console.log(`  ${i + 1}. unchanged: ${a}`);
    } else {
      console.log(`  ${i + 1}. BEFORE: ${b}`);
      console.log(`     AFTER : ${a}  [${a.length} chars]`);
    }
  }
  console.log("");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
