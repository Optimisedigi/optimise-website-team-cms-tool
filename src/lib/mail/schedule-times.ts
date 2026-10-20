/**
 * Client-safe helpers for choosing a send time in the compose window. All
 * times are in the browser's local zone; the server receives an ISO instant.
 */

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Value for <input type="datetime-local"> (local time, minute precision). */
export function toDatetimeLocalValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The instant a datetime-local value names in the local zone, or null if it is empty or invalid. */
export function parseDatetimeLocal(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  const date = new Date(y, mo - 1, d, h, mi, 0, 0);
  return date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
}

/** Local calendar day as YYYY-MM-DD. */
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local midnight of a YYYY-MM-DD key, or null if it is not a real date. */
export function parseDateKey(key: string): Date | null {
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, y, mo, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(y, mo - 1, d);
  return date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** The instant of a local day (YYYY-MM-DD) at a local time (HH:MM). */
export function combineDateAndTime(day: string, time: string): Date | null {
  return parseDatetimeLocal(`${day}T${time}`);
}

/** Quick send times next to the day pills; each has a +2 minute button. */
export const QUICK_SEND_TIMES: readonly string[] = ["07:48", "08:11"];

/** HH:MM moved by `minutes`, wrapping within the day. */
export function addMinutesToTime(time: string, minutes: number): string {
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) return time;
  const total = (((Number(match[1]) * 60 + Number(match[2]) + minutes) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** "07:48" -> "7:48am", "13:05" -> "1:05pm". */
export function formatTime12(time: string): string {
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) return time;
  const hours = Number(match[1]);
  return `${hours % 12 || 12}:${match[2]}${hours < 12 ? "am" : "pm"}`;
}

/** Opening choice: today at the first quick time if that is still ahead, otherwise tomorrow. */
export function defaultScheduleChoice(now: Date): { day: string; time: string } {
  const time = QUICK_SEND_TIMES[0] ?? "08:00";
  const today = dateKey(now);
  const todayAt = combineDateAndTime(today, time);
  const ahead = todayAt !== null && todayAt.getTime() - now.getTime() >= 60_000;
  return { day: ahead ? today : dateKey(addDays(now, 1)), time };
}

/**
 * The weeks shown for one month, Sunday first, padded with the neighbouring
 * months' days (shown greyed), as react-day-picker lays it out.
 */
export function calendarWeeks(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const start = addDays(first, -first.getDay());
  const last = new Date(year, month + 1, 0);
  const weeks: Date[][] = [];
  for (let cursor = start; cursor <= last || weeks.length === 0; ) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}
