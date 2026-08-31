export type LandingDateRangeMode =
  | "this_week"
  | "last_week"
  | "today"
  | "7"
  | "30"
  | "90"
  | "custom";

export interface LandingDateRange {
  mode: LandingDateRangeMode;
  start?: string;
  end?: string;
}

export const DEFAULT_LANDING_DATE_RANGE: LandingDateRange = { mode: "this_week" };

export interface ResolvedLandingDateRange {
  since: string;
  until: string;
  days: number;
  googleAdsRange: string;
  label: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The zone every dashboard day is cut in.
 *
 * Days were cut at UTC midnight, which is 10am in Sydney. A sign-up made this
 * morning therefore landed on yesterday's dashboard while HubSpot and Google
 * Ads - both reporting in the account's Australian time - counted it today, so
 * the two disagreed for ten hours out of every day. Google Ads buckets its own
 * days in the account timezone as well, so this also stops the clicks and the
 * tracked conversions on one row being drawn from different days.
 */
export const REPORTING_TIME_ZONE = "Australia/Sydney";

const ZONE_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: REPORTING_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** How far the reporting zone's wall clock runs ahead of UTC at `instant`. */
function zoneOffsetMs(instant: Date): number {
  const parts: Record<string, string> = {};
  for (const part of ZONE_PARTS.formatToParts(instant)) parts[part.type] = part.value;
  const wall = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    // Midnight formats as hour 24 in some ICU builds.
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return wall - instant.valueOf();
}

/** `instant` as a YYYY-MM-DD calendar date in the reporting zone. */
export function zonedDay(instant: Date): string {
  return new Date(instant.valueOf() + zoneOffsetMs(instant)).toISOString().slice(0, 10);
}

/** The UTC instant at which a reporting-zone calendar day begins. */
function zonedDayStart(date: string): Date {
  const wall = Date.parse(`${date}T00:00:00.000Z`);
  // Two passes: the offset must be read at the instant it applies to, and the
  // first guess can land on the far side of a daylight-saving change.
  const guess = wall - zoneOffsetMs(new Date(wall));
  return new Date(wall - zoneOffsetMs(new Date(guess)));
}

function addDays(date: string, delta: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + delta * DAY_MS).toISOString().slice(0, 10);
}

/** Days since Monday, 0-6, for a calendar date. */
function daysSinceMonday(date: string): number {
  return (new Date(`${date}T00:00:00.000Z`).getUTCDay() + 6) % 7;
}

export function resolveLandingDateRange(
  params: URLSearchParams,
  now = new Date(),
): ResolvedLandingDateRange | null {
  if (params.get("period") === "this_week") {
    const today = zonedDay(now);
    const monday = addDays(today, -daysSinceMonday(today));
    return {
      since: zonedDayStart(monday).toISOString(),
      until: zonedDayStart(addDays(monday, 7)).toISOString(),
      days: 7,
      googleAdsRange: `${monday},${addDays(monday, 6)}`,
      label: "This week",
    };
  }

  const start = params.get("start");
  const end = params.get("end");
  if (start || end) {
    if (!start || !end || !ISO_DATE.test(start) || !ISO_DATE.test(end)) return null;
    const startMs = Date.parse(`${start}T00:00:00.000Z`);
    const endMs = Date.parse(`${end}T00:00:00.000Z`);
    if (
      Number.isNaN(startMs) ||
      Number.isNaN(endMs) ||
      // Rejects the impossible dates the pattern alone lets through, like 02-31.
      new Date(startMs).toISOString().slice(0, 10) !== start ||
      new Date(endMs).toISOString().slice(0, 10) !== end ||
      startMs > endMs
    ) return null;
    const days = Math.round((endMs - startMs) / DAY_MS) + 1;
    // A day that has not started in the reporting zone cannot be reported on.
    if (days > 365 || zonedDayStart(end).valueOf() > now.valueOf()) return null;
    return {
      since: zonedDayStart(start).toISOString(),
      until: zonedDayStart(addDays(end, 1)).toISOString(),
      days,
      googleAdsRange: `${start},${end}`,
      label: start === end ? start : `${start} – ${end}`,
    };
  }

  const requestedDays = Number(params.get("days") || "30");
  const days = Number.isFinite(requestedDays)
    ? Math.min(Math.max(Math.trunc(requestedDays), 1), 365)
    : 30;
  const since = new Date(now.valueOf() - days * DAY_MS);
  const googleAdsRange =
    days === 7
      ? "LAST_7_DAYS"
      : days === 30
        ? "LAST_30_DAYS"
        : days === 90
          ? "LAST_90_DAYS"
          : `${zonedDay(since)},${zonedDay(now)}`;
  return {
    since: since.toISOString(),
    until: now.toISOString(),
    days,
    googleAdsRange,
    label: `Last ${days} days`,
  };
}

export function landingDateRangeParams(
  range: LandingDateRange,
  now = new Date(),
): URLSearchParams {
  if (range.mode === "this_week") {
    const today = zonedDay(now);
    return new URLSearchParams({ start: addDays(today, -daysSinceMonday(today)), end: today });
  }
  if (range.mode === "last_week") {
    // Monday–Sunday of the completed week, matching the Google Ads dashboard.
    const today = zonedDay(now);
    const monday = addDays(today, -daysSinceMonday(today) - 7);
    return new URLSearchParams({ start: monday, end: addDays(monday, 6) });
  }
  if (range.mode === "today") {
    const today = zonedDay(now);
    return new URLSearchParams({ start: today, end: today });
  }
  if (range.mode === "custom" && range.start && range.end) {
    return new URLSearchParams({ start: range.start, end: range.end });
  }
  return new URLSearchParams({ days: range.mode === "custom" ? "30" : range.mode });
}

/**
 * "1 Aug 2026 – 30 Aug 2026" caption shown under the range dropdown, so the
 * selected preset always spells out the dates it actually covers.
 */
export function landingDateRangeCaption(
  range: LandingDateRange,
  now = new Date(),
): string {
  const params = landingDateRangeParams(range, now);
  const start = params.get("start");
  const end = params.get("end");
  if (!start || !end) {
    const days = Number(params.get("days") || "30");
    const since = new Date(now.valueOf() - days * DAY_MS);
    return `${formatDay(zonedDay(since))} – ${formatDay(zonedDay(now))}`;
  }
  const from = formatDay(start);
  const to = formatDay(end);
  return from === to ? from : `${from} – ${to}`;
}

/** Renders a YYYY-MM-DD calendar date, which carries no zone of its own. */
function formatDay(date: string): string {
  // en-GB, not en-AU: en-AU renders "short" July as "July", which breaks the
  // three-letter rhythm of the caption.
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function landingDateRangeLabel(range: LandingDateRange): string {
  if (range.mode === "this_week") return "This week";
  if (range.mode === "last_week") return "Last week";
  if (range.mode === "today") return "Today";
  if (range.mode === "custom" && range.start && range.end) {
    return range.start === range.end ? range.start : `${range.start} – ${range.end}`;
  }
  return `Last ${range.mode === "custom" ? 30 : range.mode} days`;
}
