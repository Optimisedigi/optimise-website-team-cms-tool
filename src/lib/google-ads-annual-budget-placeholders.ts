export type AnnualBudgetMonthKey = 'jul' | 'aug' | 'sep' | 'oct' | 'nov' | 'dec' | 'jan' | 'feb' | 'mar' | 'apr' | 'may' | 'jun';

export interface AnnualBudgetPlaceholderRow {
  id: string;
  label: string;
  values: Record<AnnualBudgetMonthKey, number | ''>;
}

/** A single draw against the financial year's unspent (unplanned) budget pool.
 *  `row` allocations append a new grid row; `override` allocations bump an
 *  existing row's month cell. Both are recorded here so the pool can be
 *  decremented — and reversed — without guessing which cells were manual. */
export interface CarryoverAllocation {
  id: string;
  monthKey: AnnualBudgetMonthKey;
  /** Signed amount drawn from the pool. An override that lowers a cell
   *  returns budget to the pool via a negative amount. */
  amount: number;
  mode: 'row' | 'override';
  rowId: string;
  label: string;
  createdAt: string;
}

export interface AnnualBudgetYearData {
  rows: AnnualBudgetPlaceholderRow[];
  actualTotals: Record<AnnualBudgetMonthKey, number | ''>;
  carryoverAllocations: CarryoverAllocation[];
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
    carryoverAllocations: [],
  };
}

function parseBudgetCell(value: unknown): number | '' {
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  const cleaned = String(value ?? '').replace(/[$,\s]/g, '');
  if (cleaned === '') return '';
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : '';
}

function normalizeCarryoverAllocations(value: unknown): CarryoverAllocation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: any, index: number) => {
    const monthKey = ANNUAL_BUDGET_MONTHS.find((month) => month.key === entry?.monthKey)?.key;
    const amount = parseBudgetCell(entry?.amount);
    if (!monthKey || amount === '') return [];
    return [{
      id: typeof entry?.id === 'string' && entry.id ? entry.id : `carryover-${index}`,
      monthKey,
      amount,
      mode: entry?.mode === 'override' ? 'override' : 'row',
      rowId: typeof entry?.rowId === 'string' ? entry.rowId : '',
      label: typeof entry?.label === 'string' ? entry.label : '',
      createdAt: typeof entry?.createdAt === 'string' ? entry.createdAt : '',
    } as CarryoverAllocation];
  });
}

function normalizeYearData(value: unknown): AnnualBudgetYearData {
  const rawRows = Array.isArray(value)
    ? value
    : Array.isArray((value as any)?.rows)
      ? (value as any).rows
      : [];
  const rawActuals = (value as any)?.actualTotals;

  return {
    carryoverAllocations: normalizeCarryoverAllocations((value as any)?.carryoverAllocations),
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

/** Month keys of the FY section that have already finished, i.e. the only
 *  months whose planned-vs-actual discrepancy can be treated as leftover.
 *  A previous financial year is fully complete; the live year stops at the
 *  month before today. */
export function completedMonthKeysForSection(
  section: 'thisYear' | 'lastYear',
  now = new Date(),
): AnnualBudgetMonthKey[] {
  if (section === 'lastYear') return ANNUAL_BUDGET_MONTHS.map((month) => month.key);
  const currentKey = monthKeyForDate(now);
  const currentIndex = ANNUAL_BUDGET_MONTHS.findIndex((month) => month.key === currentKey);
  return ANNUAL_BUDGET_MONTHS.slice(0, Math.max(0, currentIndex)).map((month) => month.key);
}

/** Months that can still receive a carryover allocation: the current month and
 *  the remaining months of the same financial year. Leftover budget never
 *  crosses a financial year boundary. */
export function allocatableMonthKeysForSection(
  section: 'thisYear' | 'lastYear',
  now = new Date(),
): AnnualBudgetMonthKey[] {
  if (section === 'lastYear') return [];
  const completed = completedMonthKeysForSection(section, now);
  return ANNUAL_BUDGET_MONTHS.slice(completed.length).map((month) => month.key);
}

export interface CarryoverSummary {
  /** Planned total across completed months of the financial year. */
  plannedToDate: number;
  /** Recorded actual spend across those same months. */
  actualToDate: number;
  /** Planned minus actual for completed months (negative when overspent). */
  discrepancy: number;
  /** Carryover already committed to months that have not completed yet. */
  allocated: number;
  /** Still available to allocate: discrepancy minus outstanding allocations. */
  available: number;
  /** Completed months that have no recorded actual spend, so are excluded. */
  monthsMissingActuals: AnnualBudgetMonthKey[];
}

/** Unspent budget carried forward inside one financial year.
 *
 *  Only completed months contribute, and only when an actual total has been
 *  recorded for them — a blank actual means "unknown", not "$0 spent".
 *  Allocations into months that have since completed are already reflected in
 *  that month's planned total, so subtracting them again would double count;
 *  only outstanding (future/current month) allocations reduce the pool. */
export function calculateCarryoverSummary(
  yearData: AnnualBudgetYearData,
  section: 'thisYear' | 'lastYear',
  now = new Date(),
): CarryoverSummary {
  const completedKeys = completedMonthKeysForSection(section, now);
  const completedSet = new Set<AnnualBudgetMonthKey>(completedKeys);
  const monthsMissingActuals: AnnualBudgetMonthKey[] = [];

  let plannedToDate = 0;
  let actualToDate = 0;
  for (const monthKey of completedKeys) {
    const planned = annualBudgetColumnTotal(yearData, monthKey);
    const actual = yearData.actualTotals[monthKey];
    if (planned <= 0) continue;
    if (actual === '') {
      monthsMissingActuals.push(monthKey);
      continue;
    }
    plannedToDate += planned;
    actualToDate += Number(actual);
  }

  const allocated = yearData.carryoverAllocations
    .filter((allocation) => !completedSet.has(allocation.monthKey))
    .reduce((sum, allocation) => sum + allocation.amount, 0);

  const discrepancy = plannedToDate - actualToDate;
  return {
    plannedToDate,
    actualToDate,
    discrepancy,
    allocated,
    available: discrepancy - allocated,
    monthsMissingActuals,
  };
}

function createAllocationId(): string {
  return `carryover-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface CarryoverAllocationInput {
  section: 'thisYear' | 'lastYear';
  monthKey: AnnualBudgetMonthKey;
  amount: number;
  label?: string;
  /** Required for `override`: the existing row whose month cell is replaced. */
  rowId?: string;
}

export interface CarryoverAllocationResult {
  placeholders: AnnualBudgetMultiYearData;
  error: string | null;
}

function validateAllocationTarget(
  input: CarryoverAllocationInput,
  now: Date,
): string | null {
  if (!Number.isFinite(input.amount)) return 'Enter a valid amount.';
  if (!allocatableMonthKeysForSection(input.section, now).includes(input.monthKey)) {
    return 'Carryover can only be allocated to remaining months of this financial year.';
  }
  return null;
}

/** Allocate carryover by appending a new budget row holding the amount in the
 *  target month. Returns the original placeholders untouched on validation
 *  failure so callers can surface `error` without a partial write. */
export function allocateCarryoverToNewRow(
  placeholders: AnnualBudgetMultiYearData,
  input: CarryoverAllocationInput,
  now = new Date(),
): CarryoverAllocationResult {
  const invalid = validateAllocationTarget(input, now);
  if (invalid) return { placeholders, error: invalid };
  if (input.amount <= 0) return { placeholders, error: 'Enter an amount greater than zero.' };

  const yearData = placeholders[input.section];
  const summary = calculateCarryoverSummary(yearData, input.section, now);
  if (input.amount > summary.available + 0.005) {
    return { placeholders, error: 'Amount exceeds the unspent budget available.' };
  }

  const label = input.label?.trim() || 'Carryover allocation';
  const rowId = `row-${createAllocationId()}`;
  const row: AnnualBudgetPlaceholderRow = {
    id: rowId,
    label,
    values: { ...emptyAnnualBudgetValues(), [input.monthKey]: input.amount },
  };

  return {
    error: null,
    placeholders: {
      ...placeholders,
      [input.section]: {
        ...yearData,
        rows: [...yearData.rows, row],
        carryoverAllocations: [
          ...yearData.carryoverAllocations,
          {
            id: createAllocationId(),
            monthKey: input.monthKey,
            amount: input.amount,
            mode: 'row',
            rowId,
            label,
            createdAt: now.toISOString(),
          },
        ],
      },
    },
  };
}

/** Manually override an existing row's budget for a month. The difference
 *  against the current cell value is drawn from (or returned to) the pool. */
export function overrideBudgetWithCarryover(
  placeholders: AnnualBudgetMultiYearData,
  input: CarryoverAllocationInput,
  now = new Date(),
): CarryoverAllocationResult {
  const invalid = validateAllocationTarget(input, now);
  if (invalid) return { placeholders, error: invalid };
  if (input.amount < 0) return { placeholders, error: 'Enter an amount of zero or more.' };

  const yearData = placeholders[input.section];
  const targetRow = yearData.rows.find((row) => row.id === input.rowId);
  if (!targetRow) return { placeholders, error: 'Select a budget row to override.' };

  const previous = Number(targetRow.values[input.monthKey]) || 0;
  const delta = input.amount - previous;
  if (delta === 0) return { placeholders, error: 'That month already has this amount.' };

  const summary = calculateCarryoverSummary(yearData, input.section, now);
  if (delta > summary.available + 0.005) {
    return { placeholders, error: 'Amount exceeds the unspent budget available.' };
  }

  return {
    error: null,
    placeholders: {
      ...placeholders,
      [input.section]: {
        ...yearData,
        rows: yearData.rows.map((row) => (
          row.id === targetRow.id
            ? { ...row, values: { ...row.values, [input.monthKey]: input.amount } }
            : row
        )),
        carryoverAllocations: [
          ...yearData.carryoverAllocations,
          {
            id: createAllocationId(),
            monthKey: input.monthKey,
            amount: delta,
            mode: 'override',
            rowId: targetRow.id,
            label: input.label?.trim() || targetRow.label,
            createdAt: now.toISOString(),
          },
        ],
      },
    },
  };
}

/** Reverse an allocation: drop the generated row (or unwind the override
 *  delta) and return the amount to the unspent pool. */
export function reverseCarryoverAllocation(
  placeholders: AnnualBudgetMultiYearData,
  section: 'thisYear' | 'lastYear',
  allocationId: string,
): AnnualBudgetMultiYearData {
  const yearData = placeholders[section];
  const allocation = yearData.carryoverAllocations.find((entry) => entry.id === allocationId);
  if (!allocation) return placeholders;

  const rows = allocation.mode === 'row'
    ? yearData.rows.filter((row) => row.id !== allocation.rowId)
    : yearData.rows.map((row) => {
        if (row.id !== allocation.rowId) return row;
        const restored = (Number(row.values[allocation.monthKey]) || 0) - allocation.amount;
        return {
          ...row,
          values: { ...row.values, [allocation.monthKey]: restored === 0 ? '' : restored },
        };
      });

  return {
    ...placeholders,
    [section]: {
      ...yearData,
      rows,
      carryoverAllocations: yearData.carryoverAllocations.filter((entry) => entry.id !== allocationId),
    },
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
