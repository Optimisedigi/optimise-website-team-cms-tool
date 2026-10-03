import Stripe from 'stripe'
import type { HostingQuote } from './hosting-billing'
import type { StripeBillingStartParams } from './hosting-billing-schedule'

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

export async function getHostingSubscriptionItems(subscriptionId: string): Promise<{
  hostingItemId?: string
  surchargeItemId?: string
  /** How often Stripe actually bills this subscription (the client's choice). */
  interval?: 'month' | 'year'
}> {
  const subscription = (await getStripe().subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price.product'],
  })) as any
  const items = subscription.items?.data || []
  const hostingItem = items.find(
    (item: any) => item.price?.product?.name !== 'Card processing surcharge',
  )
  const interval = hostingItem?.price?.recurring?.interval
  return {
    hostingItemId: hostingItem?.id,
    surchargeItemId: items.find(
      (item: any) => item.price?.product?.name === 'Card processing surcharge',
    )?.id,
    interval: interval === 'month' || interval === 'year' ? interval : undefined,
  }
}

/**
 * How the client pays:
 * - `hosted`: on Stripe's own page.
 * - `embedded`: Stripe's whole checkout page embedded in the CMS page.
 * - `elements`: only Stripe's card and wallet fields, inside the CMS page's
 *   own layout. Card details still go straight to Stripe in its frames.
 * Embedded and elements sessions only redirect when a payment method needs it
 * (cards don't); the CMS page shows its own success message.
 */
export type CheckoutUi = 'hosted' | 'embedded' | 'elements'

function checkoutUiParams(
  ui: CheckoutUi,
  successUrl: string,
  cancelUrl: string,
  returnUrl: string,
) {
  if (ui === 'embedded')
    return { ui_mode: 'embedded_page' as const, redirect_on_completion: 'never' as const }
  if (ui === 'elements') return { ui_mode: 'elements' as const, return_url: returnUrl }
  return { success_url: successUrl, cancel_url: cancelUrl }
}

/** Which UI an existing session was opened with. */
export function checkoutSessionUi(session: { ui_mode?: string | null }): CheckoutUi {
  if (session.ui_mode === 'embedded_page') return 'embedded'
  if (session.ui_mode === 'elements') return 'elements'
  return 'hosted'
}

/**
 * The publishable key for the embedded card form, or null to keep using
 * Stripe's hosted page. Read at request time (not inlined into the bundle).
 * A key from the other mode (test vs live) would fail to load the form, so it
 * is ignored rather than leaving the client with a broken payment page.
 */
export function getStripePublishableKey(): string | null {
  const key = process.env.STRIPE_PUBLISHABLE_KEY?.trim()
  const secret = process.env.STRIPE_SECRET_KEY?.trim() ?? ''
  if (!key || !/^pk_(live|test)_\w+$/.test(key)) return null
  const keyMode = key.startsWith('pk_live_') ? 'live' : 'test'
  const secretMode = /^(sk|rk)_live_/.test(secret)
    ? 'live'
    : /^(sk|rk)_test_/.test(secret)
      ? 'test'
      : null
  return secretMode === keyMode ? key : null
}

export async function getHostingCheckoutSession(sessionId: string) {
  return getStripe().checkout.sessions.retrieve(sessionId)
}

/** Stripe reports a deleted or unknown object with this error code. */
export function isStripeMissingResource(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'resource_missing'
}

/**
 * Stripe refused a request because its idempotency key is already used with
 * different parameters, or by a request still in flight.
 */
export function isStripeIdempotencyConflict(error: unknown): boolean {
  const { rawType, code } = (error ?? {}) as { rawType?: unknown; code?: unknown }
  return rawType === 'idempotency_error' || code === 'idempotency_key_in_use'
}

/** Close an unpaid Checkout session so a client who switches plan cannot pay both. */
export async function expireHostingCheckoutSession(sessionId: string) {
  return getStripe().checkout.sessions.expire(sessionId)
}

export type HostingSubscriptionStopAction = 'end_of_period' | 'immediately' | 'undo'

export async function stopHostingSubscription(
  subscriptionId: string,
  action: HostingSubscriptionStopAction,
) {
  const stripe = getStripe()
  if (action === 'immediately') return stripe.subscriptions.cancel(subscriptionId)
  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: action === 'end_of_period',
  })
}

export async function createHostingCheckout(input: {
  clientId: string
  offerId: string
  customerId?: string | null
  email: string
  quote: HostingQuote
  /** When the first charge and renewals fall; see stripeBillingStartParams. */
  billingStart: StripeBillingStartParams
  idempotencyKey: string
  returnToPaymentLink?: string
  ui?: CheckoutUi
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
      subscription_data: {
        metadata,
        // Renewals fall on the client's billing start date each month or year.
        ...input.billingStart,
      },
      ...checkoutUiParams(
        input.ui ?? 'hosted',
        `${site}/hosting-pay/success`,
        input.returnToPaymentLink
          ? `${site}/hosting-pay/cancel?return_to=${encodeURIComponent(input.returnToPaymentLink)}`
          : `${site}/hosting-pay/cancel`,
        `${site}${input.returnToPaymentLink ?? '/hosting-pay/success'}`,
      ),
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

/**
 * A single card payment for a one-off hosting charge (for example, backdated
 * hosting). `mode: 'payment'` never creates a subscription, so paying it
 * cannot start or change recurring billing.
 */
export async function createHostingOneOffCheckout(input: {
  clientId: string
  paymentId: string
  customerId?: string | null
  email: string
  description: string
  currency: string
  totalCents: number
  idempotencyKey: string
  returnToPaymentLink: string
  ui?: CheckoutUi
}) {
  const site = getCmsUrl()
  const metadata = { cmsClientId: input.clientId, hostingOneOffPaymentId: input.paymentId }
  return getStripe().checkout.sessions.create(
    {
      mode: 'payment',
      payment_method_types: ['card'],
      ...(input.customerId ? { customer: input.customerId } : { customer_email: input.email }),
      client_reference_id: input.clientId,
      metadata,
      payment_intent_data: { metadata, receipt_email: input.email },
      ...checkoutUiParams(
        input.ui ?? 'hosted',
        `${site}/hosting-pay/once/paid`,
        `${site}/hosting-pay/cancel?return_to=${encodeURIComponent(input.returnToPaymentLink)}`,
        // Only used if a payment method needs a redirect; the page then shows
        // the paid state once Stripe's webhook has confirmed the payment.
        `${site}${input.returnToPaymentLink}`,
      ),
      // One line for the surcharge-inclusive total; the payment page itemises it.
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.currency,
            unit_amount: input.totalCents,
            product_data: { name: input.description, metadata },
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
