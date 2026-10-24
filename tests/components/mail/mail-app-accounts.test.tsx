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
        : url.startsWith('/api/mail/contacts')
          ? {
              contacts: [{ email: 'carli@inthepicture.com.au', name: 'Carli Markunsky' }],
              senders: [{ email: 'rebekah@inthepicture.com.au', name: 'Rebekah Sadler' }],
            }
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
  it('clearing the search brings the whole inbox back without a refresh', async () => {
    render(<MailApp clients={CLIENTS} />)
    await screen.findByText('Hello there')
    const search = screen.getByRole('combobox', { name: 'Search inbox' })
    fireEvent.change(search, { target: { value: 'acme' } })
    fireEvent.submit(search.closest('form') as HTMLFormElement)
    await waitFor(() => expect(calls.some((call) => call.url.includes('q=acme'))).toBe(true))
    calls = []
    // The search box's × clears it: same as emptying the text.
    fireEvent.change(search, { target: { value: '' } })
    await waitFor(() => expect(calls.some((call) => call.url.startsWith('/api/mail/inbox'))).toBe(true))
    const url = new URL(calls.find((call) => call.url.startsWith('/api/mail/inbox'))?.url ?? '', 'https://cms.test')
    expect(url.searchParams.get('q')).toBeNull()
    expect(url.searchParams.get('folder')).toBe('inbox')
  })

  it('ticking inbox emails offers Mark as read, which marks them all read at once', async () => {
    const baseFetch = global.fetch
    const unread = [
      { ...thread, threadId: 't1', subject: 'First', unread: true },
      { ...thread, threadId: 't2', messageId: 'm2', subject: 'Second', unread: true },
      { ...thread, threadId: 't3', messageId: 'm3', subject: 'Third', unread: true },
    ]
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/mail/inbox')) {
        calls.push({ url, init })
        return { ok: true, json: async () => ({ threads: unread, nextPageToken: null, account: 'me@od.com', senderClients: [] }) } as Response
      }
      return baseFetch(url, init)
    }) as unknown as typeof fetch
    render(<MailApp clients={CLIENTS} />)
    await screen.findByText('First')
    expect(screen.queryByRole('button', { name: 'Mark as read' })).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: /First/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Second/ }))
    expect(screen.getByText('2 selected')).toBeTruthy()
    calls = []
    fireEvent.click(screen.getByRole('button', { name: 'Mark as read' }))
    await screen.findByText('Marked 2 emails read')
    const modify = calls.filter((call) => call.url === '/api/mail/modify')
    expect(modify).toHaveLength(1)
    expect(JSON.parse(String(modify[0]?.init?.body))).toEqual({ threadIds: ['t1', 't2'], action: 'read' })
    // Marked rows lose their unread style and the selection clears; the third stays unread.
    expect(screen.queryByText('2 selected')).toBeNull()
    const rows = screen.getAllByRole('listitem').map((li) => li.querySelector('button'))
    expect(rows.filter((row) => row?.className.includes('unread'))).toHaveLength(1)
  })

  it('ticking read inbox emails offers Mark as unread, without opening them', async () => {
    const baseFetch = global.fetch
    const read = [
      { ...thread, threadId: 't1', subject: 'First', unread: false },
      { ...thread, threadId: 't2', messageId: 'm2', subject: 'Second', unread: false },
      { ...thread, threadId: 't3', messageId: 'm3', subject: 'Third', unread: false },
    ]
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/mail/inbox')) {
        calls.push({ url, init })
        return { ok: true, json: async () => ({ threads: read, nextPageToken: null, account: 'me@od.com', senderClients: [] }) } as Response
      }
      return baseFetch(url, init)
    }) as unknown as typeof fetch
    render(<MailApp clients={CLIENTS} />)
    await screen.findByText('First')
    fireEvent.click(screen.getByRole('checkbox', { name: /First/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Third/ }))
    calls = []
    fireEvent.click(screen.getByRole('button', { name: 'Mark as unread' }))
    await screen.findByText('Marked 2 emails unread')
    const modify = calls.filter((call) => call.url === '/api/mail/modify')
    expect(modify).toHaveLength(1)
    expect(JSON.parse(String(modify[0]?.init?.body))).toEqual({ threadIds: ['t1', 't3'], action: 'unread' })
    // Nothing was opened, the two rows now look unread and the selection clears.
    expect(calls.some((call) => call.url.startsWith('/api/mail/thread'))).toBe(false)
    expect(screen.queryByText('2 selected')).toBeNull()
    const rows = screen.getAllByRole('listitem').map((li) => li.querySelector('button'))
    expect(rows.filter((row) => row?.className.includes('unread'))).toHaveLength(2)
  })

  it('ticking inbox emails offers Delete, which bins them all at once, with Undo', async () => {
    const baseFetch = global.fetch
    const rows = [
      { ...thread, threadId: 't1', subject: 'First' },
      { ...thread, threadId: 't2', messageId: 'm2', subject: 'Second' },
      { ...thread, threadId: 't3', messageId: 'm3', subject: 'Third' },
    ]
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/mail/inbox')) {
        calls.push({ url, init })
        return { ok: true, json: async () => ({ threads: rows, nextPageToken: null, account: 'me@od.com', senderClients: [] }) } as Response
      }
      return baseFetch(url, init)
    }) as unknown as typeof fetch
    render(<MailApp clients={CLIENTS} />)
    await screen.findByText('First')
    expect(screen.queryByText(/emails? shown/)).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: /First/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Third/ }))
    calls = []
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await screen.findByText('Deleted 2 emails. They stay in Gmail’s Bin for 30 days.')
    const modify = calls.filter((call) => call.url === '/api/mail/modify')
    expect(modify).toHaveLength(1)
    expect(JSON.parse(String(modify[0]?.init?.body))).toEqual({ threadIds: ['t1', 't3'], action: 'trash' })
    expect(screen.queryByText('First')).toBeNull()
    expect(screen.getByText('Second')).toBeTruthy()
    calls = []
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(calls.some((call) => call.url === '/api/mail/modify')).toBe(true))
    const undo = calls.filter((call) => call.url === '/api/mail/modify')
    expect(JSON.parse(String(undo[0]?.init?.body))).toEqual({ threadIds: ['t1', 't3'], action: 'untrash' })
  })

  it('a row delete icon moves the thread to the Bin, with Undo bringing it back', async () => {
    render(<MailApp clients={CLIENTS} />)
    await screen.findByText('Hello there')
    calls = []
    fireEvent.click(screen.getByRole('button', { name: 'Delete Jo Smith: Hello there' }))
    await screen.findByText(/Deleted “Hello there”/)
    // The row leaves the list straight away.
    expect(screen.queryByRole('button', { name: 'Delete Jo Smith: Hello there' })).toBeNull()
    const modify = calls.filter((call) => call.url === '/api/mail/modify')
    expect(JSON.parse(String(modify[0]?.init?.body))).toEqual({ threadId: 't1', action: 'trash' })
    calls = []
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(calls.some((call) => call.url.startsWith('/api/mail/inbox'))).toBe(true))
    const undo = calls.filter((call) => call.url === '/api/mail/modify')
    expect(JSON.parse(String(undo[0]?.init?.body))).toEqual({ threadId: 't1', action: 'untrash' })
    expect(await screen.findByRole('button', { name: 'Delete Jo Smith: Hello there' })).toBeTruthy()
  })

  it('the open email has a Delete icon in its actions', async () => {
    render(<MailApp clients={CLIENTS} />)
    fireEvent.click(await screen.findByText('Hello there'))
    const reader = await screen.findByTestId('mail-reader')
    await within(reader).findByRole('button', { name: 'Reply' })
    calls = []
    fireEvent.click(within(reader).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(within(reader).getByText('Select an email to read it.')).toBeTruthy())
    expect(JSON.parse(String(calls.find((call) => call.url === '/api/mail/modify')?.init?.body))).toEqual({ threadId: 't1', action: 'trash' })
  })

  it('Select all ticks only the emails loaded so far, not ones still behind Load more', async () => {
    const baseFetch = global.fetch
    const page1 = [
      { ...thread, threadId: 't1', subject: 'First', unread: true },
      { ...thread, threadId: 't2', messageId: 'm2', subject: 'Second', unread: true },
    ]
    const page2 = [{ ...thread, threadId: 't3', messageId: 'm3', subject: 'Third', unread: true }]
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/mail/inbox')) {
        const more = url.includes('pageToken=')
        return {
          ok: true,
          json: async () => ({ threads: more ? page2 : page1, nextPageToken: more ? null : 'r:next', account: 'me@od.com', senderClients: [] }),
        } as Response
      }
      return baseFetch(url, init)
    }) as unknown as typeof fetch
    render(<MailApp clients={CLIENTS} />)
    await screen.findByText('Second')
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
    expect(screen.getByText('2 selected')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await screen.findByText('Third')
    // The newly loaded email is not ticked; the earlier ones stay ticked.
    expect((screen.getByRole('checkbox', { name: /Third/ }) as HTMLInputElement).checked).toBe(false)
    expect(screen.getByText('2 selected')).toBeTruthy()
    // Select all again now takes in all three loaded, then Unselect all clears them.
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
    expect(screen.getByText('3 selected')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Unselect all' }))
    expect(screen.queryByText(/selected$/)).toBeNull()
  })

  it('puts the search box at the top of the email list, right above the first email', async () => {
    render(<MailApp clients={CLIENTS} />)
    await screen.findByText('Hello there')
    const search = screen.getByRole('combobox', { name: 'Search inbox' })
    const list = screen.getByRole('list', { name: 'Inbox' })
    // Search, then the Select all bar, then the first email.
    const selectAll = search.closest('form')?.nextElementSibling
    expect(selectAll?.querySelector('button')?.textContent).toBe('Select all')
    expect(selectAll?.nextElementSibling).toBe(list)
    expect(search.closest('[class*="toolbar"]')).toBeNull()
  })

  it('suggests regular senders as you type and lists their mail when one is picked', async () => {
    render(<MailApp clients={CLIENTS} />)
    await screen.findByText('Hello there')
    const search = screen.getByRole('combobox', { name: 'Search inbox' })
    fireEvent.focus(search)
    fireEvent.change(search, { target: { value: 'rebe' } })
    const option = await screen.findByRole('option', { name: /Rebekah Sadler/ })
    calls = []
    fireEvent.click(option)
    await waitFor(() => expect(calls.some((call) => call.url.startsWith('/api/mail/inbox'))).toBe(true))
    const url = new URL(calls.find((call) => call.url.startsWith('/api/mail/inbox'))?.url ?? '', 'https://cms.test')
    expect(url.searchParams.get('q')).toBe('rebekah@inthepicture.com.au')
    expect((search as HTMLInputElement).value).toBe('rebekah@inthepicture.com.au')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('searching part of a name also asks for mail from the people it matches', async () => {
    render(<MailApp clients={CLIENTS} />)
    await screen.findByText('Hello there')
    const search = screen.getByRole('combobox', { name: 'Search inbox' })
    fireEvent.change(search, { target: { value: 'inthe' } })
    calls = []
    fireEvent.submit(search.closest('form') as HTMLFormElement)
    await waitFor(() => expect(calls.some((call) => call.url.startsWith('/api/mail/inbox'))).toBe(true))
    const url = new URL(calls.find((call) => call.url.startsWith('/api/mail/inbox'))?.url ?? '', 'https://cms.test')
    expect(url.searchParams.get('q')).toBe('inthe')
    expect(url.searchParams.get('senders')).toBe('rebekah@inthepicture.com.au,carli@inthepicture.com.au')
  })

  it('does not hold a search back while the people list is still loading, then widens it', async () => {
    const baseFetch = global.fetch
    let releaseContacts: () => void = () => undefined
    const contactsGate = new Promise<void>((resolve) => {
      releaseContacts = resolve
    })
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/mail/contacts')) await contactsGate
      return baseFetch(url, init)
    }) as unknown as typeof fetch
    render(<MailApp clients={CLIENTS} />)
    await screen.findByText('Hello there')
    const search = screen.getByRole('combobox', { name: 'Search inbox' })
    fireEvent.change(search, { target: { value: 'inthe' } })
    calls = []
    fireEvent.submit(search.closest('form') as HTMLFormElement)
    const searches = () => calls.filter((call) => call.url.startsWith('/api/mail/inbox')).map((call) => new URL(call.url, 'https://cms.test'))
    await waitFor(() => expect(searches()).toHaveLength(1))
    expect(searches()[0]?.searchParams.get('q')).toBe('inthe')
    expect(searches()[0]?.searchParams.get('senders')).toBeNull()
    releaseContacts()
    await waitFor(() => expect(searches()).toHaveLength(2))
    expect(searches()[1]?.searchParams.get('senders')).toBe('rebekah@inthepicture.com.au,carli@inthepicture.com.au')
  })

  it('searches with the people saved in this browser straight away, without waiting for Gmail, and saves the refreshed list', async () => {
    localStorage.setItem(
      'mail-search-people:main',
      JSON.stringify({ savedAt: Date.now(), contacts: [], senders: [{ email: 'carli@inthepicture.com.au', name: 'Carli Markunsky' }] }),
    )
    const baseFetch = global.fetch
    // The fresh list never arrives during the search.
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/mail/contacts')) return new Promise<Response>(() => undefined)
      return baseFetch(url, init)
    }) as unknown as typeof fetch
    render(<MailApp clients={CLIENTS} />)
    await screen.findByText('Hello there')
    const search = screen.getByRole('combobox', { name: 'Search inbox' })
    fireEvent.focus(search)
    fireEvent.change(search, { target: { value: 'carl' } })
    // Suggestions come from the saved list at once.
    expect(await screen.findByRole('option', { name: /Carli Markunsky/ })).toBeTruthy()
    fireEvent.change(search, { target: { value: 'inthe' } })
    calls = []
    fireEvent.submit(search.closest('form') as HTMLFormElement)
    const searches = () => calls.filter((call) => call.url.startsWith('/api/mail/inbox')).map((call) => new URL(call.url, 'https://cms.test'))
    await waitFor(() => expect(searches()).toHaveLength(1))
    expect(searches()[0]?.searchParams.get('senders')).toBe('carli@inthepicture.com.au')
    // No second, late search.
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(searches()).toHaveLength(1)
  })

  it('has no Search in picker: one search looks at the person, subject and text, closest match first', async () => {
    const baseFetch = global.fetch
    const results = [
      { ...thread, threadId: 't1', subject: 'Notes from Rebekah', from: 'Sam <sam@x.com>' },
      { ...thread, threadId: 't2', messageId: 'm2', subject: 'Catch up', from: 'Rebekah Sadler <rebekah@inthepicture.com.au>' },
    ]
    render(<MailApp clients={CLIENTS} />)
    await screen.findByText('Hello there')
    expect(screen.queryByRole('combobox', { name: 'Search in' })).toBeNull()
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/mail/inbox')) {
        calls.push({ url, init })
        return { ok: true, json: async () => ({ threads: results, nextPageToken: null, account: 'me@od.com', senderClients: [] }) } as Response
      }
      return baseFetch(url, init)
    }) as unknown as typeof fetch
    const search = screen.getByRole('combobox', { name: 'Search inbox' })
    fireEvent.change(search, { target: { value: 'rebekah' } })
    calls = []
    fireEvent.submit(search.closest('form') as HTMLFormElement)
    await screen.findByText('Catch up')
    const searches = calls.filter((call) => call.url.startsWith('/api/mail/inbox')).map((call) => new URL(call.url, 'https://cms.test'))
    expect(searches[0]?.searchParams.get('scope')).toBeNull()
    // The sender match ranks above the subject match.
    const subjects = screen.getAllByRole('listitem').map((li) => li.textContent ?? '')
    expect(subjects.findIndex((t) => t.includes('Catch up'))).toBeLessThan(subjects.findIndex((t) => t.includes('Notes from Rebekah')))
  })

  it('suggests people you email as well as regular senders, from an @ and a domain', async () => {
    render(<MailApp clients={CLIENTS} />)
    await screen.findByText('Hello there')
    const search = screen.getByRole('combobox', { name: 'Search inbox' })
    fireEvent.focus(search)
    fireEvent.change(search, { target: { value: '@inthe' } })
    expect(await screen.findByRole('option', { name: /Rebekah Sadler/ })).toBeTruthy()
    expect(screen.getByRole('option', { name: /Carli Markunsky/ })).toBeTruthy()
  })

  it('saves the people list from Gmail for next time', async () => {
    render(<MailApp clients={CLIENTS} />)
    await screen.findByText('Hello there')
    fireEvent.focus(screen.getByRole('combobox', { name: 'Search inbox' }))
    await waitFor(() => expect(localStorage.getItem('mail-search-people:main')).toContain('rebekah@inthepicture.com.au'))
  })

  it('keeps Download thread, Mark as client and Hide sender in a ⋯ menu on the open email, and names the compose button Write message', async () => {
    render(<MailApp clients={CLIENTS} />)
    expect(screen.getByRole('button', { name: 'Write message' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Draft with AI' })).toBeNull()
    fireEvent.click(await screen.findByText('Hello there'))
    const more = await screen.findByRole('button', { name: 'More actions for this email' })
    // Not shown in the action row any more.
    for (const name of [/Download thread/, /Mark as client/, /^Hide sender$/]) expect(screen.queryByRole('button', { name })).toBeNull()
    expect(screen.getByRole('button', { name: 'Reply' })).toBeTruthy()

    fireEvent.click(more)
    const menu = screen.getByRole('menu', { name: 'More actions for this email' })
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Download thread (.md)',
      '☆ Mark as client',
      'Hide sender',
    ])
    // A sender with a domain still gets the address-or-domain choice, shown inline.
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Hide sender' }))
    expect(screen.getByRole('button', { name: 'Hide all @acme.com.au' })).toBeTruthy()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('starts the Gmail sync only after the first list has loaded', async () => {
    render(<MailApp clients={CLIENTS} />)
    await waitFor(() => expect(calls.some((call) => call.url.startsWith('/api/mail/sync'))).toBe(true))
    const inboxAt = calls.findIndex((call) => call.url.startsWith('/api/mail/inbox'))
    const syncAt = calls.findIndex((call) => call.url.startsWith('/api/mail/sync'))
    expect(inboxAt).toBeGreaterThanOrEqual(0)
    expect(syncAt).toBeGreaterThan(inboxAt)
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

describe('MailApp links opened while Mail is open (client email alert, bell)', () => {
  it('clears the search, shows the whole inbox again and opens the linked email', async () => {
    const { openCmsMailLink } = await import('@/lib/mail/drafts')
    window.history.replaceState(null, '', '/admin/mail')
    render(<MailApp clients={CLIENTS} />)
    await screen.findByText('Hello there')
    const search = screen.getByRole('combobox', { name: 'Search inbox' })
    fireEvent.change(search, { target: { value: 'invoice' } })
    fireEvent.submit(search.closest('form') as HTMLFormElement)
    await waitFor(() => expect(calls.some((call) => call.url.includes('q=invoice'))).toBe(true))
    calls = []

    const push = vi.fn()
    expect(openCmsMailLink('/admin/mail?thread=t9', push)).toBe(true)
    expect(push).not.toHaveBeenCalled()
    await waitFor(() => expect(calls.some((call) => call.url === '/api/mail/thread/t9')).toBe(true))
    expect((search as HTMLInputElement).value).toBe('')
    const inbox = calls.find((call) => call.url.startsWith('/api/mail/inbox'))
    expect(inbox).toBeTruthy()
    expect(new URL(inbox?.url ?? '', 'https://cms.test').searchParams.get('q')).toBeNull()
  })

  it('navigates normally when Mail is not open', async () => {
    const { openCmsMailLink } = await import('@/lib/mail/drafts')
    window.history.replaceState(null, '', '/admin/clients')
    const push = vi.fn()
    expect(openCmsMailLink('/admin/mail?thread=t9', push)).toBe(false)
    expect(push).toHaveBeenCalledWith('/admin/mail?thread=t9')
    window.history.replaceState(null, '', '/')
  })
})

describe('MailApp breadcrumb account switcher', () => {
  it('offers one Add email account button that asks for the address and signs it in', async () => {
    const baseFetch = global.fetch
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/mail/accounts')) {
        return {
          ok: true,
          json: async () => ({
            primary: 'me@od.com',
            accounts: [],
            addUrl: '/api/gmail/connect?add=1',
            canAdd: true,
          }),
        } as Response
      }
      return baseFetch(url, init)
    }) as unknown as typeof fetch
    render(<MailApp clients={CLIENTS} />)
    await screen.findByText('Hello there')
    await waitFor(() => expect(nav.items).toHaveLength(2))
    const crumb = render(<>{nav.items[1]?.label as React.ReactElement}</>)
    fireEvent.click(await within(crumb.container).findByRole('button', { name: /me@od\.com/ }))
    const menu = await screen.findByRole('menu', { name: 'Gmail accounts' })
    const adds = within(menu).getAllByRole('menuitem').filter((item) => item.textContent?.startsWith('+'))
    expect(adds.map((item) => item.textContent)).toEqual(['+ Add email account'])
    const assign = vi.fn()
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, assign } as Location)
    fireEvent.click(adds[0] as HTMLElement)
    const box = within(menu).getByRole('textbox', { name: 'Email account to add' })
    // Not an address, or one already in Mail: stays in the menu with a message.
    fireEvent.change(box, { target: { value: 'peter' } })
    fireEvent.submit(box.closest('form') as HTMLFormElement)
    expect(within(menu).getByRole('alert').textContent).toBe('Enter a full email address.')
    fireEvent.change(box, { target: { value: 'ME@od.com' } })
    fireEvent.submit(box.closest('form') as HTMLFormElement)
    expect(within(menu).getByRole('alert').textContent).toBe('That account is already in Mail.')
    fireEvent.change(box, { target: { value: ' Peter@CipherHealth.com.au ' } })
    fireEvent.submit(box.closest('form') as HTMLFormElement)
    expect(assign).toHaveBeenCalledWith('/api/gmail/connect?add=1&email=peter%40cipherhealth.com.au')
  })

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
    expect(within(menu).getByRole('menuitem', { name: '+ Add email account' })).toBeTruthy()
    calls = []
    fireEvent.click(within(menu).getByRole('menuitem', { name: /^sales@od\.com/ }))

    await waitFor(() => expect(calls.some((call) => call.url.startsWith('/api/mail/inbox'))).toBe(true))
    for (const call of calls.filter((entry) => entry.url.startsWith('/api/mail/'))) {
      expect((call.init?.headers as Record<string, string>)['x-mail-account']).toBe('sales@od.com')
    }
    // The choice is not remembered: Mail opens on the main Gmail next time.
    expect(localStorage.getItem('mail-active-account')).toBeNull()
  })

  it('always opens on the main Gmail, even if an older version remembered another account', async () => {
    localStorage.setItem('mail-active-account', 'sales@od.com')
    render(<MailApp clients={CLIENTS} />)
    await waitFor(() => expect(calls.some((call) => call.url.startsWith('/api/mail/inbox'))).toBe(true))
    const inbox = calls.find((call) => call.url.startsWith('/api/mail/inbox'))
    expect((inbox?.init?.headers as Record<string, string> | undefined)?.['x-mail-account']).toBeUndefined()
    expect(localStorage.getItem('mail-active-account')).toBeNull()
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

describe('MailApp "Open in new window"', () => {
  it('opens the open email in its own window, on the account on screen', async () => {
    window.history.replaceState(null, '', '/admin/mail?account=sales%40od.com')
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window)
    render(<MailApp clients={CLIENTS} />)
    fireEvent.click(await screen.findByText('Hello there'))
    fireEvent.click(await screen.findByRole('button', { name: 'Open in new window' }))
    expect(open).toHaveBeenCalledWith('/admin/mail/window?thread=t1&account=sales%40od.com', 'mail-t1', 'popup,width=1000,height=900')
  })

  it('says so when the browser blocks the window', async () => {
    window.history.replaceState(null, '', '/admin/mail')
    vi.spyOn(window, 'open').mockReturnValue(null)
    render(<MailApp clients={CLIENTS} />)
    fireEvent.click(await screen.findByText('Hello there'))
    fireEvent.click(await screen.findByRole('button', { name: 'Open in new window' }))
    expect(await screen.findByText(/blocked the new window/)).toBeTruthy()
  })

  it('the window shows only that email, with reply and the other actions, and keeps its URL', async () => {
    window.history.replaceState(null, '', '/admin/mail/window?thread=t1&account=sales%40od.com')
    render(<MailApp clients={CLIENTS} windowMode />)
    const reader = await screen.findByTestId('mail-reader')
    await within(reader).findByRole('heading', { name: 'Hello there' })
    // No folder tabs, inbox list or account breadcrumb; no inbox loads or syncs.
    expect(screen.queryByRole('tablist', { name: 'Mail folders' })).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Search inbox' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open in new window' })).toBeNull()
    expect(calls.some((call) => call.url.startsWith('/api/mail/inbox') || call.url.startsWith('/api/mail/sync'))).toBe(false)
    // The thread is read on the account from the URL, and the URL stays for a reload.
    const threadCall = calls.find((call) => call.url === '/api/mail/thread/t1')
    expect((threadCall?.init?.headers as Record<string, string>)['x-mail-account']).toBe('sales@od.com')
    expect(window.location.search).toBe('?thread=t1&account=sales%40od.com')
    expect(document.title).toBe('Hello there · Mail')
    // Delete and Mark read/unread act on the window's one row, built once the thread loads.
    expect(await within(reader).findByRole('button', { name: 'Delete' })).toBeTruthy()
    for (const name of ['Reply', 'Reply all', 'Forward', 'Archive', 'Mark unread']) {
      expect(within(reader).getByRole('button', { name })).toBeTruthy()
    }
    fireEvent.click(within(reader).getByRole('button', { name: 'Reply' }))
    expect(await screen.findByTestId('compose')).toBeTruthy()
  })

  it('after Delete in the window, offers Undo, which brings the email back', async () => {
    window.history.replaceState(null, '', '/admin/mail/window?thread=t1')
    render(<MailApp clients={CLIENTS} windowMode />)
    const reader = await screen.findByTestId('mail-reader')
    await within(reader).findByRole('heading', { name: 'Hello there' })
    const del = await within(reader).findByRole('button', { name: 'Delete' })
    calls = []
    fireEvent.click(del)
    expect(await within(reader).findByText(/Deleted “Hello there”/)).toBeTruthy()
    expect(within(reader).getByRole('button', { name: 'Close window' })).toBeTruthy()
    fireEvent.click(within(reader).getByRole('button', { name: 'Undo' }))
    await within(reader).findByRole('heading', { name: 'Hello there' })
    const modify = calls.filter((call) => call.url === '/api/mail/modify').map((call) => JSON.parse(String(call.init?.body)))
    expect(modify).toEqual([
      { threadId: 't1', action: 'trash' },
      { threadId: 't1', action: 'untrash' },
    ])
  })
})
