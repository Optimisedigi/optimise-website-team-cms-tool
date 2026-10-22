import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const modifyThreadLabels = vi.fn(async (_token: string, _id: string, _change: unknown) => undefined)

vi.mock('@/lib/mail/gmail-mail', async (importOriginal) => ({
  mapLimited: (await importOriginal<typeof import('@/lib/mail/gmail-mail')>()).mapLimited,
  modifyThreadLabels: (token: string, id: string, change: unknown) => modifyThreadLabels(token, id, change),
}))
vi.mock('@/lib/mail/route-helpers', async (importOriginal) => ({
  parseGmailId: (await importOriginal<typeof import('@/lib/mail/route-helpers')>()).parseGmailId,
  readJson: async (req: NextRequest) => req.json(),
  requireMailUser: vi.fn(async () => ({ payload: {}, user: { id: 1 } })),
  requireGmailToken: vi.fn(async () => ({ accessToken: 'tok', email: 'me@od.com', userEmail: 'me@od.com' })),
  gmailErrorResponse: vi.fn(() => new Response(JSON.stringify({ error: 'gmail' }), { status: 502 })),
}))

const { POST } = await import('@/app/(frontend)/api/mail/modify/route')

const post = (body: unknown) =>
  new NextRequest('https://cms.test/api/mail/modify', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })

afterEach(() => vi.clearAllMocks())

describe('POST /api/mail/modify', () => {
  it('marks several threads read at once, each one once', async () => {
    const res = await POST(post({ threadIds: ['t1', 't2', 't1'], action: 'read' }))
    expect(res.status).toBe(200)
    expect(modifyThreadLabels.mock.calls.map((call) => [call[1], call[2]])).toEqual([
      ['t1', { add: [], remove: ['UNREAD'] }],
      ['t2', { add: [], remove: ['UNREAD'] }],
    ])
  })

  it('still changes one thread at a time for archive and unread', async () => {
    expect((await POST(post({ threadId: 't9', action: 'archive' }))).status).toBe(200)
    expect(modifyThreadLabels).toHaveBeenCalledWith('tok', 't9', { add: [], remove: ['INBOX'] })
  })

  it('refuses bulk archive, empty or oversized lists and bad ids, touching nothing', async () => {
    const bad = [
      { threadIds: ['t1'], action: 'archive' },
      { threadIds: [], action: 'read' },
      { threadIds: Array.from({ length: 51 }, (_, i) => `t${i}`), action: 'read' },
      { threadIds: ['../x'], action: 'read' },
    ]
    for (const body of bad) expect((await POST(post(body))).status).toBe(400)
    expect(modifyThreadLabels).not.toHaveBeenCalled()
  })
})
