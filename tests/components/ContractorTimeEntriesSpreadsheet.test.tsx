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
    expect(screen.getByText('Sep 2026')).toHaveStyle({ whiteSpace: 'nowrap' })

    fireEvent.click(calculationsButton)

    expect(screen.getByText('Amount to transfer')).toBeInTheDocument()
    expect(screen.getByText('$3,045.00')).toBeInTheDocument()
    const rateInput = screen.getByLabelText('Hourly contractor rate')
    expect(rateInput).toHaveValue(20.5)

    fireEvent.change(rateInput, { target: { value: '25' } })
    expect(screen.getByText('$3,000.00')).toBeInTheDocument()

    fireEvent.change(rateInput, { target: { value: '10001' } })
    expect(rateInput).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Enter a rate from $0 to $10,000')).toBeInTheDocument()
  })
})
