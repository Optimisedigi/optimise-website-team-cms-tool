import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { getHostingSubscriptionItems, getStripe, verifyStripeWebhook } from '@/lib/stripe'
import {
  getStripeInvoiceReferences,
  getSubscriptionPeriodEnd,
  hasLiveHostingSubscription,
} from '@/lib/hosting-billing'

const stripeObjectId = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : (value as { id?: string } | null)?.id

/** The Stripe subscription an event is about, when it is about one. */
function eventSubscriptionId(type: string, object: any): string | undefined {
  if (type.startsWith('customer.subscription.')) return object.id
  if (type === 'checkout.session.completed') return stripeObjectId(object.subscription)
  if (type.startsWith('invoice.')) return getStripeInvoiceReferences(object).subscriptionId
  return undefined
}

/**
 * A client paid a second time while their first subscription still bills them.
 * Never overwrite the recorded one (it would keep charging, invisible to the
 * CMS); tell every admin so a person can cancel and refund the duplicate.
 */
async function alertDuplicateSubscription(
  payload: any,
  client: any,
  recordedId: string,
  duplicateId: string,
): Promise<void> {
  console.error('[stripe-webhook] second hosting subscription for one client', {
    clientId: client.id,
    recordedSubscriptionId: recordedId,
    duplicateSubscriptionId: duplicateId,
  })
  try {
    const admins = await payload.find({
      collection: 'users',
      where: { role: { equals: 'admin' } },
      depth: 0,
      limit: 100,
      overrideAccess: true,
    })
    for (const admin of admins.docs) {
      await payload.create({
        collection: 'notifications',
        data: {
          recipient: admin.id,
          kind: 'hosting-duplicate-subscription',
          title: `${client.name || `Client ${client.id}`}: second hosting subscription in Stripe`,
          body: `Stripe subscription ${duplicateId} started while ${recordedId} is still active, so the client may be charged twice. Cancel the duplicate in Stripe and refund it if it has been paid.`,
          url: `/admin/collections/clients/${client.id}`,
          relatedClient: client.id,
        },
        overrideAccess: true,
      })
    }
  } catch (error) {
    console.error('[stripe-webhook] duplicate-subscription alert failed', {
      clientId: client.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/** Mark the paid offer completed, but only if it really belongs to this client. */
async function completeOffer(payload: any, offerId: unknown, clientId: number | string) {
  if (!offerId) return
  let offer: any
  try {
    offer = await payload.findByID({
      collection: 'hosting-payment-offers',
      id: offerId,
      depth: 0,
      overrideAccess: true,
    })
  } catch {
    return
  }
  if (String(stripeObjectId(offer.client) ?? offer.client) !== String(clientId)) return
  await payload.update({
    collection: 'hosting-payment-offers',
    id: offer.id,
    data: { status: 'completed' },
    overrideAccess: true,
  })
}

/**
 * A one-off hosting payment (mode `payment`) completed. Mark that link paid,
 * but only if it really belongs to the client in the session. Never touches
 * the client's subscription record.
 */
async function completeOneOffPayment(payload: any, session: any, paidAt: Date): Promise<void> {
  const paymentId = session.metadata?.hostingOneOffPaymentId
  if (session.payment_status !== 'paid') return
  let payment: any
  try {
    payment = await payload.findByID({
      collection: 'hosting-one-off-payments',
      id: paymentId,
      depth: 0,
      overrideAccess: true,
    })
  } catch {
    return
  }
  const clientId = session.metadata?.cmsClientId || session.client_reference_id
  if (String(stripeObjectId(payment.client) ?? payment.client) !== String(clientId)) return
  if (payment.status === 'paid') return
  await payload.update({
    collection: 'hosting-one-off-payments',
    id: payment.id,
    data: { status: 'paid', paidAt: paidAt.toISOString(), stripeCheckoutSessionId: session.id },
    overrideAccess: true,
  })
}

async function resolveInvoiceClientId(invoice: any): Promise<string | undefined> {
  const references = getStripeInvoiceReferences(invoice)
  if (references.clientId) return references.clientId

  const stripe = getStripe()
  if (references.subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(references.subscriptionId)
    if (subscription.metadata?.cmsClientId) {
      return subscription.metadata.cmsClientId
    }
  }

  if (references.customerId) {
    const customer = await stripe.customers.retrieve(references.customerId)
    if (!customer.deleted && customer.metadata?.cmsClientId) {
      return customer.metadata.cmsClientId
    }
  }

  return undefined
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event
  try {
    event = verifyStripeWebhook(await req.text(), signature)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const payload = await getPayload({ config: await config })
  const object: any = event.data.object
  // One-off payments are separate from the subscription: handle them here and
  // stop, so they can never overwrite the client's recurring billing record.
  if (object.metadata?.hostingOneOffPaymentId) {
    if (event.type === 'checkout.session.completed')
      await completeOneOffPayment(payload, object, new Date(event.created * 1000))
    return NextResponse.json({ received: true })
  }
  let clientId = object.metadata?.cmsClientId || object.client_reference_id
  if (!clientId && (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed')) {
    try {
      clientId = await resolveInvoiceClientId(object)
    } catch {
      return NextResponse.json({ received: true })
    }
  }
  if (!clientId) return NextResponse.json({ received: true })

  let client: any
  try {
    client = await payload.findByID({
      collection: 'clients',
      id: clientId,
      overrideAccess: true,
    })
  } catch {
    return NextResponse.json({ received: true })
  }

  const hosting = client.hostingSubscription || {}
  const eventTime = new Date(event.created * 1000)
  if (hosting.providerEventCreatedAt && new Date(hosting.providerEventCreatedAt) > eventTime) {
    return NextResponse.json({ received: true })
  }
  if (hosting.providerEventId === event.id) {
    return NextResponse.json({ received: true })
  }

  const incomingSubscriptionId = eventSubscriptionId(event.type, object)
  const recordedSubscriptionId = hosting.stripeSubscriptionId
  if (
    incomingSubscriptionId &&
    recordedSubscriptionId &&
    incomingSubscriptionId !== recordedSubscriptionId &&
    hasLiveHostingSubscription(hosting)
  ) {
    if (event.type === 'checkout.session.completed') {
      await completeOffer(payload, object.metadata?.hostingOfferId, client.id)
    }
    if (event.type === 'customer.subscription.created') {
      await alertDuplicateSubscription(payload, client, recordedSubscriptionId, incomingSubscriptionId)
    }
    return NextResponse.json({ received: true })
  }

  const next: any = {
    ...hosting,
    providerEventId: event.id,
    providerEventCreatedAt: eventTime.toISOString(),
  }
  if (event.type === 'checkout.session.completed') {
    next.stripeCustomerId = stripeObjectId(object.customer)
    next.offerCompletedAt = new Date().toISOString()
    await completeOffer(payload, object.metadata?.hostingOfferId, client.id)
  }

  if (event.type.startsWith('customer.subscription.')) {
    next.stripeSubscriptionId = object.id
    next.subscriptionStatus = object.status
    next.cancelAtPeriodEnd = Boolean(object.cancel_at_period_end)
    next.currentPeriodEnd = getSubscriptionPeriodEnd(object)
    const items = await getHostingSubscriptionItems(object.id)
    // Item IDs belong to one subscription. Never carry them over to a new one:
    // a stale surcharge item makes every later price change fail in Stripe.
    const sameSubscription = hosting.stripeSubscriptionId === object.id
    next.stripeHostingItemId =
      items.hostingItemId ?? (sameSubscription ? hosting.stripeHostingItemId : null) ?? null
    next.stripeSurchargeItemId = items.surchargeItemId ?? null
    // Record the frequency the client actually chose at checkout, so price
    // changes and the admin panel use it rather than the offer's default.
    if (items.interval) next.billingInterval = items.interval
  }

  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
    next.stripeLatestInvoiceId = object.id
    next.subscriptionStatus =
      event.type === 'invoice.payment_failed' ? 'payment_failed' : next.subscriptionStatus
  }

  await payload.update({
    collection: 'clients',
    id: client.id,
    data: { hostingSubscription: next },
    overrideAccess: true,
  })
  return NextResponse.json({ received: true })
}
