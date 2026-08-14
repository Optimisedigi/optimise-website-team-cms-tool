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
 * The funnel, in the order a visitor moves through it.
 *
 * Drop-off is measured on distinct sessions that reached each step, not on
 * event counts: one person clicking a call to action four times is one person
 * who reached that step, and counting the clicks would invent a funnel that
 * grows in the middle.
 */
export const FUNNEL_STEPS = [
  { key: "page_view", label: "Landed" },
  { key: "cta_click", label: "Clicked a CTA" },
  { key: "form_start", label: "Started the form" },
  { key: "form_submit", label: "Submitted the form" },
  { key: "booking_open", label: "Opened booking" },
  { key: "booking_complete", label: "Booked" },
] as const;

export interface FunnelStep {
  key: string;
  label: string;
  sessions: number;
  /** Share of the sessions that entered the funnel at all. */
  shareOfEntry: number;
  /** Sessions lost between the previous step and this one. */
  droppedFromPrevious: number;
  /** That loss as a share of the previous step, which is the actionable number. */
  dropOffRate: number;
}

export interface SectionDwell {
  sectionId: string;
  /** Sessions that saw the section at all. */
  sessions: number;
  /** Median active seconds on screen. Median, because a few idle tabs skew a mean badly. */
  medianSeconds: number;
  /** 90th percentile, to show the spread rather than implying everyone behaved alike. */
  p90Seconds: number;
  /** Sessions whose last seen section was this one: where people stopped reading. */
  exits: number;
  exitRate: number;
}

/**
 * Build the funnel from per-step session sets.
 *
 * Steps nobody reached are kept rather than dropped, because an empty step is
 * usually the finding: it says the journey ends before that point.
 */
export function buildFunnel(stepSessions: Map<string, Set<string>>): FunnelStep[] {
  const entry = stepSessions.get(FUNNEL_STEPS[0].key)?.size ?? 0;
  let previous = entry;

  return FUNNEL_STEPS.map((step, index) => {
    const sessions = stepSessions.get(step.key)?.size ?? 0;
    // A later step can only be reached through the earlier ones, so a step is
    // never reported as larger than the one before it.
    const reached = index === 0 ? sessions : Math.min(sessions, previous);
    const dropped = index === 0 ? 0 : Math.max(0, previous - reached);
    const rate = index === 0 || previous === 0 ? 0 : dropped / previous;
    const result = {
      key: step.key,
      label: step.label,
      sessions: reached,
      shareOfEntry: entry > 0 ? reached / entry : 0,
      droppedFromPrevious: dropped,
      dropOffRate: rate,
    };
    previous = reached;
    return result;
  });
}

/** Percentile of a numeric sample, using nearest-rank on sorted values. */
export function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil(fraction * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1];
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

/**
 * Summarise time on each section, and where people stopped.
 *
 * `dwellMs` holds one figure per session per section, taken from the dwell
 * event the page sends as it is left, so a session that saw a section twice
 * contributes once rather than inflating the sample.
 */
export function summariseSections(
  dwellMs: Map<string, number[]>,
  exitsBySection: Map<string, number>,
  sessionsWithExit: number
): SectionDwell[] {
  // Sections are taken from both sources, not just from dwell. A section people
  // leave immediately produces little or no dwell data, so listing only
  // sections with samples would hide the sharpest drop-off point on the page.
  const sectionIds = new Set([...dwellMs.keys(), ...exitsBySection.keys()]);

  return [...sectionIds]
    .map((sectionId) => {
      const sorted = [...(dwellMs.get(sectionId) ?? [])].sort((a, b) => a - b);
      const exits = exitsBySection.get(sectionId) ?? 0;
      return {
        sectionId,
        sessions: sorted.length,
        medianSeconds: Math.round(percentile(sorted, 0.5) / 100) / 10,
        p90Seconds: Math.round(percentile(sorted, 0.9) / 100) / 10,
        exits,
        exitRate: sessionsWithExit > 0 ? exits / sessionsWithExit : 0,
      };
    })
    // Most time first, but a section with no dwell data and real exits still
    // has to appear, so exits break the tie rather than sinking it to the end.
    .sort((a, b) => b.medianSeconds - a.medianSeconds || b.exits - a.exits);
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
