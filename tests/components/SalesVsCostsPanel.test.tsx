import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SalesVsCostsPanel } from '@/components/SalesVsCostsPanel'

afterEach(() => {
  vi.unstubAllGlobals()
})

const month = (m: string, sales: number, received: number, costs: number, noBankData = false) => ({
  month: m, sales, received, costs, profitSales: sales - costs, profitReceived: received - costs, noBankData,
})

const FY = { from: '2026-07', to: '2026-10', label: 'FY 2026\u201327', toDate: true }

function stubPnl(body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => body })))
}

describe('SalesVsCostsPanel', () => {
  it('shows Xero figures with invoiced labels, a total row and Xero categories', async () => {
    stubPnl({
      source: 'xero',
      months: [month('2026-09', 9000, 7000, 2500), month('2026-10', 10000, 11000, 3100)],
      totals: { sales: 19000, received: 18000, costs: 5600, profitSales: 13400, profitReceived: 12400 },
      costsByAccount: [{ account: 'Contractors', amount: 4500 }, { account: 'Software', amount: 1100 }],
      fetchedAt: '2026-10-17T05:00:00.000Z',
    })

    render(<SalesVsCostsPanel {...FY} />)

    const table = await screen.findByRole('table', { name: 'Sales vs costs by month' })
    expect(within(table).getByRole('columnheader', { name: 'Invoiced' })).toBeInTheDocument()
    const totalRow = within(table).getByRole('rowheader', { name: 'Total' }).closest('tr')
    expect(totalRow).toHaveTextContent('$19,000')
    expect(totalRow).toHaveTextContent('$13,400')
    expect(screen.getByText('Costs by Xero category (FY 2026\u201327, year to date)')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sales vs Costs: FY 2026\u201327, year to date' })).toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('/api/costs/pnl?from=2026-07&to=2026-10')
    expect(screen.getByText('Contractors')).toBeInTheDocument()
    expect(screen.queryByText(/Showing bank statement/)).not.toBeInTheDocument()
  })

  it('explains the fallback when Xero is unavailable and flags months without a statement', async () => {
    stubPnl({
      source: 'bank',
      xeroUnavailable: 'scope_missing',
      months: [month('2026-09', 3000, 0, 0, true), month('2026-10', 3000, 2500, 1200)],
      totals: { sales: 6000, received: 2500, costs: 1200, profitSales: 4800, profitReceived: 1300 },
    })

    render(<SalesVsCostsPanel {...FY} />)

    expect(await screen.findByRole('status')).toHaveTextContent('needs reconnecting once')
    expect(screen.getByRole('columnheader', { name: 'Agreed sales' })).toBeInTheDocument()
    expect(screen.getByText('no statement imported')).toBeInTheDocument()
  })

  it('switches a Xero category off and on, updating the table and totals', async () => {
    const withAccounts = (m: string, sales: number, received: number, wages: number, software: number) => ({
      ...month(m, sales, received, wages + software),
      costsByAccount: [{ account: 'Wages and Salaries', amount: wages }, { account: 'Software', amount: software }],
    })
    stubPnl({
      source: 'xero',
      months: [withAccounts('2026-09', 9000, 7000, 2000, 500), withAccounts('2026-10', 10000, 11000, 2500, 600)],
      totals: { sales: 19000, received: 18000, costs: 5600, profitSales: 13400, profitReceived: 12400 },
      costsByAccount: [{ account: 'Wages and Salaries', amount: 4500 }, { account: 'Software', amount: 1100 }],
    })

    render(<SalesVsCostsPanel {...FY} />)

    const table = await screen.findByRole('table', { name: 'Sales vs costs by month' })
    const totalRow = () => within(table).getByRole('rowheader', { name: 'Total' }).closest('tr')
    expect(totalRow()).toHaveTextContent('$5,600')

    const wages = screen.getByRole('button', { name: /^Wages and Salaries/ })
    expect(wages).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(wages)

    expect(wages).toHaveAttribute('aria-pressed', 'false')
    expect(totalRow()).toHaveTextContent('$1,100') // costs without wages
    expect(totalRow()).toHaveTextContent('$17,900') // profit (invoiced) without wages
    const oct = within(table).getByRole('rowheader', { name: /Oct 2026/ }).closest('tr')
    expect(oct).toHaveTextContent('$600')
    expect(screen.getByRole('status')).toHaveTextContent('excluding Wages and Salaries')

    fireEvent.click(screen.getByRole('button', { name: 'Show all costs' }))
    expect(totalRow()).toHaveTextContent('$5,600')
    expect(wages).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('reloads when the page switches to another year', async () => {
    stubPnl({
      source: 'xero',
      months: [month('2025-07', 1, 1, 1)],
      totals: { sales: 1, received: 1, costs: 1, profitSales: 0, profitReceived: 0 },
      costsByAccount: [],
    })

    const { rerender } = render(<SalesVsCostsPanel {...FY} />)
    await screen.findByRole('table', { name: 'Sales vs costs by month' })

    rerender(<SalesVsCostsPanel from="2025-01" to="2025-12" label="2025" />)

    expect(await screen.findByRole('heading', { name: 'Sales vs Costs: 2025' })).toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls.at(-1)?.[0]).toBe('/api/costs/pnl?from=2025-01&to=2025-12')
  })
})
