import { describe, expect, it } from 'vitest';
import { reimbursementForFortnight } from '@/lib/contractor-reimbursement';

const day = (iso: string) => Date.parse(`${iso}T00:00:00.000Z`);
// Fortnight anchored 29 Jun 2026 → 12 Jul 2026 (inclusive).
const F_START = day('2026-06-29');
const F_END = day('2026-07-12');

describe('reimbursementForFortnight', () => {
  it('falls back to the legacy per-fortnight amount when no recurrence is set', () => {
    expect(reimbursementForFortnight({ chatGptReimbursementPerFortnight: 31.83 }, F_START, F_END)).toBe(31.83);
  });

  it('returns 0 for recurrence "none"', () => {
    expect(reimbursementForFortnight({ reimbursementRecurrence: 'none', reimbursementAmount: 50 }, F_START, F_END)).toBe(0);
  });

  it('applies weekly reimbursement per 7-day occurrence inside the fortnight', () => {
    const cfg = { reimbursementRecurrence: 'weekly' as const, reimbursementAmount: 10, reimbursementStartDate: '2026-06-29' };
    // 29 Jun and 6 Jul both fall in the fortnight → two occurrences.
    expect(reimbursementForFortnight(cfg, F_START, F_END)).toBe(20);
    // Start mid-fortnight → only the later weeks count.
    expect(reimbursementForFortnight({ ...cfg, reimbursementStartDate: '2026-07-06' }, F_START, F_END)).toBe(10);
  });

  it('applies per-fortnight only on/after the start date', () => {
    const cfg = { reimbursementRecurrence: 'per-fortnight' as const, reimbursementAmount: 20, reimbursementStartDate: '2026-06-29' };
    expect(reimbursementForFortnight(cfg, F_START, F_END)).toBe(20);
    // Fortnight entirely before the start date gets nothing.
    expect(reimbursementForFortnight({ ...cfg, reimbursementStartDate: '2026-07-13' }, F_START, F_END)).toBe(0);
  });

  it('applies a one-off only to the fortnight containing the start date', () => {
    const cfg = { reimbursementRecurrence: 'one-off' as const, reimbursementAmount: 100, reimbursementStartDate: '2026-07-05' };
    expect(reimbursementForFortnight(cfg, F_START, F_END)).toBe(100);
    const next = day('2026-07-13');
    expect(reimbursementForFortnight(cfg, next, next + 13 * 86400000)).toBe(0);
  });

  it('applies monthly on the start date day-of-month, once per fortnight', () => {
    const cfg = { reimbursementRecurrence: 'monthly' as const, reimbursementAmount: 40, reimbursementStartDate: '2026-07-01' };
    // 1 Jul falls inside 29 Jun → 12 Jul.
    expect(reimbursementForFortnight(cfg, F_START, F_END)).toBe(40);
    // A fortnight with no 1st-of-month inside it gets nothing.
    const midMonth = day('2026-07-13');
    expect(reimbursementForFortnight(cfg, midMonth, midMonth + 13 * 86400000)).toBe(0);
  });

  it('clamps a monthly day-of-month to the last day of shorter months', () => {
    const cfg = { reimbursementRecurrence: 'monthly' as const, reimbursementAmount: 15, reimbursementStartDate: '2026-01-31' };
    // February has no 31st, so it appears on 28 Feb 2026.
    const febStart = day('2026-02-16');
    const febEnd = day('2026-03-01');
    expect(reimbursementForFortnight(cfg, febStart, febEnd)).toBe(15);
  });
});
