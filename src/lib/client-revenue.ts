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
  countTowardsRetainer?: boolean | null;
}

export interface HistoricalRevenueYear {
  year?: number | null;
  amount?: number | null;
}

/**
 * Normalises `revenueSharePercent` (1–100) to a 0..1 factor for
 * multiplying contract amounts by the agency's share.
 *
 * Values outside [1, 100] or non-finite inputs default to 1 (100% share),
 * preserving back-compat for clients without the field set.
 */
export function revenueShareFactor(
  pct: number | null | undefined,
): number {
  if (pct == null) return 1;
  const n = Number(pct);
  if (!Number.isFinite(n)) return 1;
  if (n <= 0) return 0;
  if (n >= 100) return 1;
  return n / 100;
}

/**
 * Sums per-year historical revenue rows, treating null/invalid amounts as 0.
 * Year is informational only — the sum spans every row regardless of year.
 */
export function historicalRevenueTotal(
  rows: HistoricalRevenueYear[] | null | undefined,
): number {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  let total = 0;
  for (const r of rows) {
    if (!r) continue;
    const amt = Number(r.amount);
    if (!isFinite(amt) || amt <= 0) continue;
    total += amt;
  }
  return total;
}

export interface ClientRevenueInput {
  monthlyRetainer?: number | null;
  setupFee?: number | null;
  clientStartDate?: string | null;
  retainerStartDate?: string | null;
  retainerHistory?: RetainerHistoryEntry[] | null;
  referralCommissions?: ReferralCommission[] | null;
  oneOffProjects?: OneOffProject[] | null;
}

/**
 * Pro-ration factor for the first month of an engagement.
 *
 * If `monthDate` is in the same calendar month as `clientStartDate`,
 * returns `(daysInMonth − startDay + 1) / daysInMonth` — the share of
 * that month from the start day through month-end, inclusive.
 *
 * If `monthDate` is in a later month, returns 1 (full month billed).
 * If `monthDate` is in an earlier month, returns 0 (engagement hadn't
 * started yet).
 */
export function firstMonthProrationFactor(
  clientStartDate: Date,
  monthDate: Date,
): number {
  const startY = clientStartDate.getFullYear();
  const startM = clientStartDate.getMonth();
  const monthY = monthDate.getFullYear();
  const monthM = monthDate.getMonth();

  if (monthY < startY || (monthY === startY && monthM < startM)) return 0;
  if (monthY > startY || (monthY === startY && monthM > startM)) return 1;

  // Same calendar month: pro-rate by calendar days remaining.
  const daysInMonth = new Date(startY, startM + 1, 0).getDate();
  const startDay = clientStartDate.getDate();
  const remaining = daysInMonth - startDay + 1;
  const factor = remaining / daysInMonth;
  if (factor < 0) return 0;
  if (factor > 1) return 1;
  return factor;
}

/**
 * Gross pro-rated retainer for the first (partial) month of an engagement,
 * given a retainer start date. Returns `monthlyRetainer` scaled by the share
 * of the start month from the start day through month-end, inclusive.
 *
 * Returns 0 when the retainer start date is missing/invalid or the monthly
 * retainer is non-positive.
 */
export function firstMonthRetainerAmount(
  monthlyRetainer: number | null | undefined,
  retainerStartDate: string | null | undefined,
): number {
  const gross = Math.max(0, Number(monthlyRetainer) || 0);
  if (gross <= 0) return 0;
  const start = toDate(retainerStartDate ?? null);
  if (!start) return 0;
  return gross * firstMonthProrationFactor(start, start);
}

/**
 * Partitions `oneOffProjects` into two groups based on the
 * `countTowardsRetainer` flag on each row. Rows with the flag ON count
 * toward the managing retainer; rows without count as standalone one-offs.
 */
export function splitOneOffs(
  projects: OneOffProject[] | null | undefined,
): { retainer: OneOffProject[]; oneOff: OneOffProject[] } {
  if (!Array.isArray(projects) || projects.length === 0) {
    return { retainer: [], oneOff: [] };
  }
  const retainer: OneOffProject[] = [];
  const oneOff: OneOffProject[] = [];
  for (const p of projects) {
    if (!p) continue;
    if (p.countTowardsRetainer) retainer.push(p);
    else oneOff.push(p);
  }
  return { retainer, oneOff };
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

  // Retainer anchor: the dedicated retainer start date when set, otherwise
  // fall back to the client start date (keeps existing clients unchanged).
  const anchor =
    toDate(client.retainerStartDate ?? null) ??
    toDate(client.clientStartDate ?? null);
  if (!anchor) {
    // No start date: count current month only
    return netMonthlyRetainer(monthlyRetainer, commissions, now);
  }

  const yearStart = new Date(now.getFullYear(), 0, 1);
  const firstMonth = monthStart(anchor > yearStart ? anchor : yearStart);
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
    const factor = firstMonthProrationFactor(anchor, m);
    const netForMonth = Math.max(0, gross - commission) * factor;
    total += netForMonth;
  }

  // Setup fee: counted in the calendar year of the retainer anchor, only once
  // the anchor month has begun (so it doesn't appear in a future YTD). The
  // fee is recognised in full — only its timing follows the retainer anchor.
  const setupFee = Math.max(0, Number(client.setupFee) || 0);
  if (setupFee > 0 && anchor.getFullYear() === now.getFullYear()) {
    const startMonth = monthStart(anchor);
    if (startMonth <= lastMonth) {
      total += setupFee;
    }
  }

  // Retainer-tagged one-offs: any row dated within the YTD window where
  // countTowardsRetainer is on.
  const oneOffs = Array.isArray(client.oneOffProjects)
    ? client.oneOffProjects
    : [];
  if (oneOffs.length > 0) {
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const upperBound = now;
    for (const p of oneOffs) {
      if (!p?.countTowardsRetainer) continue;
      if (!p?.date || p.amount == null) continue;
      const d = toDate(p.date);
      if (!d) continue;
      if (d >= yearStart && d <= upperBound) {
        total += Number(p.amount) || 0;
      }
    }
  }

  return total;
}

/**
 * Optional filter for the YTD/this-month one-off helpers:
 * - `true`  → sum only rows with countTowardsRetainer ON
 * - `false` → sum only rows with countTowardsRetainer OFF (or unset)
 * - omitted → sum every row regardless of the flag (back-compat)
 */
function matchesRetainerFilter(
  p: OneOffProject,
  filter: boolean | undefined,
): boolean {
  if (filter === undefined) return true;
  const flag = Boolean(p.countTowardsRetainer);
  return flag === filter;
}

/**
 * Sum of one-off project amounts dated in the current calendar year up to
 * and including today. Future-dated rows are excluded.
 *
 * When `countTowardsRetainerFilter` is supplied, only rows matching the
 * flag value contribute; omit it to sum every row.
 */
export function oneOffsYTD(
  oneOffProjects: OneOffProject[] | null | undefined,
  now: Date,
  countTowardsRetainerFilter?: boolean,
): number {
  if (!Array.isArray(oneOffProjects) || oneOffProjects.length === 0) return 0;
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const upper = monthEnd < now ? monthEnd : now;
  let total = 0;
  for (const p of oneOffProjects) {
    if (!p?.date || p.amount == null) continue;
    if (!matchesRetainerFilter(p, countTowardsRetainerFilter)) continue;
    const d = toDate(p.date);
    if (!d) continue;
    if (d >= yearStart && d <= upper) {
      total += Number(p.amount) || 0;
    }
  }
  return total;
}

/**
 * Sum of one-off project amounts dated in the current calendar month, up
 * to and including today. Future-dated rows are excluded.
 */
export function oneOffsThisMonth(
  oneOffProjects: OneOffProject[] | null | undefined,
  now: Date,
  countTowardsRetainerFilter?: boolean,
): number {
  if (!Array.isArray(oneOffProjects) || oneOffProjects.length === 0) return 0;
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const upper = end < now ? end : now;
  let total = 0;
  for (const p of oneOffProjects) {
    if (!p?.date || p.amount == null) continue;
    if (!matchesRetainerFilter(p, countTowardsRetainerFilter)) continue;
    const d = toDate(p.date);
    if (!d) continue;
    if (d >= start && d <= upper) {
      total += Number(p.amount) || 0;
    }
  }
  return total;
}
