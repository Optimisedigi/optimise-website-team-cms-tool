import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@/components/VoiceField', () => ({
  default: ({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) => (
    <textarea
      aria-label={placeholder ?? 'voice field'}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  ),
}))

import GmailReplyChat from '@/components/GmailReplyChat'

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    json: async () => body,
  }
}

describe('GmailReplyChat usability smoke', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('opens directly into the compose flow and creates a Gmail draft', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ connected: true, email: 'user@example.com' }))
      .mockResolvedValueOnce(jsonResponse({ reply: 'Hi there,\n\nThanks for reaching out.' }))
      .mockResolvedValueOnce(jsonResponse({ gmailUrl: 'https://mail.google.com/draft/1' }))

    render(<GmailReplyChat initialPhase="compose" />)

    expect(await screen.findByText('Gmail · user@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reply to an email' })).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('To (optional — you can choose in Gmail)…'), {
      target: { value: 'client@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Subject (optional)…'), {
      target: { value: 'Follow up' },
    })
    fireEvent.change(screen.getByPlaceholderText('What should the email say?'), {
      target: { value: 'Thank them for the meeting and ask for the report.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Draft email' }))

    const saveComposeDraft = await screen.findByRole('button', { name: 'Save to Gmail Drafts' })
    fireEvent.click(saveComposeDraft)

    await screen.findByText('Saved to Drafts.')
    const draftCall = fetchMock.mock.calls.find(([url]) => url === '/api/gmail/draft')
    expect(JSON.parse(draftCall?.[1]?.body as string)).toMatchObject({
      to: 'client@example.com',
      subject: 'Follow up',
      body: 'Hi there,\n\nThanks for reaching out.',
    })
  })

  it('supports search → pick email → chat through reply → save threaded draft', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/gmail/status') {
        return jsonResponse({ connected: true, email: 'user@example.com' })
      }
      if (url.startsWith('/api/gmail/search')) {
        return jsonResponse({
          results: [
            {
              messageId: 'msg-1',
              threadId: 'thread-1',
              subject: 'Proposal question',
              from: 'Client <client@example.com>',
              date: 'today',
              snippet: 'Can you clarify the next steps?',
            },
          ],
        })
      }
      if (url === '/api/gmail/message/msg-1') {
        return jsonResponse({
          messageId: 'msg-1',
          threadId: 'thread-1',
          rfcMessageId: '<msg-1@example.com>',
          subject: 'Proposal question',
          from: 'Client <client@example.com>',
          to: 'user@example.com',
          date: 'today',
          body: 'Can you clarify the next steps?',
        })
      }
      if (url === '/api/gmail/ai-reply') {
        const request = JSON.parse(String(init?.body))
        expect(request.instructions).toContain('Latest request:')
        return jsonResponse({ reply: 'Hi Client,\n\nThe next step is to review the proposal together.' })
      }
      if (url === '/api/gmail/draft') {
        return jsonResponse({ gmailUrl: 'https://mail.google.com/draft/2' })
      }
      throw new Error(`Unexpected fetch ${url}`)
    })

    render(<GmailReplyChat initialPhase="search" />)

    expect(await screen.findByPlaceholderText('Search inbox (Gmail syntax)…')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Search inbox (Gmail syntax)…'), {
      target: { value: 'from:client' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    fireEvent.click(await screen.findByText('Proposal question'))
    expect(await screen.findByText('Can you clarify the next steps?')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('How should I reply?'), {
      target: { value: 'Be warm and explain the next step.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Draft reply' }))

    expect(await screen.findByText('GmailMate draft')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save latest draft to Gmail' }))
    await screen.findByText('Saved to Drafts.')

    await waitFor(() => {
      const draftCall = fetchMock.mock.calls.find(([url]) => url === '/api/gmail/draft')
      expect(JSON.parse(draftCall?.[1]?.body as string)).toMatchObject({
        to: 'client@example.com',
        subject: 'Re: Proposal question',
        threadId: 'thread-1',
        inReplyTo: '<msg-1@example.com>',
        body: 'Hi Client,\n\nThe next step is to review the proposal together.',
      })
    })
  })
})
