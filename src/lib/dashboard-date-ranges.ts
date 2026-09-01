import { landingPresetSpan, zonedDay } from "@/lib/landing-date-range";

const DAY_MS = 24 * 60 * 60 * 1000;

export function formatDateOnly(date: Date): string {
  return zonedDay(date);
}

function addDays(date: string, delta: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + delta * DAY_MS).toISOString().slice(0, 10);
}

export function getThisWeekRange(today = new Date()): { start: string; end: string } {
  const { start } = landingPresetSpan("this_week", zonedDay(today));
  return { start, end: addDays(start, 6) };
}

export function getLastWeekRange(today = new Date()): { start: string; end: string } {
  return landingPresetSpan("last_week", zonedDay(today));
}

export function normalizeDashboardRange(range: string, today = new Date()): string {
  if (range === "this_week") {
    const { start, end } = getThisWeekRange(today);
    return `custom:${start},${end}`;
  }
  if (range === "last_week" || range === "this_month" || range === "last_month") {
    const { start, end } = landingPresetSpan(range, zonedDay(today));
    return `custom:${start},${end}`;
  }
  return range;
}
