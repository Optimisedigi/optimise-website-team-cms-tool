import type { GoogleAdsEmailComponentKey } from "@/lib/google-ads-email-components";
import { pickVariant } from "./_email-copy-variants";

/**
 * Component-driven insight sentence for report emails.
 *
 * Extracted from create_monthly_budget_gmail_draft so the weekly and monthly
 * emails describe the same dashboard components in the same words. Each clause
 * is seed-varied so a batch of accounts does not repeat identical boilerplate;
 * the figures are never varied, only the wording around them.
 *
 * The `pickVariant` slot names are part of the output contract: renaming one
 * changes which variant an existing seed selects.
 */

export interface EmailComponentData {
  keywordRelevancyTrend?: Array<{ label: string; value: number | null }>;
  cpaTrend?: Array<{ label: string; value: number | null }>;
  qualityScore?: {
    latestQualityScore?: number | null;
    latestMonth?: string | null;
    trend?: Array<{ label: string; value: number | null }>;
  } | null;
  topConverters?: Array<{ term: string; conversions?: number | null; cpa?: number | null }>;
}

export function buildComponentInsightSentence(
  components: GoogleAdsEmailComponentKey[],
  dashboardData?: EmailComponentData,
  seed = 0,
): string {
  const insights: string[] = [];
  const joinSeed = seed;

  for (const component of components) {
    if (component === "keyword_relevancy") {
      const trend = dashboardData?.keywordRelevancyTrend?.filter(hasNumericValue);
      if (trend && trend.length >= 2) {
        const latest = trend[trend.length - 1]!;
        const previous = trend[trend.length - 2]!;
        const delta = Number(latest.value) - Number(previous.value);
        const current = formatPercent(Number(latest.value));
        const prior = formatPercent(Number(previous.value));
        if (delta >= 0.5) {
          insights.push(
            pickVariant(
              [
                `search relevance improved to ${current} from ${prior}`,
                `search relevance climbed to ${current} from ${prior}`,
                `search relevance strengthened to ${current} from ${prior}`,
                `search relevance moved up to ${current} from ${prior}`,
              ],
              seed,
              "insight-relevancy-up",
            ),
          );
        } else if (delta <= -0.5) {
          insights.push(
            pickVariant(
              [
                `search relevance softened to ${current} from ${prior}`,
                `search relevance eased to ${current} from ${prior}`,
                `search relevance slipped to ${current} from ${prior}`,
                `search relevance pulled back to ${current} from ${prior}`,
              ],
              seed,
              "insight-relevancy-down",
            ),
          );
        } else {
          insights.push(
            pickVariant(
              [
                `search relevance held steady at ${current}`,
                `search relevance stayed level at ${current}`,
                `search relevance was unchanged at ${current}`,
                `search relevance held at ${current}`,
              ],
              seed,
              "insight-relevancy-flat",
            ),
          );
        }
      }
      continue;
    }

    if (component === "cpa_trend") {
      const trend = dashboardData?.cpaTrend?.filter(hasNumericValue);
      if (trend && trend.length >= 2) {
        const latest = trend[trend.length - 1]!;
        const previous = trend[trend.length - 2]!;
        const delta = Number(latest.value) - Number(previous.value);
        const current = formatCurrency(Number(latest.value));
        const prior = formatCurrency(Number(previous.value));
        if (delta <= -5) {
          insights.push(
            pickVariant(
              [
                `the wider CPA trend improved to ${current} from ${prior}`,
                `the wider CPA trend came down to ${current} from ${prior}`,
                `the broader CPA trend tightened to ${current} from ${prior}`,
                `the longer-run CPA trend fell to ${current} from ${prior}`,
              ],
              seed,
              "insight-cpa-down",
            ),
          );
        } else if (delta >= 5) {
          insights.push(
            pickVariant(
              [
                `the wider CPA trend rose to ${current} from ${prior}`,
                `the wider CPA trend edged up to ${current} from ${prior}`,
                `the broader CPA trend lifted to ${current} from ${prior}`,
                `the longer-run CPA trend climbed to ${current} from ${prior}`,
              ],
              seed,
              "insight-cpa-up",
            ),
          );
        } else {
          insights.push(
            pickVariant(
              [
                `the wider CPA trend held steady at ${current}`,
                `the wider CPA trend stayed level at ${current}`,
                `the broader CPA trend was largely unchanged at ${current}`,
                `the longer-run CPA trend held at ${current}`,
              ],
              seed,
              "insight-cpa-flat",
            ),
          );
        }
      }
      continue;
    }

    if (component === "quality_score") {
      const latestScore = Number(dashboardData?.qualityScore?.latestQualityScore ?? NaN);
      const latestMonth = String(dashboardData?.qualityScore?.latestMonth ?? "").trim();
      const trend = dashboardData?.qualityScore?.trend?.filter(hasNumericValue);
      if (Number.isFinite(latestScore)) {
        const prior = trend && trend.length >= 2 ? Number(trend[trend.length - 2]?.value ?? NaN) : NaN;
        if (Number.isFinite(prior)) {
          const direction =
            latestScore >= prior + 0.2 ? "improved" : latestScore <= prior - 0.2 ? "softened" : "held steady";
          insights.push(
            direction === "held steady"
              ? `Quality Score held steady${latestMonth ? ` in ${latestMonth}` : ""} at ${formatScore(latestScore)}`
              : `Quality Score ${direction}${latestMonth ? ` in ${latestMonth}` : ""} to ${formatScore(latestScore)} from ${formatScore(prior)}`,
          );
        } else {
          insights.push(`Quality Score sits at ${formatScore(latestScore)}${latestMonth ? ` in ${latestMonth}` : ""}`);
        }
      }
      continue;
    }

    if (component === "top_converters") {
      const top = dashboardData?.topConverters?.[0];
      const conversions = Number(top?.conversions ?? 0);
      if (top?.term && conversions > 0) {
        const cpaText =
          Number.isFinite(Number(top.cpa)) && Number(top.cpa) > 0
            ? ` at a CPA of ${formatCurrency(Number(top.cpa))}`
            : "";
        insights.push(
          `the strongest converting search was ${top.term}, generating ${formatNumber(conversions)} conversions${cpaText}`,
        );
      }
    }
  }

  if (insights.length === 0) {
    return pickVariant(
      [
        "The supporting trend data is included below to show how efficiency and search quality moved across the recent reporting window.",
        "The trend data below shows how efficiency and search quality moved over the recent reporting window.",
        "Supporting trends for efficiency and search quality across the recent reporting window are below.",
      ],
      seed,
      "monthly-insight-fallback",
    );
  }

  return `${joinInsights(insights, joinSeed)}.`;
}

/**
 * Joins the clauses with a seed-varied connector. This is a cheap extra axis of
 * variation: without it, two accounts whose individual clauses happen to match
 * produce a byte-identical sentence.
 */
function joinInsights(insights: string[], seed: number): string {
  if (insights.length === 1) return capitalize(insights[0]!);
  if (insights.length === 2) {
    const connector = pickVariant([" and ", ", while ", ", and "], seed, "insight-join-pair");
    return `${capitalize(insights[0]!)}${connector}${insights[1]!}`;
  }
  const finalConnector = pickVariant([", and ", ", while "], seed, "insight-join-final");
  return `${capitalize(insights.slice(0, -1).join(", "))}${finalConnector}${insights[insights.length - 1]!}`;
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function hasNumericValue<T extends { value: number | null }>(row: T): row is T & { value: number } {
  return typeof row.value === "number" && Number.isFinite(row.value);
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

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 }).format(value)}%`;
}

function formatScore(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}
