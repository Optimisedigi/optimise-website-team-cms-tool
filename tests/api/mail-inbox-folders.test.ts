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
  isHiddenSender: vi.fn((from: string) => from.endsWith('@news.com>')),
}))
vi.mock('@/lib/mail/client-senders', () => ({ loadClientSenders: vi.fn(async () => []) }))
vi.mock('@/lib/mail/sender-clients', () => ({ loadSenderClients: vi.fn(async () => []) }))
vi.mock('@/lib/mail/route-helpers', () => ({
  requireMailUser: vi.fn(async () => ({ payload: {}, user: { id: 1 } })),
  requireGmailToken: vi.fn(async () => ({ accessToken: 'tok', email: 'me@od.com', userEmail: 'me@od.com' })),
  gmailErrorResponse: vi.fn(),
}))

const { GET } = await import('@/app/(frontend)/api/mail/inbox/route')

const request = (query: string) => new NextRequest(`https://cms.test/api/mail/inbox${query}`)

// `count` list rows with ids `${prefix}${from}`, `${prefix}${from + 1}`, ...
const rows = (prefix: string, from: number, count: number, unread: boolean) =>
  Array.from({ length: count }, (_, i) => ({
    threadId: `${prefix}${from + i}`, messageId: `m-${prefix}${from + i}`, from: 'Jo <jo@client.com>', to: 'me@od.com', cc: '',
    subject: 's', snippet: '', date: '', unread, messageCount: 1,
  }))

afterEach(() => {
  vi.clearAllMocks()
  listFolderThreads.mockReset()
  listFolderThreads.mockImplementation(async () => ({ threads: rows('t', 1, 1, false), nextPageToken: null }))
})

describe('GET /api/mail/inbox folders', () => {
  it('defaults to the inbox and applies the hidden-sender filter there', async () => {
    const res = await GET(request(''))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ folder: 'inbox', threads: [{ threadId: 't1', client: null }] })
    expect(listFolderThreads).toHaveBeenCalledWith('tok', 'inbox', { pageToken: undefined, q: '-from:news.com -in:sent is:unread', maxResults: 45 })
    // t1 is already listed, so the read part still asks for a full page.
    expect(listFolderThreads).toHaveBeenCalledWith('tok', 'inbox', { pageToken: undefined, q: '-from:news.com -in:sent -is:unread', maxResults: 44 })
  })

  it('lists every unread thread before any read one, across pages', async () => {
    // Page 1: more unread threads than fit, so only unread ones come back (page filled to 45).
    listFolderThreads.mockResolvedValueOnce({ threads: rows('u', 0, 45, true), nextPageToken: 'g2' })
    const first = await (await GET(request(''))).json()
    expect(first.threads).toHaveLength(45)
    expect(first.threads.every((t: { unread: boolean }) => t.unread)).toBe(true)
    expect(first.nextPageToken).toBe('u:g2')
    expect(listFolderThreads).toHaveBeenCalledTimes(1)

    // Page 2: the last unread threads, then the read ones start in the same page (no duplicates).
    listFolderThreads
      .mockResolvedValueOnce({ threads: rows('u', 45, 3, true), nextPageToken: null })
      .mockResolvedValueOnce({ threads: [...rows('u', 47, 1, true), ...rows('r', 0, 42, false)], nextPageToken: 'g9' })
    const second = await (await GET(request('?pageToken=u:g2'))).json()
    expect(listFolderThreads).toHaveBeenNthCalledWith(2, 'tok', 'inbox', { pageToken: 'g2', q: '-from:news.com -in:sent is:unread', maxResults: 45 })
    expect(listFolderThreads).toHaveBeenNthCalledWith(3, 'tok', 'inbox', { pageToken: undefined, q: '-from:news.com -in:sent -is:unread', maxResults: 42 })
    expect(second.threads.slice(0, 3).map((t: { threadId: string }) => t.threadId)).toEqual(['u45', 'u46', 'u47'])
    expect(second.threads).toHaveLength(45)
    expect(listFolderThreads).toHaveBeenCalledTimes(3)
    expect(second.nextPageToken).toBe('r:g9')

    // Page 3: read threads only.
    listFolderThreads.mockResolvedValueOnce({ threads: rows('r', 42, 1, false), nextPageToken: null })
    const third = await (await GET(request('?pageToken=r:g9&q=budget'))).json()
    expect(listFolderThreads).toHaveBeenLastCalledWith('tok', 'inbox', { pageToken: 'g9', q: '{budget from:budget} -from:news.com -in:sent -is:unread', maxResults: 45 })
    expect(third).toMatchObject({ threads: [{ threadId: 'r42' }], nextPageToken: null })
  })

  it('inbox search matches the sender address as well as the subject', async () => {
    const res = await GET(request(`?q=${encodeURIComponent('jo@client.com')}`))
    expect(res.status).toBe(200)
    expect(listFolderThreads).toHaveBeenCalledWith('tok', 'inbox', {
      pageToken: undefined,
      q: '{jo@client.com from:jo@client.com} -from:news.com -in:sent is:unread',
      maxResults: 45,
    })
    // A hand-written Gmail search is sent as typed.
    await GET(request(`?q=${encodeURIComponent('subject:invoice')}`))
    expect(listFolderThreads).toHaveBeenCalledWith('tok', 'inbox', {
      pageToken: undefined,
      q: 'subject:invoice -from:news.com -in:sent is:unread',
      maxResults: 45,
    })
  })

  it('adds the people the Mail page matched to part of a name as from: matches', async () => {
    const res = await GET(request(`?q=rebe&senders=${encodeURIComponent('rebekah@inthepicture.com.au,not-an-address')}`))
    expect(res.status).toBe(200)
    expect(listFolderThreads).toHaveBeenCalledWith('tok', 'inbox', {
      pageToken: undefined,
      q: '{rebe from:rebe from:rebekah@inthepicture.com.au} -from:news.com -in:sent is:unread',
      maxResults: 45,
    })
  })

  it('tops up a short page (one thread can fill several Gmail results) before showing Load more', async () => {
    // Gmail pages count messages: 45 results here were only 10 threads.
    listFolderThreads
      .mockResolvedValueOnce({ threads: [], nextPageToken: null })
      .mockResolvedValueOnce({ threads: rows('r', 0, 10, false), nextPageToken: 'a' })
      .mockResolvedValueOnce({ threads: rows('r', 10, 30, false), nextPageToken: 'b' })
      .mockResolvedValueOnce({ threads: rows('r', 40, 5, false), nextPageToken: 'c' })
    const page = await (await GET(request(''))).json()
    expect(page.threads).toHaveLength(45)
    expect(page.nextPageToken).toBe('r:c')
    expect(listFolderThreads).toHaveBeenNthCalledWith(3, 'tok', 'inbox', { pageToken: 'a', q: '-from:news.com -in:sent -is:unread', maxResults: 35 })
    expect(listFolderThreads).toHaveBeenNthCalledWith(4, 'tok', 'inbox', { pageToken: 'b', q: '-from:news.com -in:sent -is:unread', maxResults: 5 })
  })

  it('stops after a few Gmail calls even if the page is still short', async () => {
    listFolderThreads.mockResolvedValue({ threads: [], nextPageToken: 'more' })
    const page = await (await GET(request('?pageToken=r:x'))).json()
    expect(listFolderThreads).toHaveBeenCalledTimes(4)
    expect(page.nextPageToken).toBe('r:more')
  })

  it('carries on with the read part next page when unread fills this one exactly', async () => {
    listFolderThreads.mockResolvedValueOnce({ threads: rows('u', 0, 45, true), nextPageToken: null })
    const page = await (await GET(request(''))).json()
    expect(listFolderThreads).toHaveBeenCalledTimes(1)
    expect(page.nextPageToken).toBe('r:')
  })

  it('lists Sent and Drafts without the hidden-sender filter', async () => {
    expect((await GET(request('?folder=sent&q=budget'))).status).toBe(200)
    expect(listFolderThreads).toHaveBeenLastCalledWith('tok', 'sent', { pageToken: undefined, q: 'budget', maxResults: 45 })
    expect(await (await GET(request('?folder=drafts&pageToken=p2'))).json()).toMatchObject({ folder: 'drafts' })
    expect(listFolderThreads).toHaveBeenLastCalledWith('tok', 'drafts', { pageToken: 'p2', q: undefined, maxResults: 45 })
  })

  it('rejects unknown folders before touching Gmail', async () => {
    const res = await GET(request('?folder=spam'))
    expect(res.status).toBe(400)
    expect(listFolderThreads).not.toHaveBeenCalled()
  })
})
