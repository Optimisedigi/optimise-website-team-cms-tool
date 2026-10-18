/**
 * Business costs from Xero, in the shapes the Costs page (`/api/costs`) and
 * the dashboard already use, so both can run without bank statement uploads.
 *
 * Xero categories are its expense accounts. CMS Cost Categories still matter
 * in one way: a Cost Category with the same name as a Xero account (any case)
 * lends that account its colour and monthly budget.
 */

import type { XeroFinanceMonth } from "@/lib/finance/xero-finance";

export interface CostsCategory {
  id: string | number;
  name: string;
  color: string;
  budget?: number;
}

export interface CmsCostCategory {
  id: string | number;
  name?: string | null;
  color?: string | null;
  budget?: number | null;
}

export interface CostAlert {
  type: "over_budget" | "spike";
  severity: "red" | "orange";
  message: string;
  categoryId: string;
  categoryName: string;
}

export interface XeroCostsView {
  costsByCategory: Array<{ category: CostsCategory; total: number; count: number; items: never[] }>;
  costHistory: Array<{
    label: string;
    month: string;
    categories: Array<{ id: string | number; name: string; color: string; total: number }>;
    uncategorised: number;
    total: number;
  }>;
  costAlerts: CostAlert[];
  uncategorised: never[];
  totalThisMonth: number;
  totalLastMonth: number;
  currentMonth: string;
  categories: CostsCategory[];
}

// Brand-adjacent colours for Xero accounts without a matching Cost Category.
const PALETTE = ["#213843", "#468D8B", "#74B3A8", "#4A90D9", "#8B5CF6", "#EC4899", "#F59E0B", "#22C55E", "#EF4444", "#9CA3AF"];

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Stable colour for a name (same account always gets the same colour). */
function paletteColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length] ?? "#9CA3AF";
}

function previousMonthKey(key: string, back = 1): string {
  const [y = 0, m = 1] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - back, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y = 0, m = 1] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-AU", { month: "short", year: "2-digit", timeZone: "UTC" });
}

function byAccount(month: XeroFinanceMonth | undefined): Map<string, number> {
  return new Map((month?.costsByAccount ?? []).map((c) => [c.account, c.amount]));
}

/**
 * Costs page view for `selectedMonth` (cards, 6-month chart ending at that
 * month, budget/spike alerts). Returns null when Xero's data doesn't cover the
 * selected month, so the caller can fall back to imported statements.
 */
export function buildXeroCostsView(input: {
  xeroMonths: XeroFinanceMonth[];
  selectedMonth: string;
  cmsCategories: CmsCostCategory[];
}): XeroCostsView | null {
  const months = new Map(input.xeroMonths.map((m) => [m.month, m]));
  const current = months.get(input.selectedMonth);
  if (!current) return null;

  const cmsByName = new Map<string, CmsCostCategory>();
  for (const c of input.cmsCategories) if (c.name) cmsByName.set(c.name.trim().toLowerCase(), c);

  const historyKeys = [5, 4, 3, 2, 1, 0].map((back) => previousMonthKey(input.selectedMonth, back));
  const accountNames = new Set<string>();
  for (const key of historyKeys) for (const c of months.get(key)?.costsByAccount ?? []) accountNames.add(c.account);

  const categoryFor = (name: string): CostsCategory => {
    const match = cmsByName.get(name.trim().toLowerCase());
    const budget = Number(match?.budget);
    return {
      id: `xero:${name}`,
      name,
      color: match?.color || paletteColor(name),
      ...(Number.isFinite(budget) && budget > 0 ? { budget } : {}),
    };
  };
  const categories = [...accountNames].sort((a, b) => a.localeCompare(b)).map(categoryFor);
  const categoryByName = new Map(categories.map((c) => [c.name, c]));

  const currentByAccount = byAccount(current);
  const previous = months.get(previousMonthKey(input.selectedMonth));
  const previousByAccount = byAccount(previous);

  const costsByCategory = [...currentByAccount.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, total]) => ({
      category: categoryByName.get(name) ?? categoryFor(name),
      total: round(total),
      count: 0,
      items: [] as never[],
    }));

  const costAlerts: CostAlert[] = [];
  for (const { category, total } of costsByCategory) {
    const categoryId = String(category.id);
    if (category.budget && total > category.budget) {
      costAlerts.push({
        type: "over_budget",
        severity: "red",
        message: `${category.name} is $${round(total - category.budget)} over budget ($${round(total)} / $${category.budget})`,
        categoryId,
        categoryName: category.name,
      });
    }
    const prev = previousByAccount.get(category.name) ?? 0;
    if (prev > 0 && total > 0) {
      const increase = ((total - prev) / prev) * 100;
      if (increase > 20) {
        costAlerts.push({
          type: "spike",
          severity: "orange",
          message: `${category.name} up ${round(increase)}% vs last month ($${round(total)} vs $${round(prev)})`,
          categoryId,
          categoryName: category.name,
        });
      }
    }
  }

  const costHistory = historyKeys.map((key) => {
    const monthByAccount = byAccount(months.get(key));
    return {
      label: monthLabel(key),
      month: key,
      categories: categories.map((c) => ({ id: c.id, name: c.name, color: c.color, total: round(monthByAccount.get(c.name) ?? 0) })),
      uncategorised: 0,
      total: round(months.get(key)?.costs ?? 0),
    };
  });

  return {
    costsByCategory,
    costHistory,
    costAlerts,
    uncategorised: [],
    totalThisMonth: round(current.costs),
    totalLastMonth: round(previous?.costs ?? 0),
    currentMonth: input.selectedMonth,
    categories,
  };
}

/** Dashboard figures from Xero: this month, last month, and a month → total map for the cost chart. */
export function xeroBusinessCostsSummary(
  xeroMonths: XeroFinanceMonth[],
  thisMonthKey: string,
  lastMonthKey: string,
): { totalThisMonth: number; totalLastMonth: number; uncategorisedCount: number; source: "xero"; byMonth: Map<string, number> } {
  const byMonth = new Map(xeroMonths.map((m) => [m.month, round(m.costs)]));
  return {
    totalThisMonth: byMonth.get(thisMonthKey) ?? 0,
    totalLastMonth: byMonth.get(lastMonthKey) ?? 0,
    uncategorisedCount: 0,
    source: "xero",
    byMonth,
  };
}
