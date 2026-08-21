import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import TaskMateChat from '@/components/TaskMateChat'

vi.mock('@/components/OptiMateTranscribe', () => ({
  default: ({ onTranscript }: { onTranscript: (text: string) => void }) => <button type="button" onClick={() => onTranscript('dictated task')}>Dictate</button>,
}))

const staged = {
  weekStart: '2026-08-17',
  tasks: [{ title: 'SEO review', clientId: '1', clientName: 'Acme', taskType: 'seo', priority: 'normal', dueDate: '2026-08-19', instructions: 'Review rankings' }],
}
const clients = [{ id: '1', name: 'Acme' }, { id: '2', name: 'Beta' }]
const users = [{ id: '7', name: 'Alex' }, { id: '8', name: 'Sam' }]
const response = (body: unknown, ok = true) => ({ ok, json: async () => body })

describe('TaskMateChat', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('inserts speech, stages review, applies client correction, and prevents duplicate assignment', async () => {
    let resolveAssign: ((value: ReturnType<typeof response>) => void) | undefined
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/optimate/taskmate/chat' && !init) return Promise.resolve(response({ clients, users }))
      if (url === '/api/optimate/taskmate/chat') return Promise.resolve(response({ reply: 'Review it.', stagedTaskList: staged, clients, users }))
      if (url === '/api/optimate/taskmate/assign') return new Promise((resolve) => { resolveAssign = resolve })
      throw new Error(`Unexpected fetch ${url}`)
    })
    const assigned = vi.fn()
    window.addEventListener('optimate:taskmate-assigned', assigned)
    render(<TaskMateChat />)

    fireEvent.click(screen.getByRole('button', { name: 'Dictate' }))
    expect(screen.getByLabelText('Message TaskMate')).toHaveValue('dictated task')
    fireEvent.click(screen.getByRole('button', { name: 'Generate task list' }))
    expect(await screen.findByRole('button', { name: 'Assign 1 task' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Client for SEO review'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Assignee for SEO review'), { target: { value: '8' } })
    const assignButton = screen.getByRole('button', { name: 'Assign 1 task' })
    fireEvent.click(assignButton)
    fireEvent.click(assignButton)
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/optimate/taskmate/assign')).toHaveLength(1)
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/optimate/taskmate/assign')
    expect(JSON.parse(call?.[1]?.body as string).tasks[0]).toMatchObject({ clientId: '2', assignedToId: '8' })

    resolveAssign?.(response({ count: 1, ids: [10] }))
    expect(await screen.findByText('1 task assigned.')).toBeInTheDocument()
    expect(assigned).toHaveBeenCalledTimes(1)
    window.removeEventListener('optimate:taskmate-assigned', assigned)
  })

  it('preserves an uncommitted review after assignment failure', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/optimate/taskmate/chat' && !init) return Promise.resolve(response({ clients: [clients[0]], users }))
      if (url === '/api/optimate/taskmate/chat') return Promise.resolve(response({ reply: 'Review it.', stagedTaskList: staged, clients: [clients[0]], users }))
      return Promise.resolve(response({ error: 'Rolled back' }, false))
    })
    render(<TaskMateChat />)
    fireEvent.click(screen.getByRole('button', { name: 'Generate task list' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Assign 1 task' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Rolled back')
    expect(screen.getByLabelText('Task list review')).toBeInTheDocument()
  })
})
