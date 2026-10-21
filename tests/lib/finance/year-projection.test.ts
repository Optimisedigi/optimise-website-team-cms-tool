import { describe, expect, it } from 'vitest'
import {
  buildYearProjection,
  excludeProjectionAccounts,
  expectedRetainerForMonth,
  MANUAL_COST_ACCOUNT,
} from '@/lib/finance/year-projection'
import { monthKeysBetween } from '@/lib/finance/periods'

// Calendar year 2026, "now" in October.
const YEAR = monthKeysBetween('2026-01', '2026-12')
const CURRENT = '2026-10'
const AVERAGE = monthKeysBetween('2026-04', '2026-09')

const xero = (month: string, invoiced: number, wages: number, other: number) => ({
  month,
  invoiced,
  costs: wages + other,
  costsByAccount: [
    { account: 'Wages and Salaries', amount: wages },
    { account: 'Software', amount: other },
  ].filter((c) => c.amount > 0),
})

const actual = [
  ...monthKeysBetween('2026-01', '2026-03').map((m) => xero(m, 5000, 0, 0)),
  ...AVERAGE.map((m) => xero(m, 10000, 3000, 1000)),
  xero('2026-10', 9000, 1000, 2000), // part-way through October
]

describe('expectedRetainerForMonth', () => {
  it('counts a retainer that starts later from its start date, pro-rating the first month', () => {
    const client = { id: 1, monthlyRetainer: 3000, retainerStartDate: '2026-11-16T12:00:00.000Z' } // Nov has 30 days
    expect(expectedRetainerForMonth(client, '2026-10')).toBe(0)
    expect(expectedRetainerForMonth(client, '2026-11')).toBeCloseTo(1500)
    expect(expectedRetainerForMonth(client, '2026-12')).toBe(3000)
  })

  it('applies scheduled ends and changes, and skips one-off and inactive clients', () => {
    const ends = { id: 1, monthlyRetainer: 2000, clientStartDate: '2025-01-01T12:00:00.000Z', retainerChangeAction: 'end', retainerChangeDate: '2026-12-01T12:00:00.000Z' }
    expect(expectedRetainerForMonth(ends, '2026-11')).toBe(2000)
    expect(expectedRetainerForMonth(ends, '2026-12')).toBe(0)
    // Deactivated early: still billed until the scheduled end.
    expect(expectedRetainerForMonth({ ...ends, isActive: false }, '2026-11')).toBe(2000)

    const changes = { id: 2, monthlyRetainer: 2000, retainerChangeAction: 'change', retainerChangeDate: '2026-12-01T12:00:00.000Z', retainerChangeAmount: 500 }
    expect(expectedRetainerForMonth(changes, '2026-12')).toBe(500)

    expect(expectedRetainerForMonth({ id: 3, monthlyRetainer: 2000, clientType: 'one_off' }, '2026-11')).toBe(0)
    expect(expectedRetainerForMonth({ id: 4, monthlyRetainer: 2000, isActive: false }, '2026-11')).toBe(0)
  })
})

describe('buildYearProjection', () => {
  const clients = [
    { id: 1, name: 'Steady', monthlyRetainer: 4000, clientStartDate: '2025-01-01T12:00:00.000Z' },
    { id: 2, name: 'Leaving', monthlyRetainer: 2000, clientStartDate: '2025-01-01T12:00:00.000Z', retainerChangeAction: 'end', retainerChangeDate: '2026-12-01T12:00:00.000Z' },
    { id: 3, name: 'New', monthlyRetainer: 3000, retainerStartDate: '2026-11-16T12:00:00.000Z' },
  ]
  const projection = buildYearProjection({ monthKeys: YEAR, currentMonth: CURRENT, actual, averageMonths: AVERAGE, clients })
  const byMonth = new Map(projection.months.map((m) => [m.month, m]))

  it('keeps Xero months as they are', () => {
    expect(byMonth.get('2026-02')).toMatchObject({ kind: 'actual', invoiced: 5000, costs: 0 })
    expect(byMonth.get('2026-06')).toMatchObject({ kind: 'actual', invoiced: 10000, costs: 4000, profit: 6000 })
  })

  it('fills future months with expected retainers and costs at the recent average', () => {
    // Nov: 4000 + 2000 + half of 3000. Dec: 4000 + 0 + 3000.
    expect(byMonth.get('2026-11')).toMatchObject({ kind: 'estimate', invoiced: 7500, invoicedActual: 0, costs: 4000, profit: 3500 })
    expect(byMonth.get('2026-12')).toMatchObject({ kind: 'estimate', invoiced: 7000, costs: 4000 })
    // Jan–Mar had no costs but did have invoices, so they'd count; they're outside the window anyway.
    expect(projection.costAverage).toEqual({ months: AVERAGE, monthly: 4000 })
  })

  it('takes the higher of Xero so far and the estimate this month, per cost category', () => {
    // Expected Oct retainers: 4000 + 2000 = 6000 < 9000 invoiced so far.
    // Costs: wages max(1000, 3000) + software max(2000, 1000).
    expect(byMonth.get('2026-10')).toMatchObject({ kind: 'current', invoiced: 9000, invoicedActual: 9000, costs: 5000, costsActual: 3000 })
  })

  it('totals the year and lists the retainers behind the estimate', () => {
    expect(projection.totals).toEqual({
      invoicedActual: 3 * 5000 + 6 * 10000 + 9000,
      invoicedExpected: 7500 + 7000,
      invoiced: 84000 + 14500,
      costsActual: 6 * 4000 + 3000,
      costsExpected: 2000 + 2 * 4000,
      costs: 27000 + 10000,
      profit: 98500 - 37000,
    })
    expect(projection.clients).toEqual([
      { id: 1, name: 'Steady', monthlyRetainer: 4000, override: null, setupFee: null, restOfPeriod: 8000, startsOn: null, change: null },
      { id: 3, name: 'New', monthlyRetainer: 3000, override: null, setupFee: null, restOfPeriod: 4500, startsOn: '2026-11-16T12:00:00.000Z', change: null },
      { id: 2, name: 'Leaving', monthlyRetainer: 2000, override: null, setupFee: null, restOfPeriod: 2000, startsOn: null, change: { date: '2026-12-01T12:00:00.000Z', action: 'end', amount: 0 } },
    ])
  })

  it('removes switched-off categories from actual and estimated costs alike', () => {
    const { months, totals } = excludeProjectionAccounts(projection.months, new Set(['Wages and Salaries']))
    const m = new Map(months.map((x) => [x.month, x]))
    expect(m.get('2026-06')?.costs).toBe(1000)
    expect(m.get('2026-10')).toMatchObject({ costs: 2000, costsActual: 2000 })
    expect(m.get('2026-11')?.costs).toBe(1000)
    expect(totals.costs).toBe(6 * 1000 + 2000 + 2 * 1000)
    expect(totals.costsActual).toBe(6 * 1000 + 2000)
  })

  it('lists the expected retainers behind each open month', () => {
    expect(byMonth.get('2026-06')?.retainers).toEqual([])
    expect(byMonth.get('2026-11')).toMatchObject({
      invoicedExpected: 7500,
      retainers: [
        { id: 1, name: 'Steady', amount: 4000 },
        { id: 2, name: 'Leaving', amount: 2000 },
        { id: 3, name: 'New', amount: 1500 },
      ],
    })
    expect(byMonth.get('2026-10')).toMatchObject({ invoicedExpected: 6000, invoiced: 9000 })
  })

  it('adds manual estimated invoices and costs on top of their month only', () => {
    const adjusted = buildYearProjection({
      monthKeys: YEAR,
      currentMonth: CURRENT,
      actual,
      averageMonths: AVERAGE,
      clients,
      adjustments: [
        { id: 1, month: '2026-11', kind: 'invoiced', amount: 5000, description: 'Website build' },
        { id: 2, month: '2026-11', kind: 'cost', amount: 1200, description: 'Freelancer', account: 'Wages and Salaries' },
        { id: 3, month: '2026-12', kind: 'cost', amount: 300, description: 'Event', account: null },
        { id: 4, month: '2026-10', kind: 'invoiced', amount: 1000, description: 'Extra' },
        { id: 5, month: '2027-01', kind: 'invoiced', amount: 9999, description: 'Outside the period' },
      ],
    })
    const m = new Map(adjusted.months.map((x) => [x.month, x]))
    expect(m.get('2026-11')).toMatchObject({ invoiced: 12500, costs: 5200, profit: 7300 })
    expect(m.get('2026-11')?.costsByAccount).toContainEqual({ account: 'Wages and Salaries', amount: 4200 })
    expect(m.get('2026-12')).toMatchObject({ invoiced: 7000, costs: 4300 })
    expect(m.get('2026-12')?.costsByAccount).toContainEqual({ account: MANUAL_COST_ACCOUNT, amount: 300 })
    // This month: on top of the higher of Xero so far (9000) and retainers (6000).
    expect(m.get('2026-10')).toMatchObject({ invoiced: 10000, invoicedActual: 9000 })
    expect(adjusted.totals.invoiced).toBe(projection.totals.invoiced + 5000 + 1000)
    expect(adjusted.totals.costs).toBe(projection.totals.costs + 1500)
    // Manual costs never move the run rate.
    expect(adjusted.costAverage).toEqual(projection.costAverage)
    // Switched-off categories drop their manual costs too.
    const { months } = excludeProjectionAccounts(adjusted.months, new Set(['Wages and Salaries']))
    expect(months.find((x) => x.month === '2026-11')?.costs).toBe(1000)
  })

  it('invoices setup fees in the start month, for retainer and one-off clients alike', () => {
    const withFees = buildYearProjection({
      monthKeys: YEAR,
      currentMonth: CURRENT,
      actual,
      averageMonths: AVERAGE,
      clients: [
        ...clients,
        { id: 4, name: 'Fresh', monthlyRetainer: 1500, setupFee: 900, retainerStartDate: '2026-12-01T12:00:00.000Z' },
        { id: 5, name: 'Project', clientType: 'one_off', setupFee: 2500, clientStartDate: '2026-11-10T12:00:00.000Z' },
        { id: 6, name: 'Old', monthlyRetainer: 1000, setupFee: 700, clientStartDate: '2026-03-01T12:00:00.000Z' }, // in Xero already
        { id: 7, name: 'Undated', monthlyRetainer: 1000, setupFee: 800 },
        { id: 8, name: 'Gone', isActive: false, clientType: 'one_off', setupFee: 600, clientStartDate: '2026-11-01T12:00:00.000Z' },
      ],
    })
    const m = new Map(withFees.months.map((x) => [x.month, x]))
    // Nov: 7500 + Old 1000 + Undated 1000 + Project setup 2500.
    expect(m.get('2026-11')?.invoiced).toBe(12000)
    expect(m.get('2026-11')?.retainers).toContainEqual({ id: 5, name: 'Project', amount: 2500, kind: 'setup' })
    // Dec: 7000 + 2000 + Fresh 1500 retainer + 900 setup.
    expect(m.get('2026-12')?.invoiced).toBe(11400)
    expect(m.get('2026-12')?.retainers.filter((r) => r.id === 4)).toEqual([
      { id: 4, name: 'Fresh', amount: 1500, kind: 'retainer' },
      { id: 4, name: 'Fresh', amount: 900, kind: 'setup' },
    ])
    expect(m.get('2026-03')?.invoiced).toBe(5000)
    const rows = new Map(withFees.clients.map((c) => [c.id, c]))
    expect(rows.get(4)).toMatchObject({ setupFee: { month: '2026-12', amount: 900 }, restOfPeriod: 2400 })
    expect(rows.get(5)).toMatchObject({ monthlyRetainer: 0, setupFee: { month: '2026-11', amount: 2500 }, restOfPeriod: 2500, startsOn: null })
    expect(rows.get(6)?.setupFee).toBeNull()
    expect(rows.has(8)).toBe(false)
  })

  it('uses an estimate-only retainer override in every month the retainer runs', () => {
    const overridden = buildYearProjection({
      monthKeys: YEAR,
      currentMonth: CURRENT,
      actual,
      averageMonths: AVERAGE,
      clients,
      retainerOverrides: [
        { id: 20, clientId: 1, amount: 5000 },
        { id: 21, clientId: 3, amount: 2000 },
        { id: 22, clientId: 2, amount: 2500 },
      ],
    })
    const m = new Map(overridden.months.map((x) => [x.month, x]))
    // Nov: Steady 5000 + Leaving 2500 + New half of 2000. Dec: Leaving has ended.
    expect(m.get('2026-11')?.invoiced).toBe(8500)
    expect(m.get('2026-12')?.invoiced).toBe(7000)
    // Past months stay as Xero.
    expect(m.get('2026-06')?.invoiced).toBe(10000)
    expect(overridden.clients.find((c) => c.id === 1)).toMatchObject({ monthlyRetainer: 4000, override: { id: 20, amount: 5000 }, restOfPeriod: 10000 })
  })

  it('skips months without any Xero activity when averaging costs', () => {
    const sparse = buildYearProjection({
      monthKeys: YEAR,
      currentMonth: CURRENT,
      actual: [xero('2026-09', 8000, 0, 600)],
      averageMonths: AVERAGE,
      clients: [],
    })
    expect(sparse.costAverage).toEqual({ months: ['2026-09'], monthly: 600 })
  })
})
