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

    const patchBodies = fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'PATCH')
      .map(([, init]) => JSON.parse(String(init?.body)))
    expect(patchBodies).toEqual([
      { id: 321, client: '7' },
      { id: 321, taskType: 'seo' },
      { id: 321, title: 'Publish weekly landing page' },
    ])
    expect(fetchMock.mock.calls.filter(([, init]) => !init?.method)).toHaveLength(1)
    expect(screen.queryByText('Loading tasks…')).not.toBeInTheDocument()
  })
})
