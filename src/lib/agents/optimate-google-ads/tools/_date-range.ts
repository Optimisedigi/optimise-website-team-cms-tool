/**
 * Shared date-range resolver for Optimate-Google-Ads read tools.
 *
 * Most ranges pass through as Growth Tools preset enums. Two extras layered
 * on top:
 *
 *   1. `segment` ("month" | "week" | "day"): when set, the tools forward the
 *      arg to Growth Tools so the upstream query emits one row per (entity,
 *      segment) instead of a single total. Old Growth Tools versions ignore
 *      it; the tools detect that and surface `segmentationUnavailable: true`.
 *
 *   2. Custom ISO ranges: when the user asks for "Q1 2026" or "Jan through
 *      March", we resolve to an explicit `startDate`/`endDate` pair (a
 *      `CUSTOM` dateRange) so quarter / year-to-date no longer get silently
 *      coerced to LAST_90_DAYS. The tool layer forwards `startDate`/`endDate`
 *      to Growth Tools.
 *
 * Supported presets (passed through to Growth Tools as-is):
 *   TODAY, YESTERDAY, LAST_7_DAYS, LAST_14_DAYS, LAST_30_DAYS,
 *   LAST_60_DAYS, LAST_90_DAYS, THIS_MONTH, LAST_MONTH,
 *   THIS_WEEK_MON_TODAY, LAST_WEEK_SUN_SAT
 *
 * Resolved to CUSTOM (with computed startDate/endDate):
 *   YEAR_TO_DATE / YTD
 *   THIS_QUARTER, LAST_QUARTER, QUARTER_TO_DATE / QTD
 *   "YYYY-MM-DD..YYYY-MM-DD"  (literal span)
 *   "Q1 2026" / "Q4 2025" etc.
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

export type RangePreset = (typeof SUPPORTED_PRESETS)[number] | "CUSTOM";

/** Per-row segmentation granularity. */
export type Segment = "month" | "week" | "day";

const COERCED: Record<string, { to: Exclude<RangePreset, "CUSTOM">; reason: string }> = {
  THIS_WEEK: { to: "THIS_WEEK_MON_TODAY", reason: "using THIS_WEEK_MON_TODAY" },
  LAST_WEEK: { to: "LAST_WEEK_SUN_SAT", reason: "using LAST_WEEK_SUN_SAT" },
  LAST_BUSINESS_WEEK: { to: "LAST_WEEK_SUN_SAT", reason: "approximated as LAST_WEEK_SUN_SAT" },
};

export interface ResolvedRange {
  /** Enum sent to Growth Tools. Always one of SUPPORTED_PRESETS or "CUSTOM". */
  dateRange: RangePreset;
  /** Original input, normalised. */
  requested: string;
  /** Set when input was mapped to a different preset. */
  coercedFrom?: string;
  /** Human-readable note (only when coerced). */
  note?: string;
  /** Display-friendly label. */
  label: string;
  /** Inclusive start (YYYY-MM-DD) when dateRange === "CUSTOM". */
  startDate?: string;
  /** Inclusive end (YYYY-MM-DD) when dateRange === "CUSTOM". */
  endDate?: string;
  /** Per-row segmentation, when supplied. */
  segment?: Segment;
}

const LABELS: Record<Exclude<RangePreset, "CUSTOM">, string> = {
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

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toIso(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Friendly label for a span, e.g. "Jan 1 – Mar 31 2026". */
function spanLabel(start: string, end: string): string {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear();
  const sm = MONTHS[s.getUTCMonth()];
  const em = MONTHS[e.getUTCMonth()];
  if (sameYear) {
    return `${sm} ${s.getUTCDate()} – ${em} ${e.getUTCDate()} ${e.getUTCFullYear()}`;
  }
  return `${sm} ${s.getUTCDate()} ${s.getUTCFullYear()} – ${em} ${e.getUTCDate()} ${e.getUTCFullYear()}`;
}

/** Quarter bounds in UTC, inclusive. quarter is 1–4. */
function quarterBounds(year: number, quarter: 1 | 2 | 3 | 4): { start: string; end: string } {
  const startMonth = (quarter - 1) * 3; // 0-indexed
  const endMonth = startMonth + 2;
  const start = new Date(Date.UTC(year, startMonth, 1));
  // End-of-month: day 0 of next month is the last day of `endMonth`.
  const end = new Date(Date.UTC(year, endMonth + 1, 0));
  return { start: toIso(start), end: toIso(end) };
}

function currentQuarter(now: Date): 1 | 2 | 3 | 4 {
  return (Math.floor(now.getUTCMonth() / 3) + 1) as 1 | 2 | 3 | 4;
}

/** Parse "YYYY-MM-DD..YYYY-MM-DD" → start/end, or null if it doesn't match. */
function parseIsoSpan(raw: string): { start: string; end: string } | null {
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})\s*\.\.\s*(\d{4}-\d{2}-\d{2})$/);
  if (!m) return null;
  const [, start, end] = m;
  // Loose validation — Date() will fail later if these are nonsense.
  if (Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) return null;
  return { start, end };
}

/** Parse "Q1 2026", "Q3-2026", "Q2_2025" → start/end, or null. */
function parseQuarterLiteral(raw: string): { start: string; end: string; label: string } | null {
  const m = raw.match(/^Q([1-4])[\s_-]*(\d{4})$/);
  if (!m) return null;
  const q = Number(m[1]) as 1 | 2 | 3 | 4;
  const year = Number(m[2]);
  const { start, end } = quarterBounds(year, q);
  return { start, end, label: `Q${q} ${year}` };
}

/** Resolve a quarter alias against `now` (overridable for tests). */
function resolveQuarterAlias(
  alias: "THIS_QUARTER" | "LAST_QUARTER" | "QUARTER_TO_DATE" | "QTD",
  now: Date,
): { start: string; end: string; label: string } {
  const year = now.getUTCFullYear();
  const q = currentQuarter(now);
  if (alias === "THIS_QUARTER") {
    const b = quarterBounds(year, q);
    return { ...b, label: `Q${q} ${year}` };
  }
  if (alias === "LAST_QUARTER") {
    if (q === 1) {
      const b = quarterBounds(year - 1, 4);
      return { ...b, label: `Q4 ${year - 1}` };
    }
    const prev = (q - 1) as 1 | 2 | 3;
    const b = quarterBounds(year, prev);
    return { ...b, label: `Q${prev} ${year}` };
  }
  // QUARTER_TO_DATE / QTD — start of current quarter through today.
  const b = quarterBounds(year, q);
  return { start: b.start, end: toIso(now), label: `Q${q} to date` };
}

function resolveYearToDate(now: Date): { start: string; end: string; label: string } {
  const start = `${now.getUTCFullYear()}-01-01`;
  return { start, end: toIso(now), label: `${now.getUTCFullYear()} YTD` };
}

function normaliseSegment(input: unknown): Segment | undefined {
  if (typeof input !== "string") return undefined;
  const s = input.trim().toLowerCase();
  if (s === "month" || s === "monthly") return "month";
  if (s === "week" || s === "weekly") return "week";
  if (s === "day" || s === "daily" || s === "date") return "day";
  return undefined;
}

/**
 * Normalise a range input. Accepts:
 *   - A `RangePreset`
 *   - A known alias ("this week" → THIS_WEEK_MON_TODAY)
 *   - A quarter alias (THIS_QUARTER, LAST_QUARTER, QTD, YTD) → CUSTOM
 *   - "Q1 2026" / "Q3-2025" → CUSTOM
 *   - "YYYY-MM-DD..YYYY-MM-DD" → CUSTOM
 *   - undefined → LAST_30_DAYS
 *
 * `now` is injected for testability.
 */
export function resolveRange(
  input: string | undefined | null,
  now: Date = new Date(),
): ResolvedRange {
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
    const preset = upper as Exclude<RangePreset, "CUSTOM">;
    return { dateRange: preset, requested: preset, label: LABELS[preset] };
  }

  // Quarter aliases → resolved to CUSTOM with computed bounds.
  if (
    upper === "THIS_QUARTER" ||
    upper === "LAST_QUARTER" ||
    upper === "QUARTER_TO_DATE" ||
    upper === "QTD"
  ) {
    const { start, end, label } = resolveQuarterAlias(
      upper as "THIS_QUARTER" | "LAST_QUARTER" | "QUARTER_TO_DATE" | "QTD",
      now,
    );
    return {
      dateRange: "CUSTOM",
      requested: upper,
      startDate: start,
      endDate: end,
      label,
    };
  }

  if (upper === "YEAR_TO_DATE" || upper === "YTD") {
    const { start, end, label } = resolveYearToDate(now);
    return {
      dateRange: "CUSTOM",
      requested: upper,
      startDate: start,
      endDate: end,
      label,
    };
  }

  // "Q1 2026" literal.
  const quarterLiteral = parseQuarterLiteral(upper);
  if (quarterLiteral) {
    return {
      dateRange: "CUSTOM",
      requested: raw,
      startDate: quarterLiteral.start,
      endDate: quarterLiteral.end,
      label: quarterLiteral.label,
    };
  }

  // "YYYY-MM-DD..YYYY-MM-DD" literal.
  const span = parseIsoSpan(raw);
  if (span) {
    return {
      dateRange: "CUSTOM",
      requested: raw,
      startDate: span.start,
      endDate: span.end,
      label: spanLabel(span.start, span.end),
    };
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

  // Unknown / unparsed — fall back to LAST_30_DAYS and tell the agent.
  return {
    dateRange: "LAST_30_DAYS",
    requested: raw,
    coercedFrom: raw,
    note: `range "${raw}" is not recognised; defaulting to LAST_30_DAYS`,
    label: LABELS.LAST_30_DAYS,
  };
}

/**
 * Same as `resolveRange` but also normalises and attaches a per-row
 * segmentation granularity ("month" | "week" | "day"). Invalid segment
 * inputs are dropped silently.
 */
export function resolveRangeWithSegment(
  input: string | undefined | null,
  segment: unknown,
  now: Date = new Date(),
): ResolvedRange {
  const resolved = resolveRange(input, now);
  const seg = normaliseSegment(segment);
  if (seg) resolved.segment = seg;
  return resolved;
}

/** True if a given preset is in our supported set (no coercion needed). */
export function isSupportedPreset(value: string): value is Exclude<RangePreset, "CUSTOM"> {
  return (SUPPORTED_PRESETS as readonly string[]).includes(value);
}

/** Display label for a preset, falls back to the preset itself. */
export function labelFor(preset: string): string {
  return (LABELS as Record<string, string>)[preset] ?? preset;
}

// ─────────────────────────────────────────────────────────────────────────
// CUSTOM → preset snap-down
// ─────────────────────────────────────────────────────────────────────────
// Growth Tools' `get-metrics` endpoint currently substitutes `dateRange` into
// a GAQL `DURING` clause verbatim. Google rejects literal `CUSTOM` there
// (`INVALID_VALUE_WITH_DURING_OPERATOR`), so any tool that resolves a range
// to CUSTOM and forwards startDate/endDate currently 500s. Until Growth Tools
// is fixed, we map CUSTOM ranges down to the smallest `LAST_N_DAYS` preset
// that fully covers the requested span. Trades a little precision for
// "it actually returns data."
//
// Snap policy:
//   - If endDate isn't today, we still snap (Growth Tools presets always
//     end today). Caller gets a note explaining the shift.
//   - For spans ≤ 7/14/30/60 days we use the matching preset.
//   - Anything longer snaps to LAST_90_DAYS (the largest preset we have).
//     Months-old data won't round-trip yet; a future Growth Tools fix is the
//     proper home for that.

const SNAP_PRESETS: ReadonlyArray<{ preset: Exclude<RangePreset, "CUSTOM">; days: number }> = [
  { preset: "LAST_7_DAYS", days: 7 },
  { preset: "LAST_14_DAYS", days: 14 },
  { preset: "LAST_30_DAYS", days: 30 },
  { preset: "LAST_60_DAYS", days: 60 },
  { preset: "LAST_90_DAYS", days: 90 },
];

function daysBetween(start: string, end: string): number {
  const s = Date.parse(`${start}T00:00:00Z`);
  const e = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
  return Math.floor((e - s) / 86_400_000) + 1; // inclusive
}

/**
 * If `resolved` is a CUSTOM range, return a copy snapped to the smallest
 * `LAST_N_DAYS` preset that fully covers the span. Non-CUSTOM ranges pass
 * through unchanged. `now` is injected for tests.
 *
 * The resolver itself stays pure — callers that need exact start/end (e.g.
 * for display / labelling) can keep using `resolveRange` directly. Only the
 * HTTP layer should snap.
 */
export function snapCustomToPreset(
  resolved: ResolvedRange,
  now: Date = new Date(),
): ResolvedRange {
  if (resolved.dateRange !== "CUSTOM") return resolved;
  if (!resolved.startDate || !resolved.endDate) return resolved;

  const today = toIso(now);
  const spanDays = daysBetween(resolved.startDate, resolved.endDate);
  const startToTodayDays = daysBetween(resolved.startDate, today);
  // Use the wider of the two so we cover the entire requested window even
  // when the user asked for a back-dated span (Growth Tools presets always
  // end "today", so we need at least startDate → today's worth of data).
  const neededDays = Math.max(spanDays, startToTodayDays);

  const snap =
    SNAP_PRESETS.find((p) => neededDays <= p.days) ??
    SNAP_PRESETS[SNAP_PRESETS.length - 1]!;

  const originalLabel = resolved.label;
  const noteParts: string[] = [];
  noteParts.push(
    `custom range ${resolved.startDate}…${resolved.endDate} ("${originalLabel}") snapped to ${snap.preset} — Growth Tools doesn't accept CUSTOM ranges yet`,
  );
  if (resolved.endDate !== today) {
    noteParts.push(
      `result window ends today (${today}) instead of ${resolved.endDate}`,
    );
  }

  return {
    dateRange: snap.preset,
    requested: resolved.requested,
    coercedFrom: `CUSTOM ${resolved.startDate}..${resolved.endDate}`,
    note: noteParts.join("; "),
    label: `${LABELS[snap.preset]} (covers ${originalLabel})`,
    // Intentionally drop startDate/endDate so the HTTP layer stops forwarding
    // them — Growth Tools ignores them once dateRange is a preset, but
    // sending them muddies the request log.
    ...(resolved.segment ? { segment: resolved.segment } : {}),
  };
}
