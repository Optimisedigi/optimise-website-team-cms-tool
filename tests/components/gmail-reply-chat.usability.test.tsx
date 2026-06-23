import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

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
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/optimate/default-model') return jsonResponse({ emailAssistantModel: 'claude-sonnet-4.6' })
      if (url === '/api/gmail/status') return jsonResponse({ connected: true, email: 'user@example.com' })
      if (url === '/api/optimate/email/chat') {
        return jsonResponse({
          reply: 'I’ve staged the draft below.',
          stagedEmailReply: { body: 'Hi there,\n\nThanks for reaching out.' },
          modelUsed: 'claude-sonnet-4.6',
        })
      }
      if (url === '/api/gmail/draft') return jsonResponse({ gmailUrl: 'https://mail.google.com/draft/1' })
      throw new Error(`Unexpected fetch ${url}`)
    })

    render(<GmailReplyChat initialPhase="compose" />)

    expect(await screen.findByText('Gmail · user@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reply to an email' })).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('To (optional)…'), {
      target: { value: 'client@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Subject…'), {
      target: { value: 'Follow up' },
    })
    const composeTextarea = screen.getByPlaceholderText('Message GmailMate about the email…')
    fireEvent.change(composeTextarea, {
      target: { value: 'Thank them for the meeting and ask for the report.' },
    })
    fireEvent.keyDown(composeTextarea, { key: 'Enter', shiftKey: false })

    expect(await screen.findByText(/Draft preview:/)).toBeInTheDocument()
    expect(screen.getByText(/Hi there,[\s\S]*Thanks for reaching out\./)).toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: 'Create Gmail draft' }))

    await screen.findByText('Saved to Drafts.')
    const draftCall = fetchMock.mock.calls.find(([url]) => url === '/api/gmail/draft')
    expect(JSON.parse(draftCall?.[1]?.body as string)).toMatchObject({
      to: 'client@example.com',
      subject: 'Follow up',
      body: 'Hi there,\n\nThanks for reaching out.',
    })
  })

  it('keeps Shift+Enter as a newline instead of sending', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/optimate/default-model') return jsonResponse({ emailAssistantModel: 'claude-sonnet-4.6' })
      if (url === '/api/gmail/status') return jsonResponse({ connected: true, email: 'user@example.com' })
      if (url === '/api/optimate/email/chat') throw new Error('Shift+Enter should not send')
      throw new Error(`Unexpected fetch ${url}`)
    })

    render(<GmailReplyChat initialPhase="compose" />)

    const textarea = await screen.findByPlaceholderText('Message GmailMate about the email…')
    fireEvent.change(textarea, { target: { value: 'Line one' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })

    expect(fetchMock.mock.calls.some(([url]) => url === '/api/optimate/email/chat')).toBe(false)
  })

  it('does not turn chat-only status text into a customer-facing Gmail draft', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/optimate/default-model') return jsonResponse({ emailAssistantModel: 'claude-sonnet-4.6' })
      if (url === '/api/gmail/status') return jsonResponse({ connected: true, email: 'user@example.com' })
      if (url.startsWith('/api/gmail/search')) {
        return jsonResponse({
          results: [
            {
              messageId: 'msg-1',
              threadId: 'thread-1',
              subject: 'GA4 access',
              from: 'Client <client@example.com>',
              date: 'today',
              snippet: 'I added GA4 access and answered below.',
            },
          ],
        })
      }
      if (url === '/api/gmail/message/msg-1') {
        return jsonResponse({
          messageId: 'msg-1',
          threadId: 'thread-1',
          rfcMessageId: '<msg-1@example.com>',
          subject: 'GA4 access',
          from: 'Client <client@example.com>',
          to: 'user@example.com',
          date: 'today',
          body: 'I added GA4 access and answered below.',
        })
      }
      if (url === '/api/optimate/email/chat') {
        expect(JSON.parse(String(init?.body)).message).toContain('thank her for GA4 access')
        return jsonResponse({
          reply: "Draft is in the review box. I've covered GA4 access and the dashboard note.",
          modelUsed: 'claude-sonnet-4.6',
        })
      }
      if (url === '/api/gmail/draft') throw new Error('Meta reply should never be saved as a Gmail draft')
      throw new Error(`Unexpected fetch ${url}`)
    })

    render(<GmailReplyChat initialPhase="search" />)

    fireEvent.change(await screen.findByPlaceholderText('Search inbox (Gmail syntax)…'), {
      target: { value: 'from:client' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    fireEvent.click(await screen.findByText('GA4 access'))

    fireEvent.change(await screen.findByPlaceholderText('Message GmailMate about the reply…'), {
      target: { value: 'Please thank her for GA4 access.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByText("Draft is in the review box. I've covered GA4 access and the dashboard note.")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create Gmail draft' })).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/gmail/draft')).toBe(false)
  })

  it('renders an agent-created Gmail draft as a clickable Gmail link', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/optimate/default-model') return jsonResponse({ emailAssistantModel: 'claude-sonnet-4.6' })
      if (url === '/api/gmail/status') return jsonResponse({ connected: true, email: 'user@example.com' })
      if (url.startsWith('/api/gmail/search')) {
        return jsonResponse({
          results: [
            {
              messageId: 'msg-1',
              threadId: 'thread-1',
              subject: 'GA4 access',
              from: 'Client <client@example.com>',
              date: 'today',
              snippet: 'I added GA4 access and answered below.',
            },
          ],
        })
      }
      if (url === '/api/gmail/message/msg-1') {
        return jsonResponse({
          messageId: 'msg-1',
          threadId: 'thread-1',
          rfcMessageId: '<msg-1@example.com>',
          subject: 'GA4 access',
          from: 'Client <client@example.com>',
          to: 'user@example.com',
          date: 'today',
          body: 'I added GA4 access and answered below.',
        })
      }
      if (url === '/api/optimate/email/chat') {
        const request = JSON.parse(String(init?.body))
        expect(request.message).toBe('send to gmail draft')
        return jsonResponse({
          reply: 'Saved to Gmail drafts.',
          gmailDraft: { gmailUrl: 'https://mail.google.com/mail/u/0/#drafts/msg-123' },
          modelUsed: 'claude-sonnet-4.6',
        })
      }
      throw new Error(`Unexpected fetch ${url}`)
    })

    render(<GmailReplyChat initialPhase="search" />)

    fireEvent.change(await screen.findByPlaceholderText('Search inbox (Gmail syntax)…'), {
      target: { value: 'from:client' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    fireEvent.click(await screen.findByText('GA4 access'))

    fireEvent.change(await screen.findByPlaceholderText('Message GmailMate about the reply…'), {
      target: { value: 'send to gmail draft' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    const link = await screen.findByRole('link', { name: 'Open in Gmail' })
    expect(link).toHaveAttribute('href', 'https://mail.google.com/mail/u/0/#drafts/msg-123')
  })

  it('supports search → pick email → chat through reply → save threaded draft', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/optimate/default-model') {
        return jsonResponse({ emailAssistantModel: 'claude-sonnet-4.6' })
      }
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
      if (url === '/api/optimate/email/chat') {
        const request = JSON.parse(String(init?.body))
        expect(request.message).toBe('Be warm and explain the next step.')
        return jsonResponse({
          reply: 'I’ve staged the reply below.',
          stagedEmailReply: { body: 'Hi Client,\n\nThe next step is to review the proposal together.' },
          modelUsed: 'claude-sonnet-4.6',
        })
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
    fireEvent.click(screen.getByRole('button', { name: 'Collapse original email' }))
    expect(screen.queryByText('Can you clarify the next steps?')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show original email' })).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Message GmailMate about the reply…'), {
      target: { value: 'Be warm and explain the next step.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Create Gmail draft' }))
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
