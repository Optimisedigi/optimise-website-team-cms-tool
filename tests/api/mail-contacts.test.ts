import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const listMessageIdsMatching = vi.fn(async (_tok: string, q: string) => (q.startsWith('in:sent') ? ['s1'] : ['r1', 'r2']))
const getMessageHeaders = vi.fn(async () => [
  { messageId: 's1', threadId: 't', from: 'me@od.com', to: 'Carli <carli@client.com>', cc: '', labelIds: ['SENT'] },
  { messageId: 'r1', threadId: 't', from: 'Dan <dan@x.com>', to: 'me@od.com', cc: '', labelIds: ['INBOX'] },
  { messageId: 'r2', threadId: 't', from: 'Deals <deals@shop.com>', to: 'me@od.com', cc: '', labelIds: ['INBOX'], listUnsubscribe: '<u>' },
])
const requireMailUser = vi.fn(async (): Promise<unknown> => ({ payload: {}, user: { id: 5, email: 'me@od.com' } }))

vi.mock('@/lib/mail/gmail-mail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mail/gmail-mail')>()),
  listMessageIdsMatching,
  getMessageHeaders,
}))
vi.mock('@/lib/mail/route-helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mail/route-helpers')>()),
  requireMailUser,
  requireGmailToken: vi.fn(async () => ({ accessToken: 'tok', email: 'me@od.com', userEmail: 'me@od.com', account: '' })),
}))

const { GET } = await import('@/app/(frontend)/api/mail/contacts/route')
const get = () => new NextRequest('https://cms.test/api/mail/contacts')

afterEach(() => vi.clearAllMocks())

describe('GET /api/mail/contacts', () => {
  it('returns people from sent and received mail, without marketing, never cached', async () => {
    const res = await GET(get())
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('no-store')
    expect(await res.json()).toEqual({
      contacts: [
        { email: 'carli@client.com', name: 'Carli' },
        { email: 'dan@x.com', name: 'Dan' },
      ],
      // Dan emailed once, so is not yet a regular sender.
      senders: [],
    })
    const received = listMessageIdsMatching.mock.calls.find(([, q]) => !q.startsWith('in:sent'))?.[1] ?? ''
    expect(received).toContain('-category:promotions')
    expect(received).toContain('-category:updates')
  })

  it('needs a logged-in Mail user', async () => {
    requireMailUser.mockResolvedValueOnce(NextResponse.json({ error: 'You must be logged in.' }, { status: 401 }))
    const res = await GET(get())
    expect(res.status).toBe(401)
    expect(listMessageIdsMatching).not.toHaveBeenCalled()
  })
})
