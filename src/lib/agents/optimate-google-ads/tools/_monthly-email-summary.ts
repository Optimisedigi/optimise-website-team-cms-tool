import type { GoogleAdsEmailComponentKey } from "@/lib/google-ads-email-components";
import { pickVariant } from "./_email-copy-variants";
import { buildComponentInsightSentence, type EmailComponentData } from "./_email-component-insights";

/**
 * The single top-line summary used by every monthly Google Ads report email,
 * whether the draft is created from an individual account chat or batched
 * across selected/portfolio accounts.
 *
 * Mirrors `_weekly-email-summary.ts`: performance compared month-on-month
 * against the prior completed month, then the shared component insight
 * sentence. Uniqueness comes from `seed` (client + customer + month), so a
 * batch of accounts does not repeat identical boilerplate while a re-run for
 * the same account and month is byte-stable. Only wording varies, never the
 * figures.
 */

export interface MonthlySummaryRow {
  label: string;
  totals: { spend: number; conversions: number };
  metrics?: { cpa?: number | null } & Record<string, number | null | undefined>;
}

export interface MonthlyEmailSummaryInput {
  rows: MonthlySummaryRow[];
  components: GoogleAdsEmailComponentKey[];
  dashboardData?: EmailComponentData;
  seed?: number;
}

export function buildMonthlyEmailSummary({
  rows,
  components,
  dashboardData,
  seed = 0,
}: MonthlyEmailSummaryInput): string {
  return [
    buildPerformanceSentence(rows, seed),
    buildComponentInsightSentence(components, dashboardData, seed),
  ]
    .filter(Boolean)
    .join(" ");
}

function resolveCpa(row: MonthlySummaryRow | undefined): number | null {
  if (!row) return null;
  const declared = row.metrics?.cpa;
  if (typeof declared === "number" && Number.isFinite(declared)) return declared;
  const conversions = Number(row.totals?.conversions ?? 0);
  const spend = Number(row.totals?.spend ?? 0);
  return conversions > 0 ? spend / conversions : null;
}

/**
 * Month-on-month performance. When a prior completed month is available the
 * sentence states the direction of travel for conversions and CPA; otherwise it
 * falls back to describing the latest month on its own.
 */
function buildPerformanceSentence(rows: MonthlySummaryRow[], seed: number): string {
  const latest = rows[rows.length - 1];
  const previous = rows[rows.length - 2];
  if (!latest) return "Here is the monthly Google Ads performance update.";

  const label = latest.label;
  const conversions = Number(latest.totals?.conversions ?? 0);
  const spend = Number(latest.totals?.spend ?? 0);
  const cpa = resolveCpa(latest);
  const previousConversions = previous ? Number(previous.totals?.conversions ?? 0) : null;
  const previousCpa = resolveCpa(previous);

  const conversionsText = formatNumber(conversions);
  const cpaText = cpa !== null ? formatCurrency(cpa) : "";
  const spendText = formatCurrency(spend);
  const previousConversionsText =
    previousConversions !== null ? formatNumber(previousConversions) : "";
  const previousCpaText = previousCpa !== null ? formatCurrency(previousCpa) : "";

  const conversionsUp = previousConversions !== null && conversions > previousConversions;
  const conversionsDown = previousConversions !== null && conversions < previousConversions;
  const cpaImproved = cpa !== null && previousCpa !== null && cpa < previousCpa;
  const cpaWorsened = cpa !== null && previousCpa !== null && cpa > previousCpa;

  // Best case: more conversions and cheaper than the month before.
  if (conversionsUp && cpaImproved) {
    return pickVariant(
      [
        `${label} was a strong month: conversions rose to ${conversionsText} from ${previousConversionsText} while CPA improved to ${cpaText} from ${previousCpaText}.`,
        `${label} performed well, lifting conversions to ${conversionsText} from ${previousConversionsText} and bringing CPA down to ${cpaText} from ${previousCpaText}.`,
        `A strong ${label}: ${conversionsText} conversions against ${previousConversionsText} the month prior, with CPA tightening to ${cpaText} from ${previousCpaText}.`,
        `Both volume and efficiency improved in ${label}: ${conversionsText} conversions from ${previousConversionsText}, at ${cpaText} against ${previousCpaText}.`,
        `${label} delivered more for less, with conversions at ${conversionsText} from ${previousConversionsText} and CPA at ${cpaText} from ${previousCpaText}.`,
        `Month-on-month ${label} improved on both fronts: ${conversionsText} conversions versus ${previousConversionsText}, CPA ${cpaText} versus ${previousCpaText}.`,
      ],
      seed,
      "monthly-performance-up-efficient",
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
        `${label} came in ahead of the prior month on volume, at ${conversionsText} conversions against ${previousConversionsText}${cpaClause}.`,
        `Volume improved in ${label}, with ${conversionsText} conversions versus ${previousConversionsText} the month before${cpaClause}.`,
        `${label} built on the prior month, reaching ${conversionsText} conversions from ${previousConversionsText}${cpaClause}.`,
        `Month-on-month, ${label} added volume at ${conversionsText} conversions against ${previousConversionsText}${cpaClause}.`,
      ],
      seed,
      "monthly-performance-up",
    );
  }

  // Fewer conversions, but cheaper acquisition.
  if (conversionsDown && cpaImproved) {
    return pickVariant(
      [
        `${label} traded volume for efficiency: conversions eased to ${conversionsText} from ${previousConversionsText}, while CPA improved to ${cpaText} from ${previousCpaText}.`,
        `Conversions softened across ${label} to ${conversionsText} from ${previousConversionsText}, though CPA came down to ${cpaText} from ${previousCpaText}.`,
        `${label} saw ${conversionsText} conversions against ${previousConversionsText} the month prior, with CPA tightening to ${cpaText} from ${previousCpaText}.`,
        `Volume dipped in ${label} to ${conversionsText} from ${previousConversionsText}, but each conversion came cheaper at ${cpaText} versus ${previousCpaText}.`,
      ],
      seed,
      "monthly-performance-down-efficient",
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
        `${label} came in behind the prior month, at ${conversionsText} conversions against ${previousConversionsText}${cpaClause}.`,
        `Volume slipped in ${label} to ${conversionsText} from ${previousConversionsText}${cpaClause}.`,
        `The account converted ${conversionsText} times in ${label}, down from ${previousConversionsText}${cpaClause}.`,
        `Month-on-month, ${label} gave back some volume at ${conversionsText} conversions from ${previousConversionsText}${cpaClause}.`,
      ],
      seed,
      "monthly-performance-down",
    );
  }

  // Volume flat month-on-month, so lead on the efficiency move.
  if (previousConversions !== null && cpa !== null && (cpaImproved || cpaWorsened)) {
    const direction = cpaImproved ? "improved" : "rose";
    return pickVariant(
      [
        `${label} held conversions at ${conversionsText}, with CPA ${direction} to ${cpaText} from ${previousCpaText}.`,
        `Conversions were steady across ${label} at ${conversionsText}, while CPA ${direction} to ${cpaText} from ${previousCpaText}.`,
        `${label} matched the prior month at ${conversionsText} conversions, and CPA ${direction} to ${cpaText} from ${previousCpaText}.`,
        `Volume held flat in ${label} at ${conversionsText} conversions, with CPA ${direction} to ${cpaText} from ${previousCpaText}.`,
      ],
      seed,
      "monthly-performance-flat-cpa-move",
    );
  }

  // No prior month to compare against: describe the latest month on its own.
  if (conversions > 0 && cpa !== null) {
    const cpaTone = cpa <= 100 ? "efficient" : cpa <= 150 ? "steady" : "heavier than target";
    return pickVariant(
      [
        `${label} delivered ${conversionsText} conversions from ${spendText} in spend, with CPA ${cpaTone} at ${cpaText}.`,
        `Across ${label}, ${spendText} in spend produced ${conversionsText} conversions, with CPA ${cpaTone} at ${cpaText}.`,
        `${label} finished with ${conversionsText} conversions on ${spendText} of spend, and CPA ${cpaTone} at ${cpaText}.`,
        `In ${label} the account converted ${conversionsText} times off ${spendText} in spend, keeping CPA ${cpaTone} at ${cpaText}.`,
      ],
      seed,
      "monthly-performance-converting",
    );
  }

  if (spend > 0) {
    return pickVariant(
      [
        `${label} recorded ${spendText} in Google Ads spend, with the monthly trend included below for context.`,
        `Google Ads spend for ${label} came in at ${spendText}, and the monthly trend is below for context.`,
        `${label} used ${spendText} in spend, with the monthly trend set out below.`,
        `Spend across ${label} was ${spendText}, and the monthly trend follows below.`,
      ],
      seed,
      "monthly-performance-spend",
    );
  }

  return pickVariant(
    [
      `${label} is included as the completed-month view, with the trend below for context.`,
      `${label} is the completed-month view, and the trend below covers recent performance.`,
      `Below is the completed month for ${label}, along with the recent performance trend.`,
    ],
    seed,
    "monthly-performance-flat",
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 }).format(value);
}
