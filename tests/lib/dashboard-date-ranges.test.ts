import { describe, expect, it } from 'vitest'
import { getLastWeekRange, normalizeDashboardRange } from '@/lib/dashboard-date-ranges'

describe('dashboard date ranges', () => {
  it('builds last week as the previous Monday to Sunday', () => {
    expect(getLastWeekRange(new Date(2026, 5, 9))).toEqual({
      start: '2026-06-01',
      end: '2026-06-07',
    })
  })

  it('normalizes last_week for Growth Tools while passing other ranges through', () => {
    const normalized = normalizeDashboardRange('last_week')
    expect(normalized).toMatch(/^custom:\d{4}-\d{2}-\d{2},\d{4}-\d{2}-\d{2}$/)
    expect(normalizeDashboardRange('last_month')).toBe('last_month')
  })
})
