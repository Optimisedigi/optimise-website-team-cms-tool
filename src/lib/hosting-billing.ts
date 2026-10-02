export type HostingInterval = 'month' | 'year'
export type SurchargeConfig = { percentage: number; fixedCents: number }
export type HostingQuote = {
  currency: string
  baseCents: number
  surchargeCents: number
  totalCents: number
  interval: HostingInterval
  allowance: string
  clause: string
  planName: string
}
export type StripeInvoiceReferences = {
  clientId?: string
  customerId?: string
  subscriptionId?: string
}

export function validateSurchargeConfig(config: SurchargeConfig): void {
  if (!Number.isFinite(config.percentage) || config.percentage < 0 || config.percentage >= 100)
    throw new Error('Card surcharge percentage must be at least 0 and below 100.')
  if (!Number.isInteger(config.fixedCents) || config.fixedCents < 0)
    throw new Error('Card surcharge fixed fee must be a non-negative whole number of cents.')
}

export function calculateCardSurcharge(baseCents: number, config: SurchargeConfig): number {
  if (!Number.isInteger(baseCents) || baseCents < 0)
    throw new Error('Hosting amount must be a non-negative whole number of cents.')
  validateSurchargeConfig(config)
  return Math.ceil((baseCents + config.fixedCents) / (1 - config.percentage / 100)) - baseCents
}

export function createHostingQuote(input: {
  currency: string
  baseCents: number
  interval: HostingInterval
  allowance: string
  clause: string
  planName: string
  surcharge: SurchargeConfig
}): HostingQuote {
  const surchargeCents = calculateCardSurcharge(input.baseCents, input.surcharge)
  return {
    currency: input.currency.toLowerCase(),
    baseCents: input.baseCents,
    surchargeCents,
    totalCents: input.baseCents + surchargeCents,
    interval: input.interval,
    allowance: input.allowance,
    clause: input.clause,
    planName: input.planName,
  }
}

/** Default client-facing renewal note (Hosting Billing Settings → Client terms). */
export const HOSTING_RENEWAL_NOTE_DEFAULT =
  'Your hosting renews automatically and is paid from your card for the next period. If you want to stop renting your website, just let us know and we can cancel straight away.'

/**
 * What a client saves a year by paying annually: the annual discount on the
 * hosting fee (12 x monthly fee - annual fee). Card surcharge is left out on
 * purpose. One yearly card charge carries less fixed surcharge than twelve
 * monthly ones, but that is not a discount we advertise. With no discount
 * this is 0, so no "save" line is shown.
 */
export function annualSavingCents(
  monthly: HostingQuote | null | undefined,
  annual: HostingQuote | null | undefined,
): number {
  if (!monthly || !annual) return 0
  return Math.max(0, monthly.baseCents * 12 - annual.baseCents)
}

export function formatMoney(cents: number, currency = 'aud'): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100)
}

function stripeId(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string')
    return value.id
  return undefined
}

export function getStripeInvoiceReferences(invoice: any): StripeInvoiceReferences {
  const subscriptionDetails = invoice?.parent?.subscription_details
  return {
    clientId: subscriptionDetails?.metadata?.cmsClientId || invoice?.metadata?.cmsClientId,
    customerId: stripeId(invoice?.customer),
    subscriptionId: stripeId(subscriptionDetails?.subscription || invoice?.subscription),
  }
}

/**
 * Stripe moved `current_period_end` off the subscription and onto each subscription item
 * (API 2025-03-31.basil onwards). Read the item value, falling back to the legacy top-level
 * field so older API versions and stored fixtures still resolve.
 */
export function getSubscriptionPeriodEnd(subscription: any): string | null {
  const seconds =
    subscription?.items?.data?.find((item: any) => Number.isFinite(item?.current_period_end))
      ?.current_period_end ?? subscription?.current_period_end
  if (!Number.isFinite(seconds)) return null
  return new Date(seconds * 1000).toISOString()
}

export function shouldApplyHostingPriceChange(
  change: { status?: string | null; effectiveAt?: string | null },
  now = new Date(),
  leadTimeMs = 2 * 60 * 60 * 1000,
): boolean {
  if (change.status !== 'pending' || !change.effectiveAt) return false
  const effectiveAt = new Date(change.effectiveAt).getTime()
  return Number.isFinite(effectiveAt) && effectiveAt <= now.getTime() + leadTimeMs
}

/** Stripe statuses after which a subscription can never charge the card again. */
const ENDED_SUBSCRIPTION_STATUSES = new Set(['canceled', 'incomplete_expired'])

export function isEndedSubscriptionStatus(status: string | null | undefined): boolean {
  return ENDED_SUBSCRIPTION_STATUSES.has(String(status ?? ''))
}

/**
 * True while the client's recorded subscription can still bill them. Used to
 * refuse a second payment link so one client is never charged twice.
 */
export function hasLiveHostingSubscription(
  hosting: { stripeSubscriptionId?: string | null; subscriptionStatus?: string | null } | null | undefined,
): boolean {
  return Boolean(hosting?.stripeSubscriptionId) && !isEndedSubscriptionStatus(hosting?.subscriptionStatus)
}

export function hashOfferToken(token: string): string {
  const crypto = require('crypto') as typeof import('crypto')
  return crypto.createHash('sha256').update(token).digest('hex')
}
