import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import TeamTasksSpreadsheet from '@/components/TeamTasksSpreadsheet'

const tasks = [
  { id: 1, title: 'Review launch', dueDate: '2026-09-24', priority: 'high', status: 'ready_for_review', taskType: 'blog_post', instructions: '<p>Prepare the weekly brief.</p>' },
  { id: 2, title: 'Check links', dueDate: '2026-09-25', priority: 'normal', status: 'in_progress', taskType: 'email', instructions: '<p>Check links before handoff.</p>' },
  { id: 3, title: 'Plan October', dueDate: '2026-09-28', priority: 'normal', status: 'not_started', taskType: 'blog_post', instructions: '<p>Collect next week’s priorities.</p>' },
]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-25T12:00:00Z'))
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/detail')) return {
      ok: true,
      json: async () => ({
        task: { ...tasks[0], relatedLinks: [{ label: 'Campaign brief', url: 'https://example.com/brief' }], screenshots: [] },
        comments: [{ id: 4, body: '<p>Ready for review.</p>', author: { id: 7, name: 'Morgan' } }],
        users: [{ id: 7, name: 'Morgan' }], currentUser: { id: 7, name: 'Morgan' }, canManage: true,
      }),
    }
    const week = new URL(url, 'http://localhost').searchParams.get('weekStart')
    return { ok: true, json: async () => ({ tasks: week === 'all' ? tasks : tasks.slice(0, 2), clients: [], users: [], canEditTaskFields: true, canManage: true }) }
  }))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('desktop weekly tasks', () => {
  it('retains a combined table for each week, with readable dates and task counts', async () => {
    render(<TeamTasksSpreadsheet />)
    await screen.findByRole('table')
    fireEvent.change(screen.getByRole('combobox', { name: 'Weeks' }), { target: { value: 'all' } })
    await screen.findByRole('button', { name: 'Open details for Plan October' })

    const table = screen.getByRole('table')
    const weeks = within(table).getAllByRole('cell').filter((cell) => cell.hasAttribute('rowspan'))
    expect(weeks).toHaveLength(2)
    expect(weeks[0]).toHaveAttribute('rowspan', '2')
    expect(weeks[0]).toHaveTextContent('21 – 27 September')
    expect(weeks[0]).toHaveTextContent('2 tasks')
    expect(weeks[1]).toHaveTextContent('28 Sept – 4 Oct')
    expect(weeks[1]).toHaveTextContent('1 task')
    expect(screen.getByRole('textbox', { name: 'Task title for Review launch' })).toHaveValue('Review launch')
    expect(screen.getByRole('textbox', { name: 'Task title for Check links' })).toHaveValue('Check links')
    expect(screen.getByLabelText('Task date for Review launch')).toHaveValue('2026-09-24')
  })

  it('removes a saved task from the selected week when its detail date moves to another week', async () => {
    let savedTask = { ...tasks[0] }
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/detail')) {
        if (init?.method === 'PATCH') {
          savedTask = { ...savedTask, ...JSON.parse(String(init.body)) }
        }
        return { ok: true, json: async () => ({ task: savedTask, comments: [], users: [], canManage: true }) }
      }
      const week = new URL(url, 'http://localhost').searchParams.get('weekStart')
      const visible = [savedTask, ...tasks.slice(1)].filter((task) => week === 'all' || task.dueDate >= '2026-09-21' && task.dueDate < '2026-09-28')
      return { ok: true, json: async () => ({ tasks: visible, clients: [], users: [], canEditTaskFields: true, canManage: true }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<TeamTasksSpreadsheet />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open details for Review launch' }))
    const pane = await screen.findByRole('complementary', { name: 'Task details' })
    fireEvent.change(within(pane).getByLabelText('Task date'), { target: { value: '2026-09-30' } })

    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Task title for Review launch' })).not.toBeInTheDocument())
    expect(screen.getByRole('combobox', { name: 'Weeks' })).toHaveValue('week')
    expect(screen.getByLabelText('Week')).toHaveValue('2026-09-21')
    expect(within(pane).getByLabelText('Task date')).toHaveValue('2026-09-30')
    expect(fetchMock.mock.calls.filter(([url]) => url.includes('weekStart=2026-09-21'))).toHaveLength(2)
  })

  it('restores the selected-week row and date when moving a task fails', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/detail')) return init?.method === 'PATCH'
        ? { ok: false, json: async () => ({ error: 'Could not move task' }) }
        : { ok: true, json: async () => ({ task: tasks[0], comments: [], users: [], canManage: true }) }
      return { ok: true, json: async () => ({ tasks: tasks.slice(0, 2), clients: [], users: [], canEditTaskFields: true, canManage: true }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<TeamTasksSpreadsheet />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open details for Review launch' }))
    const pane = await screen.findByRole('complementary', { name: 'Task details' })
    fireEvent.change(within(pane).getByLabelText('Task date'), { target: { value: '2026-09-30' } })

    expect(await within(pane).findByRole('alert')).toHaveTextContent('Could not move task')
    expect(within(pane).getByLabelText('Task date')).toHaveValue('2026-09-24')
    expect(screen.getByRole('textbox', { name: 'Task title for Review launch' })).toHaveValue('Review launch')
    expect(screen.getByRole('combobox', { name: 'Weeks' })).toHaveValue('week')
    expect(screen.getByLabelText('Week')).toHaveValue('2026-09-21')
  })

  it('saves a title from the detail pane and restores the original value if the first save fails', async () => {
    let savedTask = { ...tasks[0] }
    let saves = 0
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/detail')) {
        if (init?.method === 'PATCH') {
          saves += 1
          if (saves === 1) return { ok: false, json: async () => ({ error: 'Could not save title' }) }
          savedTask = { ...savedTask, ...JSON.parse(String(init.body)) }
        }
        return { ok: true, json: async () => ({ task: savedTask, comments: [], users: [], canManage: true }) }
      }
      return { ok: true, json: async () => ({ tasks: [savedTask, tasks[1]], clients: [], users: [], canEditTaskFields: true, canManage: true }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<TeamTasksSpreadsheet />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open details for Review launch' }))
    const pane = await screen.findByRole('complementary', { name: 'Task details' })
    const title = within(pane).getByRole('textbox', { name: 'Task title' })
    fireEvent.change(title, { target: { value: 'Revised launch' } })
    fireEvent.blur(title)
    expect(await within(pane).findByRole('alert')).toHaveTextContent('Could not save title')
    expect(title).toHaveValue('Review launch')
    expect(screen.getByRole('textbox', { name: 'Task title for Review launch' })).toHaveValue('Review launch')

    fireEvent.change(title, { target: { value: 'Revised launch' } })
    fireEvent.blur(title)
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Task title for Revised launch' })).toHaveValue('Revised launch'))
    expect(saves).toBe(2)
    expect(title).toHaveValue('Revised launch')
  })

  it('opens the same task pane with its date, instructions, links and comments without losing week selection', async () => {
    render(<TeamTasksSpreadsheet />)
    fireEvent.change(await screen.findByRole('combobox', { name: 'Weeks' }), { target: { value: 'all' } })
    const open = await screen.findByRole('button', { name: 'Open details for Review launch' })
    fireEvent.click(open)

    const pane = await screen.findByRole('complementary', { name: 'Task details' })
    expect(within(pane).getByRole('textbox', { name: 'Task title' })).toHaveValue('Review launch')
    expect(within(pane).getByLabelText('Task date')).toHaveValue('2026-09-24')
    expect(within(pane).getByText('Prepare the weekly brief.')).toBeInTheDocument()
    expect(within(pane).getByText('Campaign brief')).toBeInTheDocument()
    expect(within(pane).getByText('Ready for review.')).toBeInTheDocument()
    fireEvent.click(within(pane).getByRole('button', { name: 'Close task details' }))
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Task details' })).not.toBeInTheDocument())
    expect(screen.getByRole('combobox', { name: 'Weeks' })).toHaveValue('all')
  })
})
