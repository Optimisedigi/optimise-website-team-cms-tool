import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import TeamTasksSpreadsheet from '@/components/TeamTasksSpreadsheet'

vi.mock('@/components/TeamTaskDetailPane', () => ({
  default: () => null,
}))

describe('TeamTasksSpreadsheet permissions', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lets default team-tasks users use task dropdowns without manager access', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        tasks: [
          {
            id: 123,
            title: 'Review task responses',
            client: 1,
            taskType: 'blog_post',
            status: 'in_progress',
            priority: 'normal',
            assignedTo: 10,
            dueDate: '2026-06-15T00:00:00.000Z',
            instructions: 'Check Trello responses',
          },
        ],
        clients: [{ id: 1, name: 'Berendsen', slug: 'berendsen' }],
        users: [{ id: 10, name: 'Lorenzo', email: 'lorenzo@example.com' }],
        canEditTaskFields: true,
        canManage: false,
      }),
    } as Response)

    render(<TeamTasksSpreadsheet />)

    const existingClient = await screen.findByDisplayValue('Berendsen')
    const existingTaskType = screen.getByDisplayValue('Blog Post')
    const existingAssignee = screen.getByDisplayValue('Lorenzo')

    expect(existingClient).toBeEnabled()
    expect(existingTaskType).toBeEnabled()
    expect(existingAssignee).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Edit schedule for Review task responses' })).toBeVisible()

    await waitFor(() => {
      expect(screen.queryByTitle('Delete row')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Delete empty week' })).not.toBeInTheDocument()
    })
  })

  it('keeps client, task type, and title edits after the save endpoint responds', async () => {
    let task = {
      id: 321,
      title: 'New task',
      client: null as number | null,
      taskType: 'blog_post',
      status: 'in_progress',
      priority: 'normal',
      assignedTo: 10,
      dueDate: '2026-06-15T00:00:00.000Z',
      instructions: '',
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      if (init?.method === 'PATCH') {
        const update = JSON.parse(String(init.body)) as Partial<typeof task>
        task = { ...task, ...update }
        return { ok: true, json: async () => ({ task: { ...task } }) } as Response
      }

      return {
        ok: true,
        json: async () => ({
          tasks: [{ ...task }],
          clients: [
            { id: 7, name: 'Acme', slug: 'acme' },
            { id: 8, name: 'Beacon', slug: 'beacon' },
          ],
          users: [{ id: 10, name: 'Lorenzo', email: 'lorenzo@example.com' }],
          canEditTaskFields: true,
          canManage: false,
        }),
      } as Response
    })

    render(<TeamTasksSpreadsheet />)

    const title = await screen.findByDisplayValue('New task')
    const row = title.closest('tr')
    expect(row).not.toBeNull()
    const rowQueries = within(row!)
    const client = rowQueries.getByDisplayValue('—')
    const taskType = rowQueries.getByDisplayValue('Blog Post')

    fireEvent.change(client, { target: { value: '7' } })
    await waitFor(() => expect(client).toHaveValue('7'))

    fireEvent.change(taskType, { target: { value: 'seo' } })
    await waitFor(() => expect(taskType).toHaveValue('seo'))

    fireEvent.change(title, { target: { value: 'Publish weekly landing page' } })
    fireEvent.blur(title)
    await waitFor(() => expect(title).toHaveValue('Publish weekly landing page'))

    const date = screen.getByLabelText('Task date for Publish weekly landing page')
    fireEvent.change(date, { target: { value: '2026-06-23' } })
    await waitFor(() => expect(date).toHaveValue('2026-06-23'))

    const patchBodies = fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'PATCH')
      .map(([, init]) => JSON.parse(String(init?.body)))
    expect(patchBodies).toEqual([
      { id: 321, client: '7' },
      { id: 321, taskType: 'seo' },
      { id: 321, title: 'Publish weekly landing page' },
      { id: 321, dueDate: '2026-06-23' },
    ])
    expect(fetchMock.mock.calls.filter(([, init]) => !init?.method)).toHaveLength(1)
    expect(screen.queryByText('Loading tasks…')).not.toBeInTheDocument()
  })

  it('keeps the week column merged while each task has its own editable date', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        tasks: [
          { id: 1, title: 'Monday task', dueDate: '2026-08-17T00:00:00.000Z', status: 'in_progress', taskType: 'seo' },
          { id: 2, title: 'Tuesday task', dueDate: '2026-08-18T00:00:00.000Z', status: 'in_progress', taskType: 'seo' },
        ],
        clients: [],
        users: [],
        canEditTaskFields: true,
        canManage: false,
      }),
    } as Response)

    const { container } = render(<TeamTasksSpreadsheet />)

    expect(await screen.findByLabelText('Task date for Monday task')).toHaveValue('2026-08-17')
    expect(screen.getByLabelText('Task date for Tuesday task')).toHaveValue('2026-08-18')
    expect(container.querySelector('td[rowspan="2"]')).toBeInTheDocument()
  })

  it('deletes an accidentally added week only while its placeholder is untouched', async () => {
    let tasks = [{
      id: 654,
      title: 'New task',
      client: null,
      taskType: 'blog_post',
      status: 'in_progress',
      priority: 'normal',
      assignedTo: null,
      dueDate: '2026-08-17T00:00:00.000Z',
      instructions: '',
      staffNotes: '',
      reviewNotes: '',
    }]
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      if (init?.method === 'DELETE') {
        tasks = []
        return { ok: true, json: async () => ({ ok: true }) } as Response
      }
      return {
        ok: true,
        json: async () => ({
          tasks,
          clients: [],
          users: [],
          canEditTaskFields: true,
          canManage: false,
        }),
      } as Response
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<TeamTasksSpreadsheet />)

    const removeWeek = await screen.findByRole('button', { name: 'Delete empty week' })
    fireEvent.click(removeWeek)

    await waitFor(() => expect(screen.queryByDisplayValue('New task')).not.toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith('/api/team-tasks/grid?id=654', { method: 'DELETE' })
  })
})
