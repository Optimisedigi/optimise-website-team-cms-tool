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

/**
 * Goals that are not event types.
 *
 * The readiness checklist is a `form_submit` from one particular form, and the
 * page has always sent it that way. Treating it as a filter rather than a new
 * event type means it counts retroactively over data already collected, and no
 * SDK or schema change is needed.
 */
export const READINESS_CHECKLIST_GOAL = "readiness_checklist";
export const READINESS_CHECKLIST_FORM_ID = "readiness-checklist";

/**
 * The qualification form, whose submit is what creates the HubSpot contact.
 *
 * `result` reads `accepted` only once HubSpot has taken the submission. A
 * `deferred` submit means the CRM write did not land, and the booking step
 * retries the lead before it books, so counting deferred submits would report
 * leads that never reached HubSpot.
 */
export const QUALIFICATION_FORM_ID = "qualification";
export const QUALIFICATION_ACCEPTED_RESULT = "accepted";

/**
 * A lead, as the client counts one: the visitor handed over their details.
 *
 * The dashboard used to count only `booking_complete`, so someone who submitted
 * the qualification form and never picked a time showed up in HubSpot as a paid
 * sign-up while the dashboard reported zero. Bookings stay included because the
 * shortcut path books without passing through the details step at all.
 *
 * Applied per session, so a visitor who submits and then books is one lead.
 * Both halves are module constants, never caller input.
 */
export const LEAD_SQL_PREDICATE =
  "(`event_type` = 'booking_complete' OR (`event_type` = 'form_submit'" +
  " AND json_extract(`properties`, '$.form_id') = '" + QUALIFICATION_FORM_ID + "'" +
  " AND json_extract(`properties`, '$.result') = '" + QUALIFICATION_ACCEPTED_RESULT + "'))";

/** Does this event satisfy `goal`, for goals that are event types and for those that are not. */
export function matchesGoal(
  goal: string,
  eventType: string,
  properties: Record<string, unknown>
): boolean {
  if (goal === READINESS_CHECKLIST_GOAL) {
    return eventType === "form_submit" && properties.form_id === READINESS_CHECKLIST_FORM_ID;
  }
  return eventType === goal;
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
  /** Distinct sessions whose scroll depth crossed the section's leading edge. */
  sessions: number;
  /** Reached sessions as a share of all filtered landing-page sessions. */
  reachRate: number;
  /** Sessions that supplied usable dominant-section active time. */
  timingSamples: number;
  /** Median active seconds while this was the dominant visible section. */
  medianSeconds: number;
  /** Sessions that gave this section at least three active seconds. */
  engagedSessions: number;
  engagedRate: number;
  /** Retained in the API for older dashboard clients; no longer shown. */
  p90Seconds: number;
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
  // A session that reached a later step must have passed through the earlier
  // ones, so each step counts every session seen at it or beyond. Backfilling
  // keeps the funnel non-increasing without ever reporting a real conversion as
  // zero: a missing earlier event is a measurement gap (lost beacon, consent
  // timing), not proof the visitor never landed.
  const reachedPerStep: number[] = new Array(FUNNEL_STEPS.length).fill(0);
  const reachedSessions = new Set<string>();
  for (let index = FUNNEL_STEPS.length - 1; index >= 0; index -= 1) {
    for (const sessionId of stepSessions.get(FUNNEL_STEPS[index].key) ?? []) {
      reachedSessions.add(sessionId);
    }
    reachedPerStep[index] = reachedSessions.size;
  }

  const entry = reachedPerStep[0];
  let previous = entry;

  return FUNNEL_STEPS.map((step, index) => {
    const reached = reachedPerStep[index];
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
  sessionsWithExit: number,
  reachedSessionsBySection: Map<string, Set<string>> = new Map(),
  engagedSessionsBySection: Map<string, Set<string>> = new Map(),
  totalSessions = 0,
): SectionDwell[] {
  // Include reached-only sections: a dropped lifecycle beacon must remove timing,
  // not erase evidence that the visitor reached the section.
  const sectionIds = new Set([
    ...reachedSessionsBySection.keys(),
    ...engagedSessionsBySection.keys(),
    ...dwellMs.keys(),
    ...exitsBySection.keys(),
  ]);

  return [...sectionIds]
    .map((sectionId) => {
      const sorted = [...(dwellMs.get(sectionId) ?? [])].sort((a, b) => a - b);
      const exits = exitsBySection.get(sectionId) ?? 0;
      const sessions = reachedSessionsBySection.get(sectionId)?.size ?? 0;
      const engagedSessions = engagedSessionsBySection.get(sectionId)?.size ?? 0;
      return {
        sectionId,
        sessions,
        reachRate: totalSessions > 0 ? sessions / totalSessions : 0,
        timingSamples: sorted.length,
        medianSeconds: Math.round(percentile(sorted, 0.5) / 100) / 10,
        engagedSessions,
        engagedRate: sessions > 0 ? engagedSessions / sessions : 0,
        p90Seconds: Math.round(percentile(sorted, 0.9) / 100) / 10,
        exits,
        exitRate: sessionsWithExit > 0 ? exits / sessionsWithExit : 0,
      };
    })
    .sort((a, b) => b.medianSeconds - a.medianSeconds || b.sessions - a.sessions);
}

export interface SessionTime {
  /** Sessions that reported page_dwell at all. */
  measuredSessions: number;
  /** Sessions in range with no page_dwell — recorded before the SDK sent it. */
  unmeasuredSessions: number;
  medianActiveSeconds: number;
  p90ActiveSeconds: number;
  /** Wall clock, including time the tab sat in the background. */
  medianTotalSeconds: number;
}

/**
 * Time on the page per session, from `page_dwell`.
 *
 * Reported separately from section dwell because the two cannot be derived from
 * each other: sections overlap on screen, so summing them overcounts.
 *
 * Sessions with no page_dwell are counted, not treated as zero seconds. Every
 * session recorded before the SDK started sending the event is in that bucket,
 * and folding them in as zeros would drag the median toward nothing and look
 * like a collapse in engagement that never happened.
 */
export function summariseSessionTime(
  activeMsBySession: Map<string, number>,
  totalMsBySession: Map<string, number>,
  sessionsInRange: number
): SessionTime {
  const active = [...activeMsBySession.values()].sort((a, b) => a - b);
  const total = [...totalMsBySession.values()].sort((a, b) => a - b);
  const seconds = (ms: number) => Math.round(ms / 100) / 10;

  return {
    measuredSessions: active.length,
    unmeasuredSessions: Math.max(0, sessionsInRange - active.length),
    medianActiveSeconds: seconds(percentile(active, 0.5)),
    p90ActiveSeconds: seconds(percentile(active, 0.9)),
    medianTotalSeconds: seconds(percentile(total, 0.5)),
  };
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
