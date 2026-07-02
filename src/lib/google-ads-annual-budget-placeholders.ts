export type AnnualBudgetMonthKey = 'jul' | 'aug' | 'sep' | 'oct' | 'nov' | 'dec' | 'jan' | 'feb' | 'mar' | 'apr' | 'may' | 'jun';

export interface AnnualBudgetPlaceholderRow {
  id: string;
  label: string;
  values: Record<AnnualBudgetMonthKey, number | ''>;
}

export interface AnnualBudgetYearData {
  rows: AnnualBudgetPlaceholderRow[];
  actualTotals: Record<AnnualBudgetMonthKey, number | ''>;
}

export interface AnnualBudgetMultiYearData {
  thisYear: AnnualBudgetYearData;
  lastYear: AnnualBudgetYearData;
}

export const ANNUAL_BUDGET_MONTHS: Array<{ key: AnnualBudgetMonthKey; label: string; monthIndex: number }> = [
  { key: 'jul', label: 'Jul', monthIndex: 6 },
  { key: 'aug', label: 'Aug', monthIndex: 7 },
  { key: 'sep', label: 'Sep', monthIndex: 8 },
  { key: 'oct', label: 'Oct', monthIndex: 9 },
  { key: 'nov', label: 'Nov', monthIndex: 10 },
  { key: 'dec', label: 'Dec', monthIndex: 11 },
  { key: 'jan', label: 'Jan', monthIndex: 0 },
  { key: 'feb', label: 'Feb', monthIndex: 1 },
  { key: 'mar', label: 'Mar', monthIndex: 2 },
  { key: 'apr', label: 'Apr', monthIndex: 3 },
  { key: 'may', label: 'May', monthIndex: 4 },
  { key: 'jun', label: 'Jun', monthIndex: 5 },
];

export function emptyAnnualBudgetValues(): Record<AnnualBudgetMonthKey, number | ''> {
  return ANNUAL_BUDGET_MONTHS.reduce((acc, month) => {
    acc[month.key] = '';
    return acc;
  }, {} as Record<AnnualBudgetMonthKey, number | ''>);
}

export function createEmptyAnnualBudgetYearData(): AnnualBudgetYearData {
  return {
    rows: [],
    actualTotals: emptyAnnualBudgetValues(),
  };
}

function parseBudgetCell(value: unknown): number | '' {
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  const cleaned = String(value ?? '').replace(/[$,\s]/g, '');
  if (cleaned === '') return '';
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : '';
}

function normalizeYearData(value: unknown): AnnualBudgetYearData {
  const rawRows = Array.isArray(value)
    ? value
    : Array.isArray((value as any)?.rows)
      ? (value as any).rows
      : [];
  const rawActuals = (value as any)?.actualTotals;

  return {
    rows: rawRows.map((row: any, index: number) => ({
      id: typeof row?.id === 'string' ? row.id : `saved-${index}`,
      label: typeof row?.label === 'string' && row.label.trim() ? row.label : `Budget ${index + 1}`,
      values: ANNUAL_BUDGET_MONTHS.reduce((acc, month) => {
        acc[month.key] = parseBudgetCell(row?.values?.[month.key]);
        return acc;
      }, {} as Record<AnnualBudgetMonthKey, number | ''>),
    })),
    actualTotals: ANNUAL_BUDGET_MONTHS.reduce((acc, month) => {
      acc[month.key] = parseBudgetCell(rawActuals?.[month.key]);
      return acc;
    }, emptyAnnualBudgetValues()),
  };
}

export function normalizeAnnualBudgetMultiYearData(value: unknown, legacyValue?: unknown): AnnualBudgetMultiYearData {
  const raw = (value && typeof value === 'object' ? value : null) as Record<string, unknown> | null;
  if (raw && ('thisYear' in raw || 'lastYear' in raw)) {
    return {
      thisYear: normalizeYearData(raw.thisYear),
      lastYear: normalizeYearData(raw.lastYear),
    };
  }

  const hasLegacyShape = Array.isArray(value) || Boolean(raw && ('rows' in raw || 'actualTotals' in raw));
  const legacy = hasLegacyShape ? value : (legacyValue ?? value);
  return {
    thisYear: normalizeYearData(legacy),
    lastYear: createEmptyAnnualBudgetYearData(),
  };
}

export function financialYearStartYear(date: Date): number {
  return date.getMonth() >= 6 ? date.getFullYear() : date.getFullYear() - 1;
}

export function financialYearLabel(startYear: number): string {
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`;
}

export function monthKeyForDate(date: Date): AnnualBudgetMonthKey {
  return ANNUAL_BUDGET_MONTHS.find((month) => month.monthIndex === date.getMonth())?.key ?? 'jul';
}

export function financialYearSectionForDate(
  targetDate: Date,
  now = new Date(),
): 'thisYear' | 'lastYear' | null {
  const currentStartYear = financialYearStartYear(now);
  const targetStartYear = financialYearStartYear(targetDate);
  if (targetStartYear === currentStartYear) return 'thisYear';
  if (targetStartYear === currentStartYear - 1) return 'lastYear';
  return null;
}

export function annualBudgetColumnTotal(yearData: AnnualBudgetYearData, monthKey: AnnualBudgetMonthKey): number {
  return yearData.rows.reduce((sum, row) => sum + (typeof row.values[monthKey] === 'number' ? row.values[monthKey] : 0), 0);
}

export function annualBudgetHasExplicitValue(yearData: AnnualBudgetYearData, monthKey: AnnualBudgetMonthKey): boolean {
  return yearData.rows.some((row) => typeof row.values[monthKey] === 'number');
}

export function resolveMonthlyBudgetForDate(
  placeholders: AnnualBudgetMultiYearData | null | undefined,
  targetDate: Date,
  fallbackMonthlyBudget: number,
  now = new Date(),
): number {
  if (!placeholders) return fallbackMonthlyBudget;
  const section = financialYearSectionForDate(targetDate, now);
  if (!section) return fallbackMonthlyBudget;
  const monthKey = monthKeyForDate(targetDate);
  const yearData = placeholders[section];
  if (!annualBudgetHasExplicitValue(yearData, monthKey)) return fallbackMonthlyBudget;
  return annualBudgetColumnTotal(yearData, monthKey);
}

export function resolveActualTotalsSlotForDate(
  targetDate: Date,
  now = new Date(),
): { section: 'thisYear' | 'lastYear' | null; monthKey: AnnualBudgetMonthKey } {
  return {
    section: financialYearSectionForDate(targetDate, now),
    monthKey: monthKeyForDate(targetDate),
  };
}

export function writeActualTotalForDate(
  placeholders: AnnualBudgetMultiYearData,
  targetDate: Date,
  actualSpend: number,
  now = new Date(),
): AnnualBudgetMultiYearData {
  const { section, monthKey } = resolveActualTotalsSlotForDate(targetDate, now);
  if (!section) return placeholders;

  return {
    ...placeholders,
    [section]: {
      ...placeholders[section],
      actualTotals: {
        ...placeholders[section].actualTotals,
        [monthKey]: actualSpend,
      },
    },
  };
}
