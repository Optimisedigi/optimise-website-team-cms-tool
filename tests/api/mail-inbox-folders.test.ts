import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const listFolderThreads = vi.fn(async () => ({
  threads: [{ threadId: 't1', messageId: 'm1', from: 'me@od.com', to: 'jo@client.com', cc: '', subject: 'Hi', snippet: '', date: '', unread: false, messageCount: 1 }],
  nextPageToken: null,
}))

vi.mock('@/lib/mail/gmail-mail', () => ({ listFolderThreads }))
vi.mock('@/lib/mail/client-matching', () => ({ matchMessageToClient: vi.fn(() => null) }))
vi.mock('@/lib/mail/store', () => ({ loadClientDomainIndex: vi.fn(async () => ({})) }))
vi.mock('@/lib/mail/hidden-senders', () => ({
  loadHiddenSenders: vi.fn(async () => ['@news.com']),
  hiddenSendersQuery: vi.fn(() => '-from:news.com'),
}))
vi.mock('@/lib/mail/client-senders', () => ({ loadClientSenders: vi.fn(async () => []) }))
vi.mock('@/lib/mail/route-helpers', () => ({
  requireMailUser: vi.fn(async () => ({ payload: {}, user: { id: 1 } })),
  requireGmailToken: vi.fn(async () => ({ accessToken: 'tok', email: 'me@od.com', userEmail: 'me@od.com' })),
  gmailErrorResponse: vi.fn(),
}))

const { GET } = await import('@/app/(frontend)/api/mail/inbox/route')

const request = (query: string) => new NextRequest(`https://cms.test/api/mail/inbox${query}`)

afterEach(() => vi.clearAllMocks())

describe('GET /api/mail/inbox folders', () => {
  it('defaults to the inbox and applies the hidden-sender filter there', async () => {
    const res = await GET(request(''))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ folder: 'inbox', threads: [{ threadId: 't1', client: null }] })
    expect(listFolderThreads).toHaveBeenCalledWith('tok', 'inbox', { pageToken: undefined, q: '-from:news.com' })
  })

  it('lists Sent and Drafts without the hidden-sender filter', async () => {
    expect((await GET(request('?folder=sent&q=budget'))).status).toBe(200)
    expect(listFolderThreads).toHaveBeenLastCalledWith('tok', 'sent', { pageToken: undefined, q: 'budget' })
    expect(await (await GET(request('?folder=drafts&pageToken=p2'))).json()).toMatchObject({ folder: 'drafts' })
    expect(listFolderThreads).toHaveBeenLastCalledWith('tok', 'drafts', { pageToken: 'p2', q: undefined })
  })

  it('rejects unknown folders before touching Gmail', async () => {
    const res = await GET(request('?folder=spam'))
    expect(res.status).toBe(400)
    expect(listFolderThreads).not.toHaveBeenCalled()
  })
})
