import type Stripe from 'stripe'

/** One paid hosting subscription invoice, as shown in the client's payment history. */
export type HostingPayment = {
  invoiceId: string
  /** ISO dates of the service period the invoice paid for. */
  periodStart: string | null
  periodEnd: string | null
  amountPaidCents: number
  currency: string
  paidAt: string | null
  status: 'paid'
}

export type HostingPaymentsSummary = {
  payments: HostingPayment[]
  count: number
  totalPaidCents: number
}

/** Upper bound on invoices read from Stripe for one client (100 months is 8+ years). */
export const HOSTING_PAYMENTS_MAX_INVOICES = 100

/** Minimal invoice shape this module reads, so tests need not build full Stripe objects. */
export type InvoiceLike = Pick<
  Stripe.Invoice,
  'id' | 'status' | 'amount_paid' | 'currency' | 'period_start' | 'period_end' | 'metadata'
> & {
  parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null
  status_transitions?: { paid_at?: number | null } | null
  lines?: { data?: Array<{ period?: { start?: number | null; end?: number | null } | null }> } | null
}

const iso = (seconds: number | null | undefined): string | null =>
  typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000).toISOString()
    : null

function invoiceSubscriptionId(invoice: InvoiceLike): string | null {
  const sub = invoice.parent?.subscription_details?.subscription
  if (!sub) return null
  return typeof sub === 'string' ? sub : sub.id
}

/**
 * True for a paid invoice raised by a hosting subscription. One-off hosting
 * payments are Checkout `mode: 'payment'` sessions with
 * `hostingOneOffPaymentId` metadata and no subscription, so they are excluded
 * (they have their own list).
 */
export function isHostingSubscriptionInvoice(
  invoice: InvoiceLike,
  subscriptionId?: string | null,
): boolean {
  if (invoice.status !== 'paid') return false
  if (invoice.metadata?.hostingOneOffPaymentId) return false
  const sub = invoiceSubscriptionId(invoice)
  if (!sub) return false
  return subscriptionId ? sub === subscriptionId : true
}

/**
 * The service period the invoice paid for. Subscription invoices report the
 * *previous* period at invoice level, so prefer the line item periods.
 */
function servicePeriod(invoice: InvoiceLike): { start: number | null; end: number | null } {
  const lines = invoice.lines?.data ?? []
  const starts = lines.map((line) => line.period?.start).filter((v): v is number => !!v)
  const ends = lines.map((line) => line.period?.end).filter((v): v is number => !!v)
  if (starts.length && ends.length) return { start: Math.min(...starts), end: Math.max(...ends) }
  return { start: invoice.period_start ?? null, end: invoice.period_end ?? null }
}

export function toHostingPayment(invoice: InvoiceLike): HostingPayment {
  const period = servicePeriod(invoice)
  return {
    invoiceId: invoice.id ?? '',
    periodStart: iso(period.start),
    periodEnd: iso(period.end),
    amountPaidCents: Math.max(0, Number(invoice.amount_paid) || 0),
    currency: (invoice.currency || 'aud').toLowerCase(),
    paidAt: iso(invoice.status_transitions?.paid_at ?? null),
    status: 'paid',
  }
}

const sortKey = (payment: HostingPayment): string =>
  payment.paidAt || payment.periodStart || ''

/** Filters, de-duplicates and sorts invoices newest first, with totals. */
export function summariseHostingPayments(
  invoices: InvoiceLike[],
  subscriptionId?: string | null,
): HostingPaymentsSummary {
  const seen = new Set<string>()
  const payments: HostingPayment[] = []
  for (const invoice of invoices) {
    if (!invoice.id || seen.has(invoice.id)) continue
    if (!isHostingSubscriptionInvoice(invoice, subscriptionId)) continue
    seen.add(invoice.id)
    payments.push(toHostingPayment(invoice))
  }
  payments.sort((a, b) => sortKey(b).localeCompare(sortKey(a)))
  return {
    payments,
    count: payments.length,
    totalPaidCents: payments.reduce((sum, payment) => sum + payment.amountPaidCents, 0),
  }
}
