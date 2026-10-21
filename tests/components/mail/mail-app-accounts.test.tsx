import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

type NavItem = { label: unknown; url?: string }
const nav: { items: NavItem[] } = { items: [] }
vi.mock('@payloadcms/ui', () => ({
  useStepNav: () => ({
    setStepNav: (items: NavItem[]) => {
      nav.items = items
    },
    stepNav: [],
  }),
}))
vi.mock('@/components/mail/ComposeWindow', () => ({ default: () => <div data-testid="compose" /> }))
vi.mock('@/components/mail/EmailBody', () => ({ default: () => <div /> }))

const { default: MailApp } = await import('@/components/mail/MailApp')

const thread = {
  threadId: 't1', messageId: 'm1', from: 'Jo Smith <jo@acme.com.au>', to: 'me@od.com', subject: 'Hello there',
  snippet: 'snippet', date: new Date().toISOString(), unread: false, messageCount: 1, client: { id: 1, name: 'Acme' },
}
const message = { ...thread, cc: '', body: 'Body text', html: '', stored: null, match: { id: 1, name: 'Acme', matchedOn: 'acme.com.au' } }

let calls: Array<{ url: string; init?: RequestInit }> = []

beforeEach(() => {
  calls = []
  localStorage.clear()
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const account = (init?.headers as Record<string, string> | undefined)?.['x-mail-account'] ?? ''
    const body = url.startsWith('/api/mail/inbox')
      ? { threads: [thread], nextPageToken: null, account: account || 'me@od.com', senderClients: [] }
      : url.startsWith('/api/mail/thread/')
        ? { messages: [message] }
        : url.startsWith('/api/mail/counts')
          ? { inboxUnread: 0, drafts: 0 }
          : url.startsWith('/api/mail/accounts')
            ? { primary: 'me@od.com', accounts: [{ email: 'sales@od.com' }], addUrl: '/api/gmail/connect?add=1', canAdd: true }
            : url.startsWith('/api/mail/sender-client')
              ? { senderClients: [{ sender: 'jo@acme.com.au', clientId: 2 }], client: { id: 2, name: 'Beta' }, moved: 3 }
              : {}
    return { ok: true, json: async () => body } as Response
  }) as unknown as typeof fetch
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  nav.items = []
})

const CLIENTS = [
  { id: 1, name: 'Acme' },
  { id: 2, name: 'Beta' },
]

describe('MailApp layout', () => {
  it('puts the search box at the top of the email list, right above the first email', async () => {
    render(<MailApp clients={CLIENTS} />)
    await screen.findByText('Hello there')
    const search = screen.getByRole('searchbox', { name: 'Search inbox' })
    const list = screen.getByRole('list', { name: 'Inbox' })
    expect(search.closest('form')?.nextElementSibling).toBe(list)
    expect(search.closest('[class*="toolbar"]')).toBeNull()
  })

  it('marks the folder you are on as the active tab', async () => {
    render(<MailApp clients={CLIENTS} />)
    const inbox = screen.getByRole('tab', { name: 'Inbox' })
    expect(inbox.getAttribute('aria-selected')).toBe('true')
    expect(inbox.className).toMatch(/folderActive/)
    fireEvent.click(screen.getByRole('tab', { name: 'Sent' }))
    expect(screen.getByRole('tab', { name: 'Sent' }).className).toMatch(/folderActive/)
    expect(screen.getByRole('tab', { name: 'Inbox' }).className).not.toMatch(/folderActive/)
    expect(screen.getByRole('tab', { name: 'Sent' }).getAttribute('aria-selected')).toBe('true')
  })
})

describe('MailApp breadcrumb account switcher', () => {
  it('shows Mail / <email> in the breadcrumb and switches every request to the chosen account', async () => {
    render(<MailApp clients={CLIENTS} />)
    await screen.findByText('Hello there')
    await waitFor(() => expect(nav.items).toHaveLength(2))
    expect(nav.items[0]).toEqual({ label: 'Mail', url: '/admin/mail' })

    // Render the breadcrumb's email (the switcher) the way the admin header would.
    const crumb = render(<>{nav.items[1]?.label as React.ReactElement}</>)
    const button = await within(crumb.container).findByRole('button', { name: /me@od\.com/ })
    fireEvent.click(button)
    const menu = await screen.findByRole('menu', { name: 'Gmail accounts' })
    expect(within(menu).getByRole('menuitem', { name: '+ Add another Gmail account' }).getAttribute('href')).toBe('/api/gmail/connect?add=1')
    calls = []
    fireEvent.click(within(menu).getByRole('menuitem', { name: /^sales@od\.com/ }))

    await waitFor(() => expect(calls.some((call) => call.url.startsWith('/api/mail/inbox'))).toBe(true))
    for (const call of calls.filter((entry) => entry.url.startsWith('/api/mail/'))) {
      expect((call.init?.headers as Record<string, string>)['x-mail-account']).toBe('sales@od.com')
    }
    expect(localStorage.getItem('mail-active-account')).toBe('sales@od.com')
  })

  it('opens on the account named in the link (?account=), e.g. from an alert', async () => {
    window.history.replaceState(null, '', '/admin/mail?account=sales%40od.com')
    render(<MailApp clients={CLIENTS} />)
    await waitFor(() => expect(calls.some((call) => call.url.startsWith('/api/mail/inbox'))).toBe(true))
    const inbox = calls.find((call) => call.url.startsWith('/api/mail/inbox'))
    expect((inbox?.init?.headers as Record<string, string>)['x-mail-account']).toBe('sales@od.com')
    expect(window.location.search).toBe('')
  })
})

describe('MailApp client pill for a sender', () => {
  it('changes which client a sender is added to', async () => {
    render(<MailApp clients={CLIENTS} />)
    fireEvent.click(await screen.findByText('Hello there'))
    fireEvent.click(await screen.findByRole('button', { name: 'Client: Acme ▾' }))
    fireEvent.change(screen.getByLabelText('Which emails'), { target: { value: 'jo@acme.com.au' } })
    fireEvent.change(screen.getByLabelText('Client for this sender'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText(/Emails from jo@acme\.com\.au now go to Beta\. Moved 3 saved emails to it\./)
    const post = calls.find((call) => call.url === '/api/mail/sender-client')
    expect(JSON.parse(String(post?.init?.body))).toEqual({ sender: 'jo@acme.com.au', clientId: 2 })
  })
})
