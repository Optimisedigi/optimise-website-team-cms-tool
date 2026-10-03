import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { userHasFeature } from '@/lib/access'
import { getStripe } from '@/lib/stripe'
import {
  HOSTING_PAYMENTS_MAX_INVOICES,
  summariseHostingPayments,
  type HostingPaymentsSummary,
  type InvoiceLike,
} from '@/lib/hosting-payments'

type Params = { params: Promise<{ id: string }> }

const CACHE_HEADERS = { 'Cache-Control': 'private, max-age=60' }
const EMPTY: HostingPaymentsSummary = { payments: [], count: 0, totalPaidCents: 0 }

const asStripeId = (value: unknown, prefix: string): string | null =>
  typeof value === 'string' && value.startsWith(prefix) && /^[A-Za-z0-9_]+$/.test(value)
    ? value
    : null

/**
 * Paid hosting subscription invoices for a client, newest first. Stripe is the
 * source of truth; the client record only stores the current subscription.
 * One-off hosting payments are excluded (see isHostingSubscriptionInvoice).
 */
export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const payload = await getPayload({ config: await config })
  const { user } = await payload.auth({ headers: req.headers })
  if (!user || !userHasFeature(user, 'clients'))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { id } = await params
  if (!/^[1-9]\d{0,11}$/.test(id))
    return NextResponse.json({ error: 'Invalid client id.' }, { status: 400 })

  let client: { hostingSubscription?: Record<string, unknown> | null }
  try {
    client = (await payload.findByID({
      collection: 'clients',
      id,
      depth: 0,
      overrideAccess: true,
    })) as typeof client
  } catch {
    return NextResponse.json({ error: 'Client not found.' }, { status: 404 })
  }

  const hosting = client.hostingSubscription ?? {}
  const subscriptionId = asStripeId(hosting.stripeSubscriptionId, 'sub_')
  const customerId = asStripeId(hosting.stripeCustomerId, 'cus_')
  if (!subscriptionId && !customerId)
    return NextResponse.json(EMPTY, { headers: CACHE_HEADERS })

  // Listing by customer covers earlier, since-replaced subscriptions too.
  const filter = customerId ? { customer: customerId } : { subscription: subscriptionId! }
  const started = Date.now()
  try {
    const invoices: InvoiceLike[] = []
    const list = getStripe().invoices.list({ ...filter, status: 'paid', limit: 100 })
    for await (const invoice of list) {
      invoices.push(invoice as unknown as InvoiceLike)
      if (invoices.length >= HOSTING_PAYMENTS_MAX_INVOICES) break
    }
    const summary = summariseHostingPayments(invoices, customerId ? null : subscriptionId)
    console.info('[hosting-payments] stripe invoices listed', {
      clientId: id,
      by: customerId ? 'customer' : 'subscription',
      fetched: invoices.length,
      returned: summary.count,
      capped: invoices.length >= HOSTING_PAYMENTS_MAX_INVOICES,
      elapsedMs: Date.now() - started,
    })
    return NextResponse.json(summary, { headers: CACHE_HEADERS })
  } catch (error) {
    console.error('[hosting-payments] stripe invoice list failed', {
      clientId: id,
      by: customerId ? 'customer' : 'subscription',
      code: (error as { code?: string } | null)?.code,
      type: (error as { type?: string } | null)?.type,
      elapsedMs: Date.now() - started,
    })
    return NextResponse.json(
      { error: 'Could not load payment history from Stripe.' },
      { status: 502 },
    )
  }
}
