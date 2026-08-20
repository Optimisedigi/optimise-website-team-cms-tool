export type LandingDateRangeMode = "this_week" | "today" | "7" | "30" | "90" | "custom";

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

export function resolveLandingDateRange(
  params: URLSearchParams,
  now = new Date(),
): ResolvedLandingDateRange | null {
  if (params.get("period") === "this_week") {
    const monday = new Date(now);
    const daysSinceMonday = (monday.getUTCDay() + 6) % 7;
    monday.setUTCDate(monday.getUTCDate() - daysSinceMonday);
    monday.setUTCHours(0, 0, 0, 0);
    const nextMonday = new Date(monday.valueOf() + 7 * DAY_MS);
    const sunday = new Date(nextMonday.valueOf() - DAY_MS);
    return {
      since: monday.toISOString(),
      until: nextMonday.toISOString(),
      days: 7,
      googleAdsRange: `${monday.toISOString().slice(0, 10)},${sunday.toISOString().slice(0, 10)}`,
      label: "This week",
    };
  }

  const start = params.get("start");
  const end = params.get("end");
  if (start || end) {
    if (!start || !end || !ISO_DATE.test(start) || !ISO_DATE.test(end)) return null;
    const sinceDate = new Date(`${start}T00:00:00.000Z`);
    const endDate = new Date(`${end}T00:00:00.000Z`);
    if (
      Number.isNaN(sinceDate.valueOf()) ||
      Number.isNaN(endDate.valueOf()) ||
      sinceDate.toISOString().slice(0, 10) !== start ||
      endDate.toISOString().slice(0, 10) !== end ||
      sinceDate > endDate
    ) return null;
    const days = Math.floor((endDate.valueOf() - sinceDate.valueOf()) / DAY_MS) + 1;
    if (days > 365 || endDate.valueOf() > now.valueOf()) return null;
    return {
      since: sinceDate.toISOString(),
      until: new Date(endDate.valueOf() + DAY_MS).toISOString(),
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
          : `${since.toISOString().slice(0, 10)},${now.toISOString().slice(0, 10)}`;
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
    const monday = new Date(now);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const today = now.toISOString().slice(0, 10);
    return new URLSearchParams({ start: monday.toISOString().slice(0, 10), end: today });
  }
  if (range.mode === "today") {
    const today = now.toISOString().slice(0, 10);
    return new URLSearchParams({ start: today, end: today });
  }
  if (range.mode === "custom" && range.start && range.end) {
    return new URLSearchParams({ start: range.start, end: range.end });
  }
  return new URLSearchParams({ days: range.mode === "custom" ? "30" : range.mode });
}

export function landingDateRangeLabel(range: LandingDateRange): string {
  if (range.mode === "this_week") return "This week";
  if (range.mode === "today") return "Today";
  if (range.mode === "custom" && range.start && range.end) {
    return range.start === range.end ? range.start : `${range.start} – ${range.end}`;
  }
  return `Last ${range.mode === "custom" ? 30 : range.mode} days`;
}
