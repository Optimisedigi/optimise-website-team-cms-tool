/**
 * Pure date logic for Google Ads milestone audits (1/3/6/9/12 months after the
 * client's campaign go-live date, `clients.campaignStartDate`).
 *
 * All dates are calendar days (YYYY-MM-DD) in the agency timezone. A milestone
 * becomes runnable the day after its due date so the audit window
 * (go-live → day before the milestone) is fully settled in Google Ads.
 */

export const MILESTONE_MONTHS = [1, 3, 6, 9, 12] as const;
export type MilestoneMonths = (typeof MILESTONE_MONTHS)[number];

export const MILESTONE_TIMEZONE = "Australia/Brisbane";

/**
 * A missed milestone is only caught up when it fell due within this many days.
 * The largest gap between milestones is 3 months, so any client still inside
 * the 12-month programme always has its latest missed milestone in range,
 * while clients who went live years ago don't get a stale "12-month" audit.
 */
export const CATCH_UP_WINDOW_DAYS = 92;

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

export function toYmd(value: string | Date | null | undefined, timeZone = MILESTONE_TIMEZONE): string | null {
  if (!value) return null;
  if (typeof value === "string" && YMD.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  // Payload stores date-only fields as midnight UTC ISO strings; read those as
  // the calendar day they were entered as rather than shifting timezones.
  if (typeof value === "string" && /T00:00:00(\.000)?Z$/.test(value)) return value.slice(0, 10);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Add calendar months, clamping to the last day of the target month (31 Jan + 1 → 28/29 Feb). */
export function addMonthsClamped(ymd: string, months: number): string {
  const match = YMD.exec(ymd);
  if (!match) throw new Error(`Invalid date: ${ymd}`);
  const year = Number(match[1]);
  const month = Number(match[2]) - 1 + months;
  const day = Number(match[3]);
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

export function addDays(ymd: string, days: number): string {
  const date = new Date(`${ymd}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(fromYmd: string, toYmdValue: string): number {
  return Math.round((Date.parse(`${toYmdValue}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / 86_400_000);
}

export interface MilestonePlanItem {
  months: MilestoneMonths;
  dueDate: string;
  /** Audit window: go-live date through the day before the milestone. */
  periodStart: string;
  periodEnd: string;
}

export function milestonePlan(goLiveYmd: string): MilestonePlanItem[] {
  return MILESTONE_MONTHS.map((months) => {
    const dueDate = addMonthsClamped(goLiveYmd, months);
    return { months, dueDate, periodStart: goLiveYmd, periodEnd: addDays(dueDate, -1) };
  });
}

export function milestoneLabel(months: number): string {
  return months === 12 ? "12-month" : `${months}-month`;
}

/** A milestone is runnable from the day after its due date. */
export function isRunnable(dueDate: string, todayYmd: string): boolean {
  return todayYmd > dueDate;
}

export interface ScheduledRowLike {
  id: number | string;
  months: number;
  dueDate: string;
}

/**
 * Decide what to do with scheduled (not yet started) milestones.
 *
 * Only the latest runnable milestone runs; earlier runnable ones are skipped as
 * superseded, and a runnable milestone older than the catch-up window is
 * skipped as too old. This one rule covers the first rollout (clients already
 * months past go-live), go-live date edits, and catch-up after downtime.
 */
export function planScheduledRows<T extends ScheduledRowLike>(
  rows: T[],
  todayYmd: string,
): { run: T | null; skip: Array<{ row: T; reason: string }> } {
  const runnable = rows
    .filter((row) => isRunnable(row.dueDate, todayYmd))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (runnable.length === 0) return { run: null, skip: [] };
  const latest = runnable[runnable.length - 1];
  const skip: Array<{ row: T; reason: string }> = runnable.slice(0, -1).map((row) => ({
    row,
    reason: `Superseded by the ${milestoneLabel(latest.months)} audit (missed while catching up).`,
  }));
  if (daysBetween(latest.dueDate, todayYmd) > CATCH_UP_WINDOW_DAYS) {
    skip.push({ row: latest, reason: `Fell due on ${latest.dueDate}, more than ${CATCH_UP_WINDOW_DAYS} days ago, so it was not caught up.` });
    return { run: null, skip };
  }
  return { run: latest, skip };
}
