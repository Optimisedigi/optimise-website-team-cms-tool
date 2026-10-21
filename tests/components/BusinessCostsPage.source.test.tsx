import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The Sales vs Costs panel has its own tests; here we only check which period it's given.
const panelProps = vi.hoisted(() => ({ last: null as null | Record<string, unknown> }))
vi.mock('@/components/SalesVsCostsPanel', () => ({
  SalesVsCostsPanel: (props: Record<string, unknown>) => {
    panelProps.last = props
    return null
  },
}))
const estimateProps = vi.hoisted(() => ({ last: null as null | Record<string, unknown> }))
vi.mock('@/components/YearEndEstimatePanel', () => ({
  YearEndEstimatePanel: (props: Record<string, unknown>) => {
    estimateProps.last = props
    return <div data-testid="year-end-estimate" />
  },
}))

import BusinessCostsPage from '@/components/BusinessCostsPage'

beforeEach(() => {
  // Pin "today" so the default period is stable: 18 Oct 2026 → FY 2026–27.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 18, 12))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const base = {
  costHistory: [],
  costAlerts: [],
  uncategorised: [],
  totalLastMonth: 500,
  currentMonth: '2026-10',
}

const xeroResponse = {
  ...base,
  source: 'xero',
  totalThisMonth: 650,
  costsByCategory: [{ category: { id: 'xero:Software', name: 'Software', color: '#4A90D9' }, total: 650, count: 0, items: [] }],
  categories: [{ id: 'xero:Software', name: 'Software', color: '#4A90D9' }],
}

const bankResponse = {
  ...base,
  source: 'bank',
  totalThisMonth: 31,
  costsByCategory: [{
    category: { id: 1, name: 'Infrastructure', color: '#213843' },
    total: 31,
    count: 1,
    items: [{ id: 9, date: '2026-10-01T00:00:00.000Z', amount: 31, description: 'VERCEL', source: 'csv_import', category: { id: 1, name: 'Infrastructure', color: '#213843' } }],
  }],
  categories: [{ id: 1, name: 'Infrastructure', color: '#213843' }],
}

function stubCosts() {
  const fetchMock = vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (url.includes('source=bank') ? bankResponse : xeroResponse),
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('BusinessCostsPage data source', () => {
  it('shows Xero costs without the CSV-only tools, and switches to imported statements on request', async () => {
    const fetchMock = stubCosts()

    render(<BusinessCostsPage />)

    expect(await screen.findByText('Software')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('Costs below come from Xero')
    expect(screen.queryByText('Import CSV')).not.toBeInTheDocument()
    expect(screen.queryByText(/^\d+ transactions?$/)).not.toBeInTheDocument() // no per-card count from Xero
    expect(screen.getByRole('button', { name: 'Xero' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Imported CSV' }))

    await waitFor(() => expect(screen.getByText('VERCEL')).toBeInTheDocument())
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/costs?month=2026-10&source=bank')
    expect(screen.getByText('Import CSV')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Imported CSV' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('defaults to the current financial year and switches between financial and calendar years', async () => {
    const fetchMock = stubCosts()

    render(<BusinessCostsPage />)
    await screen.findByText('Software')

    expect(screen.getByRole('button', { name: 'Financial year' })).toHaveAttribute('aria-pressed', 'true')
    expect(panelProps.last).toMatchObject({ from: '2026-07', to: '2026-10', label: 'FY 2026\u201327', toDate: true })
    // The running year gets an estimate for the whole July–June period.
    expect(screen.getByTestId('year-end-estimate')).toBeInTheDocument()
    expect(estimateProps.last).toMatchObject({ from: '2026-07', to: '2027-06', label: 'FY 2026\u201327' })
    expect(estimateProps.last?.excluded).toBe(panelProps.last?.excluded)
    const yearSelect = screen.getByRole('combobox', { name: 'Financial year' })
    expect(yearSelect).toHaveDisplayValue('FY 2026\u201327 (Jul 2026 \u2013 Jun 2027)')
    // Month menu lists only months in the financial year so far, newest first.
    const monthOptions = Array.from((screen.getByRole('combobox', { name: 'Month' }) as HTMLSelectElement).options).map((o) => o.value)
    expect(monthOptions).toEqual(['2026-10', '2026-09', '2026-08', '2026-07'])

    // A past financial year: whole July–June, breakdown jumps to June.
    fireEvent.change(yearSelect, { target: { value: '2024' } })
    expect(panelProps.last).toMatchObject({ from: '2024-07', to: '2025-06', label: 'FY 2024\u201325', toDate: false })
    expect(screen.queryByTestId('year-end-estimate')).not.toBeInTheDocument()
    await waitFor(() => expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/costs?month=2025-06'))

    // Switch to calendar year: keeps the selected month (June 2025) → 2025.
    fireEvent.click(screen.getByRole('button', { name: 'Calendar year' }))
    expect(screen.getByRole('button', { name: 'Calendar year' })).toHaveAttribute('aria-pressed', 'true')
    expect(panelProps.last).toMatchObject({ from: '2025-01', to: '2025-12', label: '2025', toDate: false })
    expect(screen.getByRole('combobox', { name: 'Calendar year' })).toHaveDisplayValue('2025')
    expect(screen.getByRole('combobox', { name: 'Month' })).toHaveDisplayValue('June 2025')
  })
})
