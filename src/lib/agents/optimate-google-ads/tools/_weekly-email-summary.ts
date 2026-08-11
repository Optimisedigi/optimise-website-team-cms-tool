import type { GoogleAdsEmailComponentKey } from "@/lib/google-ads-email-components";
import type { WeeklyBucketRow } from "@/lib/google-ads-weekly-metric-table";
import { pickVariant } from "./_email-copy-variants";
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
}

export function buildWeeklyEmailSummary({
  rows,
  components,
  dashboardData,
  budget,
  seed = 0,
}: WeeklyEmailSummaryInput): string {
  return [
    buildPerformanceSentence(rows, seed),
    buildComponentInsightSentence(components, dashboardData, seed),
    buildPacingSentence(budget, seed),
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Week-on-week performance. When a prior completed week is available the
 * sentence states the direction of travel for conversions and CPA; otherwise it
 * falls back to describing the latest week on its own.
 */
function buildPerformanceSentence(rows: WeeklyBucketRow[], seed: number): string {
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

  // Best case: more conversions and cheaper than the week before.
  if (conversionsUp && cpaImproved) {
    return pickVariant(
      [
        `${label} was a strong week: conversions rose to ${conversionsText} from ${previousConversionsText} while CPA improved to ${cpaText} from ${previousCpaText}.`,
        `${label} performed well, lifting conversions to ${conversionsText} from ${previousConversionsText} and bringing CPA down to ${cpaText} from ${previousCpaText}.`,
        `A strong ${label}: ${conversionsText} conversions against ${previousConversionsText} the week prior, with CPA tightening to ${cpaText} from ${previousCpaText}.`,
        `${label} moved in the right direction on both counts, with conversions up to ${conversionsText} from ${previousConversionsText} and CPA down to ${cpaText} from ${previousCpaText}.`,
        `Both volume and efficiency improved in ${label}: ${conversionsText} conversions from ${previousConversionsText}, at ${cpaText} against ${previousCpaText}.`,
        `${label} delivered more for less, with conversions at ${conversionsText} from ${previousConversionsText} and CPA at ${cpaText} from ${previousCpaText}.`,
        `A productive ${label}, lifting conversions to ${conversionsText} from ${previousConversionsText} while CPA fell to ${cpaText} from ${previousCpaText}.`,
        `Week-on-week ${label} improved on both fronts: ${conversionsText} conversions versus ${previousConversionsText}, CPA ${cpaText} versus ${previousCpaText}.`,
      ],
      seed,
      "weekly-performance-up-efficient",
    );
  }

  // More conversions, but CPA flat or higher.
  if (conversionsUp) {
    const cpaClause =
      cpa !== null
        ? cpaWorsened
          ? `, with CPA easing to ${cpaText} from ${previousCpaText}`
          : ` at a CPA of ${cpaText}`
        : "";
    return pickVariant(
      [
        `${label} lifted conversions to ${conversionsText} from ${previousConversionsText}${cpaClause}.`,
        `Conversions grew across ${label} to ${conversionsText} from ${previousConversionsText}${cpaClause}.`,
        `${label} came in ahead of the prior week on volume, at ${conversionsText} conversions against ${previousConversionsText}${cpaClause}.`,
        `Volume improved in ${label}, with ${conversionsText} conversions versus ${previousConversionsText} the week before${cpaClause}.`,
        `${label} built on the prior week, reaching ${conversionsText} conversions from ${previousConversionsText}${cpaClause}.`,
        `The account converted ${conversionsText} times in ${label}, up from ${previousConversionsText}${cpaClause}.`,
        `${label} pushed volume higher, to ${conversionsText} conversions from ${previousConversionsText}${cpaClause}.`,
        `Week-on-week, ${label} added volume at ${conversionsText} conversions against ${previousConversionsText}${cpaClause}.`,
      ],
      seed,
      "weekly-performance-up",
    );
  }

  // Fewer conversions, but cheaper acquisition.
  if (conversionsDown && cpaImproved) {
    return pickVariant(
      [
        `${label} traded volume for efficiency: conversions eased to ${conversionsText} from ${previousConversionsText}, while CPA improved to ${cpaText} from ${previousCpaText}.`,
        `Conversions softened across ${label} to ${conversionsText} from ${previousConversionsText}, though CPA came down to ${cpaText} from ${previousCpaText}.`,
        `${label} saw ${conversionsText} conversions against ${previousConversionsText} the week prior, with CPA tightening to ${cpaText} from ${previousCpaText}.`,
        `Volume dipped in ${label} to ${conversionsText} from ${previousConversionsText}, but each conversion came cheaper at ${cpaText} versus ${previousCpaText}.`,
      ],
      seed,
      "weekly-performance-down-efficient",
    );
  }

  // Fewer conversions and no efficiency gain.
  if (conversionsDown) {
    const cpaClause =
      cpa !== null
        ? cpaWorsened
          ? `, and CPA rose to ${cpaText} from ${previousCpaText}`
          : ` at a CPA of ${cpaText}`
        : "";
    return pickVariant(
      [
        `${label} eased back to ${conversionsText} conversions from ${previousConversionsText}${cpaClause}.`,
        `Conversions softened across ${label} to ${conversionsText} from ${previousConversionsText}${cpaClause}.`,
        `${label} came in behind the prior week, at ${conversionsText} conversions against ${previousConversionsText}${cpaClause}.`,
        `Volume slipped in ${label} to ${conversionsText} from ${previousConversionsText}${cpaClause}.`,
        `${label} finished below the week prior, with ${conversionsText} conversions against ${previousConversionsText}${cpaClause}.`,
        `The account converted ${conversionsText} times in ${label}, down from ${previousConversionsText}${cpaClause}.`,
        `Week-on-week, ${label} gave back some volume at ${conversionsText} conversions from ${previousConversionsText}${cpaClause}.`,
        `${label} tracked lower on volume, at ${conversionsText} conversions versus ${previousConversionsText}${cpaClause}.`,
      ],
      seed,
      "weekly-performance-down",
    );
  }

  // Volume flat week-on-week, so lead on the efficiency move.
  if (previousConversions !== null && cpa !== null && (cpaImproved || cpaWorsened)) {
    const direction = cpaImproved ? "improved" : "rose";
    return pickVariant(
      [
        `${label} held conversions at ${conversionsText}, with CPA ${direction} to ${cpaText} from ${previousCpaText}.`,
        `Conversions were steady across ${label} at ${conversionsText}, while CPA ${direction} to ${cpaText} from ${previousCpaText}.`,
        `${label} matched the prior week at ${conversionsText} conversions, and CPA ${direction} to ${cpaText} from ${previousCpaText}.`,
        `Volume held flat in ${label} at ${conversionsText} conversions, with CPA ${direction} to ${cpaText} from ${previousCpaText}.`,
      ],
      seed,
      "weekly-performance-flat-cpa-move",
    );
  }

  // No prior week to compare against: describe the latest week on its own.
  if (conversions > 0 && cpa !== null) {
    return pickVariant(
      [
        `${label} delivered ${conversionsText} conversions at a CPA of ${cpaText}, with ${spendText} in spend.`,
        `${label} brought in ${conversionsText} conversions from ${spendText} in spend, at a CPA of ${cpaText}.`,
        `Across ${label}, ${spendText} in spend produced ${conversionsText} conversions at ${cpaText} each.`,
        `${label} closed out with ${conversionsText} conversions, ${spendText} in spend and a CPA of ${cpaText}.`,
      ],
      seed,
      "weekly-intro-converting",
    );
  }
  if (spend > 0) {
    return pickVariant(
      [
        `${label} recorded ${spendText} in Google Ads spend, with the completed-week trend included below for context.`,
        `Google Ads spend for ${label} came in at ${spendText}, and the completed-week trend is below for context.`,
        `${label} used ${spendText} in spend, with the completed-week trend set out below.`,
        `Spend across ${label} was ${spendText}, and the completed-week trend follows below.`,
      ],
      seed,
      "weekly-intro-spend",
    );
  }
  return pickVariant(
    [
      `${label} is included as the completed-week view, with the budget tracker below for current pacing context.`,
      `${label} is the completed-week view, and the budget tracker below covers current pacing.`,
      `Below is the completed week for ${label}, along with the budget tracker for current pacing.`,
    ],
    seed,
    "weekly-intro-flat",
  );
}

function buildPacingSentence(budget: WeeklySummaryBudget | undefined, seed: number): string {
  if (!budget || budget.monthlyBudget <= 0) return "";
  if (budget.pacingDifference <= 0) {
    return pickVariant(
      [
        "Spend stayed controlled, keeping the account under budget and giving us a strong base for the rest of the month.",
        "Spend is tracking under budget for the month, which leaves room to lean into what is working.",
        "Budget pacing is comfortable, with the account sitting under target and the rest of the month still to run.",
        "Spend remains below the month-to-date target, so there is headroom left for the back half of the month.",
        "Pacing is sitting under the month-to-date target, leaving budget available for the weeks ahead.",
        "The account is running below budget for the month, so there is room to scale what is performing.",
      ],
      seed,
      "weekly-budget-under",
    );
  }
  return pickVariant(
    [
      "Spend is currently ahead of the month-to-date target, so we’ll keep pacing closely through the rest of the month.",
      "Spend is running ahead of the month-to-date target, so we’re watching pacing closely for the remainder of the month.",
      "The account is tracking ahead of the month-to-date budget target, so we’ll manage pacing tightly through month end.",
      "Month-to-date spend sits above target, so pacing is being adjusted for the rest of the month.",
      "Pacing is ahead of the month-to-date target, so we’re moderating delivery through the back half of the month.",
      "The account is above its month-to-date budget target, so spend is being reined in for the rest of the month.",
    ],
    seed,
    "weekly-budget-over",
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 }).format(value);
}
