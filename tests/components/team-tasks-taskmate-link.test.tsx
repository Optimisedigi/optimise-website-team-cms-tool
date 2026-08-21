import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import TeamTasksSpreadsheet from '@/components/TeamTasksSpreadsheet'

const jsonResponse = (body: unknown) => ({ ok: true, json: async () => body })
const grid = (isAdmin: boolean) => ({ tasks: [], clients: [], users: [], canManage: isAdmin, canEditTaskFields: isAdmin, isAdmin })

describe('Team Tasks TaskMate integration', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('shows the launcher link only for admins and reloads the assigned week', async () => {
    fetchMock.mockResolvedValue(jsonResponse(grid(true)))
    render(<TeamTasksSpreadsheet />)
    expect(await screen.findByRole('button', { name: 'Open TaskMate' })).toBeInTheDocument()

    act(() => window.dispatchEvent(new CustomEvent('optimate:taskmate-assigned', { detail: { weekStart: '2026-08-24' } })))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('weekStart=2026-08-24'))).toBe(true))
  })

  it('hides the launcher link from non-admin users', async () => {
    fetchMock.mockResolvedValue(jsonResponse(grid(false)))
    render(<TeamTasksSpreadsheet />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Open TaskMate' })).not.toBeInTheDocument()
  })
})
