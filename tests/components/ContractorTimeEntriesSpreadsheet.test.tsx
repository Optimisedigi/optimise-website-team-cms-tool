import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ContractorTimeEntriesSpreadsheet from '@/components/ContractorTimeEntriesSpreadsheet'

const gridResponse = {
  entries: [],
  clients: [],
  users: [],
  currentUser: { id: 3, name: 'Lorenzo' },
  monthlyTotals: [],
  columnClientIds: [],
  isAdmin: true,
  canDelete: true,
}

afterEach(() => vi.restoreAllMocks())

describe('ContractorTimeEntriesSpreadsheet', () => {
  it('defaults Weeks to This month and refreshes paid statuses when the tab regains focus', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => gridResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<ContractorTimeEntriesSpreadsheet />)

    const weeks = await screen.findByLabelText('Weeks')
    expect(weeks).toHaveValue('this-month')
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(String(fetchMock.mock.calls[0][0])).toContain('weekMode=this-month')
    expect(fetchMock.mock.calls[0][1]).toEqual({ cache: 'no-store' })

    fireEvent.focus(window)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('keeps the Profiterole transfer calculation collapsed until requested and recalculates from a valid hourly rate', async () => {
    const response = {
      ...gridResponse,
      clients: [{ id: 5, name: 'Profiterole Patisserie' }],
      monthlyTotals: [{
        month: '2026-09',
        monthLabel: 'Sep 2026',
        totals: [{ clientId: '5', clientName: 'Profiterole Patisserie', hours: 20 }],
      }],
      columnClientIds: [],
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => response,
    }))

    render(<ContractorTimeEntriesSpreadsheet />)

    const calculationsButton = await screen.findByRole('button', { name: 'Calculations +' })
    expect(calculationsButton).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Amount to transfer')).not.toBeInTheDocument()
    expect(await screen.findByText('Sep 2026')).toHaveStyle({ whiteSpace: 'nowrap' })

    fireEvent.click(calculationsButton)

    expect(screen.getByText('Amount to transfer')).toBeInTheDocument()
    expect(screen.getByText('$3,045.00')).toBeInTheDocument()
    const rateInput = screen.getByLabelText('Hourly contractor rate')
    expect(rateInput).toHaveValue(20.5)

    expect(screen.getByText('Profiterole Patisserie', { selector: 'th div' })).toBeInTheDocument()
    fireEvent.change(rateInput, { target: { value: '25' } })
    expect(screen.getByText('$3,000.00')).toBeInTheDocument()

    fireEvent.change(rateInput, { target: { value: '10001' } })
    expect(rateInput).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Enter a rate from $0 to $10,000')).toBeInTheDocument()
  })

  it('marks a month transfer as paid in green when the amount is clicked', async () => {
    const response = {
      ...gridResponse,
      clients: [{ id: 5, name: 'Profiterole Patisserie' }],
      monthlyTotals: [
        { month: '2026-07', monthLabel: 'Jul 2026', totals: [{ clientId: '5', clientName: 'Profiterole Patisserie', hours: 20 }] },
        { month: '2026-06', monthLabel: 'Jun 2026', totals: [{ clientId: '5', clientName: 'Profiterole Patisserie', hours: 10 }] },
      ],
      paidTransferMonths: ['2026-06'],
    }
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      json: async () => init?.method === 'PATCH' ? { ok: true, paidTransferMonths: ['2026-06', '2026-07'] } : response,
    }))
    vi.stubGlobal('fetch', fetchMock)

    render(<ContractorTimeEntriesSpreadsheet />)
    fireEvent.click(await screen.findByRole('button', { name: 'Calculations +' }))

    const june = screen.getByRole('button', { name: /Jun 2026, paid/ })
    expect(june).toHaveAttribute('aria-pressed', 'true')
    expect(june).toHaveStyle({ color: '#15803d' })
    const july = screen.getByRole('button', { name: /Jul 2026, not paid/ })
    expect(july).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(july)

    await waitFor(() => expect(screen.getByRole('button', { name: /Jul 2026, paid/ })).toHaveStyle({ color: '#15803d' }))
    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')
    expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({ transferMonth: '2026-07', transferPaid: true })
  })
})
