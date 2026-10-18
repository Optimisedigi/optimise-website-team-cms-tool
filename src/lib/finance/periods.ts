/**
 * Reporting periods for the Costs page: Australian financial year
 * (1 July – 30 June) or calendar year. Pure; all inputs are YYYY-MM keys so
 * the caller decides what "now" is.
 */

export type PeriodMode = "fy" | "cy";

/** First month of the financial year (July, Australia). */
export const FY_START_MONTH = 7;

export interface Period {
  mode: PeriodMode;
  /** Calendar year the period starts in (FY 2026–27 → 2026). */
  startYear: number;
}

export interface PeriodRange {
  from: string;
  /** Last month shown: the period end, or the current month if the period is still running. */
  to: string;
  months: string[];
  label: string;
  /** True when the period hasn't finished yet (figures are year to date). */
  toDate: boolean;
}

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isMonthKey(value: unknown): value is string {
  return typeof value === "string" && MONTH_KEY.test(value);
}

export function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function addMonths(key: string, delta: number): string {
  const [y = 0, m = 1] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Inclusive month keys, oldest first. */
export function monthKeysBetween(from: string, to: string): string[] {
  const keys: string[] = [];
  for (let k = from; k <= to; k = addMonths(k, 1)) keys.push(k);
  return keys;
}

/** The period of the given kind that contains `monthKey`. */
export function periodContaining(mode: PeriodMode, monthKey: string): Period {
  const [y = 0, m = 1] = monthKey.split("-").map(Number);
  if (mode === "cy") return { mode, startYear: y };
  return { mode, startYear: m >= FY_START_MONTH ? y : y - 1 };
}

export function periodLabel(period: Period): string {
  if (period.mode === "cy") return String(period.startYear);
  return `FY ${period.startYear}\u2013${String(period.startYear + 1).slice(-2)}`;
}

/** Months of the period, stopping at `currentMonth` if the period is still running. */
export function periodRange(period: Period, currentMonth: string): PeriodRange {
  const startMonth = period.mode === "cy" ? 1 : FY_START_MONTH;
  const from = `${period.startYear}-${String(startMonth).padStart(2, "0")}`;
  const end = addMonths(from, 11);
  const toDate = end > currentMonth;
  const to = toDate ? currentMonth : end;
  return {
    from,
    to,
    months: from <= to ? monthKeysBetween(from, to) : [],
    label: periodLabel(period),
    toDate,
  };
}

/** The current period and the `count - 1` before it, newest first. */
export function periodOptions(mode: PeriodMode, currentMonth: string, count = 6): Period[] {
  const current = periodContaining(mode, currentMonth);
  return Array.from({ length: count }, (_, i) => ({ mode, startYear: current.startYear - i }));
}
