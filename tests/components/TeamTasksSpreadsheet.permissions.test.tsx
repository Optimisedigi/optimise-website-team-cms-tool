import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
    const [existingTaskType, draftTaskType] = screen.getAllByDisplayValue('Blog Post')
    const existingAssignee = screen.getByDisplayValue('Lorenzo')
    const draftClient = screen.getByDisplayValue('Client')
    const draftAssignee = screen.getByDisplayValue('Unassigned')

    expect(existingClient).toBeEnabled()
    expect(existingTaskType).toBeEnabled()
    expect(existingAssignee).toBeEnabled()
    expect(draftClient).toBeEnabled()
    expect(draftTaskType).toBeEnabled()
    expect(draftAssignee).toBeEnabled()

    await waitFor(() => {
      expect(screen.queryByTitle('Delete row')).not.toBeInTheDocument()
    })
  })
})
