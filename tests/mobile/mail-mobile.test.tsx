import React from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@/components/mail/ComposeWindow', () => ({ default: () => <div data-testid="compose" /> }))
vi.mock('@/components/mail/EmailBody', () => ({ default: () => <div /> }))
vi.mock('@payloadcms/ui', () => ({ useStepNav: () => ({ setStepNav: vi.fn(), stepNav: [] }) }))

import MailApp from '@/components/mail/MailApp'

const thread = {
  threadId: 't1', messageId: 'm1', from: 'Jo Smith <jo@x.com>', to: 'me@x.com', subject: 'Hello there',
  snippet: 'snippet', date: new Date().toISOString(), unread: false, messageCount: 1, client: null,
}
const message = {
  ...thread, cc: '', body: 'Body text', html: '', stored: null, match: null,
}

function setViewport(mobile: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: mobile && /max-width/.test(query),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

function mockFetch() {
  global.fetch = vi.fn(async (url: string) => {
    const body = url.startsWith('/api/mail/inbox')
      ? { threads: [thread], nextPageToken: null, account: 'me@x.com' }
      : url.startsWith('/api/mail/thread/')
        ? { messages: [message] }
        : url.startsWith('/api/mail/counts')
          ? { inboxUnread: 0, drafts: 0 }
          : {}
    return { ok: true, json: async () => body } as Response
  }) as unknown as typeof fetch
}

describe('MailApp on a phone', () => {
  beforeEach(() => mockFetch())
  afterEach(() => vi.restoreAllMocks())

  it('opens the email in a full-screen panel with a back button and a sticky reply bar', async () => {
    setViewport(true)
    render(<MailApp clients={[]} />)
    fireEvent.click(await screen.findByText('Hello there'))

    const reader = screen.getByTestId('mail-reader')
    await waitFor(() => expect(reader.className).toMatch(/readerOpen/))
    expect(await screen.findByTestId('mail-reply-bar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to inbox' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Back to inbox' }))
    await waitFor(() => expect(reader.className).not.toMatch(/readerOpen/))
    expect(screen.queryByTestId('mail-reply-bar')).toBeNull()
  })

  it('closes the open email on a swipe right', async () => {
    setViewport(true)
    render(<MailApp clients={[]} />)
    fireEvent.click(await screen.findByText('Hello there'))
    const reader = screen.getByTestId('mail-reader')
    await waitFor(() => expect(reader.className).toMatch(/readerOpen/))
    const pt = (x: number, y: number) => ({ clientX: x, clientY: y, identifier: 1, target: reader })
    fireEvent.touchStart(reader, { touches: [pt(15, 400)] })
    fireEvent.touchEnd(reader, { changedTouches: [pt(220, 410)] })
    await waitFor(() => expect(reader.className).not.toMatch(/readerOpen/))
  })

  it('keeps the side-by-side layout on desktop (no back button or reply bar)', async () => {
    setViewport(false)
    render(<MailApp clients={[]} />)
    fireEvent.click(await screen.findByText('Hello there'))
    await screen.findByText('Body text')
    expect(screen.queryByRole('button', { name: 'Back to inbox' })).toBeNull()
    expect(screen.queryByTestId('mail-reply-bar')).toBeNull()
  })
})
