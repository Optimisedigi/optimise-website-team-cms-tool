import { fireEvent, render, screen, waitForElementToBeRemoved, within } from '@testing-library/react'
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
  retainers: kind === 'actual' ? [] : [{ id: 1, name: 'Steady Co', amount: 6000, kind: 'retainer' }],
  invoicedExpected: kind === 'actual' ? 0 : 6000,
  adjustments: [] as unknown[],
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
    { id: 3, name: 'New Co', monthlyRetainer: 3000, override: null, setupFee: { month: '2026-11', amount: 900 }, restOfPeriod: 2400, startsOn: '2026-11-16T12:00:00.000Z', change: null },
    { id: 2, name: 'Leaving Co', monthlyRetainer: 2000, override: { id: 40, amount: 2500 }, setupFee: null, restOfPeriod: 0, startsOn: null, change: { date: '2026-11-01T12:00:00.000Z', action: 'end', amount: 0 } },
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
    expect(within(clients).getByRole('rowheader', { name: 'New Co' }).closest('tr')).toHaveTextContent('Starts 16 Nov 2026 \u00b7 Setup fee $900 in Nov 2026')
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

  it('shows what a month\u2019s invoiced and costs figures are made of on hover', async () => {
    const nov = { ...row('2026-11', 'estimate', 7500, 0, 3000, 1000), retainers: [{ id: 1, name: 'Steady Co', amount: 6000, kind: 'retainer' }, { id: 3, name: 'New Co', amount: 1500, kind: 'setup' }], invoicedExpected: 7500 }
    stub({ ...estimate, months: [estimate.months[0], estimate.months[1], nov] })
    render(<YearEndEstimatePanel {...props} excluded={new Set(['Software'])} />)

    const table = await screen.findByRole('table', { name: 'Year-end estimate by month' })
    const novRow = within(table).getByRole('rowheader', { name: 'Nov 2026' }).closest('tr') as HTMLElement
    fireEvent.mouseEnter(within(novRow).getByText('$7,500'))
    const invoiced = await screen.findByRole('tooltip')
    expect(invoiced).toHaveTextContent('Invoiced \u00b7 Nov 2026')
    expect(invoiced).toHaveTextContent('Steady Co$6,000')
    expect(invoiced).toHaveTextContent('New Co$1,500Setup fee')
    fireEvent.mouseLeave(within(novRow).getByText('$7,500'))
    await waitForElementToBeRemoved(invoiced)

    const octRow = within(table).getByRole('rowheader', { name: 'Oct 2026' }).closest('tr') as HTMLElement
    fireEvent.focus(within(octRow).getByText('$3,000'))
    const costs = await screen.findByRole('tooltip')
    expect(costs).toHaveTextContent('Costs \u00b7 Oct 2026')
    expect(costs).toHaveTextContent('Wages and Salaries$3,000')
    expect(costs).not.toHaveTextContent('Software')
    expect(costs).toHaveTextContent('1 switched-off category not counted')
  })

  it('adds and removes manual estimates, then reloads the estimate', async () => {
    const withManual = {
      ...estimate,
      months: [
        estimate.months[0],
        estimate.months[1],
        { ...row('2026-11', 'estimate', 9500, 0, 3000, 1000), adjustments: [{ id: 9, month: '2026-11', kind: 'invoiced', amount: 2000, description: 'Website build', account: null }] },
      ],
    }
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/costs/projection?')) return { ok: true, status: 200, json: async () => withManual }
      return { ok: true, status: 200, json: async () => ({ ok: true, id: 10, init }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<YearEndEstimatePanel {...props} />)

    const manual = await screen.findByRole('table', { name: 'Manual estimates' })
    expect(within(manual).getByRole('rowheader', { name: 'Website build' }).closest('tr')).toHaveTextContent('Nov 2026')
    const table = screen.getByRole('table', { name: 'Year-end estimate by month' })
    expect(within(table).getByRole('rowheader', { name: 'Nov 2026' }).closest('tr')).toHaveTextContent('Estimate + manual')

    const form = screen.getByRole('form', { name: 'Add a manual estimate' })
    fireEvent.change(within(form).getByLabelText('Month'), { target: { value: '2026-11' } })
    fireEvent.change(within(form).getByLabelText('Type'), { target: { value: 'cost' } })
    fireEvent.change(within(form).getByLabelText('Category'), { target: { value: 'Software' } })
    fireEvent.change(within(form).getByLabelText('Description'), { target: { value: 'New tool' } })
    fireEvent.change(within(form).getByLabelText('Amount (ex-GST)'), { target: { value: '250' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add estimate' }))

    await vi.waitFor(() => expect(fetchMock.mock.calls.filter(([u]) => String(u).startsWith('/api/costs/projection?'))).toHaveLength(2))
    const post = fetchMock.mock.calls.find(([u]) => u === '/api/costs/projection/adjustments')
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ month: '2026-11', kind: 'cost', amount: 250, description: 'New tool', account: 'Software' })

    fireEvent.click(within(manual).getByRole('button', { name: 'Remove Website build (Nov 2026)' }))
    await vi.waitFor(() => expect(fetchMock.mock.calls.filter(([u]) => String(u).startsWith('/api/costs/projection?'))).toHaveLength(3))
    expect(fetchMock).toHaveBeenCalledWith('/api/costs/projection/adjustments/9', { method: 'DELETE' })
  })

  it('edits a client\u2019s estimated monthly retainer and resets it to the client record', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith('/api/costs/projection?')) return { ok: true, status: 200, json: async () => estimate }
      return { ok: true, status: 200, json: async () => ({ ok: true, id: 41 }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<YearEndEstimatePanel {...props} />)

    const clients = await screen.findByRole('table', { name: 'Retainers counted for Nov 2026' })
    const leaving = within(clients).getByRole('rowheader', { name: 'Leaving Co' }).closest('tr') as HTMLElement
    expect(within(leaving).getByLabelText('Client record: $2,000')).toBeInTheDocument()
    expect(leaving).toHaveTextContent('$2,500')

    fireEvent.click(within(clients).getByRole('button', { name: 'Edit estimated monthly retainer for New Co' }))
    const input = within(clients).getByLabelText('Estimated monthly retainer for New Co')
    expect(input).toHaveValue(3000)
    fireEvent.change(input, { target: { value: '3500' } })
    fireEvent.click(within(clients).getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(fetchMock.mock.calls.filter(([u]) => String(u).startsWith('/api/costs/projection?'))).toHaveLength(2))
    const post = fetchMock.mock.calls.find(([u]) => u === '/api/costs/projection/adjustments') as unknown as [string, RequestInit] | undefined
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ kind: 'retainer', clientId: 3, amount: 3500 })

    fireEvent.click(await screen.findByRole('button', { name: 'Reset Leaving Co to the client record' }))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/costs/projection/adjustments/40', { method: 'DELETE' }))
  })

  it('explains when Xero is unavailable', async () => {
    stub({ available: false, reason: 'not_connected' })
    render(<YearEndEstimatePanel {...props} />)
    expect(await screen.findByRole('status')).toHaveTextContent('Xero isn\u2019t connected in Growth Tools.')
  })
})
