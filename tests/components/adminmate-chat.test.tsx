import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import AdminMateChat from '@/components/AdminMateChat'

vi.mock('@/components/OptiMateTranscribe', () => ({
  default: ({ onTranscript }: { onTranscript: (text: string) => void }) => <button type="button" onClick={() => onTranscript('dictated client')}>Dictate</button>,
}))

vi.mock('@/components/EmailAttachPicker', () => ({
  default: ({ open, onSelect }: { open: boolean; onSelect: (email: Record<string, string>) => void }) => open ? (
    <button type="button" onClick={() => onSelect({
      messageId: 'gmail-message-1',
      subject: 'Campaign question',
      from: 'Jane Client <jane@example.com>',
      date: '2026-09-16T10:00:00.000Z',
      snippet: 'Can you send an update?',
    })}>Choose Campaign question</button>
  ) : null,
}))

const staged = {
  name: 'Acme Corp',
  slug: 'acme-corp',
  websiteUrl: 'https://acmecorp.com',
  services: ['google_ads'],
  contactName: 'Jane Doe',
  contactEmail: 'jane@acme.com',
  clientType: 'recurring',
  monthlyRetainer: 2000,
  isActive: true,
}
const response = (body: unknown, ok = true) => ({ ok, json: async () => body })

describe('AdminMateChat', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('stages a client, applies edits, and creates it once', async () => {
    let resolveCreate: ((value: ReturnType<typeof response>) => void) | undefined
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/optimate/adminmate/chat') {
        return Promise.resolve(response({ reply: 'Review it.', stagedClient: staged, similarClients: [{ id: '9', name: 'Acme Pty Ltd', slug: 'acme-pty-ltd' }] }))
      }
      if (url === '/api/optimate/adminmate/create-client') return new Promise((resolve) => { resolveCreate = resolve })
      throw new Error(`Unexpected fetch ${url}`)
    })
    render(<AdminMateChat />)

    fireEvent.click(screen.getByRole('button', { name: 'Dictate' }))
    expect(screen.getByLabelText('Message AdminMate')).toHaveValue('dictated client')
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByRole('button', { name: 'Create Acme Corp' })).toBeInTheDocument()
    expect(screen.getByText(/Possible duplicate: Acme Pty Ltd/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'acme-corp-au' } })
    fireEvent.change(screen.getByLabelText('Internal notes'), { target: { value: 'VIP — invoice via accounts@' } })
    fireEvent.change(screen.getByLabelText('Setup fee ($)'), { target: { value: '1500' } })
    fireEvent.click(screen.getByLabelText('SEO'))
    const createButton = screen.getByRole('button', { name: 'Create Acme Corp' })
    fireEvent.click(createButton)
    fireEvent.click(createButton)

    const createCalls = fetchMock.mock.calls.filter(([url]) => url === '/api/optimate/adminmate/create-client')
    expect(createCalls).toHaveLength(1)
    expect(JSON.parse(createCalls[0][1].body as string)).toMatchObject({ slug: 'acme-corp-au', services: ['google_ads', 'seo'], notes: 'VIP — invoice via accounts@', setupFee: 1500 })

    resolveCreate?.(response({ id: 11, name: 'Acme Corp', slug: 'acme-corp-au' }))
    expect(await screen.findByText(/Created Acme Corp/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create Acme Corp' })).not.toBeInTheDocument()
  })

  it('keeps the staged card when creation fails', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/optimate/adminmate/chat') return Promise.resolve(response({ reply: 'Review it.', stagedClient: staged }))
      return Promise.resolve(response({ error: 'Slug "acme-corp" is already used by Acme Corp.' }, false))
    })
    render(<AdminMateChat />)

    fireEvent.change(screen.getByLabelText('Message AdminMate'), { target: { value: 'create client Acme' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Create Acme Corp' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('already used by Acme Corp')
    expect(screen.getByRole('button', { name: 'Create Acme Corp' })).toBeInTheDocument()
  })

  it('keeps an attached Gmail message across reply revision turns and links each draft', async () => {
    const requestBodies: Array<Record<string, unknown>> = []
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url !== '/api/optimate/adminmate/chat') throw new Error(`Unexpected fetch ${url}`)
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      requestBodies.push(body)
      const revision = requestBodies.length === 2
      return Promise.resolve(response({
        reply: revision ? 'I revised the reply in Gmail Drafts.' : 'I created the reply in Gmail Drafts.',
        gmailDraft: {
          gmailUrl: `https://mail.google.com/mail/u/0/#drafts/${revision ? 'draft-message-2' : 'draft-message-1'}`,
          subject: 'Re: Campaign question',
          to: 'jane@example.com',
        },
      }))
    })

    render(<AdminMateChat />)
    fireEvent.click(screen.getByRole('button', { name: 'Attach an email from Gmail' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose Campaign question' }))
    expect(screen.getByText(/Campaign question/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Message AdminMate'), {
      target: { value: 'Reply with a friendly progress update.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    const firstLink = await screen.findByRole('link', { name: 'Open Gmail draft: Re: Campaign question' })
    expect(firstLink).toHaveAttribute('href', 'https://mail.google.com/mail/u/0/#drafts/draft-message-1')
    expect(screen.getByText(/Campaign question — Jane Client/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Message AdminMate'), {
      target: { value: 'Make that warmer and mention Friday.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText('I revised the reply in Gmail Drafts.')

    expect(requestBodies).toHaveLength(2)
    expect(requestBodies[0]).toMatchObject({
      message: 'Reply with a friendly progress update.',
      attachedEmail: { messageId: 'gmail-message-1', subject: 'Campaign question' },
    })
    expect(requestBodies[1]).toMatchObject({
      message: 'Make that warmer and mention Friday.',
      attachedEmail: { messageId: 'gmail-message-1', subject: 'Campaign question' },
    })
  })
  it('starts a new chat instead of restoring a previous thread', () => {
    sessionStorage.setItem('optimate:adminmate', JSON.stringify({
      messages: [{ role: 'user', content: 'create client leftover' }],
      draft: 'leftover draft',
    }))
    render(<AdminMateChat />)
    expect(screen.queryByText('create client leftover')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Message AdminMate')).toHaveValue('')
    expect(sessionStorage.getItem('optimate:adminmate')).toBeNull()
  })
})
