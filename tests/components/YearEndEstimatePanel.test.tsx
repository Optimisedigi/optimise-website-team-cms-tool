import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { YearEndEstimatePanel } from '@/components/YearEndEstimatePanel'

afterEach(() => {
  vi.unstubAllGlobals()
})

const row = (month: string, kind: string, invoiced: number, invoicedActual: number, wages: number, other: number, actualWages = 0, actualOther = 0) => ({
  month,
  kind,
  invoiced,
  invoicedActual,
  costs: wages + other,
  costsActual: actualWages + actualOther,
  costsByAccount: [{ account: 'Wages and Salaries', amount: wages }, { account: 'Software', amount: other }],
  costsActualByAccount: [{ account: 'Wages and Salaries', amount: actualWages }, { account: 'Software', amount: actualOther }],
  profit: invoiced - wages - other,
})

const estimate = {
  available: true,
  currentMonth: '2026-10',
  costAverage: { months: ['2026-09'], monthly: 4000 },
  months: [
    row('2026-09', 'actual', 10000, 10000, 3000, 1000, 3000, 1000),
    row('2026-10', 'current', 9000, 9000, 3000, 2000, 1000, 2000),
    row('2026-11', 'estimate', 7500, 0, 3000, 1000),
  ],
  clients: [
    { id: 3, name: 'New Co', monthlyRetainer: 3000, restOfPeriod: 1500, startsOn: '2026-11-16T12:00:00.000Z', change: null },
    { id: 2, name: 'Leaving Co', monthlyRetainer: 2000, restOfPeriod: 0, startsOn: null, change: { date: '2026-11-01T12:00:00.000Z', action: 'end', amount: 0 } },
  ],
}

const props = { from: '2026-09', to: '2026-11', label: '2026', excluded: new Set<string>(), onExcludedChange: vi.fn() }

function stub(body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => body })))
}

describe('YearEndEstimatePanel', () => {
  it('shows the estimated year, which months are estimates, and the retainers behind them', async () => {
    stub(estimate)
    render(<YearEndEstimatePanel {...props} />)

    const table = await screen.findByRole('table', { name: 'Year-end estimate by month' })
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('/api/costs/projection?from=2026-09&to=2026-11')
    expect(within(table).getByRole('rowheader', { name: 'Nov 2026' }).closest('tr')).toHaveTextContent('Estimate')
    expect(within(table).getByRole('rowheader', { name: 'Estimated total' }).closest('tr')).toHaveTextContent('$26,500')
    expect(screen.getByText('Invoiced so far').nextSibling).toHaveTextContent('$19,000')
    expect(screen.getByText('Still to invoice').nextSibling).toHaveTextContent('+$7,500')
    expect(screen.getByText('Estimated profit').nextSibling).toHaveTextContent('$13,500')

    const clients = screen.getByRole('table', { name: 'Retainers counted for Nov 2026' })
    expect(within(clients).getByRole('rowheader', { name: 'New Co' }).closest('tr')).toHaveTextContent('Starts 16 Nov 2026')
    expect(within(clients).getByRole('rowheader', { name: 'Leaving Co' }).closest('tr')).toHaveTextContent('Ends 1 Nov 2026')
  })

  it('follows the what-if category exclusions and can clear them', async () => {
    stub(estimate)
    const onExcludedChange = vi.fn()
    render(<YearEndEstimatePanel {...props} excluded={new Set(['Wages and Salaries'])} onExcludedChange={onExcludedChange} />)

    await screen.findByRole('table', { name: 'Year-end estimate by month' })
    expect(screen.getByText('Estimated costs').nextSibling).toHaveTextContent('$4,000')
    expect(screen.getByText('Estimated profit').nextSibling).toHaveTextContent('$22,500')
    fireEvent.click(screen.getByRole('button', { name: 'Show all costs' }))
    expect(onExcludedChange).toHaveBeenCalledWith(new Set())
  })

  it('switches a cost category off and on from its own legend', async () => {
    stub(estimate)
    function Harness() {
      const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set())
      return <YearEndEstimatePanel {...props} excluded={excluded} onExcludedChange={setExcluded} />
    }
    render(<Harness />)

    const legend = await screen.findByRole('list', { name: 'Estimated costs by Xero category (2026)' })
    expect(screen.getByText('Estimated costs').nextSibling).toHaveTextContent('$13,000')
    const wages = within(legend).getByRole('button', { name: /^Wages and Salaries, \$9,000/ })
    expect(wages).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(wages)
    expect(wages).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Estimated costs').nextSibling).toHaveTextContent('$4,000')
    expect(screen.getByText('Estimated profit').nextSibling).toHaveTextContent('$22,500')

    fireEvent.click(wages)
    expect(wages).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Estimated costs').nextSibling).toHaveTextContent('$13,000')
  })

  it('explains when Xero is unavailable', async () => {
    stub({ available: false, reason: 'not_connected' })
    render(<YearEndEstimatePanel {...props} />)
    expect(await screen.findByRole('status')).toHaveTextContent('Xero isn\u2019t connected in Growth Tools.')
  })
})
