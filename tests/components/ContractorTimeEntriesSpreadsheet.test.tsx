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
})
