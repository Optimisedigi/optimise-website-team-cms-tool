import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The Sales vs Costs panel has its own tests; keep this file about the costs list.
vi.mock('@/components/SalesVsCostsPanel', () => ({ SalesVsCostsPanel: () => null }))

import BusinessCostsPage from '@/components/BusinessCostsPage'

afterEach(() => {
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
})
