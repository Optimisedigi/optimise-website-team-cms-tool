import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import TaskMateChat from '@/components/TaskMateChat'

vi.mock('@/components/TaskMateLiveVoice', () => ({
  default: ({ onTurn, onActiveChange }: { onTurn: (role: 'user' | 'assistant', text: string) => void; onActiveChange: (active: boolean) => void }) => <>
    <button type="button" onClick={() => onActiveChange(true)}>Start live call</button>
    <button type="button" onClick={() => { onTurn('user', 'SEO review for Acme next week'); onTurn('assistant', 'I have noted the SEO review.'); onTurn('user', 'PPC check for Beta on Friday'); onActiveChange(false) }}>End live call</button>
  </>,
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

  it('captures live conversation, waits for call end, stages review, and prevents duplicate assignment', async () => {
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

    const generate = screen.getByRole('button', { name: 'Generate task list' })
    expect(generate).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Start live call' }))
    expect(generate).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'End live call' }))
    expect(screen.getByText('SEO review for Acme next week')).toBeInTheDocument()
    fireEvent.click(generate)
    await waitFor(() => {
      const body = JSON.parse(fetchMock.mock.calls.find(([url, init]) => url === '/api/optimate/taskmate/chat' && init)?.[1]?.body as string)
      expect(body.history).toEqual([
        { role: 'user', content: 'SEO review for Acme next week' },
        { role: 'assistant', content: 'I have noted the SEO review.' },
        { role: 'user', content: 'PPC check for Beta on Friday' },
      ])
      expect(body.message).toContain('SEO review for Acme next week')
      expect(body.message).toContain('PPC check for Beta on Friday')
    })
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

  it('generates one review list from a conversation longer than the API message limit', async () => {
    sessionStorage.setItem('optimate:taskmate', JSON.stringify({ messages: [
      { role: 'user', content: `SEO review for Acme next week. ${'detail '.repeat(630)}` },
      { role: 'user', content: `PPC check for Beta next week. ${'context '.repeat(630)}` },
    ] }))
    let portion = 0
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (!init) return Promise.resolve(response({ clients, users }))
      const body = JSON.parse(String(init.body))
      expect(body.message.length).toBeLessThanOrEqual(8000)
      expect(body.history).toEqual([])
      portion += 1
      return Promise.resolve(response({ stagedTaskList: {
        weekStart: '2026-08-17',
        tasks: [{ ...staged.tasks[0], title: portion === 1 ? 'SEO review' : 'PPC check' }],
      } }))
    })
    render(<TaskMateChat />)
    fireEvent.click(await screen.findByRole('button', { name: 'Generate task list' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Assign 2 tasks' })).toBeInTheDocument())
    expect(fetchMock.mock.calls.filter(([url, init]) => url === '/api/optimate/taskmate/chat' && init)).toHaveLength(2)
    expect(screen.getByText('SEO review')).toBeInTheDocument()
    expect(screen.getByText('PPC check')).toBeInTheDocument()
  })

  it('keeps the speaker label when one spoken turn spans multiple portions', async () => {
    sessionStorage.setItem('optimate:taskmate', JSON.stringify({ messages: [
      { role: 'user', content: `Plan the SEO work for Acme next week. ${'more detail '.repeat(820)}` },
    ] }))
    const prompts: string[] = []
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (!init) return Promise.resolve(response({ clients, users }))
      prompts.push(JSON.parse(String(init.body)).message)
      return Promise.resolve(response({ stagedTaskList: staged }))
    })
    render(<TaskMateChat />)
    fireEvent.click(await screen.findByRole('button', { name: 'Generate task list' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Assign 1 task' })).toBeInTheDocument())
    expect(prompts.length).toBeGreaterThan(1)
    expect(prompts[1]).toContain('Admin (continued):')
  })

  it('preserves an uncommitted review after assignment failure', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/optimate/taskmate/chat' && !init) return Promise.resolve(response({ clients: [clients[0]], users }))
      if (url === '/api/optimate/taskmate/chat') return Promise.resolve(response({ reply: 'Review it.', stagedTaskList: staged, clients: [clients[0]], users }))
      return Promise.resolve(response({ error: 'Rolled back' }, false))
    })
    render(<TaskMateChat />)
    fireEvent.change(screen.getByLabelText('Message TaskMate'), { target: { value: 'SEO review for Acme' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText('Review it.')
    fireEvent.click(screen.getByRole('button', { name: 'Generate task list' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Assign 1 task' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Rolled back')
    expect(screen.getByLabelText('Task list review')).toBeInTheDocument()
  })
})
