import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { z } from 'zod'
import config from '@/payload.config'
import { userHasFeature } from '@/lib/access'
import { getSubscriptionPeriodEnd } from '@/lib/hosting-billing'
import { stopHostingSubscription } from '@/lib/stripe'

const BodySchema = z.object({ action: z.enum(['end_of_period', 'immediately', 'undo']) })

/**
 * Stop (or un-stop) a client's hosting card payments from the CMS.
 * - end_of_period: no further charges; hosting stays paid until the period ends.
 * - immediately: cancel now. Stripe does not refund automatically.
 * - undo: remove a scheduled end-of-period stop.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const payload = await getPayload({ config: await config })
  const { user } = await payload.auth({ headers: req.headers })
  // Ending billing is a billing action: same permission as price changes.
  if (!user || !userHasFeature(user, 'hosting-billing-settings')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Only accept JSON: browsers cannot send it cross-site without a CORS
  // preflight, so a form on another site cannot use an admin's login cookie.
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ error: 'Expected a JSON request.' }, { status: 415 })
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Choose how to stop the payment.' }, { status: 400 })
  }
  const { action } = parsed.data

  const { id } = await params
  let client: any
  try {
    client = await payload.findByID({ collection: 'clients', id, overrideAccess: true })
  } catch {
    return NextResponse.json({ error: 'Client not found.' }, { status: 404 })
  }
  const hosting = client.hostingSubscription || {}
  if (!hosting.stripeSubscriptionId) {
    return NextResponse.json(
      { error: 'This client has no hosting subscription to stop.' },
      { status: 409 },
    )
  }
  if (hosting.subscriptionStatus === 'canceled') {
    return NextResponse.json(
      { error: 'This hosting subscription is already stopped.' },
      { status: 409 },
    )
  }

  const startedAt = Date.now()
  let subscription: any
  try {
    subscription = await stopHostingSubscription(hosting.stripeSubscriptionId, action)
  } catch (error) {
    console.error('[hosting-subscription/stop] Stripe request failed', {
      clientId: client.id,
      action,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: 'Stripe could not update this subscription. Check it in Stripe and try again.' },
      { status: 502 },
    )
  }
  console.info('[hosting-subscription/stop] updated', {
    clientId: client.id,
    action,
    status: subscription.status,
    elapsedMs: Date.now() - startedAt,
  })

  const result = {
    subscriptionStatus: String(subscription.status),
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    currentPeriodEnd: getSubscriptionPeriodEnd(subscription) ?? hosting.currentPeriodEnd ?? null,
  }
  await payload.update({
    collection: 'clients',
    id: client.id,
    data: { hostingSubscription: { ...hosting, ...result } },
    overrideAccess: true,
  })
  return NextResponse.json(result)
}
