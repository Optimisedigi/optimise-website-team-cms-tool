import { sql } from '@payloadcms/db-sqlite'

/** Statuses from which a one-off payment link can still be paid. */
export const PAYABLE_STATUSES = ['active', 'checkout_pending'] as const

/** Failed email attempts before a scheduled link stops retrying and asks the admin. */
export const MAX_SCHEDULED_SEND_ATTEMPTS = 5

type RunsSql = { run: (query: ReturnType<typeof sql>) => Promise<{ rowsAffected?: number }> }

const statusList = (statuses: readonly string[]) =>
  sql.join(
    statuses.map((status) => sql`${status}`),
    sql`, `,
  )

/**
 * Moves a payable one-off payment link to a new status in a single
 * conditional UPDATE, and reports whether it did. Checkout and cancel race
 * each other; because only one of them can win this statement, a cancelled
 * link is never revived as payable, and a cancel never misses a checkout
 * session that was recorded first. A cancel also stops a link that is still
 * waiting for its scheduled email.
 */
export async function moveFromPayable(
  db: RunsSql,
  input: {
    id: number | string
    status: 'checkout_pending' | 'revoked'
    stripeCheckoutSessionId?: string
    now: Date
  },
): Promise<boolean> {
  const sessionId = input.stripeCheckoutSessionId ?? null
  const from =
    input.status === 'revoked' ? [...PAYABLE_STATUSES, 'scheduled'] : [...PAYABLE_STATUSES]
  const result = await db.run(
    sql`update hosting_one_off_payments
        set status = ${input.status},
            stripe_checkout_session_id = coalesce(${sessionId}, stripe_checkout_session_id),
            updated_at = ${input.now.toISOString()}
        where id = ${Number(input.id)} and status in (${statusList(from)})`,
  )
  return Number(result.rowsAffected ?? 0) > 0
}

/**
 * Claims a scheduled link for sending: gives it the token that will be
 * emailed and starts its expiry clock. Only one sender (or a cancel) can win,
 * so a link is never emailed twice and a cancelled link is never sent.
 */
export async function claimScheduledForSend(
  db: RunsSql,
  input: { id: number | string; tokenHash: string; expiresAt: string; now: Date },
): Promise<boolean> {
  const result = await db.run(
    sql`update hosting_one_off_payments
        set status = 'active',
            token_hash = ${input.tokenHash},
            expires_at = ${input.expiresAt},
            updated_at = ${input.now.toISOString()}
        where id = ${Number(input.id)} and status = 'scheduled'`,
  )
  return Number(result.rowsAffected ?? 0) > 0
}

/**
 * Puts a claimed link back on the schedule after its email failed, with a
 * fresh unusable token so the link in the failed email can never be paid.
 * Nobody received that link, so nobody can have paid it in the meantime.
 */
export async function returnToSchedule(
  db: RunsSql,
  input: { id: number | string; tokenHash: string; now: Date },
): Promise<boolean> {
  const result = await db.run(
    sql`update hosting_one_off_payments
        set status = 'scheduled',
            token_hash = ${input.tokenHash},
            send_attempts = coalesce(send_attempts, 0) + 1,
            updated_at = ${input.now.toISOString()}
        where id = ${Number(input.id)} and status = 'active'`,
  )
  return Number(result.rowsAffected ?? 0) > 0
}
