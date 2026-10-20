import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { SCHEDULED_EMAILS_SCHEMA } from '@/lib/mail/schema'
import {
  cancelScheduledEmail,
  countScheduledEmails,
  createScheduledEmail,
  failStaleSending,
  listScheduledEmails,
  parseScheduledFor,
  rescheduleScheduledEmail,
  scheduleDb,
  sendDueScheduledEmails,
  sendScheduledEmail,
  type SendDeps,
} from '@/lib/mail/scheduled'

// A real in-memory SQLite database with the migration's own SQL, so the
// conditional UPDATE/DELETE claims are exercised, not mocked.
let client: Client
let payload: Payload

const NOW = new Date('2026-10-19T02:00:00.000Z')
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000)
const HTML = '<p>Hello</p>'

async function queue(overrides: Partial<{ ownerId: number; when: Date; to: string; replyTo: string | null }> = {}) {
  return createScheduledEmail(scheduleDb(payload), {
    ownerId: overrides.ownerId ?? 1,
    to: overrides.to ?? 'jo@client.com',
    cc: '',
    subject: 'Hi',
    replyToMessageId: overrides.replyTo ?? null,
    scheduledFor: overrides.when ?? minutes(10),
    content: { html: HTML, inlineImages: [], attachments: [] },
  })
}

async function statusOf(id: number) {
  const res = await client.execute({ sql: 'select status, attempts, last_error, content, sent_message_id from scheduled_emails where id = ?', args: [id] })
  return res.rows[0] as unknown as { status: string; attempts: number; last_error: string | null; content: string | null; sent_message_id: string | null } | undefined
}

function deps(deliver: SendDeps['deliver'], now = NOW): SendDeps {
  return {
    now: () => now,
    getToken: async () => ({ ok: true, accessToken: 'tok', email: 'me@od.com', userEmail: 'me@od.com' }),
    deliver,
  }
}
const delivered = () => vi.fn(async () => ({ ok: true as const, messageId: 'gm1', threadId: 'gt1', client: null }))

beforeEach(async () => {
  client = createClient({ url: ':memory:' })
  await client.execute('create table users (id integer primary key)')
  await client.execute('insert into users (id) values (1), (2)')
  for (const [, statement] of SCHEDULED_EMAILS_SCHEMA) await client.execute(statement)
  payload = { db: { drizzle: drizzle(client) } } as unknown as Payload
})
afterEach(() => client.close())

describe('parseScheduledFor', () => {
  it('accepts a time at least a minute ahead and at most a year ahead', () => {
    expect(parseScheduledFor(minutes(5).toISOString(), NOW)).toEqual({ ok: true, date: minutes(5) })
  })
  it('rejects missing, invalid, past and far-future times', () => {
    expect(parseScheduledFor('', NOW).ok).toBe(false)
    expect(parseScheduledFor('tomorrow-ish', NOW).ok).toBe(false)
    expect(parseScheduledFor(minutes(-5).toISOString(), NOW).ok).toBe(false)
    expect(parseScheduledFor(minutes(0.5).toISOString(), NOW).ok).toBe(false)
    expect(parseScheduledFor(new Date(NOW.getTime() + 400 * 86_400_000).toISOString(), NOW).ok).toBe(false)
    expect(parseScheduledFor(undefined, NOW).ok).toBe(false)
  })
})

describe('storing and listing scheduled emails', () => {
  it('lists the owner’s queued emails soonest first, without other users’ mail or sent items', async () => {
    const later = await queue({ when: minutes(60) })
    const sooner = await queue({ when: minutes(10) })
    await queue({ ownerId: 2 })
    const sent = await queue({ when: minutes(5) })
    await client.execute({ sql: "update scheduled_emails set status = 'sent' where id = ?", args: [sent] })

    const items = await listScheduledEmails(scheduleDb(payload), 1)
    expect(items.map((item) => item.id)).toEqual([sooner, later])
    expect(items[0]).toMatchObject({ to: 'jo@client.com', subject: 'Hi', status: 'pending', scheduledFor: minutes(10).toISOString(), attachmentCount: 0, isReply: false })
    expect(items[0]).not.toHaveProperty('content')
  })

  it('counts only emails still waiting to go out', async () => {
    await queue()
    const failed = await queue()
    await client.execute({ sql: "update scheduled_emails set status = 'failed' where id = ?", args: [failed] })
    expect(await countScheduledEmails(scheduleDb(payload), 1)).toBe(1)
  })
})

describe('managing scheduled emails', () => {
  it('cancels a pending email, only for its owner', async () => {
    const id = await queue()
    expect(await cancelScheduledEmail(scheduleDb(payload), id, 2)).toBe(false)
    expect(await cancelScheduledEmail(scheduleDb(payload), id, 1)).toBe(true)
    expect(await statusOf(id)).toBeUndefined()
  })

  it('cannot cancel or move an email that is already sending or sent', async () => {
    const id = await queue()
    await client.execute({ sql: "update scheduled_emails set status = 'sending' where id = ?", args: [id] })
    expect(await cancelScheduledEmail(scheduleDb(payload), id, 1)).toBe(false)
    expect(await rescheduleScheduledEmail(scheduleDb(payload), id, 1, minutes(90), NOW)).toBe(false)
    expect((await statusOf(id))?.status).toBe('sending')
  })

  it('reschedules, and re-queues a failed email with its error cleared', async () => {
    const id = await queue()
    await client.execute({ sql: "update scheduled_emails set status = 'failed', attempts = 3, last_error = 'boom' where id = ?", args: [id] })
    expect(await rescheduleScheduledEmail(scheduleDb(payload), id, 1, minutes(90), NOW)).toBe(true)
    expect(await statusOf(id)).toMatchObject({ status: 'pending', attempts: 0, last_error: null })
    expect((await listScheduledEmails(scheduleDb(payload), 1))[0]?.scheduledFor).toBe(minutes(90).toISOString())
  })
})

describe('sending scheduled emails', () => {
  it('sends to the Bcc stored with the content', async () => {
    const id = await createScheduledEmail(scheduleDb(payload), {
      ownerId: 1,
      to: 'jo@client.com',
      cc: '',
      subject: 'Hi',
      replyToMessageId: null,
      scheduledFor: minutes(-1),
      content: { html: HTML, bcc: 'boss@od.com', inlineImages: [], attachments: [] },
    })
    const deliver = delivered()
    await sendScheduledEmail(payload, id, deps(deliver), { onlyDue: true })
    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({ bcc: 'boss@od.com' }))
  })

  it('sends a due email once, records it and clears the stored body', async () => {
    const id = await queue({ when: minutes(-1) })
    const deliver = delivered()
    const outcome = await sendScheduledEmail(payload, id, deps(deliver), { onlyDue: true })
    expect(outcome).toEqual({ status: 'sent', messageId: 'gm1' })
    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 1, to: 'jo@client.com', subject: 'Hi', replyToMessageId: null }))
    expect(await statusOf(id)).toMatchObject({ status: 'sent', sent_message_id: 'gm1', content: null })

    // A second run (overlapping cron, double click) must not send again.
    expect(await sendScheduledEmail(payload, id, deps(deliver), { onlyDue: false })).toEqual({ status: 'skipped' })
    expect(deliver).toHaveBeenCalledTimes(1)
  })

  it('does not send before its time for the cron, but "send now" ignores the time', async () => {
    const id = await queue({ when: minutes(30) })
    const deliver = delivered()
    expect(await sendScheduledEmail(payload, id, deps(deliver), { onlyDue: true })).toEqual({ status: 'skipped' })
    expect(deliver).not.toHaveBeenCalled()
    expect((await sendScheduledEmail(payload, id, deps(deliver), { onlyDue: false, ownerId: 1 })).status).toBe('sent')
  })

  it('"send now" cannot touch another user’s email', async () => {
    const id = await queue({ ownerId: 2 })
    const deliver = delivered()
    expect(await sendScheduledEmail(payload, id, deps(deliver), { onlyDue: false, ownerId: 1 })).toEqual({ status: 'skipped' })
    expect(deliver).not.toHaveBeenCalled()
  })

  it('the cron sends only due emails, oldest first, and reports the tally', async () => {
    const second = await queue({ when: minutes(-1) })
    const first = await queue({ when: minutes(-30) })
    const notYet = await queue({ when: minutes(30) })
    const order: string[] = []
    const deliver = vi.fn(async (input: { to: string }) => {
      order.push(input.to)
      return { ok: true as const, messageId: `m${order.length}`, threadId: 't', client: null }
    })
    const tally = await sendDueScheduledEmails(payload, deps(deliver as unknown as SendDeps['deliver']))
    expect(tally).toMatchObject({ sent: 2, failed: 0, skipped: 0 })
    expect((await statusOf(first))?.sent_message_id).toBe('m1')
    expect((await statusOf(second))?.sent_message_id).toBe('m2')
    expect((await statusOf(notYet))?.status).toBe('pending')
  })

  it('marks the email failed with a readable reason when Gmail is not connected', async () => {
    const id = await queue({ when: minutes(-1) })
    const noToken: SendDeps = { ...deps(delivered()), getToken: async () => ({ ok: false, reason: 'x' }) }
    const outcome = await sendScheduledEmail(payload, id, noToken, { onlyDue: true })
    expect(outcome.status).toBe('failed')
    expect(await statusOf(id)).toMatchObject({ status: 'failed' })
    expect((await statusOf(id))?.last_error).toMatch(/Reconnect Gmail/)
  })

  it('retries rate limits a few times, then fails; other Gmail errors fail at once', async () => {
    const id = await queue({ when: minutes(-1) })
    const limited = vi.fn(async () => ({ ok: false as const, stage: 'send' as const, error: { code: 429 } }))
    expect((await sendScheduledEmail(payload, id, deps(limited), { onlyDue: true })).status).toBe('retry')
    expect(await statusOf(id)).toMatchObject({ status: 'pending', attempts: 1 })
    await sendScheduledEmail(payload, id, deps(limited), { onlyDue: true })
    expect((await sendScheduledEmail(payload, id, deps(limited), { onlyDue: true })).status).toBe('failed')
    expect(await statusOf(id)).toMatchObject({ status: 'failed', attempts: 3 })

    const other = await queue({ when: minutes(-1) })
    const bad = vi.fn(async () => ({ ok: false as const, stage: 'send' as const, error: new Error('nope') }))
    expect((await sendScheduledEmail(payload, other, deps(bad), { onlyDue: true })).status).toBe('failed')
  })

  it('passes the reply target so the send is threaded', async () => {
    const id = await queue({ when: minutes(-1), replyTo: 'abc123', to: '' })
    const deliver = delivered()
    await sendScheduledEmail(payload, id, deps(deliver), { onlyDue: true })
    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({ replyToMessageId: 'abc123', to: '' }))
  })

  it('fails stale "sending" emails instead of resending them', async () => {
    const id = await queue()
    const old = new Date(NOW.getTime() - 30 * 60_000).toISOString()
    await client.execute({ sql: "update scheduled_emails set status = 'sending', updated_at = ? where id = ?", args: [old, id] })
    expect(await failStaleSending(scheduleDb(payload), NOW)).toBe(1)
    expect(await statusOf(id)).toMatchObject({ status: 'failed' })
  })
})
