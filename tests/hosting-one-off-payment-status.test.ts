import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { beforeEach, describe, expect, it } from 'vitest'
import { moveFromPayable } from '@/lib/hosting-one-off-payment-status'

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
    'create table hosting_one_off_payments (id integer primary key, status text, stripe_checkout_session_id text, updated_at text)',
  )
  await client.execute(
    "insert into hosting_one_off_payments values (1, 'active', null, null), (2, 'checkout_pending', 'cs_old', null), (3, 'paid', 'cs_paid', null), (4, 'revoked', null, null)",
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
})
