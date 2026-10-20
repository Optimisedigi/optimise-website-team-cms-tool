import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const getFolderCounts = vi.fn(async () => ({ inboxUnread: 4, drafts: 2 }))
const deleteDraft = vi.fn(async () => undefined)
const createScheduledEmail = vi.fn(async () => 7)
const countScheduledEmails = vi.fn(async () => 0)
const listScheduledEmails = vi.fn(async () => [{ id: 7 }])
type Found = { item: { id: number; status: string; scheduledFor: string }; replyToMessageId: string | null; content: unknown } | null
const getScheduledEmail = vi.fn(
  async (): Promise<Found> => ({ item: { id: 7, status: 'pending', scheduledFor: '2026-12-01T08:00:00.000Z' }, replyToMessageId: null, content: { html: '<p>Hi</p>' } }),
)
const updateScheduledEmail = vi.fn(async () => true)

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
  getScheduledEmail,
  updateScheduledEmail,
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
const scheduleItem = await import('@/app/(frontend)/api/mail/schedule/[id]/route')
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const put = (body: unknown) =>
  new NextRequest('https://cms.test/api/mail/schedule/7', { method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })

const post = (body: unknown) =>
  new NextRequest('https://cms.test/api/mail/schedule', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()
const valid = { to: 'jo@client.com', subject: 'Hi', html: '<p>Hello</p>', scheduledFor: inHours(2) }

afterEach(() => vi.clearAllMocks())

describe('GET /api/mail/counts', () => {
  it('returns the Inbox unread, Drafts and Scheduled counts', async () => {
    countScheduledEmails.mockResolvedValueOnce(3)
    const res = await counts.GET(new NextRequest('https://cms.test/api/mail/counts'))
    expect(await res.json()).toEqual({ inboxUnread: 4, drafts: 2, scheduled: 3 })
    expect(getFolderCounts).toHaveBeenCalledWith('tok')
    expect(countScheduledEmails).toHaveBeenCalledWith({}, 5)
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

describe('/api/mail/schedule/:id', () => {
  it('GET returns the email with its editable content, only the owner’s', async () => {
    const res = await scheduleItem.GET(new NextRequest('https://cms.test/api/mail/schedule/7'), params('7'))
    expect(await res.json()).toMatchObject({ item: { id: 7 }, html: '<p>Hi</p>', attachments: [], bcc: '' })
    expect(getScheduledEmail).toHaveBeenCalledWith({}, 7, 5)
    getScheduledEmail.mockResolvedValueOnce(null)
    expect((await scheduleItem.GET(new NextRequest('https://cms.test/api/mail/schedule/8'), params('8'))).status).toBe(404)
  })

  it('PUT saves validated edits, keeping the time when none is sent', async () => {
    const res = await scheduleItem.PUT(put({ to: 'sam@x.com', subject: 'New', html: '<p>Edited</p>', bcc: 'b@x.com' }), params('7'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, scheduledFor: '2026-12-01T08:00:00.000Z' })
    expect(updateScheduledEmail).toHaveBeenCalledWith(
      {},
      7,
      5,
      expect.objectContaining({ to: 'sam@x.com', subject: 'New', scheduledFor: null, content: expect.objectContaining({ html: '<p>Edited</p>', bcc: 'b@x.com' }) }),
      expect.any(Date),
    )
  })

  it('PUT rejects bad edits and emails that are already sending', async () => {
    expect((await scheduleItem.PUT(put({ to: 'sam@x.com', html: '<p> </p>' }), params('7'))).status).toBe(400)
    expect((await scheduleItem.PUT(put({ to: 'sam@x.com', html: '<p>x</p>', scheduledFor: inHours(-1) }), params('7'))).status).toBe(400)
    getScheduledEmail.mockResolvedValueOnce({ item: { id: 7, status: 'sending', scheduledFor: '' }, replyToMessageId: null, content: null })
    expect((await scheduleItem.PUT(put({ to: 'sam@x.com', html: '<p>x</p>' }), params('7'))).status).toBe(409)
    expect(updateScheduledEmail).not.toHaveBeenCalled()
  })
})
