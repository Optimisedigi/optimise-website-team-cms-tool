import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { createHostingCheckout, getHostingCheckoutSession } from '@/lib/stripe'
import { hashOfferToken, type HostingQuote } from '@/lib/hosting-billing'

const RATE_LIMIT_WINDOW_MS = 60_000
const MAX_ATTEMPTS_PER_WINDOW = 8
const MAX_TRACKED_TOKENS = 1_000
const attempts = new Map<string, { count: number; until: number }>()

function isRateLimited(token: string): boolean {
  const now = Date.now()
  for (const [key, state] of attempts) {
    if (state.until <= now) attempts.delete(key)
  }

  const key = hashOfferToken(token)
  const state = attempts.get(key) || {
    count: 0,
    until: now + RATE_LIMIT_WINDOW_MS,
  }
  state.count += 1
  attempts.delete(key)
  attempts.set(key, state)

  while (attempts.size > MAX_TRACKED_TOKENS) {
    const oldestKey = attempts.keys().next().value
    if (!oldestKey) break
    attempts.delete(oldestKey)
  }

  return state.count > MAX_ATTEMPTS_PER_WINDOW
}

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

  const snapshot: any = offer.snapshot
  const selectedInterval = offer.selectedInterval || snapshot.selectedInterval
  if (selectedInterval && interval !== selectedInterval) {
    return NextResponse.json(
      { error: 'This offer uses a different billing interval.' },
      { status: 400 },
    )
  }

  if (offer.status === 'checkout_pending' && offer.stripeCheckoutSessionId) {
    try {
      const existingSession = await getHostingCheckoutSession(offer.stripeCheckoutSessionId)
      if (existingSession.status === 'complete') {
        return NextResponse.json(
          { error: 'This payment link has already been used.' },
          { status: 410 },
        )
      }
      if (existingSession.status === 'open' && existingSession.url) {
        return NextResponse.redirect(existingSession.url, 303)
      }
    } catch {
      // Recreate a missing or inaccessible session below using a new key.
    }
  }

  const client: any = await payload.findByID({
    collection: 'clients',
    id: typeof offer.client === 'object' ? offer.client.id : offer.client,
    overrideAccess: true,
  })
  const quote: HostingQuote = interval === 'month' ? snapshot.monthly : snapshot.annual
  const retrySuffix = offer.stripeCheckoutSessionId ? `-${offer.stripeCheckoutSessionId}` : ''
  const session = await createHostingCheckout({
    clientId: String(client.id),
    offerId: String(offer.id),
    customerId: client.hostingSubscription?.stripeCustomerId,
    email: snapshot.recipientEmail,
    quote,
    idempotencyKey: `hosting-checkout-${offer.id}-${interval}${retrySuffix}`,
  })

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
