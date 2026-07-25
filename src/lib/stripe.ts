import Stripe from 'stripe'
import type { HostingQuote } from './hosting-billing'

function required(name: 'STRIPE_SECRET_KEY' | 'STRIPE_WEBHOOK_SECRET' | 'CMS_URL'): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required for hosting billing.`)
  return value
}
export function getStripe(): Stripe {
  return new Stripe(required('STRIPE_SECRET_KEY'))
}
export function getCmsUrl(): string {
  const url = required('CMS_URL')
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost')
    throw new Error('CMS_URL must be an https URL.')
  return parsed.origin
}
export function verifyStripeWebhook(body: string | Buffer, signature: string): Stripe.Event {
  return getStripe().webhooks.constructEvent(body, signature, required('STRIPE_WEBHOOK_SECRET'))
}

export async function getHostingSubscriptionItems(
  subscriptionId: string,
): Promise<{ hostingItemId?: string; surchargeItemId?: string }> {
  const subscription = (await getStripe().subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price.product'],
  })) as any
  const items = subscription.items?.data || []
  return {
    hostingItemId: items.find(
      (item: any) => item.price?.product?.name !== 'Card processing surcharge',
    )?.id,
    surchargeItemId: items.find(
      (item: any) => item.price?.product?.name === 'Card processing surcharge',
    )?.id,
  }
}

export async function getHostingCheckoutSession(sessionId: string) {
  return getStripe().checkout.sessions.retrieve(sessionId)
}

export async function createHostingCheckout(input: {
  clientId: string
  offerId: string
  customerId?: string | null
  email: string
  quote: HostingQuote
  idempotencyKey: string
}) {
  const stripe = getStripe()
  const site = getCmsUrl()
  const metadata = { cmsClientId: input.clientId, hostingOfferId: input.offerId }
  const customer =
    input.customerId ||
    (
      await stripe.customers.create(
        { email: input.email, metadata },
        { idempotencyKey: `hosting-customer-${input.clientId}` },
      )
    ).id
  return stripe.checkout.sessions.create(
    {
      mode: 'subscription',
      payment_method_types: ['card'],
      customer,
      client_reference_id: input.clientId,
      metadata,
      subscription_data: { metadata },
      success_url: `${site}/hosting-pay/success`,
      cancel_url: `${site}/hosting-pay/cancel`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.quote.currency,
            unit_amount: input.quote.baseCents,
            product_data: { name: `${input.quote.planName} hosting`, metadata },
            recurring: { interval: input.quote.interval },
          },
        },
        {
          quantity: 1,
          price_data: {
            currency: input.quote.currency,
            unit_amount: input.quote.surchargeCents,
            product_data: { name: 'Card processing surcharge', metadata },
            recurring: { interval: input.quote.interval },
          },
        },
      ],
    },
    { idempotencyKey: input.idempotencyKey },
  )
}

export async function applyHostingPriceChange(input: {
  subscriptionId: string
  hostingItemId: string
  surchargeItemId: string
  quote: HostingQuote
  clientId: string
  changeId: string
}) {
  const stripe = getStripe()
  const metadata = { cmsClientId: input.clientId, hostingPriceChangeId: input.changeId }
  const hostingPrice = await stripe.prices.create(
    {
      currency: input.quote.currency,
      unit_amount: input.quote.baseCents,
      recurring: { interval: input.quote.interval },
      product_data: { name: `${input.quote.planName} hosting`, metadata },
      metadata,
    },
    { idempotencyKey: `hosting-price-${input.changeId}` },
  )
  const surchargePrice = await stripe.prices.create(
    {
      currency: input.quote.currency,
      unit_amount: input.quote.surchargeCents,
      recurring: { interval: input.quote.interval },
      product_data: { name: 'Card processing surcharge', metadata },
      metadata,
    },
    { idempotencyKey: `hosting-surcharge-${input.changeId}` },
  )
  return stripe.subscriptions.update(
    input.subscriptionId,
    {
      proration_behavior: 'none',
      items: [
        { id: input.hostingItemId, price: hostingPrice.id },
        { id: input.surchargeItemId, price: surchargePrice.id },
      ],
      metadata,
    },
    { idempotencyKey: `hosting-change-${input.changeId}` },
  )
}
