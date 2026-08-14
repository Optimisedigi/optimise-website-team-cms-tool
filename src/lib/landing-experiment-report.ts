/**
 * Aggregation and statistics for landing A/B reporting.
 *
 * The statistics here are deliberately conservative. An A/B dashboard that
 * announces a winner early is worse than no dashboard, because it converts
 * noise into a confident decision. Everything below reports uncertainty
 * alongside the estimate and refuses to call a result when the sample cannot
 * support it.
 */

/** Minimum conversions per variant before a comparison is worth showing at all. */
export const MIN_CONVERSIONS_FOR_CALL = 25;
/** Minimum sessions per variant before a comparison is worth showing at all. */
export const MIN_SESSIONS_FOR_CALL = 300;

export interface VariantAccumulator {
  variantId: string;
  sessions: Set<string>;
  convertedSessions: Set<string>;
  eventCounts: Record<string, number>;
}

export interface VariantSummary {
  variantId: string;
  sessions: number;
  conversions: number;
  conversionRate: number;
  /** 95% Wilson interval for the conversion rate, as [low, high]. */
  interval: [number, number];
  eventCounts: Record<string, number>;
}

export interface ComparisonSummary {
  controlVariantId: string;
  variantId: string;
  /** Relative change in conversion rate against the control. */
  upliftPct: number | null;
  /** Two-sided p-value from a two-proportion z-test. */
  pValue: number | null;
  significant: boolean;
  /** True when the sample is too small to support any call, regardless of p. */
  underpowered: boolean;
}

export function createAccumulator(variantId: string): VariantAccumulator {
  return { variantId, sessions: new Set(), convertedSessions: new Set(), eventCounts: {} };
}

/**
 * Wilson score interval. Preferred over the normal approximation because it
 * stays inside [0,1] and behaves sensibly at the small samples and low
 * conversion rates that landing pages actually produce.
 */
export function wilsonInterval(successes: number, trials: number, z = 1.959963985): [number, number] {
  if (trials <= 0) return [0, 0];
  const p = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const centre = p + (z * z) / (2 * trials);
  const spread = z * Math.sqrt((p * (1 - p)) / trials + (z * z) / (4 * trials * trials));
  const low = (centre - spread) / denominator;
  const high = (centre + spread) / denominator;
  return [Math.max(0, low), Math.min(1, high)];
}

/** Abramowitz–Stegun approximation of the standard normal CDF. */
function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const probability =
    d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x > 0 ? 1 - probability : probability;
}

/** Two-sided p-value from a pooled two-proportion z-test. */
export function twoProportionPValue(
  successesA: number,
  trialsA: number,
  successesB: number,
  trialsB: number
): number | null {
  if (trialsA <= 0 || trialsB <= 0) return null;
  const pooled = (successesA + successesB) / (trialsA + trialsB);
  if (pooled <= 0 || pooled >= 1) return null;
  const standardError = Math.sqrt(pooled * (1 - pooled) * (1 / trialsA + 1 / trialsB));
  if (standardError === 0) return null;
  const z = (successesB / trialsB - successesA / trialsA) / standardError;
  return 2 * (1 - normalCdf(Math.abs(z)));
}

export function summariseVariant(accumulator: VariantAccumulator): VariantSummary {
  const sessions = accumulator.sessions.size;
  const conversions = accumulator.convertedSessions.size;
  return {
    variantId: accumulator.variantId,
    sessions,
    conversions,
    conversionRate: sessions > 0 ? conversions / sessions : 0,
    interval: wilsonInterval(conversions, sessions),
    eventCounts: accumulator.eventCounts,
  };
}

/**
 * Compare each variant against the control.
 *
 * `significant` requires BOTH a p-value under 0.05 and a sample that clears the
 * minimum thresholds, so an early lucky streak cannot present itself as a
 * result. `underpowered` is reported separately so the UI can say why.
 */
export function compareVariants(
  summaries: VariantSummary[],
  controlVariantId: string
): ComparisonSummary[] {
  const control = summaries.find((summary) => summary.variantId === controlVariantId);
  if (!control) return [];

  return summaries
    .filter((summary) => summary.variantId !== controlVariantId)
    .map((summary) => {
      const pValue = twoProportionPValue(
        control.conversions,
        control.sessions,
        summary.conversions,
        summary.sessions
      );
      const underpowered =
        control.sessions < MIN_SESSIONS_FOR_CALL ||
        summary.sessions < MIN_SESSIONS_FOR_CALL ||
        control.conversions < MIN_CONVERSIONS_FOR_CALL ||
        summary.conversions < MIN_CONVERSIONS_FOR_CALL;

      return {
        controlVariantId,
        variantId: summary.variantId,
        upliftPct:
          control.conversionRate > 0
            ? ((summary.conversionRate - control.conversionRate) / control.conversionRate) * 100
            : null,
        pValue,
        significant: pValue !== null && pValue < 0.05 && !underpowered,
        underpowered,
      };
    });
}
