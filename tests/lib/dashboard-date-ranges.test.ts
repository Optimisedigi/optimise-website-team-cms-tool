import { describe, expect, it } from 'vitest'
import { getLastWeekRange, getThisWeekRange, normalizeDashboardRange } from '@/lib/dashboard-date-ranges'
import { landingDateRangeParams, landingPresetSpan, zonedDay } from '@/lib/landing-date-range'

describe('dashboard date ranges', () => {
  /* Local 9 Jun 2026 is still Monday in any AU zone. The UTC-evening clock
     below is already Friday 21 Aug in Sydney and still Thursday in UTC, so a
     local-machine cut would pick the wrong week. */
  const midWeek = new Date(2026, 5, 9)
  const sydneyAheadOfUtc = new Date('2026-08-20T16:00:00.000Z')

  it('builds this week as the current Monday to Sunday in Australia/Sydney', () => {
    expect(getThisWeekRange(midWeek)).toEqual({
      start: '2026-06-08',
      end: '2026-06-14',
    })
    expect(getThisWeekRange(sydneyAheadOfUtc)).toEqual({
      start: '2026-08-17',
      end: '2026-08-23',
    })
  })

  it('builds last week as the previous Monday to Sunday in Australia/Sydney', () => {
    expect(getLastWeekRange(midWeek)).toEqual({
      start: '2026-06-01',
      end: '2026-06-07',
    })
    expect(getLastWeekRange(sydneyAheadOfUtc)).toEqual({
      start: '2026-08-10',
      end: '2026-08-16',
    })
  })

  it('normalizes calendar-week presets for Growth Tools while passing other ranges through', () => {
    expect(normalizeDashboardRange('this_week', midWeek)).toBe('custom:2026-06-08,2026-06-14')
    expect(normalizeDashboardRange('last_week', midWeek)).toBe('custom:2026-06-01,2026-06-07')
    expect(normalizeDashboardRange('this_week', sydneyAheadOfUtc)).toBe('custom:2026-08-17,2026-08-23')
    expect(normalizeDashboardRange('last_30_days', midWeek)).toBe('last_30_days')
  })

  it('pins this_month and last_month to Sydney custom dates, not Growth Tools UTC', () => {
    /* 20 Aug 16:00 UTC is already 21 Aug in Sydney. A UTC toISOString() cut
       would still be in August here, but last_month must not follow UTC day 20
       into a different calendar month at month boundaries. */
    expect(normalizeDashboardRange('this_month', sydneyAheadOfUtc)).toBe('custom:2026-08-01,2026-08-21')
    expect(normalizeDashboardRange('last_month', sydneyAheadOfUtc)).toBe('custom:2026-07-01,2026-07-31')
    expect(zonedDay(sydneyAheadOfUtc)).toBe('2026-08-21')
    expect(landingPresetSpan('this_month', '2026-08-21')).toEqual({ start: '2026-08-01', end: '2026-08-21' })
    expect(landingPresetSpan('last_month', '2026-08-21')).toEqual({ start: '2026-07-01', end: '2026-07-31' })
    expect(Object.fromEntries(landingDateRangeParams({ mode: 'this_month' }, sydneyAheadOfUtc))).toEqual({
      start: '2026-08-01',
      end: '2026-08-21',
    })
  })
})
