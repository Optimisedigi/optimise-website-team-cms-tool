import type { GoogleAdsEmailComponentKey } from "@/lib/google-ads-email-components";
import { pickCopy } from "./_email-copy-variants";
import type { ClientEmailCopy } from "./_email-copy-slots";
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
 *
 * The phrasings themselves live in `_email-copy-slots.ts` and are overridable
 * from OptiMate Settings; pass the loaded overrides as `copy`.
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
  /** Editable phrasings from OptiMate Settings; defaults are used when absent. */
  copy?: ClientEmailCopy;
}

export function buildMonthlyEmailSummary({
  rows,
  components,
  dashboardData,
  seed = 0,
  copy,
}: MonthlyEmailSummaryInput): string {
  return [
    buildPerformanceSentence(rows, seed, copy),
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
function buildPerformanceSentence(
  rows: MonthlySummaryRow[],
  seed: number,
  copy: ClientEmailCopy | undefined,
): string {
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

  const tokens = {
    period: label,
    conversions: conversionsText,
    prevConversions: previousConversionsText,
    cpa: cpaText,
    prevCpa: previousCpaText,
    spend: spendText,
  };

  // Best case: more conversions and cheaper than the month before.
  if (conversionsUp && cpaImproved) {
    return pickCopy("monthly-performance-up-efficient", seed, copy, tokens);
  }

  // More conversions, but CPA flat or higher.
  if (conversionsUp) {
    return pickCopy("monthly-performance-up", seed, copy, {
      ...tokens,
      cpaClause: buildCpaClause(cpa, cpaWorsened, cpaText, previousCpaText, "easing"),
    });
  }

  // Fewer conversions, but cheaper acquisition.
  if (conversionsDown && cpaImproved) {
    return pickCopy("monthly-performance-down-efficient", seed, copy, tokens);
  }

  // Fewer conversions and no efficiency gain.
  if (conversionsDown) {
    return pickCopy("monthly-performance-down", seed, copy, {
      ...tokens,
      cpaClause: buildCpaClause(cpa, cpaWorsened, cpaText, previousCpaText, "rose"),
    });
  }

  // Volume flat month-on-month, so lead on the efficiency move.
  if (previousConversions !== null && cpa !== null && (cpaImproved || cpaWorsened)) {
    return pickCopy("monthly-performance-flat-cpa-move", seed, copy, {
      ...tokens,
      direction: cpaImproved ? "improved" : "rose",
    });
  }

  // No prior month to compare against: describe the latest month on its own.
  if (conversions > 0 && cpa !== null) {
    return pickCopy("monthly-performance-converting", seed, copy, {
      ...tokens,
      cpaTone: cpa <= 100 ? "efficient" : cpa <= 150 ? "steady" : "heavier than target",
    });
  }

  if (spend > 0) {
    return pickCopy("monthly-performance-spend", seed, copy, tokens);
  }

  return pickCopy("monthly-performance-flat", seed, copy, tokens);
}

/**
 * The trailing CPA clause for the mixed-direction sentences. Rendered here
 * rather than in a slot template because it is conditional: it names the prior
 * month only when CPA actually moved the wrong way.
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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 }).format(value);
}
