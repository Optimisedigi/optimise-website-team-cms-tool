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
  returnToPaymentLink?: string
}) {
  const stripe = getStripe()
  const site = getCmsUrl()
  const metadata = { cmsClientId: input.clientId, hostingOfferId: input.offerId }
  const customer =
    input.customerId ||
    (
      await stripe.customers.create(
        { email: input.email, metadata },
        // A customer belongs to this offer attempt. Reusing a client-wide key
        // makes Stripe reject a reissued offer when its email or metadata differs.
        { idempotencyKey: `hosting-customer-${input.clientId}-${input.offerId}` },
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
      cancel_url: input.returnToPaymentLink
        ? `${site}/hosting-pay/cancel?return_to=${encodeURIComponent(input.returnToPaymentLink)}`
        : `${site}/hosting-pay/cancel`,
      // Checkout's subscription summary collapses multiple recurring line items
      // into “and 1 more”. The payment-review page already itemises the disclosed
      // surcharge, so send Stripe one recurring total for a clearer client hand-off.
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.quote.currency,
            unit_amount: input.quote.totalCents,
            product_data: { name: input.quote.planName, metadata },
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
  surchargeItemId?: string | null
  quote: HostingQuote
  clientId: string
  changeId: string
}) {
  const stripe = getStripe()
  const metadata = { cmsClientId: input.clientId, hostingPriceChangeId: input.changeId }
  if (!input.surchargeItemId) {
    const totalPrice = await stripe.prices.create(
      {
        currency: input.quote.currency,
        unit_amount: input.quote.totalCents,
        recurring: { interval: input.quote.interval },
        product_data: { name: input.quote.planName, metadata },
        metadata,
      },
      { idempotencyKey: `hosting-price-${input.changeId}` },
    )
    return stripe.subscriptions.update(
      input.subscriptionId,
      {
        proration_behavior: 'none',
        items: [{ id: input.hostingItemId, price: totalPrice.id }],
        metadata,
      },
      { idempotencyKey: `hosting-change-${input.changeId}` },
    )
  }

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
