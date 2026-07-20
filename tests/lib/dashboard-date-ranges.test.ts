import { describe, expect, it } from 'vitest'
import { getLastWeekRange, getThisWeekRange, normalizeDashboardRange } from '@/lib/dashboard-date-ranges'

describe('dashboard date ranges', () => {
  it('builds this week as the current Monday to Sunday', () => {
    expect(getThisWeekRange(new Date(2026, 5, 9))).toEqual({
      start: '2026-06-08',
      end: '2026-06-14',
    })
  })

  it('builds last week as the previous Monday to Sunday', () => {
    expect(getLastWeekRange(new Date(2026, 5, 9))).toEqual({
      start: '2026-06-01',
      end: '2026-06-07',
    })
  })

  it('normalizes calendar-week presets for Growth Tools while passing other ranges through', () => {
    const today = new Date(2026, 5, 9)
    expect(normalizeDashboardRange('this_week', today)).toBe('custom:2026-06-08,2026-06-14')
    expect(normalizeDashboardRange('last_week', today)).toBe('custom:2026-06-01,2026-06-07')
    expect(normalizeDashboardRange('last_month', today)).toBe('last_month')
  })
})
