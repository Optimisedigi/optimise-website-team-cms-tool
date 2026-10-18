import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const getFolderCounts = vi.fn(async () => ({ inboxUnread: 4, drafts: 2 }))
const deleteDraft = vi.fn(async () => undefined)
const createScheduledEmail = vi.fn(async () => 7)
const countScheduledEmails = vi.fn(async () => 0)
const listScheduledEmails = vi.fn(async () => [{ id: 7 }])

vi.mock('@/lib/mail/gmail-mail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mail/gmail-mail')>()),
  getFolderCounts,
  deleteDraft,
}))
vi.mock('@/lib/mail/scheduled', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mail/scheduled')>()),
  createScheduledEmail,
  countScheduledEmails,
  listScheduledEmails,
  scheduleDb: vi.fn(() => ({})),
}))
vi.mock('@/lib/agents/_shared/user-gmail-tokens', () => ({
  getValidGmailToken: vi.fn(async () => ({ ok: true, accessToken: 'tok', email: 'me@od.com', userEmail: 'me@od.com' })),
}))
vi.mock('@/lib/mail/route-helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mail/route-helpers')>()),
  requireMailUser: vi.fn(async () => ({ payload: {}, user: { id: 5 } })),
  requireGmailToken: vi.fn(async () => ({ accessToken: 'tok', email: 'me@od.com', userEmail: 'me@od.com' })),
}))

const counts = await import('@/app/(frontend)/api/mail/counts/route')
const schedule = await import('@/app/(frontend)/api/mail/schedule/route')

const post = (body: unknown) =>
  new NextRequest('https://cms.test/api/mail/schedule', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()
const valid = { to: 'jo@client.com', subject: 'Hi', html: '<p>Hello</p>', scheduledFor: inHours(2) }

afterEach(() => vi.clearAllMocks())

describe('GET /api/mail/counts', () => {
  it('returns the Inbox unread and Drafts counts only', async () => {
    const res = await counts.GET(new NextRequest('https://cms.test/api/mail/counts'))
    expect(await res.json()).toEqual({ inboxUnread: 4, drafts: 2 })
    expect(getFolderCounts).toHaveBeenCalledWith('tok')
  })
})

describe('POST /api/mail/schedule', () => {
  it('queues a valid email for the signed-in user', async () => {
    const res = await schedule.POST(post(valid))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: 7, scheduledFor: valid.scheduledFor })
    expect(createScheduledEmail).toHaveBeenCalledWith({}, expect.objectContaining({ ownerId: 5, to: 'jo@client.com', subject: 'Hi', replyToMessageId: null }))
  })

  it('removes the Gmail draft it was opened from', async () => {
    await schedule.POST(post({ ...valid, draftId: 'r123' }))
    expect(deleteDraft).toHaveBeenCalledWith('tok', 'r123')
  })

  it.each([
    ['a past time', { scheduledFor: inHours(-1) }],
    ['no time', { scheduledFor: '' }],
    ['no recipient', { to: '' }],
    ['an empty body', { html: '<p> </p>' }],
    ['a bad draft id', { draftId: 'a b/c' }],
  ])('rejects %s without queueing', async (_name, patch) => {
    const res = await schedule.POST(post({ ...valid, ...patch }))
    expect(res.status).toBe(400)
    expect(createScheduledEmail).not.toHaveBeenCalled()
  })

  it('allows a reply with no typed recipient (resolved from the original at send time)', async () => {
    expect((await schedule.POST(post({ ...valid, to: '', replyToMessageId: 'abc' }))).status).toBe(200)
  })

  it('stops at the queue limit', async () => {
    countScheduledEmails.mockResolvedValueOnce(100)
    expect((await schedule.POST(post(valid))).status).toBe(400)
    expect(createScheduledEmail).not.toHaveBeenCalled()
  })
})

describe('GET /api/mail/schedule', () => {
  it('lists the user’s queue', async () => {
    const res = await schedule.GET(new NextRequest('https://cms.test/api/mail/schedule'))
    expect(await res.json()).toEqual({ items: [{ id: 7 }] })
    expect(listScheduledEmails).toHaveBeenCalledWith({}, 5)
  })
})
