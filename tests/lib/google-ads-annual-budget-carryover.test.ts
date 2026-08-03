import { describe, expect, it } from 'vitest';

import {
  allocatableMonthKeysForSection,
  allocateCarryoverToNewRow,
  calculateCarryoverSummary,
  completedMonthKeysForSection,
  normalizeAnnualBudgetMultiYearData,
  overrideBudgetWithCarryover,
  reverseCarryoverAllocation,
  type AnnualBudgetMonthKey,
} from '@/lib/google-ads-annual-budget-placeholders';

const NOW = new Date('2025-10-15T12:00:00Z');

function values(overrides: Partial<Record<AnnualBudgetMonthKey, number>>) {
  return {
    jul: '', aug: '', sep: '', oct: '', nov: '', dec: '',
    jan: '', feb: '', mar: '', apr: '', may: '', jun: '',
    ...overrides,
  };
}

function placeholdersFixture() {
  return normalizeAnnualBudgetMultiYearData({
    thisYear: {
      rows: [{ id: 'base', label: 'Search', values: values({ jul: 10000, aug: 10000, sep: 10000, oct: 10000, nov: 10000 }) }],
      actualTotals: values({ jul: 9000, aug: 8000, sep: 10500 }),
    },
    lastYear: { rows: [], actualTotals: {} },
  });
}

describe('financial-year carryover pool', () => {
  it('only treats completed months of the live financial year as carryover sources', () => {
    expect(completedMonthKeysForSection('thisYear', NOW)).toEqual(['jul', 'aug', 'sep']);
    expect(allocatableMonthKeysForSection('thisYear', NOW)).toEqual([
      'oct', 'nov', 'dec', 'jan', 'feb', 'mar', 'apr', 'may', 'jun',
    ]);
  });

  it('never allows a previous financial year to receive carryover', () => {
    expect(allocatableMonthKeysForSection('lastYear', NOW)).toEqual([]);
  });

  it('sums planned minus actual for completed months and ignores months without actuals', () => {
    const summary = calculateCarryoverSummary(placeholdersFixture().thisYear, 'thisYear', NOW);

    expect(summary.plannedToDate).toBe(30000);
    expect(summary.actualToDate).toBe(27500);
    expect(summary.discrepancy).toBe(2500);
    expect(summary.available).toBe(2500);
    expect(summary.monthsMissingActuals).toEqual([]);
  });

  it('excludes completed months whose actual spend has not been recorded', () => {
    const placeholders = normalizeAnnualBudgetMultiYearData({
      thisYear: {
        rows: [{ id: 'base', label: 'Search', values: values({ jul: 10000, aug: 10000, sep: 10000 }) }],
        actualTotals: values({ jul: 6000 }),
      },
    });
    const summary = calculateCarryoverSummary(placeholders.thisYear, 'thisYear', NOW);

    expect(summary.discrepancy).toBe(4000);
    expect(summary.monthsMissingActuals).toEqual(['aug', 'sep']);
  });

  it('adds a new row for an allocation and decrements the available pool', () => {
    const { placeholders, error } = allocateCarryoverToNewRow(
      placeholdersFixture(),
      { section: 'thisYear', monthKey: 'nov', amount: 1500, label: 'Q2 catch-up' },
      NOW,
    );

    expect(error).toBeNull();
    const row = placeholders.thisYear.rows.at(-1)!;
    expect(row.label).toBe('Q2 catch-up');
    expect(row.values.nov).toBe(1500);
    expect(calculateCarryoverSummary(placeholders.thisYear, 'thisYear', NOW).available).toBe(1000);
  });

  it('rejects allocations above the available pool and outside the financial year', () => {
    const base = placeholdersFixture();

    expect(allocateCarryoverToNewRow(base, { section: 'thisYear', monthKey: 'nov', amount: 5000 }, NOW).error)
      .toMatch(/exceeds/i);
    expect(allocateCarryoverToNewRow(base, { section: 'thisYear', monthKey: 'aug', amount: 100 }, NOW).error)
      .toMatch(/remaining months/i);
    expect(allocateCarryoverToNewRow(base, { section: 'lastYear', monthKey: 'nov', amount: 100 }, NOW).error)
      .toMatch(/remaining months/i);
  });

  it('draws only the delta from the pool when a budget amount is manually overridden', () => {
    const { placeholders, error } = overrideBudgetWithCarryover(
      placeholdersFixture(),
      { section: 'thisYear', monthKey: 'nov', amount: 12000, rowId: 'base' },
      NOW,
    );

    expect(error).toBeNull();
    expect(placeholders.thisYear.rows[0].values.nov).toBe(12000);
    expect(calculateCarryoverSummary(placeholders.thisYear, 'thisYear', NOW).available).toBe(500);
  });

  it('returns budget to the pool when an override lowers a month', () => {
    const { placeholders } = overrideBudgetWithCarryover(
      placeholdersFixture(),
      { section: 'thisYear', monthKey: 'nov', amount: 9000, rowId: 'base' },
      NOW,
    );

    expect(calculateCarryoverSummary(placeholders.thisYear, 'thisYear', NOW).available).toBe(3500);
  });

  it('reverses allocations back out of the grid and the pool', () => {
    const allocated = allocateCarryoverToNewRow(
      placeholdersFixture(),
      { section: 'thisYear', monthKey: 'dec', amount: 2000 },
      NOW,
    ).placeholders;
    const allocationId = allocated.thisYear.carryoverAllocations[0].id;

    const reversed = reverseCarryoverAllocation(allocated, 'thisYear', allocationId);

    expect(reversed.thisYear.rows).toHaveLength(1);
    expect(reversed.thisYear.carryoverAllocations).toHaveLength(0);
    expect(calculateCarryoverSummary(reversed.thisYear, 'thisYear', NOW).available).toBe(2500);
  });

  it('stops double counting once an allocated month has itself completed', () => {
    const allocated = allocateCarryoverToNewRow(
      placeholdersFixture(),
      { section: 'thisYear', monthKey: 'oct', amount: 2000 },
      NOW,
    ).placeholders;

    // November: October is now complete and spent its full planned amount.
    const november = new Date('2025-11-05T12:00:00Z');
    const withOctoberActuals = {
      ...allocated,
      thisYear: {
        ...allocated.thisYear,
        actualTotals: { ...allocated.thisYear.actualTotals, oct: 12000 },
      },
    };

    const summary = calculateCarryoverSummary(withOctoberActuals.thisYear, 'thisYear', november);
    expect(summary.plannedToDate).toBe(42000);
    expect(summary.actualToDate).toBe(39500);
    expect(summary.available).toBe(2500);
  });

  it('round-trips carryover allocations through normalization so saves persist them', () => {
    const allocated = allocateCarryoverToNewRow(
      placeholdersFixture(),
      { section: 'thisYear', monthKey: 'dec', amount: 1200, label: 'Xmas push' },
      NOW,
    ).placeholders;

    const roundTripped = normalizeAnnualBudgetMultiYearData(JSON.parse(JSON.stringify(allocated)));

    expect(roundTripped.thisYear.carryoverAllocations).toHaveLength(1);
    expect(roundTripped.thisYear.carryoverAllocations[0]).toMatchObject({
      monthKey: 'dec',
      amount: 1200,
      mode: 'row',
      label: 'Xmas push',
    });
    expect(calculateCarryoverSummary(roundTripped.thisYear, 'thisYear', NOW).available).toBe(1300);
  });
});
