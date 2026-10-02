import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import {
  createHostingCheckout,
  expireHostingCheckoutSession,
  getHostingCheckoutSession,
  isStripeIdempotencyConflict,
  isStripeMissingResource,
} from '@/lib/stripe'
import {
  hashOfferToken,
  hasLiveHostingSubscription,
  type HostingQuote,
} from '@/lib/hosting-billing'
import { planBillingStart, stripeBillingStartParams } from '@/lib/hosting-billing-schedule'
import { createTokenRateLimiter } from '@/lib/hosting-pay-rate-limit'

const isRateLimited = createTokenRateLimiter()

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (isRateLimited(token)) {
    return NextResponse.json({ error: 'Too many attempts. Try again shortly.' }, { status: 429 })
  }

  const payload = await getPayload({ config: await config })
  const found: any = await payload.find({
    collection: 'hosting-payment-offers',
    where: { tokenHash: { equals: hashOfferToken(token) } },
    limit: 1,
    overrideAccess: true,
  })
  const offer = found.docs[0]
  if (
    !offer ||
    !['active', 'checkout_pending'].includes(offer.status) ||
    new Date(offer.expiresAt) <= new Date()
  ) {
    return NextResponse.json({ error: 'This payment link is unavailable.' }, { status: 410 })
  }

  const data = await req.formData()
  const interval = data.get('interval')
  if (interval !== 'month' && interval !== 'year') {
    return NextResponse.json({ error: 'Choose a billing frequency.' }, { status: 400 })
  }

  // The client chooses monthly or annual on the payment page; the admin's
  // interval is only the preselected default.
  const snapshot: any = offer.snapshot
  if (!(interval === 'month' ? snapshot.monthly : snapshot.annual)?.totalCents) {
    return NextResponse.json(
      { error: 'This billing frequency is not available for this offer.' },
      { status: 400 },
    )
  }

  if (offer.status === 'checkout_pending' && offer.stripeCheckoutSessionId) {
    let existingSession: Awaited<ReturnType<typeof getHostingCheckoutSession>> | null = null
    try {
      existingSession = await getHostingCheckoutSession(offer.stripeCheckoutSessionId)
    } catch (error) {
      // Only a session Stripe no longer has is safe to replace. Any other
      // failure might hide an open session, and a second one could double-charge.
      if (!isStripeMissingResource(error)) {
        return NextResponse.json(
          { error: 'We could not reach our payment provider. Please try again in a minute.' },
          { status: 503 },
        )
      }
    }
    if (existingSession?.status === 'complete') {
      return NextResponse.json(
        { error: 'This payment link has already been used.' },
        { status: 410 },
      )
    }
    if (existingSession?.status === 'open') {
      if (offer.selectedInterval === interval && existingSession.url) {
        return NextResponse.redirect(existingSession.url, 303)
      }
      // The client switched frequency: close the old session first so only one
      // subscription can ever be paid from this link. If Stripe refuses (for
      // example, it completed meanwhile), stop rather than open a second one.
      try {
        await expireHostingCheckoutSession(existingSession.id)
      } catch {
        return NextResponse.json(
          { error: 'This payment is already in progress. Please refresh and try again.' },
          { status: 409 },
        )
      }
    }
  }

  const client: any = await payload.findByID({
    collection: 'clients',
    id: typeof offer.client === 'object' ? offer.client.id : offer.client,
    overrideAccess: true,
  })
  if (hasLiveHostingSubscription(client.hostingSubscription)) {
    return NextResponse.json(
      { error: 'Your hosting subscription is already active. No further payment is needed.' },
      { status: 409 },
    )
  }
  const quote: HostingQuote = interval === 'month' ? snapshot.monthly : snapshot.annual
  const now = new Date()
  const billingStart = stripeBillingStartParams(
    planBillingStart(snapshot.billingStartDate, interval, now),
    interval,
    now,
  )
  const retrySuffix = offer.stripeCheckoutSessionId ? `-${offer.stripeCheckoutSessionId}` : ''
  let session: Awaited<ReturnType<typeof createHostingCheckout>>
  try {
    session = await createHostingCheckout({
      clientId: String(client.id),
      offerId: String(offer.id),
      customerId: client.hostingSubscription?.stripeCustomerId,
      email: snapshot.recipientEmail,
      quote,
      billingStart,
      // One key per checkout attempt, deliberately not per interval: two
      // simultaneous requests (say monthly and annual) share it, so Stripe
      // opens at most one session and refuses the other. Switching frequency
      // later gets a fresh key via the expired session's ID. v4 bills from the
      // client's start date; versioning avoids colliding with sessions
      // created by earlier request shapes.
      idempotencyKey: `hosting-checkout-v4-${offer.id}${retrySuffix}`,
      returnToPaymentLink: `/hosting-pay/${token}`,
    })
  } catch (error) {
    if (!isStripeIdempotencyConflict(error)) throw error
    return NextResponse.json(
      { error: 'This payment is already in progress. Please refresh and try again.' },
      { status: 409 },
    )
  }

  await payload.update({
    collection: 'hosting-payment-offers',
    id: offer.id,
    data: {
      status: 'checkout_pending',
      selectedInterval: interval,
      stripeCheckoutSessionId: session.id,
    },
    overrideAccess: true,
  })
  return NextResponse.redirect(session.url!, 303)
}
