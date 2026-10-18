/**
 * Pure month-by-month Sales vs Costs maths for the Costs page.
 *
 * Xero is the source of truth when connected (buildMonthlyPnlFromXero).
 * Without Xero, the fallback (buildMonthlyPnl) uses:
 * - Sales (agreed): what client records say was earned in each month, using
 *   the same rules as the dashboard (retainer in force that month from the
 *   retainer history, minus monthly referral commissions, first-month
 *   pro-ration, retainer-tagged and standalone one-offs, setup fees, all
 *   multiplied by the agency's revenue share).
 * - Received: credits imported from bank statements (`bank-receipts`).
 * - Costs: debits imported from bank statements plus manual costs
 *   (`business-costs`). Fixed infra/LLM estimates are NOT added: those bills
 *   already appear as debits on the statement, so adding them would double count.
 */

import {
  firstMonthProrationFactor,
  grossRetainerForMonth,
  monthlyCommissionForDate,
  revenueShareFactor,
  type OneOffProject,
  type ReferralCommission,
  type RetainerHistoryEntry,
} from "@/lib/client-revenue";

export interface PnlClient {
  isActive?: boolean | null;
  clientType?: string | null;
  monthlyRetainer?: number | null;
  setupFee?: number | null;
  revenueSharePercent?: number | null;
  clientStartDate?: string | null;
  retainerStartDate?: string | null;
  retainerHistory?: RetainerHistoryEntry[] | null;
  referralCommissions?: ReferralCommission[] | null;
  oneOffProjects?: OneOffProject[] | null;
}

export interface PnlMonth {
  month: string; // YYYY-MM
  sales: number;
  received: number;
  costs: number;
  profitSales: number;
  profitReceived: number;
  /** True when no bank rows exist for the month (statement probably not imported). */
  noBankData: boolean;
  /** Xero only: this month's costs split by the Xero account they were coded to. */
  costsByAccount?: Array<{ account: string; amount: number }>;
}

export interface PnlTotals {
  sales: number;
  received: number;
  costs: number;
  profitSales: number;
  profitReceived: number;
}

export function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** The `count` month keys ending with the month containing `now`, oldest first. */
export function lastMonthKeys(now: Date, count: number): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    keys.push(monthKeyOf(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  return keys;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function inMonth(d: Date, monthStart: Date, now: Date): boolean {
  const next = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
  return d >= monthStart && d < next && d <= now;
}

function sumOneOffs(
  projects: OneOffProject[] | null | undefined,
  monthStart: Date,
  now: Date,
  countTowardsRetainer: boolean,
): number {
  if (!Array.isArray(projects)) return 0;
  let total = 0;
  for (const p of projects) {
    if (!p?.date || p.amount == null) continue;
    if (Boolean(p.countTowardsRetainer) !== countTowardsRetainer) continue;
    const d = toDate(p.date);
    if (d && inMonth(d, monthStart, now)) total += Number(p.amount) || 0;
  }
  return total;
}

/** Setup fee lands in the retainer/client start month; undated fees count in the current month (matches the dashboard). */
function setupFeeForMonth(client: PnlClient, monthStart: Date, now: Date): number {
  const amount = Math.max(0, Number(client.setupFee) || 0);
  if (amount <= 0) return 0;
  const dateValue = client.retainerStartDate ?? client.clientStartDate ?? null;
  if (!dateValue) return monthKeyOf(monthStart) === monthKeyOf(now) ? amount : 0;
  const d = toDate(dateValue);
  return d && inMonth(d, monthStart, now) ? amount : 0;
}

/**
 * Agreed (earned) sales for one client in one month. Retainers count only for
 * active clients: inactive clients have no end date recorded, so their past
 * retainer months can't be reconstructed (the dashboard makes the same call).
 * One-offs and one-off setup fees count for every client.
 */
export function agreedSalesForMonth(client: PnlClient, monthStart: Date, now: Date): number {
  if (monthStart > now) return 0;
  const share = revenueShareFactor(client.revenueSharePercent);
  let total = sumOneOffs(client.oneOffProjects, monthStart, now, false);

  if (client.clientType === "one_off") {
    total += setupFeeForMonth(client, monthStart, now);
    return total * share;
  }

  if (client.isActive === false) return total * share;

  const anchor = toDate(client.retainerStartDate ?? null) ?? toDate(client.clientStartDate ?? null);
  const isCurrentMonth = monthKeyOf(monthStart) === monthKeyOf(now);
  // No start date: the dashboard only counts the current month, so do the same.
  const factor = anchor ? firstMonthProrationFactor(anchor, monthStart) : isCurrentMonth ? 1 : 0;
  if (factor > 0) {
    const gross = grossRetainerForMonth(
      Math.max(0, Number(client.monthlyRetainer) || 0),
      Array.isArray(client.retainerHistory) ? client.retainerHistory : [],
      monthStart,
    );
    const commission = monthlyCommissionForDate(client.referralCommissions, gross, monthStart);
    total += Math.max(0, gross - commission) * factor;
  }
  total += sumOneOffs(client.oneOffProjects, monthStart, now, true);
  total += setupFeeForMonth(client, monthStart, now);
  return total * share;
}

function totalsOf(months: PnlMonth[]): PnlTotals {
  const sum = (pick: (row: PnlMonth) => number) => round(months.reduce((s, row) => s + pick(row), 0));
  return {
    sales: sum((r) => r.sales),
    received: sum((r) => r.received),
    costs: sum((r) => r.costs),
    profitSales: sum((r) => r.profitSales),
    profitReceived: sum((r) => r.profitReceived),
  };
}

/**
 * Same shape from Xero: sales = invoiced, received = payments + receive
 * money, costs = bills + spend money (all ex-GST), plus a per-account cost
 * breakdown across the whole range using Xero's own categories.
 */
export function buildMonthlyPnlFromXero(input: {
  monthKeys: string[];
  xeroMonths: Array<{ month: string; invoiced: number; received: number; costs: number; costsByAccount: Array<{ account: string; amount: number }> }>;
}): { months: PnlMonth[]; totals: PnlTotals; costsByAccount: Array<{ account: string; amount: number }> } {
  const byMonth = new Map(input.xeroMonths.map((m) => [m.month, m]));
  const accountTotals = new Map<string, number>();
  const months = input.monthKeys.map((key): PnlMonth => {
    const x = byMonth.get(key);
    for (const c of x?.costsByAccount ?? []) accountTotals.set(c.account, (accountTotals.get(c.account) ?? 0) + c.amount);
    const sales = round(x?.invoiced ?? 0);
    const received = round(x?.received ?? 0);
    const costs = round(x?.costs ?? 0);
    return {
      month: key,
      sales,
      received,
      costs,
      profitSales: round(sales - costs),
      profitReceived: round(received - costs),
      noBankData: false,
      costsByAccount: x?.costsByAccount ?? [],
    };
  });
  const costsByAccount = [...accountTotals.entries()]
    .map(([account, amount]) => ({ account, amount: round(amount) }))
    .sort((a, b) => b.amount - a.amount || a.account.localeCompare(b.account));
  return { months, totals: totalsOf(months), costsByAccount };
}

export function buildMonthlyPnl(input: {
  monthKeys: string[];
  clients: PnlClient[];
  costsByMonth: Map<string, number>;
  receivedByMonth: Map<string, number>;
  now: Date;
}): { months: PnlMonth[]; totals: PnlTotals } {
  const months = input.monthKeys.map((key): PnlMonth => {
    const [y = 0, m = 1] = key.split("-").map(Number);
    const monthStart = new Date(y, m - 1, 1);
    const sales = round(
      input.clients.reduce((sum, c) => sum + agreedSalesForMonth(c, monthStart, input.now), 0),
    );
    const costs = round(input.costsByMonth.get(key) ?? 0);
    const received = round(input.receivedByMonth.get(key) ?? 0);
    return {
      month: key,
      sales,
      received,
      costs,
      profitSales: round(sales - costs),
      profitReceived: round(received - costs),
      noBankData: !input.costsByMonth.has(key) && !input.receivedByMonth.has(key),
    };
  });

  return { months, totals: totalsOf(months) };
}

/**
 * "What if" view: drop the given Xero cost accounts from every month and
 * recompute costs, both profits and the totals. Months without a per-account
 * split (bank fallback) are returned unchanged.
 */
export function excludeCostAccounts(
  months: PnlMonth[],
  excluded: ReadonlySet<string>,
): { months: PnlMonth[]; totals: PnlTotals } {
  const adjusted = months.map((m): PnlMonth => {
    if (excluded.size === 0 || !m.costsByAccount) return m;
    const removed = m.costsByAccount.reduce((s, c) => (excluded.has(c.account) ? s + c.amount : s), 0);
    const costs = round(m.costs - removed);
    return {
      ...m,
      costs,
      profitSales: round(m.sales - costs),
      profitReceived: round(m.received - costs),
    };
  });
  return { months: adjusted, totals: totalsOf(adjusted) };
}
