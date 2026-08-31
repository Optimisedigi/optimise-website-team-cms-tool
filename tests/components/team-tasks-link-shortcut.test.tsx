import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import TeamTasksSpreadsheet from '@/components/TeamTasksSpreadsheet'

const gridBody = {
  tasks: [{ id: 1, title: 'write audit', priority: 'normal', taskType: 'blog_post', status: 'in_progress', dueDate: '2026-08-26', instructions: 'See the brief' }],
  clients: [],
  users: [],
  canManage: true,
  canEditTaskFields: true,
}

describe('Cmd/Ctrl+K link shortcut in task notes', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, init?: RequestInit) => Promise.resolve({
      ok: true,
      json: async () => init?.method === 'PATCH'
        ? { task: { ...gridBody.tasks[0], ...JSON.parse(String(init.body)) } }
        : gridBody,
    })))
  })

  it('links the selected note text and saves it as an anchor', async () => {
    vi.stubGlobal('prompt', vi.fn().mockReturnValue('optimisedigital.online/brief'))
    const { container } = render(<TeamTasksSpreadsheet />)
    await screen.findByDisplayValue('write audit')

    const notes = container.querySelector('[contenteditable]') as HTMLElement
    expect(notes.textContent).toContain('See the brief')

    const range = document.createRange()
    range.selectNodeContents(notes)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)

    fireEvent.keyDown(notes, { key: 'k', metaKey: true })

    const anchor = notes.querySelector('a') as HTMLAnchorElement
    expect(anchor).toBeTruthy()
    expect(anchor.getAttribute('href')).toBe('https://optimisedigital.online/brief')
    expect(anchor.textContent).toContain('See the brief')

    // Saving keeps the anchor rather than flattening it back to a raw url.
    fireEvent.blur(notes)
    await waitFor(() => {
      const patches = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([, init]: any[]) => init?.method === 'PATCH')
      expect(patches.length).toBe(1)
      expect(JSON.parse(patches[0][1].body).instructions).toContain('href="https://optimisedigital.online/brief"')
    })
  })
})
