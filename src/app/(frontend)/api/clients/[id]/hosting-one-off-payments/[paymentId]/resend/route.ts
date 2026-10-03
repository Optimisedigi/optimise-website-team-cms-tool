import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { userHasFeature } from '@/lib/access'
import { closeOldCheckout, resendOneOffPayment } from '@/lib/hosting-one-off-issue'
import { parseSendOn } from '@/lib/hosting-one-off-payment'
import { PAYABLE_STATUSES } from '@/lib/hosting-one-off-payment-status'

/**
 * Emails an unpaid one-off payment link again, now or on a chosen date (for
 * example when the client lost the email or the link expired). The client
 * gets a new link valid for 14 days; the link in the earlier email stops
 * working when the resend goes out. Any checkout left open on the old link
 * is closed first so only the new link can be paid.
 *
 * Body (optional JSON): `{ sendOn: 'YYYY-MM-DD' }` schedules the resend for
 * 9am Sydney that day; `{ cancelSchedule: true }` drops a scheduled resend.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> },
) {
  const payload = await getPayload({ config: await config })
  const { user } = await payload.auth({ headers: req.headers })
  if (!user || !userHasFeature(user, 'hosting-billing-settings'))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { id, paymentId } = await params
  const body = ((await req.json().catch(() => null)) ?? {}) as {
    sendOn?: unknown
    cancelSchedule?: unknown
  }
  const now = new Date()
  const schedule = parseSendOn(body.sendOn, now)
  if (!schedule.ok) return NextResponse.json({ error: schedule.error }, { status: 400 })

  let payment: any
  try {
    payment = await payload.findByID({
      collection: 'hosting-one-off-payments',
      id: paymentId,
      depth: 0,
      overrideAccess: true,
    })
  } catch {
    payment = null
  }
  if (!payment || String(payment.client) !== String(id))
    return NextResponse.json({ error: 'Payment link not found.' }, { status: 404 })
  if (payment.status === 'paid')
    return NextResponse.json({ error: 'This payment has already been made.' }, { status: 409 })
  if (!(PAYABLE_STATUSES as readonly string[]).includes(payment.status))
    return NextResponse.json(
      {
        error:
          payment.status === 'scheduled'
            ? 'This link has not been emailed yet. It goes out on its scheduled date.'
            : 'This link was cancelled. Send a new payment link instead.',
      },
      { status: 409 },
    )

  // Scheduling only records the date: the current link keeps working until
  // the resend goes out. Paying or cancelling the link stops the resend.
  if (body.cancelSchedule === true || schedule.value) {
    const resendAt = body.cancelSchedule === true ? null : schedule.value
    await payload.update({
      collection: 'hosting-one-off-payments',
      id: payment.id,
      data: { resendAt, sendAttempts: 0 },
      overrideAccess: true,
    })
    return NextResponse.json({ resendAt })
  }

  const checkout = await closeOldCheckout(payment)
  if (checkout === 'paid')
    return NextResponse.json(
      {
        error:
          'The client has just paid. Stripe will confirm the payment shortly, so there is nothing to resend.',
      },
      { status: 409 },
    )
  if (checkout === 'unreachable')
    return NextResponse.json(
      { error: 'Could not reach Stripe to check this link. Try again in a minute.' },
      { status: 503 },
    )

  const resent = await resendOneOffPayment(payload, {
    payment,
    seenSessionId: payment.stripeCheckoutSessionId || null,
    now,
  })
  if (!resent)
    return NextResponse.json(
      {
        error:
          'The client opened the payment page just now, or the link changed. Refresh the list and try again.',
      },
      { status: 409 },
    )
  return NextResponse.json(resent)
}
