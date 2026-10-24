import { mondayOf, todayInTimeZone } from "@/lib/agents/taskmate/dates";

/**
 * Weekly roll-up helpers for the "Google Ads keyword cost finder used"
 * notification: one bell row per Monday-Sunday week whose count goes up with
 * each use and shows the latest use.
 */

export const KEYWORD_COST_FINDER_ACTIVITY_TYPE = "google_ads_keyword_cost_finder_used" as const;

/** Weeks run Monday to Sunday in Perth time (fixed UTC+8, no daylight saving). */
const WEEK_TIME_ZONE = "Australia/Perth";
const PERTH_OFFSET = "+08:00";
const DAY_MS = 86_400_000;

/** The Monday-Sunday Perth week containing `at`, as UTC instants. */
export function usageWeek(at: Date): { monday: string; start: Date; end: Date } {
  const monday = mondayOf(todayInTimeZone(at, WEEK_TIME_ZONE));
  const start = new Date(`${monday}T00:00:00${PERTH_OFFSET}`);
  return { monday, start, end: new Date(start.getTime() + 7 * DAY_MS) };
}

/** Activity-log list filtered to one week of usage; doubles as the weekly notification's key. */
export function weeklyUsageUrl(start: Date): string {
  return (
    `/admin/collections/activity-log?where[and][0][type][equals]=${KEYWORD_COST_FINDER_ACTIVITY_TYPE}` +
    `&where[and][1][createdAt][greater_than_equal]=${encodeURIComponent(start.toISOString())}`
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function ordinal(day: number): string {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  return `${day}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[day % 10] ?? "th"}`;
}

/** "Sat 24th Oct, 11:02am" in Perth time. */
export function perthDateTime(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: WEEK_TIME_ZONE, weekday: "short", day: "numeric", month: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  }).formatToParts(at);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const month = MONTHS[Number(part("month")) - 1] ?? "";
  return `${part("weekday")} ${ordinal(Number(part("day")))} ${month}, ${part("hour")}:${part("minute")}${part("dayPeriod").toLowerCase().replace(/\./g, "")}`;
}

export function weekLabel(monday: string): string {
  const date = new Date(`${monday}T00:00:00Z`);
  return `${ordinal(date.getUTCDate())} ${MONTHS[date.getUTCMonth()] ?? ""}`;
}
