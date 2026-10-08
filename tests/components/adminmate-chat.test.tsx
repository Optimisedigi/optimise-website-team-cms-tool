import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import AdminMateChat from '@/components/AdminMateChat'

const dictation = vi.hoisted(() => ({ phrase: 'dictated client' }))

vi.mock('@/components/OptiMateTranscribe', () => ({
  default: ({ onTranscript }: { onTranscript: (text: string) => void }) => <button type="button" onClick={() => onTranscript(dictation.phrase)}>Dictate</button>,
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
const proposal = {
  businessName: 'Aussie Fluid Power',
  slug: 'aussie-fluid-power',
  websiteUrl: 'https://www.aussiefluidpower.com.au',
  contactName: 'Priya',
}
const response = (body: unknown, ok = true) => ({ ok, json: async () => body })

describe('AdminMateChat', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    dictation.phrase = 'dictated client'
    sessionStorage.clear()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('shows a short, readable opening example on a dark bubble', () => {
    render(<AdminMateChat />)
    const example = screen.getByText(/Try: “Create a client called Acme Corp”/)
    expect(example).toHaveStyle({ background: '#2a2a2d', color: '#fff' })
    expect(example.textContent?.length).toBeLessThan(150)
  })

  it('grows and shrinks the message box to keep the draft visible', () => {
    render(<AdminMateChat />)
    const messageBox = screen.getByLabelText('Message AdminMate')

    Object.defineProperty(messageBox, 'scrollHeight', { configurable: true, value: 96 })
    fireEvent.change(messageBox, { target: { value: 'A message long enough to wrap onto several lines.' } })
    expect(messageBox).toHaveStyle({ height: '96px', overflowY: 'hidden' })

    Object.defineProperty(messageBox, 'scrollHeight', { configurable: true, value: 44 })
    fireEvent.change(messageBox, { target: { value: 'Short again' } })
    expect(messageBox).toHaveStyle({ height: '44px' })
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

  it('stages a client proposal and creates it once', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/optimate/adminmate/chat') {
        return Promise.resolve(response({ reply: 'Review it.', stagedProposal: proposal }))
      }
      if (url === '/api/optimate/adminmate/create-proposal') {
        return Promise.resolve(response({ id: 21, businessName: 'Aussie Fluid Power', slug: 'aussie-fluid-power', adminUrl: '/admin/collections/client-proposals/21' }))
      }
      throw new Error(`Unexpected fetch ${url}`)
    })
    render(<AdminMateChat />)

    fireEvent.change(screen.getByLabelText('Message AdminMate'), { target: { value: 'create a client proposal for Aussie Fluid Power' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByRole('button', { name: 'Create Aussie Fluid Power' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create Aussie Fluid Power' }))

    expect(await screen.findByText(/Created the proposal for Aussie Fluid Power/)).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/optimate/adminmate/create-proposal')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Create Aussie Fluid Power' })).not.toBeInTheDocument()
  })

  it('stages, creates and sends a meeting scheduler by voice alone', async () => {
    const preview = {
      schedulerId: '31',
      title: 'Discovery call',
      durationMinutes: '30',
      timezone: 'Australia/Sydney',
      status: 'slots_generated',
      offeredTimes: 6,
      firstTime: '2026-10-12T22:00:00.000Z',
      lastTime: '2026-10-13T00:30:00.000Z',
      attendees: [{ name: 'Priya', email: 'priya@afp.com.au', internalConfirmed: false, alreadySent: false, responded: false }],
      adminUrl: '/admin/collections/meeting-schedulers/31',
    }
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/optimate/adminmate/chat') {
        return Promise.resolve(response({
          reply: 'Staged a 30 minute discovery call.',
          stagedMeetingScheduler: {
            title: 'Discovery call',
            link: { kind: 'prospect', id: '4', name: 'Aussie Fluid Power' },
            durationMinutes: '30',
            timezone: 'Australia/Sydney',
            dates: [{ date: '2026-10-13', start: '09:00', end: '12:00' }],
            attendees: [{ name: 'Priya', email: 'priya@afp.com.au', internalConfirmed: false }],
          },
        }))
      }
      if (url === '/api/optimate/adminmate/meeting-links') {
        return Promise.resolve(response({ clients: [{ id: '7', name: 'Acme' }], prospects: [{ id: '4', businessName: 'Aussie Fluid Power' }] }))
      }
      if (url === '/api/optimate/adminmate/create-meeting-scheduler') {
        return Promise.resolve(response({ id: 31, title: 'Discovery call', adminUrl: '/admin/collections/meeting-schedulers/31' }))
      }
      if (url === '/api/optimate/adminmate/meeting-invites?id=31') return Promise.resolve(response(preview))
      if (url === '/api/optimate/adminmate/meeting-invites' && init?.method === 'POST') {
        return Promise.resolve(response({ sentCount: 1, failed: [], adminUrl: '/admin/collections/meeting-schedulers/31' }))
      }
      throw new Error(`Unexpected fetch ${url}`)
    })
    vi.useFakeTimers()
    try {
      render(<AdminMateChat />)
      dictation.phrase = 'set up a discovery call with Aussie Fluid Power next Tuesday morning'
      fireEvent.click(screen.getByRole('button', { name: 'Dictate' }))
      // The dictated message sends itself after a pause; no Send click.
      await act(async () => { await vi.advanceTimersByTimeAsync(2500) })
    } finally {
      vi.useRealTimers()
    }

    const linkSelect = await screen.findByRole('combobox', { name: 'Client or prospect' })
    expect(linkSelect).toHaveValue('prospect:4')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).message).toContain('Aussie Fluid Power')

    dictation.phrase = 'Yes, create it'
    fireEvent.click(screen.getByRole('button', { name: 'Dictate' }))

    expect(await screen.findByText(/Created Discovery call/)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Open' })[0]).toHaveAttribute('href', '/admin/collections/meeting-schedulers/31')
    const createCalls = fetchMock.mock.calls.filter(([url]) => url === '/api/optimate/adminmate/create-meeting-scheduler')
    expect(createCalls).toHaveLength(1)
    expect(JSON.parse(createCalls[0][1].body as string)).toMatchObject({ title: 'Discovery call', link: { kind: 'prospect', id: '4' } })

    // Straight on to the send step, with editable details.
    expect(await screen.findByRole('region', { name: 'Send meeting invites review' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Invitee 1 name' }), { target: { value: 'Priya Shah' } })
    dictation.phrase = 'Send it'
    fireEvent.click(screen.getByRole('button', { name: 'Dictate' }))

    expect(await screen.findByText(/Sent scheduling invites to 1 person/)).toBeInTheDocument()
    const sendCalls = fetchMock.mock.calls.filter(([url, init]) => url === '/api/optimate/adminmate/meeting-invites' && init?.method === 'POST')
    expect(sendCalls).toHaveLength(1)
    expect(JSON.parse(sendCalls[0][1].body as string)).toMatchObject({
      schedulerId: '31',
      attendees: [{ name: 'Priya Shah', email: 'priya@afp.com.au', internalConfirmed: false }],
    })
    expect(screen.queryByRole('region', { name: 'Send meeting invites review' })).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/optimate/adminmate/chat')).toHaveLength(1)
  })

  it('links a meeting to a prospect picked from the dropdown and adds their contact', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/optimate/adminmate/chat') {
        return Promise.resolve(response({
          reply: 'Staged.',
          stagedMeetingScheduler: {
            title: 'Intro call',
            durationMinutes: '30',
            timezone: 'Australia/Sydney',
            dates: [{ date: '2026-10-13', start: '09:00', end: '12:00' }],
            attendees: [],
          },
        }))
      }
      if (url === '/api/optimate/adminmate/meeting-links') {
        return Promise.resolve(response({
          clients: [{ id: '7', name: 'Acme' }],
          prospects: [{ id: '4', businessName: 'Aussie Fluid Power', contactName: 'Priya', contactEmail: 'Priya@AFP.com.au' }],
        }))
      }
      throw new Error(`Unexpected fetch ${url}`)
    })
    render(<AdminMateChat />)
    fireEvent.change(screen.getByLabelText('Message AdminMate'), { target: { value: 'set up an intro meeting' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    const linkSelect = await screen.findByRole('combobox', { name: 'Client or prospect' })
    await screen.findByRole('option', { name: 'Aussie Fluid Power' })
    fireEvent.change(linkSelect, { target: { value: 'prospect:4' } })

    expect(linkSelect).toHaveValue('prospect:4')
    expect(screen.getByText('Priya <priya@afp.com.au>')).toBeInTheDocument()
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
    const attachmentLabel = screen.getByText(/Campaign question/)
    const composer = screen.getByLabelText('Message AdminMate').parentElement
    expect(attachmentLabel).toHaveStyle({ minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis' })
    expect(composer).toHaveStyle({ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto auto', minWidth: '0' })

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
  it('shows client links from the reply as buttons and drops unsafe ones', async () => {
    fetchMock.mockResolvedValueOnce(response({
      reply: 'Here is the We Can Quit contract.',
      links: [
        { label: 'Website Hosting (signed)', href: '/admin/collections/contracts/15' },
        { label: 'Phish', href: 'https://evil.example/login' },
        { label: 'Looker dashboard', href: 'https://lookerstudio.google.com/r/abc', external: true },
      ],
    }))
    render(<AdminMateChat />)
    fireEvent.change(screen.getByLabelText('Message AdminMate'), { target: { value: 'give me a link to the contract for we can quit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    const link = await screen.findByRole('link', { name: /Website Hosting \(signed\)/ })
    expect(link).toHaveAttribute('href', '/admin/collections/contracts/15')
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.queryByRole('link', { name: /Phish/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Looker dashboard \(external\)/ })).toHaveAttribute('href', 'https://lookerstudio.google.com/r/abc')
  })

  it('attaches a pasted screenshot, sends it with the message and clears it', async () => {
    const requestBodies: Array<Record<string, unknown>> = []
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return Promise.resolve(response({ reply: 'That is the We Can Quit contract.' }))
    })
    render(<AdminMateChat />)
    const box = screen.getByLabelText('Message AdminMate')
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'image.png', { type: 'image/png' })
    fireEvent.paste(box, { clipboardData: { files: [file] } })

    expect(await screen.findByRole('button', { name: /^Remove screenshot-/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
    fireEvent.change(box, { target: { value: 'how much was hosting in this contract?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await screen.findByText('That is the We Can Quit contract.')
    expect(requestBodies[0]).toMatchObject({
      message: 'how much was hosting in this contract?',
      imageAttachments: [{ mediaType: 'image/png', data: 'iVBORw==' }],
    })
    expect(screen.queryByRole('button', { name: /^Remove screenshot-/ })).not.toBeInTheDocument()
    expect(requestBodies[0]).not.toHaveProperty('imagesFromEarlierTurn')

    // A follow-up question still carries the screenshot, marked as re-sent.
    expect(screen.getByRole('status')).toHaveTextContent('AdminMate can still see your earlier screenshot')
    fireEvent.change(box, { target: { value: 'and what was the setup fee?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await vi.waitFor(() => expect(requestBodies).toHaveLength(2))
    expect(requestBodies[1]).toMatchObject({
      message: 'and what was the setup fee?',
      imageAttachments: [{ mediaType: 'image/png', data: 'iVBORw==' }],
      imagesFromEarlierTurn: true,
    })
    expect(screen.getAllByText(/\[Attached image: screenshot-/)).toHaveLength(1)

    // Clearing it stops it being sent.
    await screen.findByRole('button', { name: 'Stop sharing earlier screenshots' })
    fireEvent.click(screen.getByRole('button', { name: 'Stop sharing earlier screenshots' }))
    fireEvent.change(box, { target: { value: 'thanks' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await vi.waitFor(() => expect(requestBodies).toHaveLength(3))
    expect(requestBodies[2]).not.toHaveProperty('imageAttachments')
  })

  it('rejects unsupported image types with a message', async () => {
    render(<AdminMateChat />)
    const file = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' })
    fireEvent.paste(screen.getByLabelText('Message AdminMate'), { clipboardData: { files: [file] } })
    expect(await screen.findByRole('alert')).toHaveTextContent(/not a supported image/)
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
