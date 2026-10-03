import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { userHasFeature } from '@/lib/access'
import { resendOneOffPayment } from '@/lib/hosting-one-off-issue'
import { PAYABLE_STATUSES } from '@/lib/hosting-one-off-payment-status'
import {
  expireHostingCheckoutSession,
  getHostingCheckoutSession,
  isStripeMissingResource,
} from '@/lib/stripe'

/**
 * Emails an unpaid one-off payment link again, for example when the client
 * lost the email or the link expired. The client gets a new link valid for
 * 14 days; the link in the earlier email stops working. Any checkout left open
 * on the old link is closed first so only the new link can be paid.
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

  const seenSessionId: string | null = payment.stripeCheckoutSessionId || null
  if (payment.status === 'checkout_pending' && seenSessionId) {
    try {
      const session = await getHostingCheckoutSession(seenSessionId)
      if (session.status === 'complete')
        return NextResponse.json(
          {
            error:
              'The client has just paid. Stripe will confirm the payment shortly, so there is nothing to resend.',
          },
          { status: 409 },
        )
      if (session.status === 'open') await expireHostingCheckoutSession(session.id)
    } catch (error) {
      if (!isStripeMissingResource(error))
        return NextResponse.json(
          { error: 'Could not reach Stripe to check this link. Try again in a minute.' },
          { status: 503 },
        )
    }
  }

  const resent = await resendOneOffPayment(payload, { payment, seenSessionId, now: new Date() })
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
