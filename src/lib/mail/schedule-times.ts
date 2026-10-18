/**
 * Client-safe helpers for choosing a send time in the compose window. All
 * times are in the browser's local zone; the server receives an ISO instant.
 */

export interface SchedulePreset {
  label: string;
  date: Date;
}

function at(base: Date, daysAhead: number, hour: number): Date {
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + daysAhead, hour, 0, 0, 0);
  return date;
}

/** Gmail-style quick choices, all in the future relative to `now`. */
export function schedulePresets(now: Date): SchedulePreset[] {
  const presets: SchedulePreset[] = [];
  const todayAfternoon = at(now, 0, 13);
  if (todayAfternoon.getTime() - now.getTime() > 60 * 60 * 1000) {
    presets.push({ label: "This afternoon", date: todayAfternoon });
  }
  presets.push({ label: "Tomorrow morning", date: at(now, 1, 8) });
  presets.push({ label: "Tomorrow afternoon", date: at(now, 1, 13) });
  const untilMonday = ((8 - now.getDay()) % 7) || 7;
  if (untilMonday > 1) presets.push({ label: "Monday morning", date: at(now, untilMonday, 8) });
  return presets;
}

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
