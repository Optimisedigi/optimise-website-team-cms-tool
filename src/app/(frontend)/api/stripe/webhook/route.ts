import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { getHostingSubscriptionItems, getStripe, verifyStripeWebhook } from '@/lib/stripe'
import { getStripeInvoiceReferences } from '@/lib/hosting-billing'

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

  const next: any = {
    ...hosting,
    providerEventId: event.id,
    providerEventCreatedAt: eventTime.toISOString(),
  }
  if (event.type === 'checkout.session.completed') {
    next.stripeCustomerId =
      typeof object.customer === 'string' ? object.customer : object.customer?.id
    next.offerCompletedAt = new Date().toISOString()
    if (object.metadata?.hostingOfferId) {
      await payload.update({
        collection: 'hosting-payment-offers',
        id: object.metadata.hostingOfferId,
        data: { status: 'completed' },
        overrideAccess: true,
      })
    }
  }

  if (event.type.startsWith('customer.subscription.')) {
    next.stripeSubscriptionId = object.id
    next.subscriptionStatus = object.status
    next.cancelAtPeriodEnd = Boolean(object.cancel_at_period_end)
    next.currentPeriodEnd = object.current_period_end
      ? new Date(object.current_period_end * 1000).toISOString()
      : null
    const items = await getHostingSubscriptionItems(object.id)
    next.stripeHostingItemId = items.hostingItemId || next.stripeHostingItemId
    next.stripeSurchargeItemId = items.surchargeItemId || next.stripeSurchargeItemId
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
