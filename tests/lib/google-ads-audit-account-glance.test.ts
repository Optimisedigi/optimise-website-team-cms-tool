import { describe, expect, it } from 'vitest'
import { buildAccountGlance } from '@/lib/decks/templates/google-ads-audit-15-slide/account-glance'

// Away Digital Teams, 6-month milestone window (13 Apr – 12 Oct 2026), from a real snapshot.
const awayTrend = [
  { month: '2026-04', clicks: 1071, cost: 26689.34, conversions: 20 },
  { month: '2026-05', clicks: 2008, cost: 41890.04, conversions: 25.5 },
  { month: '2026-06', clicks: 1706, cost: 39637.3, conversions: 29.5 },
  { month: '2026-07', clicks: 1031, cost: 28894.16, conversions: 11 },
  { month: '2026-08', clicks: 1902, cost: 30516.4, conversions: 13 },
  { month: '2026-09', clicks: 1751, cost: 21105.14, conversions: 2 },
  { month: '2026-10', clicks: 121, cost: 5523.32, conversions: 1 },
]

describe('buildAccountGlance', () => {
  it('totals the window and flags both part months', () => {
    const data = buildAccountGlance({ monthlyTrend: awayTrend, periodStart: '2026-04-13', periodEnd: '2026-10-12', currencyCode: 'AUD' })!
    expect(data.months).toHaveLength(7)
    expect(Math.round(data.totals.spend)).toBe(194256)
    expect(data.totals.clicks).toBe(9590)
    expect(data.totals.conversions).toBe(102)
    expect(Math.round(data.totals.cpl!)).toBe(1904)
    expect(data.months.filter((m) => m.partial).map((m) => m.month)).toEqual(['2026-04', '2026-10'])
    expect(data.periodLabel).toBe('Apr 2026 – Oct 2026')
    expect(data.months[0].label).toBe('Apr-26')
    expect(data.notes[0]).toContain('Apr 2026 and Oct 2026 are part months')
  })

  it('reads a rising cost per lead and calls out the worst complete months', () => {
    const data = buildAccountGlance({ monthlyTrend: awayTrend, periodStart: '2026-04-13', periodEnd: '2026-10-12', currencyCode: 'AUD' })!
    // Complete months May–Sep: CPL climbs from ~$1.5K to ~$3.8K.
    expect(data.headline).toMatch(/^Cost per lead has risen \d+% \(\$[\d,]+ to \$[\d,]+\)/)
    expect(data.callouts.map((c) => c.label)).toEqual(['Sep 2026'])
    expect(Math.round(data.callouts[0].cpl!)).toBe(10553)
    // Part months never become call-outs, even with an extreme CPL.
    expect(data.callouts.some((c) => c.label === 'Oct 2026')).toBe(false)
  })

  it('reads an improving and a steady cost per lead', () => {
    const falling = [400, 350, 300, 200, 150, 120].map((cpl, i) => ({ month: `2026-0${i + 1}`, cost: cpl * 10, clicks: 100, conversions: 10 }))
    expect(buildAccountGlance({ monthlyTrend: falling, periodStart: '2026-01-01', periodEnd: '2026-06-30' })!.headline).toMatch(/^Cost per lead is down \d+%/)
    const steady = [200, 205, 198, 202].map((cpl, i) => ({ month: `2026-0${i + 1}`, cost: cpl * 10, clicks: 100, conversions: 10 }))
    expect(buildAccountGlance({ monthlyTrend: steady, periodStart: '2026-01-01', periodEnd: '2026-04-30' })!.headline).toMatch(/^Cost per lead has held steady at around \$/)
  })

  it('handles accounts with no conversions and no data', () => {
    const noConv = [{ month: '2026-01', cost: 500, clicks: 40, conversions: 0 }, { month: '2026-02', cost: 600, clicks: 50, conversions: 0 }]
    const data = buildAccountGlance({ monthlyTrend: noConv, periodStart: '2026-01-01', periodEnd: '2026-02-28' })!
    expect(data.headline).toBe('Spend and clicks at a glance')
    expect(data.totals.cpl).toBeNull()
    expect(data.callouts.map((c) => c.label)).toEqual(['Jan 2026', 'Feb 2026'])
    expect(buildAccountGlance({ monthlyTrend: [], periodStart: '2026-01-01', periodEnd: '2026-01-31' })).toBeNull()
  })

  it('charts at most 18 months but totals the whole window', () => {
    const long = Array.from({ length: 24 }, (_, i) => ({ month: `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`, cost: 100, clicks: 10, conversions: 1 }))
    const data = buildAccountGlance({ monthlyTrend: long, periodStart: '2024-01-01', periodEnd: '2025-12-31' })!
    expect(data.months).toHaveLength(18)
    expect(data.months[0].month).toBe('2024-07')
    expect(data.totals.spend).toBe(2400)
    expect(data.notes.some((n) => n.includes('latest 18 months'))).toBe(true)
  })
})
