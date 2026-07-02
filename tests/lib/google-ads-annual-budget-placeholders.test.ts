import { describe, expect, it, vi } from 'vitest';

import {
  financialYearLabel,
  financialYearSectionForDate,
  monthKeyForDate,
  normalizeAnnualBudgetMultiYearData,
  resolveActualTotalsSlotForDate,
  resolveMonthlyBudgetForDate,
  writeActualTotalForDate,
} from '@/lib/google-ads-annual-budget-placeholders';

describe('google-ads annual budget placeholders', () => {
  it('resolves July-June financial years into thisYear vs lastYear', () => {
    const now = new Date('2026-08-15T12:00:00Z');
    expect(financialYearSectionForDate(new Date('2026-08-01T12:00:00Z'), now)).toBe('thisYear');
    expect(financialYearSectionForDate(new Date('2026-06-01T12:00:00Z'), now)).toBe('lastYear');
    expect(financialYearSectionForDate(new Date('2025-05-01T12:00:00Z'), now)).toBeNull();
  });

  it('maps calendar months onto the July-June placeholder keys', () => {
    expect(monthKeyForDate(new Date('2026-07-01T12:00:00Z'))).toBe('jul');
    expect(monthKeyForDate(new Date('2026-12-01T12:00:00Z'))).toBe('dec');
    expect(monthKeyForDate(new Date('2026-01-01T12:00:00Z'))).toBe('jan');
    expect(monthKeyForDate(new Date('2026-06-01T12:00:00Z'))).toBe('jun');
  });

  it('uses the month placeholder when present and falls back to monthlyBudget when blank', () => {
    const placeholders = normalizeAnnualBudgetMultiYearData({
      thisYear: {
        rows: [{ id: '1', label: 'Budget', values: { jul: 50000, aug: '', sep: '', oct: '', nov: '', dec: '', jan: '', feb: '', mar: '', apr: '', may: '', jun: '' } }],
        actualTotals: {},
      },
      lastYear: {
        rows: [{ id: '2', label: 'Budget', values: { jul: '', aug: '', sep: '', oct: '', nov: '', dec: '', jan: '', feb: '', mar: '', apr: '', may: '', jun: 100000 } }],
        actualTotals: {},
      },
    });
    const now = new Date('2026-08-15T12:00:00Z');

    expect(resolveMonthlyBudgetForDate(placeholders, new Date('2026-07-01T12:00:00Z'), 42000, now)).toBe(50000);
    expect(resolveMonthlyBudgetForDate(placeholders, new Date('2026-06-01T12:00:00Z'), 42000, now)).toBe(100000);
    expect(resolveMonthlyBudgetForDate(placeholders, new Date('2026-08-01T12:00:00Z'), 42000, now)).toBe(42000);
  });

  it('treats legacy single-grid data as thisYear for backward compatibility', () => {
    const placeholders = normalizeAnnualBudgetMultiYearData(undefined, {
      rows: [{ id: 'legacy', label: 'Budget', values: { jul: 12345, aug: '', sep: '', oct: '', nov: '', dec: '', jan: '', feb: '', mar: '', apr: '', may: '', jun: '' } }],
      actualTotals: {},
    });

    expect(placeholders.thisYear.rows[0]?.values.jul).toBe(12345);
    expect(placeholders.lastYear.rows).toHaveLength(0);
    expect(financialYearLabel(2026)).toBe('2026/27');
  });

  it('resolves the actual-total month key from the live current date instead of freezing the first render month', () => {
    expect(resolveActualTotalsSlotForDate(new Date('2026-07-31T12:00:00Z'))).toEqual({ section: 'thisYear', monthKey: 'jul' });
    expect(resolveActualTotalsSlotForDate(new Date('2026-08-01T12:00:00Z'))).toEqual({ section: 'thisYear', monthKey: 'aug' });
  });

  it('writes actual totals into the FY section that matches the target date instead of always thisYear', () => {
    const placeholders = normalizeAnnualBudgetMultiYearData({
      thisYear: {
        rows: [{ id: 'current', label: 'Budget', values: { jul: 50000, aug: '', sep: '', oct: '', nov: '', dec: '', jan: '', feb: '', mar: '', apr: '', may: '', jun: '' } }],
        actualTotals: { jul: '', aug: '', sep: '', oct: '', nov: '', dec: '', jan: '', feb: '', mar: '', apr: '', may: '', jun: '' },
      },
      lastYear: {
        rows: [{ id: 'previous', label: 'Budget', values: { jul: '', aug: '', sep: '', oct: '', nov: '', dec: '', jan: '', feb: '', mar: '', apr: '', may: '', jun: 91000 } }],
        actualTotals: { jul: '', aug: '', sep: '', oct: '', nov: '', dec: '', jan: '', feb: '', mar: '', apr: '', may: '', jun: '' },
      },
    });

    const updated = writeActualTotalForDate(
      placeholders,
      new Date('2026-06-15T12:00:00Z'),
      88000,
      new Date('2026-07-10T12:00:00Z'),
    );

    expect(updated.lastYear.actualTotals.jun).toBe(88000);
    expect(updated.thisYear.actualTotals.jun).toBe('');
  });
});
