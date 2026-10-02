import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { userHasFeature } from '@/lib/access'
import { moveFromPayable } from '@/lib/hosting-one-off-payment-status'
import {
  expireHostingCheckoutSession,
  getHostingCheckoutSession,
  isStripeMissingResource,
} from '@/lib/stripe'

const PAID_MESSAGE = 'This payment has already been made. Refund it in Stripe instead.'

async function loadPayment(payload: any, paymentId: string): Promise<any | null> {
  try {
    return await payload.findByID({
      collection: 'hosting-one-off-payments',
      id: paymentId,
      depth: 0,
      overrideAccess: true,
    })
  } catch {
    return null
  }
}

/**
 * Cancel an unpaid one-off payment link (for example, a wrong amount).
 *
 * The link is marked cancelled first, in one conditional update, so a checkout
 * that is opening at the same moment can no longer be recorded against it (it
 * closes its own Stripe session instead). Then any Stripe session already on
 * record is closed. Retrying a cancelled link repeats only that second step,
 * so a Stripe outage can be retried safely.
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
  const payment = await loadPayment(payload, paymentId)
  if (!payment || String(payment.client) !== String(id))
    return NextResponse.json({ error: 'Payment link not found.' }, { status: 404 })
  if (payment.status === 'paid') return NextResponse.json({ error: PAID_MESSAGE }, { status: 409 })

  if (payment.status !== 'revoked') {
    const cancelled = await moveFromPayable(payload.db.drizzle, {
      id: payment.id,
      status: 'revoked',
      now: new Date(),
    })
    if (!cancelled) {
      // Lost a race: the webhook marked it paid, or another cancel won.
      const latest = await loadPayment(payload, paymentId)
      if (latest?.status === 'paid')
        return NextResponse.json({ error: PAID_MESSAGE }, { status: 409 })
    }
  }

  // Re-read so a checkout session recorded just before the cancel is closed too.
  const latest = await loadPayment(payload, paymentId)
  const sessionId = latest?.stripeCheckoutSessionId
  if (sessionId) {
    try {
      const session = await getHostingCheckoutSession(sessionId)
      if (session.status === 'complete')
        return NextResponse.json(
          {
            error:
              'The link is cancelled, but the client had already paid. Stripe will confirm the payment shortly; refund it in Stripe if needed.',
          },
          { status: 409 },
        )
      if (session.status === 'open') await expireHostingCheckoutSession(session.id)
    } catch (error) {
      // Only a session Stripe no longer has is safe to ignore; anything else
      // might leave a payable checkout open behind a cancelled link.
      if (!isStripeMissingResource(error))
        return NextResponse.json(
          {
            error:
              'The link is cancelled, but we could not reach Stripe to close a checkout the client may have open. Click Cancel link again in a minute.',
          },
          { status: 503 },
        )
    }
  }
  return NextResponse.json({ status: 'revoked' })
}
