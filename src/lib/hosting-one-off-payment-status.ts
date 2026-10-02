import { sql } from '@payloadcms/db-sqlite'

/** Statuses from which a one-off payment link can still be paid. */
export const PAYABLE_STATUSES = ['active', 'checkout_pending'] as const

type RunsSql = { run: (query: ReturnType<typeof sql>) => Promise<{ rowsAffected?: number }> }

/**
 * Moves a payable one-off payment link to a new status in a single
 * conditional UPDATE, and reports whether it did. Checkout and cancel race
 * each other; because only one of them can win this statement, a cancelled
 * link is never revived as payable, and a cancel never misses a checkout
 * session that was recorded first.
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
  const result = await db.run(
    sql`update hosting_one_off_payments
        set status = ${input.status},
            stripe_checkout_session_id = coalesce(${sessionId}, stripe_checkout_session_id),
            updated_at = ${input.now.toISOString()}
        where id = ${Number(input.id)} and status in (${sql.join(
          PAYABLE_STATUSES.map((status) => sql`${status}`),
          sql`, `,
        )})`,
  )
  return Number(result.rowsAffected ?? 0) > 0
}
