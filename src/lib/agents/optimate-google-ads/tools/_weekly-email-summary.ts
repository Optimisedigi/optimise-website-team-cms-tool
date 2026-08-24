import type { GoogleAdsEmailComponentKey } from "@/lib/google-ads-email-components";
import type { WeeklyBucketRow } from "@/lib/google-ads-weekly-metric-table";
import { pickCopy } from "./_email-copy-variants";
import type { ClientEmailCopy } from "./_email-copy-slots";
import { buildComponentInsightSentence, type EmailComponentData } from "./_email-component-insights";

/**
 * The single top-line summary used by every weekly Google Ads report email,
 * whether the draft is created from an individual account chat or batched
 * across selected/portfolio accounts.
 *
 * Three sentences, in order:
 *   1. Performance, compared week-on-week against the prior completed week.
 *   2. Component insight, shared with the monthly email.
 *   3. Budget pacing, when a monthly budget is known.
 *
 * Uniqueness comes from `seed` (client + customer + week window). Every slot
 * varies independently, so a batch of accounts does not repeat the same
 * sentence shapes, while a re-run for the same account and week is byte-stable.
 * Only wording varies - never the numbers.
 *
 * The phrasings themselves live in `_email-copy-slots.ts` and are overridable
 * from OptiMate Settings; pass the loaded overrides as `copy`.
 */

export interface WeeklySummaryBudget {
  monthlyBudget: number;
  totalSpend: number;
  targetSpendToDate: number;
  pacingDifference: number;
}

export interface WeeklyEmailSummaryInput {
  rows: WeeklyBucketRow[];
  components: GoogleAdsEmailComponentKey[];
  dashboardData?: EmailComponentData;
  budget?: WeeklySummaryBudget;
  seed?: number;
  /** Editable phrasings from OptiMate Settings; defaults are used when absent. */
  copy?: ClientEmailCopy;
}

export function buildWeeklyEmailSummary({
  rows,
  components,
  dashboardData,
  budget,
  seed = 0,
  copy,
}: WeeklyEmailSummaryInput): string {
  return [
    buildPerformanceSentence(rows, seed, copy),
    buildComponentInsightSentence(components, dashboardData, seed),
    buildPacingSentence(budget, seed, copy),
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Week-on-week performance. When a prior completed week is available the
 * sentence states the direction of travel for conversions and CPA; otherwise it
 * falls back to describing the latest week on its own.
 */
function buildPerformanceSentence(
  rows: WeeklyBucketRow[],
  seed: number,
  copy: ClientEmailCopy | undefined,
): string {
  const latest = rows[rows.length - 1];
  const previous = rows[rows.length - 2];
  if (!latest)
    return "Here is the completed-week Google Ads budget report with the weekly performance trend included above the budget tracker.";

  const conversions = latest.totals.conversions;
  const spend = latest.totals.spend;
  const cpa = conversions > 0 ? spend / conversions : null;
  const previousConversions = previous?.totals.conversions ?? null;
  const previousCpa =
    previous && previous.totals.conversions > 0
      ? previous.totals.spend / previous.totals.conversions
      : null;

  const label = latest.label;
  const conversionsText = formatNumber(conversions);
  const cpaText = cpa !== null ? formatCurrency(cpa) : "";
  const spendText = formatCurrency(spend);
  const conversionsUp = previousConversions !== null && conversions > previousConversions;
  const conversionsDown = previousConversions !== null && conversions < previousConversions;
  const cpaImproved = cpa !== null && previousCpa !== null && cpa < previousCpa;
  const cpaWorsened = cpa !== null && previousCpa !== null && cpa > previousCpa;
  const previousConversionsText =
    previousConversions !== null ? formatNumber(previousConversions) : "";
  const previousCpaText = previousCpa !== null ? formatCurrency(previousCpa) : "";

  const tokens = {
    period: label,
    conversions: conversionsText,
    prevConversions: previousConversionsText,
    cpa: cpaText,
    prevCpa: previousCpaText,
    spend: spendText,
  };

  // Best case: more conversions and cheaper than the week before.
  if (conversionsUp && cpaImproved) {
    return pickCopy("weekly-performance-up-efficient", seed, copy, tokens);
  }

  // More conversions, but CPA flat or higher.
  if (conversionsUp) {
    return pickCopy("weekly-performance-up", seed, copy, {
      ...tokens,
      cpaClause: buildCpaClause(cpa, cpaWorsened, cpaText, previousCpaText, "easing"),
    });
  }

  // Fewer conversions, but cheaper acquisition.
  if (conversionsDown && cpaImproved) {
    return pickCopy("weekly-performance-down-efficient", seed, copy, tokens);
  }

  // Fewer conversions and no efficiency gain.
  if (conversionsDown) {
    return pickCopy("weekly-performance-down", seed, copy, {
      ...tokens,
      cpaClause: buildCpaClause(cpa, cpaWorsened, cpaText, previousCpaText, "rose"),
    });
  }

  // Volume flat week-on-week, so lead on the efficiency move.
  if (previousConversions !== null && cpa !== null && (cpaImproved || cpaWorsened)) {
    return pickCopy("weekly-performance-flat-cpa-move", seed, copy, {
      ...tokens,
      direction: cpaImproved ? "improved" : "rose",
    });
  }

  // No prior week to compare against: describe the latest week on its own.
  if (conversions > 0 && cpa !== null) {
    return pickCopy("weekly-intro-converting", seed, copy, tokens);
  }
  if (spend > 0) {
    return pickCopy("weekly-intro-spend", seed, copy, tokens);
  }
  return pickCopy("weekly-intro-flat", seed, copy, tokens);
}

/**
 * The trailing CPA clause for the mixed-direction sentences. Rendered here
 * rather than in a slot template because it is conditional: it names the prior
 * week only when CPA actually moved the wrong way.
 */
function buildCpaClause(
  cpa: number | null,
  cpaWorsened: boolean,
  cpaText: string,
  previousCpaText: string,
  verb: "easing" | "rose",
): string {
  if (cpa === null) return "";
  if (!cpaWorsened) return ` at a CPA of ${cpaText}`;
  return verb === "easing"
    ? `, with CPA easing to ${cpaText} from ${previousCpaText}`
    : `, and CPA rose to ${cpaText} from ${previousCpaText}`;
}

function buildPacingSentence(
  budget: WeeklySummaryBudget | undefined,
  seed: number,
  copy: ClientEmailCopy | undefined,
): string {
  if (!budget || budget.monthlyBudget <= 0) return "";
  const slot = budget.pacingDifference <= 0 ? "weekly-budget-under" : "weekly-budget-over";
  return pickCopy(slot, seed, copy);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 }).format(value);
}
