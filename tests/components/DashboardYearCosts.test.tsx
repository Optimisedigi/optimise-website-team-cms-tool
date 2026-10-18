import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardYearCosts } from '@/components/DashboardYearCosts'

beforeEach(() => {
  // Pin "today": 18 Oct 2026 → FY 2026–27 runs Jul–Oct so far.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 18, 12))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const month = (m: string, sales: number, received: number, costs: number) => ({
  month: m, sales, received, costs, profitSales: sales - costs, profitReceived: received - costs, noBankData: false,
})

function stubPnl() {
  const fetchMock = vi.fn(async (_url: string) => ({
    ok: true,
    status: 200,
    json: async () => ({
      source: 'xero',
      months: [month('2026-07', 8000, 7000, 2000), month('2026-08', 9000, 9500, 2500), month('2026-09', 10000, 9000, 3000), month('2026-10', 4000, 1000, 1500)],
      totals: { sales: 31000, received: 26500, costs: 9000, profitSales: 22000, profitReceived: 17500 },
    }),
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const stat = (label: string) => screen.getByText(label, { selector: '.k' }).parentElement

describe('DashboardYearCosts', () => {
  it('defaults to the calendar year to date', async () => {
    const fetchMock = stubPnl()

    render(<DashboardYearCosts />)

    expect(await screen.findByText('2026, year to date')).toBeInTheDocument()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/costs/pnl?from=2026-01&to=2026-10')
    expect(screen.getByRole('button', { name: 'Calendar year' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Financial year' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows the financial year to date, narrows to a clicked month and back to the year', async () => {
    const fetchMock = stubPnl()

    render(<DashboardYearCosts />)
    await screen.findByText('2026, year to date')
    fireEvent.click(screen.getByRole('button', { name: 'Financial year' }))

    expect(await screen.findByText('FY 2026\u201327, year to date')).toBeInTheDocument()
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/costs/pnl?from=2026-07&to=2026-10')
    expect(stat('Invoiced')).toHaveTextContent('$31,000')
    expect(stat('Costs')).toHaveTextContent('$9,000')
    expect(stat('Profit')).toHaveTextContent('$22,000')

    const august = screen.getByRole('button', { name: /^August 2026/ })
    fireEvent.click(august)

    expect(august).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('August 2026')).toBeInTheDocument()
    expect(stat('Invoiced')).toHaveTextContent('$9,000')
    expect(stat('Received')).toHaveTextContent('$9,500')
    expect(stat('Costs')).toHaveTextContent('$2,500')
    expect(stat('Profit')).toHaveTextContent('$6,500')

    fireEvent.click(screen.getByRole('button', { name: 'Whole year' }))
    expect(august).toHaveAttribute('aria-pressed', 'false')
    expect(stat('Invoiced')).toHaveTextContent('$31,000')

    // Clicking the selected month again also returns to the year.
    fireEvent.click(august)
    fireEvent.click(august)
    expect(stat('Invoiced')).toHaveTextContent('$31,000')
  })

  it('switches to the financial year and clears the selected month', async () => {
    const fetchMock = stubPnl()

    render(<DashboardYearCosts />)
    fireEvent.click(await screen.findByRole('button', { name: /^September 2026/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Financial year' }))

    expect(await screen.findByText('FY 2026\u201327, year to date')).toBeInTheDocument()
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/costs/pnl?from=2026-07&to=2026-10')
    expect(screen.queryByRole('button', { name: 'Whole year' })).not.toBeInTheDocument()
  })

  it('explains missing access instead of showing figures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: 'Forbidden' }) })))

    render(<DashboardYearCosts />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Clients and Business Costs access')
  })
})
