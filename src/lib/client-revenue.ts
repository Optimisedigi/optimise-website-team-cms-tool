/**
 * Pure helpers for client revenue calculations.
 *
 * Centralises retainer math + referral commission math so the admin
 * billing summary, the `afterRead` hook on Clients, and the dashboard
 * API route all agree on the same numbers.
 *
 * All functions are pure — pass in the data, get back the number.
 */

export type CommissionFrequency = "one_off" | "monthly";
export type CommissionType = "percentage" | "fixed";

export interface ReferralCommission {
  payeeName?: string | null;
  payeeContact?: string | null;
  frequency?: CommissionFrequency | string | null;
  commissionType?: CommissionType | string | null;
  percentage?: number | null;
  monthlyAmount?: number | null;
  oneOffAmount?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
}

export interface RetainerHistoryEntry {
  amount?: number | null;
  previousAmount?: number | null;
  effectiveDate?: string | null;
  changedBy?: string | null;
}

export interface OneOffProject {
  projectName?: string | null;
  amount?: number | null;
  date?: string | null;
}

export interface ClientRevenueInput {
  monthlyRetainer?: number | null;
  clientStartDate?: string | null;
  retainerHistory?: RetainerHistoryEntry[] | null;
  referralCommissions?: ReferralCommission[] | null;
}

/**
 * Whole calendar months between `start` and `end`, clamped at 0.
 * Day-of-month is ignored: months are counted by (year, month) only.
 */
export function monthsBetween(start: Date, end: Date): number {
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth());
  return Math.max(0, months);
}

/** Start of the month containing `d`. */
function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Returns true if a monthly commission is active for the month of `date`.
 * - Active when commission.startDate ≤ end of month
 * - Active when commission.endDate ≥ start of month (or endDate is null/missing)
 */
function isCommissionActiveForMonth(
  commission: ReferralCommission,
  date: Date,
): boolean {
  const start = toDate(commission.startDate);
  if (!start) return false;
  const periodStart = new Date(date.getFullYear(), date.getMonth(), 1);
  const periodEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  if (start > periodEnd) return false;
  const end = toDate(commission.endDate);
  if (end && end < periodStart) return false;
  return true;
}

/**
 * Resolve a single monthly commission to a $ amount for the given gross
 * retainer. Returns 0 if the commission isn't a monthly type or has no
 * resolvable amount.
 */
function resolveMonthlyCommissionAmount(
  commission: ReferralCommission,
  grossMonthlyRetainer: number,
): number {
  if (commission.frequency !== "monthly") return 0;
  const type = commission.commissionType || "percentage";
  if (type === "fixed") {
    return Math.max(0, Number(commission.monthlyAmount) || 0);
  }
  const pct = Number(commission.percentage) || 0;
  if (pct <= 0) return 0;
  return Math.max(0, (grossMonthlyRetainer * pct) / 100);
}

/**
 * Sum of all active monthly commissions for `date`, resolved against the
 * `monthlyRetainer` in force at that date. One-off commissions are
 * ignored.
 */
export function monthlyCommissionForDate(
  commissions: ReferralCommission[] | null | undefined,
  monthlyRetainer: number,
  date: Date,
): number {
  if (!Array.isArray(commissions) || commissions.length === 0) return 0;
  let total = 0;
  for (const c of commissions) {
    if (!c || c.frequency !== "monthly") continue;
    if (!isCommissionActiveForMonth(c, date)) continue;
    total += resolveMonthlyCommissionAmount(c, monthlyRetainer);
  }
  return total;
}

/**
 * Net monthly retainer = gross monthly retainer − active monthly commissions.
 * Clamped at 0 (we never bill a negative retainer).
 */
export function netMonthlyRetainer(
  monthlyRetainer: number,
  commissions: ReferralCommission[] | null | undefined,
  date: Date,
): number {
  const gross = Math.max(0, Number(monthlyRetainer) || 0);
  const commission = monthlyCommissionForDate(commissions, gross, date);
  return Math.max(0, gross - commission);
}

/**
 * Resolves the gross monthly retainer in force at the given month, walking
 * the retainerHistory log. The current `monthlyRetainer` applies from the
 * most-recent history entry's effectiveDate onwards.
 */
function grossRetainerForMonth(
  monthlyRetainer: number,
  retainerHistory: RetainerHistoryEntry[],
  monthDate: Date,
): number {
  const periodEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  // Sort changes ascending by effective date
  const sorted = [...retainerHistory]
    .filter((h) => h?.effectiveDate && h?.amount != null)
    .sort((a, b) => {
      const aT = new Date(a.effectiveDate as string).getTime();
      const bT = new Date(b.effectiveDate as string).getTime();
      return aT - bT;
    });

  // Walk: find the entry whose effectiveDate is the most recent ≤ periodEnd.
  // If periodEnd is before the first change, use that change's previousAmount.
  if (sorted.length === 0) return Math.max(0, Number(monthlyRetainer) || 0);

  let amount = Math.max(0, Number(sorted[0].previousAmount) || 0);
  for (const entry of sorted) {
    const effective = new Date(entry.effectiveDate as string);
    if (effective <= periodEnd) {
      amount = Math.max(0, Number(entry.amount) || 0);
    } else {
      break;
    }
  }
  // If the most recent change is before the period AND there's a more recent
  // gross than the last logged amount (i.e. `monthlyRetainer` is the current
  // value), the loop above already settled on the last entry.amount which
  // equals the current monthlyRetainer (because trackRetainerChange writes
  // amount=new before every change).
  return amount;
}

/**
 * Year-to-date retainer revenue, net of monthly commissions.
 *
 * Walks each calendar month from max(clientStartDate, Jan-1-of-now) up to
 * the month of `now`. For each month: looks up the gross retainer in force,
 * subtracts active monthly commissions, and adds the net to the running
 * total.
 *
 * If the client has no `clientStartDate`, falls back to the current month's
 * net retainer only (matches the prior behaviour).
 */
export function retainerRevenueYTD(
  client: ClientRevenueInput,
  now: Date,
): number {
  const monthlyRetainer = Math.max(0, Number(client.monthlyRetainer) || 0);
  const commissions = Array.isArray(client.referralCommissions)
    ? client.referralCommissions
    : [];
  const retainerHistory = Array.isArray(client.retainerHistory)
    ? client.retainerHistory
    : [];

  const startDate = toDate(client.clientStartDate ?? null);
  if (!startDate) {
    // No start date: count current month only
    return netMonthlyRetainer(monthlyRetainer, commissions, now);
  }

  const yearStart = new Date(now.getFullYear(), 0, 1);
  const firstMonth = monthStart(startDate > yearStart ? startDate : yearStart);
  const lastMonth = monthStart(now);

  if (firstMonth > lastMonth) return 0;

  let total = 0;
  for (
    let m = new Date(firstMonth);
    m <= lastMonth;
    m = new Date(m.getFullYear(), m.getMonth() + 1, 1)
  ) {
    const gross = grossRetainerForMonth(monthlyRetainer, retainerHistory, m);
    const commission = monthlyCommissionForDate(commissions, gross, m);
    total += Math.max(0, gross - commission);
  }
  return total;
}

/**
 * Sum of one-off project amounts dated in the current calendar year up to
 * and including today.
 */
export function oneOffsYTD(
  oneOffProjects: OneOffProject[] | null | undefined,
  now: Date,
): number {
  if (!Array.isArray(oneOffProjects) || oneOffProjects.length === 0) return 0;
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  let total = 0;
  for (const p of oneOffProjects) {
    if (!p?.date || p.amount == null) continue;
    const d = toDate(p.date);
    if (!d) continue;
    if (d >= yearStart && d < monthEnd) {
      total += Number(p.amount) || 0;
    }
  }
  return total;
}

/**
 * Sum of one-off project amounts dated in the current calendar month.
 */
export function oneOffsThisMonth(
  oneOffProjects: OneOffProject[] | null | undefined,
  now: Date,
): number {
  if (!Array.isArray(oneOffProjects) || oneOffProjects.length === 0) return 0;
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  let total = 0;
  for (const p of oneOffProjects) {
    if (!p?.date || p.amount == null) continue;
    const d = toDate(p.date);
    if (!d) continue;
    if (d >= start && d < end) {
      total += Number(p.amount) || 0;
    }
  }
  return total;
}
