import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { DefaultCellComponentProps } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

import AccountManagerCell from '@/components/clients-list/AccountManagerCell'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AccountManagerCell editing', () => {
  it('updates account managers for its client row', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          managers: [
            { name: 'Peter', email: 'peter@example.com' },
            { name: 'Sarah', email: 'sarah@example.com' },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ updated: 1, failures: [] }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const props = {
      cellData: [{ name: 'Peter', email: 'peter@example.com' }],
      rowData: { id: 42, name: 'Acme' },
    } as unknown as DefaultCellComponentProps
    render(<AccountManagerCell {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit account managers for Acme' }))
    const dialog = await screen.findByRole('dialog', { name: 'Account managers' })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Peter' }))
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Sarah' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock.mock.calls[1][0]).toBe('/api/clients/assign-managers')
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      clientIds: [42],
      managers: [{ name: 'Sarah', email: 'sarah@example.com' }],
      mode: 'replace',
    })
    expect(screen.queryByRole('dialog', { name: 'Account managers' })).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('button', { name: 'Edit account managers for Acme' })).getByText(
        'Sarah',
      ),
    ).toBeInTheDocument()
  })
})
