import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SalesVsCostsPanel } from '@/components/SalesVsCostsPanel'

afterEach(() => {
  vi.unstubAllGlobals()
})

const month = (m: string, sales: number, received: number, costs: number, noBankData = false) => ({
  month: m, sales, received, costs, profitSales: sales - costs, profitReceived: received - costs, noBankData,
})

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

    render(<SalesVsCostsPanel />)

    const table = await screen.findByRole('table', { name: 'Sales vs costs by month' })
    expect(within(table).getByRole('columnheader', { name: 'Invoiced' })).toBeInTheDocument()
    const totalRow = within(table).getByRole('rowheader', { name: 'Total' }).closest('tr')
    expect(totalRow).toHaveTextContent('$19,000')
    expect(totalRow).toHaveTextContent('$13,400')
    expect(screen.getByText('Costs by Xero category (12 months)')).toBeInTheDocument()
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

    render(<SalesVsCostsPanel />)

    expect(await screen.findByRole('status')).toHaveTextContent('needs reconnecting once')
    expect(screen.getByRole('columnheader', { name: 'Agreed sales' })).toBeInTheDocument()
    expect(screen.getByText('no statement imported')).toBeInTheDocument()
  })
})
