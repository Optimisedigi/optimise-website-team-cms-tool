import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import TeamTasksSpreadsheet from '@/components/TeamTasksSpreadsheet'

const task = (id: number, title: string, priority: string) => ({
  id, title, priority, taskType: 'blog_post', status: 'in_progress', dueDate: '2026-08-26',
})

const gridBody = {
  tasks: [task(1, 'plain', 'normal'), task(2, 'starred', 'high'), task(3, 'top', 'urgent')],
  clients: [], users: [], canManage: true, canEditTaskFields: true,
}

describe('Team Tasks priority stars', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => Promise.resolve({
      ok: true,
      json: async () => init?.method === 'PATCH'
        ? { task: { ...gridBody.tasks[0], ...JSON.parse(String(init.body)) } }
        : gridBody,
    }))
    vi.stubGlobal('fetch', fetchMock)
  })

  it('orders urgent then high then normal within the week', async () => {
    render(<TeamTasksSpreadsheet />)
    const titles = await screen.findAllByRole('textbox')
    expect(titles.map((el) => (el as HTMLTextAreaElement).value)).toEqual(['top', 'starred', 'plain'])
  })

  it('cycles priority none -> high -> urgent -> none on click', async () => {
    render(<TeamTasksSpreadsheet />)
    const star = await screen.findByRole('button', { name: 'Change priority for plain' })
    expect(star.getAttribute('title')).toBe('Set priority')
    fireEvent.click(star)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/team-tasks/grid', expect.objectContaining({ method: 'PATCH' })))
    const patched = (body: string) => JSON.parse(body)
    const bodies = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH').map(([, init]) => patched(init.body))
    expect(bodies[0]).toMatchObject({ id: 1, priority: 'high' })

    await waitFor(() => expect(star.getAttribute('title')).toBe('Priority — click for top priority'))
    fireEvent.click(star)
    await waitFor(() => expect(star.getAttribute('title')).toBe('Top priority — click to clear'))
    fireEvent.click(star)
    await waitFor(() => {
      const all = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH').map(([, init]) => patched(init.body))
      expect(all.map((b) => b.priority)).toEqual(['high', 'urgent', 'normal'])
    })
  })

  it('renames the add-task action and keeps add week available', async () => {
    render(<TeamTasksSpreadsheet />)
    expect(await screen.findByRole('button', { name: 'Add task this week' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '+ Add week' })).toBeTruthy()
  })
})
