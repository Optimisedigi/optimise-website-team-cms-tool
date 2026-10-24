/**
 * Date context for TaskMate, so relative phrases ("next week", "two weeks from
 * now", "Friday next week") resolve without asking the admin to confirm dates.
 * Weeks run Monday to Sunday, matching Team Tasks.
 */

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** Fallback when the browser does not send its local date; the team works in Australian time. */
export const TASKMATE_DEFAULT_TIME_ZONE = "Australia/Sydney";

function parseIso(value: string): Date | null {
  if (!isoDate.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

const toIso = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

/** Today's ISO date in a time zone. */
export function todayInTimeZone(now: Date, timeZone: string = TASKMATE_DEFAULT_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * Accept the browser's local date only when it is a real ISO date within a day
 * of the server's clock (every time zone is within ±14h of UTC); otherwise use
 * the server's date in the team's time zone.
 */
export function resolveTaskMateToday(clientToday: unknown, now: Date): string {
  if (typeof clientToday === "string") {
    const date = parseIso(clientToday);
    const utcToday = parseIso(now.toISOString().slice(0, 10));
    if (date && utcToday && Math.abs(date.getTime() - utcToday.getTime()) <= DAY_MS) return clientToday;
  }
  return todayInTimeZone(now);
}

/** Monday of the week containing `today` (ISO). */
export function mondayOf(today: string): string {
  const date = parseIso(today);
  if (!date) throw new Error("today must be an ISO date");
  return toIso(addDays(date, -((date.getUTCDay() + 6) % 7)));
}

/** Prompt section giving TaskMate today's date and the Monday-Sunday weeks around it. */
export function buildTaskMateDateContext(today: string): string {
  const date = parseIso(today);
  if (!date) throw new Error("today must be an ISO date");
  const thisMonday = parseIso(mondayOf(today)) as Date;
  const labels = ["This week", "Next week", "Two weeks from now (the week after next)", "Three weeks from now", "Four weeks from now"];
  const weeks = labels.map((label, offset) => {
    const start = addDays(thisMonday, offset * 7);
    return `- ${label}: Monday ${toIso(start)} to Sunday ${toIso(addDays(start, 6))}`;
  });
  return [
    `Today is ${WEEKDAYS[date.getUTCDay()]} ${today}. Weeks run Monday to Sunday.`,
    ...weeks,
    "",
    'Resolve relative dates yourself from this calendar and never ask the admin to confirm or supply a date or Monday. "Next week" is the next Monday-to-Sunday week, even late in the current week. "Two weeks from now", "in two weeks", and "the week after next" are the week after next week, not next week. "Friday next week" is the Friday in next week. A weekday on its own ("Friday") is the next one on or after today.',
  ].join("\n");
}
