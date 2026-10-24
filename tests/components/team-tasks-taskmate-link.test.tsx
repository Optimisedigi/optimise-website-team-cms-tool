import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'

const stepNav = vi.fn()
vi.mock('@/components/AdminStepNavSetter', () => ({
  default: ({ items }: { items: Array<{ label: string }> }) => {
    stepNav(items)
    return null
  },
}))

import TeamTasksSpreadsheet from '@/components/TeamTasksSpreadsheet'

const jsonResponse = (body: unknown) => ({ ok: true, json: async () => body })
const grid = (isAdmin: boolean) => ({ tasks: [], clients: [], users: [], canManage: isAdmin, canEditTaskFields: isAdmin, isAdmin })

describe('Team Tasks TaskMate integration', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('no longer shows an Open TaskMate button but still reloads the assigned week', async () => {
    fetchMock.mockResolvedValue(jsonResponse(grid(true)))
    render(<TeamTasksSpreadsheet />)
    expect(await screen.findByRole('button', { name: 'Add task this week' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Add week' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open TaskMate' })).not.toBeInTheDocument()

    act(() => window.dispatchEvent(new CustomEvent('optimate:taskmate-assigned', { detail: { weekStart: '2026-08-24' } })))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('weekStart=2026-08-24'))).toBe(true))
  })

  it('opens the week named in the URL, as linked from TaskMate', async () => {
    window.history.replaceState(null, '', '/admin/collections/team-tasks?week=2026-08-24')
    fetchMock.mockResolvedValue(jsonResponse(grid(true)))
    render(<TeamTasksSpreadsheet />)
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('weekStart=2026-08-24'))).toBe(true))
    window.history.replaceState(null, '', '/')
  })

  it('puts Add task this week and + Add week on one row, roughly 75/25', async () => {
    fetchMock.mockResolvedValue(jsonResponse(grid(false)))
    render(<TeamTasksSpreadsheet />)
    const add = await screen.findByRole('button', { name: 'Add task this week' })
    const row = add.parentElement
    expect(row?.className).toBe('od-team-tasks-add-row')
    const week = screen.getByRole('button', { name: '+ Add week' })
    expect(week.parentElement).toBe(row)
    expect(add.style.flex).toBe('3 1 0%')
    expect(week.style.flex).toBe('1 1 0%')
  })

  it('sets the admin breadcrumb to Team Tasks', async () => {
    fetchMock.mockResolvedValue(jsonResponse(grid(false)))
    render(<TeamTasksSpreadsheet />)
    await waitFor(() => expect(stepNav).toHaveBeenCalledWith([{ label: 'Team Tasks' }]))
  })
})
