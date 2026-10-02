import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import {
  createHostingOneOffCheckout,
  expireHostingCheckoutSession,
  getHostingCheckoutSession,
  isStripeIdempotencyConflict,
  isStripeMissingResource,
} from '@/lib/stripe'
import { hashOfferToken } from '@/lib/hosting-billing'
import type { OneOffSnapshot } from '@/lib/hosting-one-off-payment'
import { createTokenRateLimiter } from '@/lib/hosting-pay-rate-limit'
import { moveFromPayable, PAYABLE_STATUSES } from '@/lib/hosting-one-off-payment-status'

const isRateLimited = createTokenRateLimiter()

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (isRateLimited(token))
    return NextResponse.json({ error: 'Too many attempts. Try again shortly.' }, { status: 429 })

  const payload = await getPayload({ config: await config })
  const found: any = await payload.find({
    collection: 'hosting-one-off-payments',
    where: { tokenHash: { equals: hashOfferToken(token) } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const payment = found.docs[0]
  if (
    !payment ||
    !(PAYABLE_STATUSES as readonly string[]).includes(payment.status) ||
    new Date(payment.expiresAt) <= new Date()
  )
    return NextResponse.json({ error: 'This payment link is unavailable.' }, { status: 410 })

  // One link pays once. Reuse an open checkout rather than opening a second.
  if (payment.status === 'checkout_pending' && payment.stripeCheckoutSessionId) {
    let existing: Awaited<ReturnType<typeof getHostingCheckoutSession>> | null = null
    try {
      existing = await getHostingCheckoutSession(payment.stripeCheckoutSessionId)
    } catch (error) {
      if (!isStripeMissingResource(error))
        return NextResponse.json(
          { error: 'We could not reach our payment provider. Please try again in a minute.' },
          { status: 503 },
        )
    }
    if (existing?.status === 'complete')
      return NextResponse.json({ error: 'This payment has already been made.' }, { status: 410 })
    if (existing?.status === 'open' && existing.url) return NextResponse.redirect(existing.url, 303)
  }

  const snapshot = payment.snapshot as OneOffSnapshot
  const client: any = await payload.findByID({
    collection: 'clients',
    id: payment.client,
    depth: 0,
    overrideAccess: true,
  })
  const retrySuffix = payment.stripeCheckoutSessionId ? `-${payment.stripeCheckoutSessionId}` : ''
  let session: Awaited<ReturnType<typeof createHostingOneOffCheckout>>
  try {
    session = await createHostingOneOffCheckout({
      clientId: String(client.id),
      paymentId: String(payment.id),
      customerId: client.hostingSubscription?.stripeCustomerId,
      email: snapshot.recipientEmail,
      description: snapshot.description,
      currency: snapshot.quote.currency,
      totalCents: snapshot.quote.totalCents,
      // One key per attempt: two simultaneous clicks share it, so Stripe opens
      // one session. An expired session gives the next attempt a fresh key.
      idempotencyKey: `hosting-one-off-v1-${payment.id}${retrySuffix}`,
      returnToPaymentLink: `/hosting-pay/once/${token}`,
    })
  } catch (error) {
    if (!isStripeIdempotencyConflict(error)) throw error
    return NextResponse.json(
      { error: 'This payment is already in progress. Please refresh and try again.' },
      { status: 409 },
    )
  }

  // An admin may have cancelled the link while Stripe was opening the session.
  // Record the session only if the link is still payable; otherwise close the
  // new session so a cancelled link is never revived as payable.
  const recorded = await moveFromPayable(payload.db.drizzle, {
    id: payment.id,
    status: 'checkout_pending',
    stripeCheckoutSessionId: session.id,
    now: new Date(),
  })
  if (!recorded) {
    await expireHostingCheckoutSession(session.id).catch((error: unknown) => {
      if (!isStripeMissingResource(error))
        console.error('[hosting-one-off-checkout] could not close session for cancelled link', {
          paymentId: payment.id,
          sessionId: session.id,
        })
    })
    return NextResponse.json({ error: 'This payment link is unavailable.' }, { status: 410 })
  }
  if (!session.url)
    return NextResponse.json({ error: 'Stripe did not return a checkout page.' }, { status: 502 })
  return NextResponse.redirect(session.url, 303)
}
