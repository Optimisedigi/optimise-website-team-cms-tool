import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  claimScheduledForSend,
  moveFromPayable,
  reissuePayableLink,
  returnToSchedule,
} from '@/lib/hosting-one-off-payment-status'

/**
 * Runs the real conditional UPDATE against SQLite. Checkout and cancel race
 * for the same link; whichever statement runs first must win cleanly.
 */

const NOW = new Date('2026-10-02T00:00:00.000Z')
let client: ReturnType<typeof createClient>
let db: ReturnType<typeof drizzle>

const row = async (id: number) =>
  (
    await client.execute({
      sql: 'select status, stripe_checkout_session_id as session from hosting_one_off_payments where id = ?',
      args: [id],
    })
  ).rows[0]

beforeEach(async () => {
  client = createClient({ url: ':memory:' })
  db = drizzle(client)
  await client.execute(
    'create table hosting_one_off_payments (id integer primary key, status text, stripe_checkout_session_id text, updated_at text, token_hash text, expires_at text, send_attempts numeric default 0)',
  )
  await client.execute(
    "insert into hosting_one_off_payments (id, status, stripe_checkout_session_id) values (1, 'active', null), (2, 'checkout_pending', 'cs_old'), (3, 'paid', 'cs_paid'), (4, 'revoked', null), (5, 'scheduled', null)",
  )
})

describe('reissuePayableLink', () => {
  const reissue = (id: number, seenSessionId: string | null) =>
    reissuePayableLink(db, {
      id,
      tokenHash: 'hash_new',
      expiresAt: '2026-10-16T00:00:00.000Z',
      seenSessionId,
      now: NOW,
    })
  const tokenRow = async (id: number) =>
    (
      await client.execute({
        sql: 'select status, token_hash as tokenHash, expires_at as expiresAt from hosting_one_off_payments where id = ?',
        args: [id],
      })
    ).rows[0]

  it('gives a sent link a new token and expiry', async () => {
    expect(await reissue(1, null)).toBe(true)
    expect(await tokenRow(1)).toMatchObject({
      status: 'active',
      tokenHash: 'hash_new',
      expiresAt: '2026-10-16T00:00:00.000Z',
    })
  })

  it('reopens a link whose checkout the caller closed, keeping the old session for a fresh Stripe key', async () => {
    expect(await reissue(2, 'cs_old')).toBe(true)
    expect(await row(2)).toMatchObject({ status: 'active', session: 'cs_old' })
  })

  it('does nothing if a checkout started after the caller looked', async () => {
    expect(await reissue(2, null)).toBe(false)
    expect(await reissue(1, 'cs_other')).toBe(false)
    expect(await row(2)).toMatchObject({ status: 'checkout_pending', session: 'cs_old' })
  })

  it.each([3, 4, 5])(
    'never reissues link %s, which is paid, cancelled or not yet sent',
    async (id) => {
      const before = await tokenRow(id)
      expect(await reissue(id, id === 3 ? 'cs_paid' : null)).toBe(false)
      expect(await tokenRow(id)).toEqual(before)
    },
  )
})

describe('moveFromPayable', () => {
  it('records a checkout session on a payable link', async () => {
    expect(
      await moveFromPayable(db, {
        id: 1,
        status: 'checkout_pending',
        stripeCheckoutSessionId: 'cs_new',
        now: NOW,
      }),
    ).toBe(true)
    expect(await row(1)).toMatchObject({ status: 'checkout_pending', session: 'cs_new' })
  })

  it('refuses to record a checkout once the link is cancelled (cancel won the race)', async () => {
    await moveFromPayable(db, { id: 1, status: 'revoked', now: NOW })

    expect(
      await moveFromPayable(db, {
        id: 1,
        status: 'checkout_pending',
        stripeCheckoutSessionId: 'cs_late',
        now: NOW,
      }),
    ).toBe(false)
    expect(await row(1)).toMatchObject({ status: 'revoked', session: null })
  })

  it('cancels after a checkout was recorded and keeps its session id to close (checkout won the race)', async () => {
    await moveFromPayable(db, {
      id: 1,
      status: 'checkout_pending',
      stripeCheckoutSessionId: 'cs_first',
      now: NOW,
    })

    expect(await moveFromPayable(db, { id: 1, status: 'revoked', now: NOW })).toBe(true)
    expect(await row(1)).toMatchObject({ status: 'revoked', session: 'cs_first' })
  })

  it('keeps the existing session id when cancelling a pending checkout', async () => {
    expect(await moveFromPayable(db, { id: 2, status: 'revoked', now: NOW })).toBe(true)
    expect(await row(2)).toMatchObject({ status: 'revoked', session: 'cs_old' })
  })

  it.each([
    [3, 'paid'],
    [4, 'revoked'],
  ])('never changes a %s link that is %s', async (id, status) => {
    expect(
      await moveFromPayable(db, {
        id,
        status: 'checkout_pending',
        stripeCheckoutSessionId: 'cs_x',
        now: NOW,
      }),
    ).toBe(false)
    expect(await moveFromPayable(db, { id, status: 'revoked', now: NOW })).toBe(false)
    expect((await row(id))?.status).toBe(status)
  })

  it('cancels a link that is still waiting for its scheduled email', async () => {
    expect(await moveFromPayable(db, { id: 5, status: 'revoked', now: NOW })).toBe(true)
    expect((await row(5))?.status).toBe('revoked')
  })

  it('never opens a checkout on a link whose email has not gone out', async () => {
    expect(
      await moveFromPayable(db, {
        id: 5,
        status: 'checkout_pending',
        stripeCheckoutSessionId: 'cs_early',
        now: NOW,
      }),
    ).toBe(false)
    expect(await row(5)).toMatchObject({ status: 'scheduled', session: null })
  })
})

describe('sending a scheduled link', () => {
  const sendRow = async (id: number) =>
    (
      await client.execute({
        sql: 'select status, token_hash as tokenHash, expires_at as expiresAt, send_attempts as attempts from hosting_one_off_payments where id = ?',
        args: [id],
      })
    ).rows[0]
  const claim = (id: number, tokenHash = 'hash_sent') =>
    claimScheduledForSend(db, { id, tokenHash, expiresAt: '2026-10-16T00:00:00.000Z', now: NOW })

  it('makes the link payable with the emailed token and a fresh expiry', async () => {
    expect(await claim(5)).toBe(true)
    expect(await sendRow(5)).toMatchObject({
      status: 'active',
      tokenHash: 'hash_sent',
      expiresAt: '2026-10-16T00:00:00.000Z',
    })
  })

  it('lets only one overlapping run send it', async () => {
    expect(await claim(5, 'hash_a')).toBe(true)
    expect(await claim(5, 'hash_b')).toBe(false)
    expect((await sendRow(5))?.tokenHash).toBe('hash_a')
  })

  it('never sends a link that was cancelled first', async () => {
    await moveFromPayable(db, { id: 5, status: 'revoked', now: NOW })

    expect(await claim(5)).toBe(false)
    expect((await sendRow(5))?.status).toBe('revoked')
  })

  it.each([1, 2, 3, 4])('never claims link %s, which is not scheduled', async (id) => {
    expect(await claim(id)).toBe(false)
  })

  it('puts a failed send back on the schedule with a retired token and counts the attempt', async () => {
    await claim(5)

    expect(await returnToSchedule(db, { id: 5, tokenHash: 'hash_retired', now: NOW })).toBe(true)
    expect(await sendRow(5)).toMatchObject({
      status: 'scheduled',
      tokenHash: 'hash_retired',
      attempts: 1,
    })
  })

  it('does not reschedule a link cancelled while its email was failing', async () => {
    await claim(5)
    await moveFromPayable(db, { id: 5, status: 'revoked', now: NOW })

    expect(await returnToSchedule(db, { id: 5, tokenHash: 'hash_retired', now: NOW })).toBe(false)
    expect((await sendRow(5))?.status).toBe('revoked')
  })
})
