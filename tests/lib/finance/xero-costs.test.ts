import { describe, expect, it } from 'vitest'
import { buildXeroCostsView, xeroBusinessCostsSummary } from '@/lib/finance/xero-costs'

const month = (m: string, accounts: Record<string, number>) => {
  const costsByAccount = Object.entries(accounts).map(([account, amount]) => ({ account, amount }))
  return { month: m, invoiced: 0, received: 0, costs: costsByAccount.reduce((s, c) => s + c.amount, 0), costsByAccount }
}

const xeroMonths = [
  month('2026-05', { Software: 400 }),
  month('2026-06', { Software: 400 }),
  month('2026-07', { Software: 400, Rent: 1000 }),
  month('2026-08', { Software: 400, Rent: 1000 }),
  month('2026-09', { Software: 500, Rent: 1000, 'Wages and Salaries': 3000 }),
  month('2026-10', { Software: 650, Rent: 1000, 'Wages and Salaries': 4000 }),
]

describe('buildXeroCostsView', () => {
  it('builds cards for the selected month from Xero accounts, largest first, with totals this and last month', () => {
    const view = buildXeroCostsView({ xeroMonths, selectedMonth: '2026-10', cmsCategories: [] })

    expect(view?.costsByCategory.map((c) => [c.category.name, c.total])).toEqual([
      ['Wages and Salaries', 4000],
      ['Rent', 1000],
      ['Software', 650],
    ])
    expect(view?.totalThisMonth).toBe(5650)
    expect(view?.totalLastMonth).toBe(4500)
    expect(view?.uncategorised).toEqual([])
    expect(view?.currentMonth).toBe('2026-10')
  })

  it('takes colour and budget from a Cost Category with the same name (any case) and raises budget alerts', () => {
    const view = buildXeroCostsView({
      xeroMonths,
      selectedMonth: '2026-10',
      cmsCategories: [{ id: 7, name: 'software', color: '#123456', budget: 600 }],
    })

    const software = view?.categories.find((c) => c.name === 'Software')
    expect(software).toEqual({ id: 'xero:Software', name: 'Software', color: '#123456', budget: 600 })
    expect(view?.costAlerts).toContainEqual(expect.objectContaining({
      type: 'over_budget',
      categoryName: 'Software',
      message: 'Software is $50 over budget ($650 / $600)',
    }))
  })

  it('flags categories up more than 20% on the previous month', () => {
    const view = buildXeroCostsView({ xeroMonths, selectedMonth: '2026-10', cmsCategories: [] })
    const spikes = view?.costAlerts.filter((a) => a.type === 'spike').map((a) => a.categoryName)
    // Software +30%, Wages +33%; Rent flat
    expect(spikes).toEqual(['Wages and Salaries', 'Software'])
  })

  it('gives every chart month the same category list so the stacked chart lines up', () => {
    const view = buildXeroCostsView({ xeroMonths, selectedMonth: '2026-10', cmsCategories: [] })

    expect(view?.costHistory.map((h) => h.month)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'])
    for (const h of view?.costHistory ?? []) {
      expect(h.categories.map((c) => c.name)).toEqual(['Rent', 'Software', 'Wages and Salaries'])
    }
    expect(view?.costHistory[0]?.categories.find((c) => c.name === 'Rent')?.total).toBe(0)
    expect(view?.costHistory[5]?.total).toBe(5650)
  })

  it('returns null when Xero has no data for the selected month, so the caller falls back to statements', () => {
    expect(buildXeroCostsView({ xeroMonths, selectedMonth: '2025-01', cmsCategories: [] })).toBeNull()
  })

  it('gives an account without a matching category a stable colour', () => {
    const a = buildXeroCostsView({ xeroMonths, selectedMonth: '2026-10', cmsCategories: [] })
    const b = buildXeroCostsView({ xeroMonths, selectedMonth: '2026-09', cmsCategories: [] })
    const color = (v: typeof a, name: string) => v?.categories.find((c) => c.name === name)?.color
    expect(color(a, 'Rent')).toMatch(/^#[0-9A-F]{6}$/i)
    expect(color(a, 'Rent')).toBe(color(b, 'Rent'))
  })
})

describe('xeroBusinessCostsSummary', () => {
  it('returns this month, last month and a per-month map for the dashboard', () => {
    const summary = xeroBusinessCostsSummary(xeroMonths, '2026-10', '2026-09')
    expect(summary.totalThisMonth).toBe(5650)
    expect(summary.totalLastMonth).toBe(4500)
    expect(summary.uncategorisedCount).toBe(0)
    expect(summary.source).toBe('xero')
    expect(summary.byMonth.get('2026-07')).toBe(1400)
  })
})
