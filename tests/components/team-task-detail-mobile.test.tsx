import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import TeamTaskDetailPane from '@/components/TeamTaskDetailPane'

const detail = {
  task: { id: 1, title: 'Google Ads audit', status: 'in_progress', relatedLinks: [], screenshots: [] },
  comments: [{ id: 2, author: { id: 3, name: 'Lorenzo' }, body: 'Please check the campaign', createdAt: '2026-09-19T12:00:00Z' }],
  users: [{ id: 3, name: 'Lorenzo' }],
  currentUser: { id: 3, name: 'Lorenzo' },
  canManage: true,
}

describe('team task detail on narrow screens', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => detail }))
  })

  it('shows a failed comment inside the open drawer and keeps the text for retry', async () => {
    let posts = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/team-tasks/1/detail') return { ok: true, json: async () => detail }
      if (url === '/api/team-tasks/1/comments' && init?.method === 'POST') {
        posts++
        if (posts === 1) return { ok: false, json: async () => ({ error: 'Could not post comment' }) }
        return { ok: true, json: async () => ({ comment: { id: 4, body: 'My update', author: { id: 3, name: 'Lorenzo' } } }) }
      }
      throw new Error(`Unexpected request: ${url}`)
    }))

    render(<TeamTaskDetailPane taskId={1} onClose={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Comments (1)' }))
    const dialog = screen.getByRole('dialog', { name: 'Comments and activity' })
    const input = screen.getByPlaceholderText('Write a comment… type @ to mention someone')
    fireEvent.change(input, { target: { value: 'My update' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Comment' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Could not post comment')
    expect(input).toHaveValue('My update')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Comment' }))
    expect(await within(dialog).findByText('My update')).toBeInTheDocument()
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
    expect(posts).toBe(2)
  })

  it('keeps an opaque surface and lets the comments drawer open and return by button or Escape', async () => {
    const onClose = vi.fn()
    render(<TeamTaskDetailPane taskId={1} onClose={onClose} />)

    const commentsButton = await screen.findByRole('button', { name: 'Comments (1)' })
    const pane = screen.getByLabelText('Task details')
    expect(pane).toHaveStyle({ background: 'var(--theme-elevation-0, #fff)' })
    const comments = screen.getByRole('region', { name: 'Comments and activity' })
    expect(comments).toHaveClass('od-team-task-comments-panel')
    expect(commentsButton).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(commentsButton)
    expect(comments).toHaveClass('is-open')
    expect(screen.getByRole('dialog', { name: 'Comments and activity' })).toHaveAttribute('aria-modal', 'true')
    expect(commentsButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Please check the campaign')).toBeInTheDocument()
    const back = screen.getByRole('button', { name: 'Back to task details' })
    expect(back).toHaveFocus()
    const commentInput = screen.getByPlaceholderText('Write a comment… type @ to mention someone')
    commentInput.focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(back).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(commentInput).toHaveFocus()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(comments).not.toHaveClass('is-open')
    expect(commentsButton).toHaveFocus()
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(commentsButton)
    fireEvent.click(screen.getByRole('button', { name: 'Back to task details' }))
    expect(comments).not.toHaveClass('is-open')
    expect(commentsButton).toHaveFocus()
  })
})
