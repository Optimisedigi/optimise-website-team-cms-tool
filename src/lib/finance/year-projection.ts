/**
 * Year-end estimate for the Costs page (financial or calendar year).
 *
 * Pure. Starts from what Xero says has been invoiced and spent, then fills the
 * rest of the period:
 * - Invoiced: each client's expected retainer per month. Retainers that start
 *   later count from their start date (first month pro-rated), and scheduled
 *   retainer changes (end / new amount) apply from their effective date.
 *   Amounts are what the client is invoiced: before revenue share and
 *   referral commissions, because Xero records those payouts as costs.
 * - Costs: every Xero category carries on at its monthly average over the
 *   last complete months (`averageMonths`), so the what-if category
 *   exclusions work on the estimate too.
 * - The current month counts the higher of Xero so far and the expected
 *   amount, per figure (and per cost category), so a half-finished month
 *   isn't treated as the whole month.
 * - Manual adjustments (estimated invoices or costs entered on the Costs
 *   page) are added on top of their month. Cost adjustments sit in their
 *   chosen Xero category (or "Manual estimates") so the what-if toggles
 *   apply to them too. They never feed the cost run rate.
 * - Xero draft and scheduled invoices are not counted: Xero figures are
 *   approved/paid invoices by invoice date.
 */

import {
  effectiveMonthlyRetainer,
  firstMonthProrationFactor,
  scheduledRetainerChange,
  type RetainerHistoryEntry,
} from "@/lib/client-revenue";

export interface ProjectionClient {
  id: string | number;
  name?: string | null;
  isActive?: boolean | null;
  clientType?: string | null;
  monthlyRetainer?: number | null;
  clientStartDate?: string | null;
  retainerStartDate?: string | null;
  retainerHistory?: RetainerHistoryEntry[] | null;
  retainerChangeDate?: string | null;
  retainerChangeAction?: string | null;
  retainerChangeAmount?: number | null;
}

export interface ActualMonth {
  month: string; // YYYY-MM
  invoiced: number;
  costs: number;
  costsByAccount?: Array<{ account: string; amount: number }>;
}

export type ProjectionMonthKind = "actual" | "current" | "estimate";

export type ProjectionAdjustmentKind = "invoiced" | "cost";

/** A manually entered estimated invoice or cost for one month. */
export interface ProjectionAdjustment {
  id: string | number;
  month: string; // YYYY-MM
  kind: ProjectionAdjustmentKind;
  /** Ex-GST; negative reduces the month. */
  amount: number;
  description: string;
  /** Cost category the amount belongs to (costs only); defaults to MANUAL_COST_ACCOUNT. */
  account?: string | null;
}

/** Cost category for manual cost adjustments without a Xero category. */
export const MANUAL_COST_ACCOUNT = "Manual estimates";

export interface ProjectionRetainer {
  id: string | number;
  name: string;
  amount: number;
}

export interface ProjectionMonth {
  month: string;
  kind: ProjectionMonthKind;
  /** Invoiced used in the estimate (actual, estimate, or the higher of both this month). */
  invoiced: number;
  /** Invoiced in Xero so far (0 for future months). */
  invoicedActual: number;
  costs: number;
  costsActual: number;
  costsByAccount: Array<{ account: string; amount: number }>;
  /** Xero costs so far by category (empty for future months). */
  costsActualByAccount: Array<{ account: string; amount: number }>;
  /** Expected retainer invoices by client (empty for past months). */
  retainers: ProjectionRetainer[];
  /** Sum of `retainers`. */
  invoicedExpected: number;
  /** Manual adjustments for this month, already included in invoiced/costs. */
  adjustments: ProjectionAdjustment[];
  profit: number;
}

export interface ProjectionTotals {
  invoicedActual: number;
  /** Added on top of Xero: expected retainers for the rest of the period. */
  invoicedExpected: number;
  invoiced: number;
  costsActual: number;
  costsExpected: number;
  costs: number;
  profit: number;
}

export interface ProjectionClientRow {
  id: string | number;
  name: string;
  monthlyRetainer: number;
  /** Expected retainer invoices for months after the current month. */
  restOfPeriod: number;
  /** Stored start date when the retainer starts after the current month began. */
  startsOn: string | null;
  /** Scheduled change that takes effect after the current month began. */
  change: { date: string; action: "end" | "change"; amount: number } | null;
}

export interface YearProjection {
  months: ProjectionMonth[];
  totals: ProjectionTotals;
  costAverage: { months: string[]; monthly: number };
  clients: ProjectionClientRow[];
}

const UNCATEGORISED = "Uncategorised";

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function monthStartOf(key: string): Date {
  const [y = 0, m = 1] = key.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** Cost categories for a month, with any unsplit remainder as "Uncategorised". */
function accountsOf(month: ActualMonth | undefined): Map<string, number> {
  const map = new Map<string, number>();
  if (!month) return map;
  for (const c of month.costsByAccount ?? []) {
    map.set(c.account, (map.get(c.account) ?? 0) + (Number(c.amount) || 0));
  }
  const split = [...map.values()].reduce((s, v) => s + v, 0);
  const rest = (Number(month.costs) || 0) - split;
  if (rest > 0.5) map.set(UNCATEGORISED, (map.get(UNCATEGORISED) ?? 0) + rest);
  return map;
}

function sortedAccounts(map: Map<string, number>): Array<{ account: string; amount: number }> {
  return [...map.entries()]
    .map(([account, amount]) => ({ account, amount: round(amount) }))
    .filter((c) => c.amount !== 0)
    .sort((a, b) => b.amount - a.amount || a.account.localeCompare(b.account));
}

/** Whether a client's retainer belongs in the estimate at all. */
function countsRetainer(client: ProjectionClient): boolean {
  if (client.clientType === "one_off") return false;
  if (client.isActive !== false) return true;
  // Deactivated early, but the retainer runs until its scheduled end.
  const change = scheduledRetainerChange(client);
  return change !== null && change.amount === 0;
}

/**
 * Expected retainer invoice for one client in one month: the retainer in
 * force that month (after scheduled changes), pro-rated in the month it
 * starts and zero before it starts. Clients without a start date count from
 * now.
 */
export function expectedRetainerForMonth(client: ProjectionClient, monthKey: string): number {
  if (!countsRetainer(client)) return 0;
  const monthStart = monthStartOf(monthKey);
  const anchor = toDate(client.retainerStartDate ?? null) ?? toDate(client.clientStartDate ?? null);
  const factor = anchor ? firstMonthProrationFactor(anchor, monthStart) : 1;
  if (factor <= 0) return 0;
  return effectiveMonthlyRetainer(client, monthStart) * factor;
}

export function projectionTotals(months: ProjectionMonth[]): ProjectionTotals {
  const sum = (pick: (m: ProjectionMonth) => number) => round(months.reduce((s, m) => s + pick(m), 0));
  const invoicedActual = sum((m) => m.invoicedActual);
  const invoiced = sum((m) => m.invoiced);
  const costsActual = sum((m) => m.costsActual);
  const costs = sum((m) => m.costs);
  return {
    invoicedActual,
    invoicedExpected: round(invoiced - invoicedActual),
    invoiced,
    costsActual,
    costsExpected: round(costs - costsActual),
    costs,
    profit: round(invoiced - costs),
  };
}

export function buildYearProjection(input: {
  /** Every month of the period, oldest first. */
  monthKeys: string[];
  currentMonth: string;
  /** Xero months covering the period so far and `averageMonths`. */
  actual: ActualMonth[];
  /** Complete months used for the cost run rate (months with no Xero activity are skipped). */
  averageMonths: string[];
  clients: ProjectionClient[];
  /** Manual estimated invoices/costs; months outside `monthKeys` are ignored. */
  adjustments?: ProjectionAdjustment[];
}): YearProjection {
  const byMonth = new Map(input.actual.map((m) => [m.month, m]));

  const usedForAverage = input.averageMonths.filter((k) => {
    const m = byMonth.get(k);
    return m !== undefined && ((Number(m.invoiced) || 0) > 0 || (Number(m.costs) || 0) > 0);
  });
  const averageByAccount = new Map<string, number>();
  for (const k of usedForAverage) {
    for (const [account, amount] of accountsOf(byMonth.get(k))) {
      averageByAccount.set(account, (averageByAccount.get(account) ?? 0) + amount / usedForAverage.length);
    }
  }
  const averageCosts = [...averageByAccount.values()].reduce((s, v) => s + v, 0);

  const clients = input.clients.filter(countsRetainer);
  const retainersFor = (key: string): ProjectionRetainer[] =>
    clients
      .map((c) => ({ id: c.id, name: String(c.name ?? `#${c.id}`), amount: round(expectedRetainerForMonth(c, key)) }))
      .filter((r) => r.amount > 0)
      .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));

  const adjustmentsByMonth = new Map<string, ProjectionAdjustment[]>();
  for (const a of input.adjustments ?? []) {
    const amount = Number(a.amount);
    if (!Number.isFinite(amount) || amount === 0) continue;
    const list = adjustmentsByMonth.get(a.month) ?? [];
    list.push({ ...a, amount: round(amount) });
    adjustmentsByMonth.set(a.month, list);
  }

  const months = input.monthKeys.map((key): ProjectionMonth => {
    const actual = byMonth.get(key);
    const invoicedActual = key <= input.currentMonth ? round(Number(actual?.invoiced) || 0) : 0;
    const costsActual = key <= input.currentMonth ? round(Number(actual?.costs) || 0) : 0;

    let kind: ProjectionMonthKind;
    let invoiced: number;
    let accounts: Map<string, number>;
    const retainers = key < input.currentMonth ? [] : retainersFor(key);
    const invoicedExpected = round(retainers.reduce((s, r) => s + r.amount, 0));
    if (key < input.currentMonth) {
      kind = "actual";
      invoiced = invoicedActual;
      accounts = accountsOf(actual);
    } else if (key === input.currentMonth) {
      kind = "current";
      invoiced = Math.max(invoicedActual, invoicedExpected);
      accounts = accountsOf(actual);
      for (const [account, avg] of averageByAccount) {
        accounts.set(account, Math.max(accounts.get(account) ?? 0, avg));
      }
    } else {
      kind = "estimate";
      invoiced = invoicedExpected;
      accounts = new Map(averageByAccount);
    }
    const baseCosts =
      kind === "actual" ? costsActual : [...accounts.values()].reduce((s, v) => s + round(v), 0);

    const adjustments = adjustmentsByMonth.get(key) ?? [];
    let costAdjustments = 0;
    for (const a of adjustments) {
      if (a.kind === "invoiced") {
        invoiced += a.amount;
      } else {
        const account = a.account?.trim() || MANUAL_COST_ACCOUNT;
        accounts.set(account, (accounts.get(account) ?? 0) + a.amount);
        costAdjustments += a.amount;
      }
    }

    const costsByAccount = sortedAccounts(accounts);
    const costsActualByAccount = key <= input.currentMonth ? sortedAccounts(accountsOf(actual)) : [];
    const costs = round(baseCosts + costAdjustments);
    invoiced = round(invoiced);
    return {
      month: key,
      kind,
      invoiced,
      invoicedActual,
      costs,
      costsActual,
      costsByAccount,
      costsActualByAccount,
      retainers,
      invoicedExpected,
      adjustments,
      profit: round(invoiced - costs),
    };
  });

  const futureKeys = input.monthKeys.filter((k) => k > input.currentMonth);
  const currentStart = monthStartOf(input.currentMonth);
  const clientRows = clients
    .map((c): ProjectionClientRow => {
      const anchorRaw = c.retainerStartDate ?? c.clientStartDate ?? null;
      const anchor = toDate(anchorRaw);
      const change = scheduledRetainerChange(c);
      const action = c.retainerChangeAction === "end" ? "end" : "change";
      return {
        id: c.id,
        name: String(c.name ?? `#${c.id}`),
        monthlyRetainer: round(Math.max(0, Number(c.monthlyRetainer) || 0)),
        restOfPeriod: round(futureKeys.reduce((s, k) => s + expectedRetainerForMonth(c, k), 0)),
        startsOn: anchor && anchor >= currentStart ? anchorRaw : null,
        change:
          change && change.date >= currentStart && c.retainerChangeDate
            ? { date: c.retainerChangeDate, action, amount: round(change.amount) }
            : null,
      };
    })
    .filter((r) => r.restOfPeriod > 0 || r.startsOn !== null || r.change !== null)
    .sort((a, b) => b.restOfPeriod - a.restOfPeriod || a.name.localeCompare(b.name));

  return {
    months,
    totals: projectionTotals(months),
    costAverage: { months: usedForAverage, monthly: round(averageCosts) },
    clients: clientRows,
  };
}

/**
 * What-if view: drop the given cost categories from every month (actual and
 * estimated) and recompute costs, profit and totals.
 */
export function excludeProjectionAccounts(
  months: ProjectionMonth[],
  excluded: ReadonlySet<string>,
): { months: ProjectionMonth[]; totals: ProjectionTotals } {
  if (excluded.size === 0) return { months, totals: projectionTotals(months) };
  const adjusted = months.map((m): ProjectionMonth => {
    const removedFrom = (rows: Array<{ account: string; amount: number }>) =>
      rows.reduce((s, c) => (excluded.has(c.account) ? s + c.amount : s), 0);
    const costs = round(m.costs - removedFrom(m.costsByAccount));
    const costsActual = round(m.costsActual - removedFrom(m.costsActualByAccount));
    return { ...m, costs, costsActual, profit: round(m.invoiced - costs) };
  });
  return { months: adjusted, totals: projectionTotals(adjusted) };
}
