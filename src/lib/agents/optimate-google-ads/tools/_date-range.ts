/**
 * Shared date-range resolver for Optimate-Google-Ads read tools.
 *
 * The Growth Tools `campaign-budgets/get-metrics` and `search-terms` endpoints
 * accept a `dateRange` enum. We expose a friendlier `range` arg on the agent's
 * read tools and resolve it here. Anything we can't pass through verbatim is
 * coerced to the nearest supported preset and we surface that fact via
 * `coercedFrom` so the agent can be transparent.
 *
 * Supported presets (passed through to Growth Tools as-is):
 *   TODAY, YESTERDAY, LAST_7_DAYS, LAST_14_DAYS, LAST_30_DAYS,
 *   LAST_60_DAYS, LAST_90_DAYS, THIS_MONTH, LAST_MONTH,
 *   THIS_WEEK_MON_TODAY, LAST_WEEK_SUN_SAT
 *
 * Coerced (mapped to nearest preset):
 *   YEAR_TO_DATE       → LAST_90_DAYS  (best widely-supported approximation)
 *   QUARTER_TO_DATE    → LAST_90_DAYS
 *   THIS_QUARTER       → LAST_90_DAYS
 *   LAST_QUARTER       → LAST_90_DAYS
 *
 * Custom ISO date ranges are not yet supported by the Growth Tools layer; if
 * the caller passes one we coerce to LAST_30_DAYS and flag it.
 */

export const SUPPORTED_PRESETS = [
  "TODAY",
  "YESTERDAY",
  "LAST_7_DAYS",
  "LAST_14_DAYS",
  "LAST_30_DAYS",
  "LAST_60_DAYS",
  "LAST_90_DAYS",
  "THIS_MONTH",
  "LAST_MONTH",
  "THIS_WEEK_MON_TODAY",
  "LAST_WEEK_SUN_SAT",
] as const;

export type RangePreset = (typeof SUPPORTED_PRESETS)[number];

const COERCED: Record<string, { to: RangePreset; reason: string }> = {
  YEAR_TO_DATE: { to: "LAST_90_DAYS", reason: "year-to-date not yet supported by Growth Tools; using LAST_90_DAYS" },
  YTD: { to: "LAST_90_DAYS", reason: "YTD not yet supported by Growth Tools; using LAST_90_DAYS" },
  QUARTER_TO_DATE: { to: "LAST_90_DAYS", reason: "quarter-to-date approximated as LAST_90_DAYS" },
  QTD: { to: "LAST_90_DAYS", reason: "QTD approximated as LAST_90_DAYS" },
  THIS_QUARTER: { to: "LAST_90_DAYS", reason: "this-quarter approximated as LAST_90_DAYS" },
  LAST_QUARTER: { to: "LAST_90_DAYS", reason: "last-quarter approximated as LAST_90_DAYS" },
  THIS_WEEK: { to: "THIS_WEEK_MON_TODAY", reason: "using THIS_WEEK_MON_TODAY" },
  LAST_WEEK: { to: "LAST_WEEK_SUN_SAT", reason: "using LAST_WEEK_SUN_SAT" },
  LAST_BUSINESS_WEEK: { to: "LAST_WEEK_SUN_SAT", reason: "approximated as LAST_WEEK_SUN_SAT" },
};

export interface ResolvedRange {
  /** The enum sent to Growth Tools. Always one of SUPPORTED_PRESETS. */
  dateRange: RangePreset;
  /** Original input, normalised. Same as dateRange unless coerced. */
  requested: string;
  /** Set when input was mapped to a different preset. */
  coercedFrom?: string;
  /** Human-readable note (only when coerced). */
  note?: string;
  /** Display-friendly label, e.g. "last 30 days". */
  label: string;
}

const LABELS: Record<RangePreset, string> = {
  TODAY: "today",
  YESTERDAY: "yesterday",
  LAST_7_DAYS: "last 7 days",
  LAST_14_DAYS: "last 14 days",
  LAST_30_DAYS: "last 30 days",
  LAST_60_DAYS: "last 60 days",
  LAST_90_DAYS: "last 90 days",
  THIS_MONTH: "this month",
  LAST_MONTH: "last month",
  THIS_WEEK_MON_TODAY: "this week (Mon–today)",
  LAST_WEEK_SUN_SAT: "last week (Sun–Sat)",
};

/**
 * Normalise a range input: accepts a `RangePreset`, a known coerced alias,
 * `undefined` (defaults to LAST_30_DAYS), or anything else (coerced with a
 * note so the agent reports it back to the user).
 */
export function resolveRange(input: string | undefined | null): ResolvedRange {
  if (input === undefined || input === null || String(input).trim() === "") {
    return {
      dateRange: "LAST_30_DAYS",
      requested: "LAST_30_DAYS",
      label: LABELS.LAST_30_DAYS,
    };
  }

  const raw = String(input).trim();
  const upper = raw.toUpperCase().replace(/[\s-]+/g, "_");

  if ((SUPPORTED_PRESETS as readonly string[]).includes(upper)) {
    const preset = upper as RangePreset;
    return { dateRange: preset, requested: preset, label: LABELS[preset] };
  }

  const coerce = COERCED[upper];
  if (coerce) {
    return {
      dateRange: coerce.to,
      requested: upper,
      coercedFrom: upper,
      note: coerce.reason,
      label: LABELS[coerce.to],
    };
  }

  // Unknown — most likely an ISO custom range like "2026-01-01..2026-01-31".
  // Coerce to LAST_30_DAYS and tell the agent.
  return {
    dateRange: "LAST_30_DAYS",
    requested: raw,
    coercedFrom: raw,
    note: `range "${raw}" is not yet supported by Growth Tools; defaulting to LAST_30_DAYS`,
    label: LABELS.LAST_30_DAYS,
  };
}

/** True if a given preset is in our supported set (no coercion needed). */
export function isSupportedPreset(value: string): value is RangePreset {
  return (SUPPORTED_PRESETS as readonly string[]).includes(value);
}

/** Display label for a preset, falls back to the preset itself. */
export function labelFor(preset: string): string {
  return (LABELS as Record<string, string>)[preset] ?? preset;
}
