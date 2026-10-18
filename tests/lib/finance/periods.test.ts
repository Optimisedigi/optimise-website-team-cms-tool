import { describe, expect, it } from 'vitest'
import {
  addMonths,
  isMonthKey,
  monthKeysBetween,
  periodContaining,
  periodLabel,
  periodOptions,
  periodRange,
} from '@/lib/finance/periods'

describe('periodContaining', () => {
  it('puts July–December in the financial year that starts that year', () => {
    expect(periodContaining('fy', '2026-07')).toEqual({ mode: 'fy', startYear: 2026 })
    expect(periodContaining('fy', '2026-12')).toEqual({ mode: 'fy', startYear: 2026 })
  })

  it('puts January–June in the financial year that started the year before', () => {
    expect(periodContaining('fy', '2027-01')).toEqual({ mode: 'fy', startYear: 2026 })
    expect(periodContaining('fy', '2027-06')).toEqual({ mode: 'fy', startYear: 2026 })
  })

  it('uses the calendar year as-is', () => {
    expect(periodContaining('cy', '2027-06')).toEqual({ mode: 'cy', startYear: 2027 })
  })
})

describe('periodRange', () => {
  it('covers a finished financial year from July to June', () => {
    const r = periodRange({ mode: 'fy', startYear: 2024 }, '2026-10')
    expect(r.from).toBe('2024-07')
    expect(r.to).toBe('2025-06')
    expect(r.months).toHaveLength(12)
    expect(r.months[6]).toBe('2025-01')
    expect(r.toDate).toBe(false)
    expect(r.label).toBe('FY 2024\u201325')
  })

  it('stops the current financial year at the current month (year to date)', () => {
    const r = periodRange({ mode: 'fy', startYear: 2026 }, '2026-10')
    expect(r.months).toEqual(['2026-07', '2026-08', '2026-09', '2026-10'])
    expect(r.toDate).toBe(true)
  })

  it('covers a calendar year from January to December', () => {
    const r = periodRange({ mode: 'cy', startYear: 2025 }, '2026-10')
    expect([r.from, r.to, r.label, r.toDate]).toEqual(['2025-01', '2025-12', '2025', false])
  })

  it('returns no months for a period that has not started', () => {
    expect(periodRange({ mode: 'cy', startYear: 2027 }, '2026-10').months).toEqual([])
  })
})

describe('periodOptions', () => {
  it('lists the current period first, then earlier ones', () => {
    expect(periodOptions('fy', '2027-03', 3).map(periodLabel)).toEqual(['FY 2026\u201327', 'FY 2025\u201326', 'FY 2024\u201325'])
    expect(periodOptions('cy', '2027-03', 2).map(periodLabel)).toEqual(['2027', '2026'])
  })
})

describe('month helpers', () => {
  it('adds months across year boundaries and lists inclusive ranges', () => {
    expect(addMonths('2026-02', -5)).toBe('2025-09')
    expect(monthKeysBetween('2025-11', '2026-01')).toEqual(['2025-11', '2025-12', '2026-01'])
  })

  it('validates YYYY-MM keys', () => {
    expect(isMonthKey('2026-10')).toBe(true)
    expect(isMonthKey('2026-13')).toBe(false)
    expect(isMonthKey('2026-1')).toBe(false)
    expect(isMonthKey(null)).toBe(false)
  })
})
