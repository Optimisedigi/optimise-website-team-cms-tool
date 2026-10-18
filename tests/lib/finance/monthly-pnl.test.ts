import { describe, expect, it } from 'vitest'
import { agreedSalesForMonth, buildMonthlyPnl, buildMonthlyPnlFromXero, excludeCostAccounts, lastMonthKeys } from '@/lib/finance/monthly-pnl'

const NOW = new Date(2026, 9, 17) // 17 Oct 2026, local time
const month = (y: number, m: number) => new Date(y, m - 1, 1)

describe('lastMonthKeys', () => {
  it('returns oldest-first keys ending with the current month, across a year boundary', () => {
    expect(lastMonthKeys(new Date(2026, 1, 10), 3)).toEqual(['2025-12', '2026-01', '2026-02'])
  })
})

describe('agreedSalesForMonth', () => {
  it('pro-rates the first month and bills full months after', () => {
    const client = { monthlyRetainer: 3000, retainerStartDate: new Date(2026, 8, 16).toISOString() } // 16 Sep (30 days)
    expect(agreedSalesForMonth(client, month(2026, 8), NOW)).toBe(0)
    expect(agreedSalesForMonth(client, month(2026, 9), NOW)).toBeCloseTo(1500)
    expect(agreedSalesForMonth(client, month(2026, 10), NOW)).toBe(3000)
  })

  it('uses the retainer in force that month from the retainer history', () => {
    const client = {
      monthlyRetainer: 4000,
      clientStartDate: new Date(2025, 0, 1).toISOString(),
      retainerHistory: [{ previousAmount: 2500, amount: 4000, effectiveDate: new Date(2026, 7, 1).toISOString() }],
    }
    expect(agreedSalesForMonth(client, month(2026, 7), NOW)).toBe(2500)
    expect(agreedSalesForMonth(client, month(2026, 8), NOW)).toBe(4000)
  })

  it('deducts monthly commissions and applies the revenue share', () => {
    const client = {
      monthlyRetainer: 2000,
      clientStartDate: new Date(2025, 0, 1).toISOString(),
      revenueSharePercent: 50,
      referralCommissions: [{ frequency: 'monthly', commissionType: 'percentage', percentage: 10, startDate: new Date(2025, 0, 1).toISOString() }],
    }
    expect(agreedSalesForMonth(client, month(2026, 10), NOW)).toBe(900) // (2000 - 200) × 50%
  })

  it('counts one-off projects in their month, but not future-dated ones', () => {
    const client = {
      clientType: 'one_off',
      isActive: false,
      oneOffProjects: [
        { amount: 5000, date: new Date(2026, 5, 10).toISOString() },
        { amount: 900, date: new Date(2026, 9, 30).toISOString() }, // after NOW
      ],
    }
    expect(agreedSalesForMonth(client, month(2026, 6), NOW)).toBe(5000)
    expect(agreedSalesForMonth(client, month(2026, 10), NOW)).toBe(0)
  })

  it('does not count retainers for inactive clients', () => {
    const client = { isActive: false, monthlyRetainer: 3000, clientStartDate: new Date(2025, 0, 1).toISOString() }
    expect(agreedSalesForMonth(client, month(2026, 9), NOW)).toBe(0)
  })

  it('counts an undated retainer only in the current month (matches the dashboard)', () => {
    const client = { monthlyRetainer: 1000 }
    expect(agreedSalesForMonth(client, month(2026, 9), NOW)).toBe(0)
    expect(agreedSalesForMonth(client, month(2026, 10), NOW)).toBe(1000)
  })
})

describe('buildMonthlyPnl', () => {
  it('computes monthly profit both ways, flags months without statements, and totals the range', () => {
    const result = buildMonthlyPnl({
      monthKeys: ['2026-09', '2026-10'],
      clients: [{ monthlyRetainer: 3000, clientStartDate: new Date(2025, 0, 1).toISOString() }],
      costsByMonth: new Map([['2026-10', 1200.5]]),
      receivedByMonth: new Map([['2026-10', 2500]]),
      now: NOW,
    })

    expect(result.months).toEqual([
      { month: '2026-09', sales: 3000, received: 0, costs: 0, profitSales: 3000, profitReceived: 0, noBankData: true },
      { month: '2026-10', sales: 3000, received: 2500, costs: 1200.5, profitSales: 1799.5, profitReceived: 1299.5, noBankData: false },
    ])
    expect(result.totals).toEqual({ sales: 6000, received: 2500, costs: 1200.5, profitSales: 4799.5, profitReceived: 1299.5 })
  })
})

describe('buildMonthlyPnlFromXero', () => {
  it('uses invoiced as sales, fills missing months with zero, and totals Xero categories across the range', () => {
    const result = buildMonthlyPnlFromXero({
      monthKeys: ['2026-08', '2026-09', '2026-10'],
      xeroMonths: [
        { month: '2026-09', invoiced: 9000, received: 7000, costs: 2500, costsByAccount: [{ account: 'Contractors', amount: 2000 }, { account: 'Software', amount: 500 }] },
        { month: '2026-10', invoiced: 10000, received: 11000, costs: 3100, costsByAccount: [{ account: 'Software', amount: 600 }, { account: 'Contractors', amount: 2500 }] },
      ],
    })

    expect(result.months.map((m) => [m.month, m.sales, m.received, m.costs, m.profitSales, m.profitReceived])).toEqual([
      ['2026-08', 0, 0, 0, 0, 0],
      ['2026-09', 9000, 7000, 2500, 6500, 4500],
      ['2026-10', 10000, 11000, 3100, 6900, 7900],
    ])
    expect(result.months.every((m) => m.noBankData === false)).toBe(true)
    expect(result.totals).toEqual({ sales: 19000, received: 18000, costs: 5600, profitSales: 13400, profitReceived: 12400 })
    expect(result.costsByAccount).toEqual([
      { account: 'Contractors', amount: 4500 },
      { account: 'Software', amount: 1100 },
    ])
  })
})

describe('excludeCostAccounts', () => {
  const xero = buildMonthlyPnlFromXero({
    monthKeys: ['2026-09', '2026-10'],
    xeroMonths: [
      { month: '2026-09', invoiced: 9000, received: 7000, costs: 2500, costsByAccount: [{ account: 'Wages and Salaries', amount: 2000 }, { account: 'Software', amount: 500 }] },
      { month: '2026-10', invoiced: 10000, received: 11000, costs: 3100, costsByAccount: [{ account: 'Software', amount: 600 }, { account: 'Wages and Salaries', amount: 2500 }] },
    ],
  })

  it('removes the switched-off category from every month and recomputes profit and totals', () => {
    const result = excludeCostAccounts(xero.months, new Set(['Wages and Salaries']))

    expect(result.months.map((m) => [m.month, m.costs, m.profitSales, m.profitReceived])).toEqual([
      ['2026-09', 500, 8500, 6500],
      ['2026-10', 600, 9400, 10400],
    ])
    expect(result.totals).toEqual({ sales: 19000, received: 18000, costs: 1100, profitSales: 17900, profitReceived: 16900 })
  })

  it('returns the original figures when nothing is switched off', () => {
    const result = excludeCostAccounts(xero.months, new Set())
    expect(result.totals).toEqual(xero.totals)
  })

  it('leaves bank-fallback months (no per-category split) unchanged', () => {
    const bank = buildMonthlyPnl({ monthKeys: ['2026-10'], clients: [], costsByMonth: new Map([['2026-10', 100]]), receivedByMonth: new Map(), now: NOW })
    expect(excludeCostAccounts(bank.months, new Set(['Software'])).months).toEqual(bank.months)
  })
})
