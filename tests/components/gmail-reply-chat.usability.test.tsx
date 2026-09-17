import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import GmailReplyChat from '@/components/GmailReplyChat'

vi.mock('@/components/RocketSplash', () => ({
  default: ({ compact }: { compact?: boolean }) => (
    <div role="status" aria-label="Loading" data-compact={compact ? 'true' : 'false'}>
      Loading
    </div>
  ),
}))

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
    window.sessionStorage.clear()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('shows the rocket while checking Gmail connection', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}))
    render(<GmailReplyChat initialPhase="search" />)
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
  })

  it('opens Reply Email on a blank focused search instead of the last recipient', async () => {
    window.sessionStorage.setItem(
      'optimate:gmail-reply-chat:search',
      JSON.stringify({
        phase: 'compose',
        composeTo: 'someone@example.com',
        composeSubject: 'Saved leftover',
        query: 'from:old-client',
        searched: true,
        results: [{ messageId: 'old', threadId: 'old', subject: 'Old thread', from: 'x', date: 'yesterday', snippet: 'hi' }],
      }),
    )

    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/optimate/default-model') return jsonResponse({ emailAssistantModel: 'claude-sonnet-4.6' })
      if (url === '/api/gmail/status') return jsonResponse({ connected: true, email: 'user@example.com' })
      throw new Error(`Unexpected fetch ${url}`)
    })

    render(<GmailReplyChat initialPhase="search" />)

    const search = await screen.findByPlaceholderText('Search inbox (Gmail syntax)…')
    expect(search).toHaveValue('')
    expect(search).toHaveFocus()
    expect(screen.queryByDisplayValue('someone@example.com')).not.toBeInTheDocument()
    expect(screen.queryByText('Old thread')).not.toBeInTheDocument()
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

    const sendButton = screen.getByRole('button', { name: 'Send' })
    expect(sendButton).toHaveStyle({ width: '38px', height: '38px', borderRadius: '50%' })
    expect(sendButton.closest('.metal-fx-root, .metal-fx-fallback')).toHaveStyle({
      width: '38px',
      height: '38px',
      borderRadius: '50%',
    })

    const modelSelect = screen.getByTitle('Model used for the next GmailMate turn')
    expect(modelSelect).toHaveStyle({ width: 'auto' })
    expect(modelSelect.parentElement).toHaveAttribute('data-optimate-select-row')

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
    const enhanceButton = screen.getByRole('button', { name: 'Enhance prompt without sending' })
    expect(enhanceButton.closest('.metal-fx-root, .metal-fx-fallback')).toHaveStyle({
      borderRadius: '999px',
    })

    const png = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      'screenshot.png',
      { type: 'image/png' },
    )
    const dropzone = screen.getByTestId('gmail-draft-image-dropzone')
    fireEvent.dragEnter(dropzone, {
      dataTransfer: { files: [png], types: ['Files'] },
    })
    expect(screen.getByText('Drop image for GmailMate and the Gmail draft')).toBeInTheDocument()
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [png], types: ['Files'] },
    })
    expect(await screen.findByText('screenshot.png')).toBeInTheDocument()

    fireEvent.keyDown(composeTextarea, { key: 'Enter', shiftKey: false })

    expect(await screen.findByText(/Draft preview:/)).toBeInTheDocument()
    expect(screen.getByText(/Hi there,[\s\S]*Thanks for reaching out\./)).toBeInTheDocument()
    expect(screen.getByText('GmailMate').parentElement).toHaveStyle({
      background: '#2a2a2d',
      color: '#fff',
    })

    const chatCall = fetchMock.mock.calls.find(([url]) => url === '/api/optimate/email/chat')
    expect(JSON.parse(chatCall?.[1]?.body as string)).toMatchObject({
      attachments: [{
        name: 'screenshot.png',
        mediaType: 'image/png',
        data: 'iVBORw0KGgo=',
      }],
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Create Gmail draft' }))

    await screen.findByText('Saved to Drafts.')
    const draftCall = fetchMock.mock.calls.find(([url]) => url === '/api/gmail/draft')
    expect(JSON.parse(draftCall?.[1]?.body as string)).toMatchObject({
      to: 'client@example.com',
      subject: 'Follow up',
      body: 'Hi there,\n\nThanks for reaching out.',
      attachments: [{
        name: 'screenshot.png',
        mediaType: 'image/png',
        data: 'iVBORw0KGgo=',
      }],
    })
  })

  it('sends dropped images with a direct agent-created Gmail draft request', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/optimate/default-model') return jsonResponse({ emailAssistantModel: 'claude-sonnet-4.6' })
      if (url === '/api/gmail/status') return jsonResponse({ connected: true, email: 'user@example.com' })
      if (url === '/api/optimate/email/chat') {
        return jsonResponse({
          reply: 'Saved the draft.',
          gmailDraft: { gmailUrl: 'https://mail.google.com/mail/u/0/#drafts/direct-1' },
        })
      }
      throw new Error(`Unexpected fetch ${url}`)
    })

    render(<GmailReplyChat initialPhase="compose" />)

    const screenshot = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      'direct-draft.png',
      { type: 'image/png' },
    )
    fireEvent.drop(await screen.findByTestId('gmail-draft-image-dropzone'), {
      dataTransfer: { files: [screenshot], types: ['Files'] },
    })
    expect(await screen.findByText('direct-draft.png')).toBeInTheDocument()

    const input = screen.getByPlaceholderText('Message GmailMate about the email…')
    fireEvent.change(input, { target: { value: 'Create the Gmail draft now.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByText('Saved to Drafts.')).toBeInTheDocument()
    const chatCall = fetchMock.mock.calls.find(([url]) => url === '/api/optimate/email/chat')
    expect(JSON.parse(chatCall?.[1]?.body as string)).toMatchObject({
      attachments: [{
        name: 'direct-draft.png',
        mediaType: 'image/png',
        data: 'iVBORw0KGgo=',
      }],
    })
  })

  it('reserves attachment limits across overlapping drops', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/optimate/default-model') return jsonResponse({ emailAssistantModel: 'claude-sonnet-4.6' })
      if (url === '/api/gmail/status') return jsonResponse({ connected: true, email: 'user@example.com' })
      throw new Error(`Unexpected fetch ${url}`)
    })

    render(<GmailReplyChat initialPhase="compose" />)
    const dropzone = await screen.findByTestId('gmail-draft-image-dropzone')
    const png = (name: string) => new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      name,
      { type: 'image/png' },
    )

    fireEvent.drop(dropzone, {
      dataTransfer: { files: [png('one.png'), png('two.png')], types: ['Files'] },
    })
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [png('three.png'), png('four.png')], types: ['Files'] },
    })

    expect(await screen.findByText('Attach up to 3 images.')).toBeInTheDocument()
    expect(await screen.findByText('one.png')).toBeInTheDocument()
    expect(screen.getByText('two.png')).toBeInTheDocument()
    expect(screen.queryByText('three.png')).not.toBeInTheDocument()
    expect(screen.queryByText('four.png')).not.toBeInTheDocument()
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
    expect(screen.queryByRole('button', { name: 'Create Gmail draft' })).not.toBeInTheDocument()
  })

  it('supports search → pick email → chat through reply → save threaded draft', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/optimate/default-model') {
        return jsonResponse({ emailAssistantModel: 'claude-sonnet-5' })
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
      if (url === '/api/optimate/email/enhance') {
        const request = JSON.parse(String(init?.body))
        expect(request).toMatchObject({
          prompt: 'Be warm and explain the next step.',
          mode: 'reply',
          model: 'claude-sonnet-5',
        })
        return jsonResponse({ enhancedPrompt: 'Draft a warm reply that clearly explains the next step.' })
      }
      if (url === '/api/optimate/email/chat') {
        const request = JSON.parse(String(init?.body))
        expect(request.message).toBe('Draft a warm reply that clearly explains the next step.')
        return jsonResponse({
          reply: 'I’ve staged the reply below.',
          stagedEmailReply: { body: 'Hi Client,\n\nThe next step is to review the proposal together.' },
          modelUsed: 'claude-sonnet-5',
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
    const originalEmailToggle = await screen.findByRole('button', { name: 'Show original email' })
    expect(originalEmailToggle).toBeInTheDocument()
    expect(originalEmailToggle.parentElement?.parentElement).toHaveStyle({
      background: '#111',
      color: '#f5f5f7',
    })
    expect(screen.queryByRole('button', { name: 'Enhance prompt without sending' })).not.toBeInTheDocument()
    expect(screen.queryByText('Can you clarify the next steps?')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show original email' }))
    expect(await screen.findByText('Can you clarify the next steps?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse original email' }))
    expect(screen.queryByText('Can you clarify the next steps?')).not.toBeInTheDocument()

    const replyScreenshot = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      'reply-screenshot.png',
      { type: 'image/png' },
    )
    fireEvent.drop(screen.getByTestId('gmail-draft-image-dropzone'), {
      dataTransfer: { files: [replyScreenshot], types: ['Files'] },
    })
    expect(await screen.findByText('reply-screenshot.png')).toBeInTheDocument()

    const replyInput = screen.getByPlaceholderText('Message GmailMate about the reply…')
    fireEvent.change(replyInput, {
      target: { value: 'Be warm and explain the next step.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enhance prompt without sending' }))
    await waitFor(() => {
      expect(replyInput).toHaveValue('Draft a warm reply that clearly explains the next step.')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    const replyChatCall = await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => url === '/api/optimate/email/chat')
      expect(call).toBeDefined()
      return call
    })
    expect(JSON.parse(replyChatCall?.[1]?.body as string)).toMatchObject({
      attachments: [{
        name: 'reply-screenshot.png',
        mediaType: 'image/png',
        data: 'iVBORw0KGgo=',
      }],
    })

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
        attachments: [{
          name: 'reply-screenshot.png',
          mediaType: 'image/png',
          data: 'iVBORw0KGgo=',
        }],
      })
    })
  })

  it('enhances a draft instruction in place without sending it to GmailMate', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/optimate/default-model') return jsonResponse({ emailAssistantModel: 'claude-sonnet-5' })
      if (url === '/api/gmail/status') return jsonResponse({ connected: true, email: 'user@example.com' })
      if (url === '/api/optimate/email/enhance') {
        const request = JSON.parse(String(init?.body))
        expect(request).toMatchObject({
          prompt: 'thank sarah for the report',
          mode: 'draft',
          model: 'claude-sonnet-5',
        })
        return jsonResponse({ enhancedPrompt: 'Draft a concise email thanking Sarah for the report.' })
      }
      throw new Error(`Unexpected fetch ${url}`)
    })

    render(<GmailReplyChat initialPhase="compose" />)

    const input = await screen.findByPlaceholderText('Message GmailMate about the email…')
    expect(screen.queryByRole('button', { name: 'Enhance prompt without sending' })).not.toBeInTheDocument()

    fireEvent.change(input, { target: { value: 'thank sarah for the report' } })
    const enhance = screen.getByRole('button', { name: 'Enhance prompt without sending' })
    expect(enhance).toBeEnabled()
    fireEvent.click(enhance)

    await waitFor(() => {
      expect(input).toHaveValue('Draft a concise email thanking Sarah for the report.')
    })
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/optimate/email/chat')).toBe(false)
    expect(screen.queryByText('You')).not.toBeInTheDocument()
  })
})
