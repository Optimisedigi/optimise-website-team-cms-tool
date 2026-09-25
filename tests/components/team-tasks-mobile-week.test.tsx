import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import TeamTasksSpreadsheet from '@/components/TeamTasksSpreadsheet'

const tasks = [
  { id: 1, title: 'Spring campaign', dueDate: '2026-09-21', status: 'in_progress', priority: 'normal', taskType: 'blog_post', client: 2, assignedTo: 3, instructions: '<p>Keep existing notes</p>' },
  { id: 2, title: 'Audit report', dueDate: '2026-09-24', status: 'ready_for_review', priority: 'urgent', taskType: 'blog_post', instructions: 'Check figures' },
  { id: 3, title: 'Next sprint', dueDate: '2026-09-28', status: 'not_started', priority: 'normal', taskType: 'blog_post' },
]
const clients = [{ id: 2, name: 'Acme Corp' }]
const users = [{ id: 3, name: 'Lorenzo' }]

function response(body: unknown) {
  return { ok: true, json: async () => body }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-25T12:00:00Z'))
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: query === '(max-width: 768px)', media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('mobile weekly team tasks', () => {
  it('keeps multiple dates and complete task summaries in combined weekly sections', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ tasks, clients, users, canEditTaskFields: true, canManage: true })))
    render(<TeamTasksSpreadsheet />)

    const week = await screen.findByRole('region', { name: 'Week 21 – 27 September' })
    expect(within(week).getAllByRole('article')).toHaveLength(2)
    expect(within(week).getByText('Audit report').closest('article')).toBe(within(week).getAllByRole('article')[0])
    expect(within(week).getByText('24 Sept 2026')).toBeInTheDocument()
    expect(within(week).getByText('21 Sept 2026')).toBeInTheDocument()
    expect(within(week).getAllByText('Acme Corp').map((element) => element.tagName)).toContain('DD')
    expect(within(week).getByText('Lorenzo')).toBeInTheDocument()
    expect(within(week).getByText('Keep existing notes')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Week 28 Sept – 4 Oct' })).toHaveTextContent('Next sprint')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add task this week' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Add week' })).toBeInTheDocument()
  })

  it('keeps the week filters and editing permissions on mobile', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ tasks, clients, users, canEditTaskFields: false, canManage: false }))
    vi.stubGlobal('fetch', fetchMock)
    render(<TeamTasksSpreadsheet />)

    await screen.findByRole('region', { name: 'Week 21 – 27 September' })
    fireEvent.change(screen.getByLabelText('Weeks'), { target: { value: 'all' } })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('weekStart=all')))
    const week = await screen.findByRole('region', { name: 'Week 21 – 27 September' })
    expect(within(week).getByText('Spring campaign')).toBeInTheDocument()
    const card = within(week).getByText('Spring campaign').closest('article') as HTMLElement
    fireEvent.click(within(card).getByText('Quick edit'))
    expect(within(card).getByRole('combobox', { name: 'Client' })).toBeDisabled()
    expect(within(card).getByRole('combobox', { name: 'Task type' })).toBeDisabled()
    expect(within(card).getByRole('button', { name: 'Change priority for Spring campaign' })).toBeDisabled()
    expect(within(card).queryByRole('button', { name: 'Delete task' })).not.toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Open details for Spring campaign' })).toBeEnabled()
  })

  it('keeps client, type and priority edits available to editors on the mobile cards', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => response(init?.method === 'PATCH'
      ? { task: { ...tasks.find((task) => task.id === JSON.parse(String(init.body)).id), ...JSON.parse(String(init.body)) } }
      : { tasks, clients, users, canEditTaskFields: true, canManage: true }))
    vi.stubGlobal('fetch', fetchMock)
    render(<TeamTasksSpreadsheet />)
    const week = await screen.findByRole('region', { name: 'Week 21 – 27 September' })
    const card = within(week).getByText('Spring campaign').closest('article') as HTMLElement
    fireEvent.click(within(card).getByText('Quick edit'))
    fireEvent.change(within(card).getByRole('combobox', { name: 'Client' }), { target: { value: '' } })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/team-tasks/grid', expect.objectContaining({
      method: 'PATCH', body: JSON.stringify({ id: 1, client: '' }),
    })))
    fireEvent.change(within(card).getByRole('combobox', { name: 'Task type' }), { target: { value: 'email' } })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/team-tasks/grid', expect.objectContaining({
      method: 'PATCH', body: JSON.stringify({ id: 1, taskType: 'email' }),
    })))
    fireEvent.click(within(card).getByRole('button', { name: 'Change priority for Spring campaign' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/team-tasks/grid', expect.objectContaining({
      method: 'PATCH', body: JSON.stringify({ id: 1, priority: 'high' }),
    })))
    expect(screen.getByRole('region', { name: 'Week 21 – 27 September' })).toHaveTextContent('Spring campaign')
  })

  it('restores a failed mobile quick edit and shows why it failed', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'PATCH'
      ? { ok: false, json: async () => ({ error: 'Could not save client' }) }
      : response({ tasks, clients, users, canEditTaskFields: true, canManage: true }))
    vi.stubGlobal('fetch', fetchMock)
    render(<TeamTasksSpreadsheet />)
    const week = await screen.findByRole('region', { name: 'Week 21 – 27 September' })
    const card = within(week).getByText('Spring campaign').closest('article') as HTMLElement
    fireEvent.click(within(card).getByText('Quick edit'))
    fireEvent.change(within(card).getByRole('combobox', { name: 'Client' }), { target: { value: '' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save client')
    expect(screen.getByRole('region', { name: 'Week 21 – 27 September' })).toHaveTextContent('Acme Corp')
  })

  it('adds the next globally empty week and focuses it without leaving the combined weekly view', async () => {
    const created = { id: 4, title: 'New task', dueDate: '2026-10-05', status: 'in_progress', priority: 'normal', taskType: 'blog_post' }
    let allTasks = [...tasks]
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toMatchObject({ dueDate: '2026-10-05' })
        allTasks = [...allTasks, created]
        return response({ task: created })
      }
      const params = new URL(url, 'http://localhost').searchParams
      const week = params.get('weekStart')
      const visible = allTasks.filter((task) => (week === 'all' || task.dueDate === week)
        && (!params.get('client') || String('client' in task ? task.client : '') === params.get('client')))
      return response({ tasks: visible, clients, users, canEditTaskFields: true, canManage: true })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<TeamTasksSpreadsheet />)
    await screen.findByRole('region', { name: 'Week 21 – 27 September' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter tasks by client' }), { target: { value: '2' } })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('client=2')))
    await screen.findByRole('button', { name: '+ Add week' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter tasks by status' }), { target: { value: 'completed' } })
    await screen.findByRole('button', { name: '+ Add week' })
    fireEvent.click(screen.getByRole('button', { name: '+ Add week' }))

    await waitFor(() => expect(screen.getByRole('region', { name: 'Week 5 – 11 October' })).toHaveTextContent('New task'))
    expect(screen.getByRole('combobox', { name: 'Weeks' })).toHaveValue('week')
    expect(screen.getByLabelText('Week')).toHaveValue('2026-10-05')
    expect(screen.getByRole('combobox', { name: 'Filter tasks by client' })).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Filter tasks by status' })).toHaveValue('all')
    expect(fetchMock).toHaveBeenCalledWith('/api/team-tasks/grid?status=all&weekStart=all')
    expect(fetchMock).toHaveBeenCalledWith('/api/team-tasks/grid?status=all&weekStart=2026-10-05')
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
  })

  it('ignores a stale filtered response after the filters change', async () => {
    let finishStale: ((value: ReturnType<typeof response>) => void) | undefined
    const fetchMock = vi.fn((url: string) => {
      const client = new URL(url, 'http://localhost').searchParams.get('client')
      if (client === '2') return new Promise<ReturnType<typeof response>>((resolve) => { finishStale = resolve })
      return Promise.resolve(response({ tasks, clients, users, canEditTaskFields: true, canManage: true }))
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<TeamTasksSpreadsheet />)
    await screen.findByRole('region', { name: 'Week 21 – 27 September' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter tasks by client' }), { target: { value: '2' } })
    await waitFor(() => expect(finishStale).toBeTypeOf('function'))
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter tasks by client' }), { target: { value: '' } })
    await screen.findByText('Audit report')

    await act(async () => { finishStale?.(response({ tasks: [tasks[0]], clients, users, canEditTaskFields: true, canManage: true })) })
    expect(screen.getByText('Audit report')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Filter tasks by client' })).toHaveValue('')
  })

  it('checks a candidate week even when the all-weeks result omits its tasks', async () => {
    const created = { id: 4, title: 'New task', dueDate: '2026-10-05', status: 'in_progress', priority: 'normal', taskType: 'blog_post' }
    let saved = false
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toMatchObject({ dueDate: '2026-10-05' })
        saved = true
        return response({ task: created })
      }
      const week = new URL(url, 'http://localhost').searchParams.get('weekStart')
      const visible = week === 'all' ? [tasks[0]] : [...tasks, ...(saved ? [created] : [])].filter((task) => task.dueDate === week)
      return response({ tasks: visible, clients, users, canEditTaskFields: true, canManage: true })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<TeamTasksSpreadsheet />)
    await screen.findByRole('button', { name: '+ Add week' })
    fireEvent.click(screen.getByRole('button', { name: '+ Add week' }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'Week 5 – 11 October' })).toHaveTextContent('New task'))
    expect(fetchMock).toHaveBeenCalledWith('/api/team-tasks/grid?status=all&weekStart=2026-09-28')
  })

  it('shows a newly created week even when it is the week already selected', async () => {
    const created = { id: 4, title: 'New task', dueDate: '2026-09-21', status: 'in_progress', priority: 'normal', taskType: 'blog_post' }
    let allTasks: typeof created[] = []
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        allTasks = [created]
        return response({ task: created })
      }
      return response({ tasks: allTasks, clients, users, canEditTaskFields: true, canManage: true })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<TeamTasksSpreadsheet />)
    await screen.findByRole('button', { name: '+ Add week' })
    fireEvent.click(screen.getByRole('button', { name: '+ Add week' }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'Week 21 – 27 September' })).toHaveTextContent('New task'))
    expect(screen.getByRole('combobox', { name: 'Weeks' })).toHaveValue('week')
  })

  it('keeps the chosen week and filters when adding a week fails, then allows a retry', async () => {
    const created = { id: 4, title: 'New task', dueDate: '2026-10-05', status: 'in_progress', priority: 'normal', taskType: 'blog_post' }
    let attempts = 0
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        attempts += 1
        return attempts === 1
          ? { ok: false, json: async () => ({ error: 'Could not add week' }) }
          : response({ task: created })
      }
      const week = new URL(_url, 'http://localhost').searchParams.get('weekStart')
      const visible = (attempts === 2 ? [...tasks, created] : tasks).filter((task) => week === 'all' || task.dueDate === week)
      return response({ tasks: visible, clients, users, canEditTaskFields: true, canManage: true })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<TeamTasksSpreadsheet />)
    await screen.findByRole('region', { name: 'Week 21 – 27 September' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter tasks by client' }), { target: { value: '2' } })
    await screen.findByRole('button', { name: '+ Add week' })
    fireEvent.click(screen.getByRole('button', { name: '+ Add week' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not add week')
    expect(screen.getByRole('combobox', { name: 'Weeks' })).toHaveValue('week')
    expect(screen.getByLabelText('Week')).toHaveValue('2026-09-21')
    expect(screen.getByRole('combobox', { name: 'Filter tasks by client' })).toHaveValue('2')
    expect(screen.queryByRole('region', { name: 'Week 5 – 11 October' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '+ Add week' }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'Week 5 – 11 October' })).toHaveTextContent('New task'))
    expect(attempts).toBe(2)
  })

  it('keeps the selected-week filter when a task moves, while retaining it in the combined all-weeks view', async () => {
    let movedTask = tasks[0]
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/team-tasks/grid?')) {
        const week = new URL(url, 'http://localhost').searchParams.get('weekStart')
        const visible = [movedTask, ...tasks.slice(1)].filter((task) => week === 'all' || task.dueDate >= '2026-09-21' && task.dueDate < '2026-09-28')
        return response({ tasks: visible, clients, users, canEditTaskFields: true, canManage: true })
      }
      if (url === '/api/team-tasks/1/detail' && init?.method === 'PATCH') {
        movedTask = { ...movedTask, ...JSON.parse(String(init.body)) }
        return response({ task: movedTask })
      }
      if (url === '/api/team-tasks/1/detail') return response({
        task: { ...tasks[0], relatedLinks: [{ label: 'Brief', url: 'https://example.com/brief' }], screenshots: [] },
        comments: [{ id: 8, author: { id: 3, name: 'Lorenzo' }, body: 'Existing comment' }],
        users, currentUser: users[0], canManage: true,
      })
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<TeamTasksSpreadsheet />)

    const week = await screen.findByRole('region', { name: 'Week 21 – 27 September' })
    fireEvent.click(within(week).getByRole('button', { name: 'Open details for Spring campaign' }))
    const date = await screen.findByLabelText('Task date')
    expect(date).toHaveValue('2026-09-21')
    expect(screen.getByText('Brief')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Comments (1)' }))
    expect(screen.getByRole('dialog', { name: 'Comments and activity' })).toHaveTextContent('Existing comment')
    fireEvent.click(screen.getByRole('button', { name: 'Back to task details' }))
    fireEvent.change(date, { target: { value: '2026-09-28' } })

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open details for Spring campaign' })).not.toBeInTheDocument())
    expect(screen.getByRole('combobox', { name: 'Weeks' })).toHaveValue('week')
    expect(screen.getByLabelText('Week')).toHaveValue('2026-09-21')
    fireEvent.change(screen.getByRole('combobox', { name: 'Weeks' }), { target: { value: 'all' } })
    await waitFor(() => expect(screen.getByRole('region', { name: 'Week 28 Sept – 4 Oct' })).toHaveTextContent('Spring campaign'))
    expect(fetchMock).toHaveBeenCalledWith('/api/team-tasks/1/detail', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ dueDate: '2026-09-28' }) }))
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
  })
})
