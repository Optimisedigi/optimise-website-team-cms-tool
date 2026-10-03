import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { userHasFeature } from '@/lib/access'
import { getHostingCheckoutSession, isStripeMissingResource } from '@/lib/stripe'

/**
 * Removes a cancelled one-off payment link from the client page list. The
 * record is kept (only hidden), so the history can still be checked in the
 * Hosting One-off Payments collection. Only cancelled links can be removed,
 * and never while the client may still have a Stripe checkout open on it.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> },
) {
  const payload = await getPayload({ config: await config })
  const { user } = await payload.auth({ headers: req.headers })
  if (!user || !userHasFeature(user, 'hosting-billing-settings'))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { id, paymentId } = await params
  let payment: any
  try {
    payment = await payload.findByID({
      collection: 'hosting-one-off-payments',
      id: paymentId,
      depth: 0,
      overrideAccess: true,
    })
  } catch {
    payment = null
  }
  if (!payment || String(payment.client) !== String(id))
    return NextResponse.json({ error: 'Payment link not found.' }, { status: 404 })
  if (payment.status !== 'revoked')
    return NextResponse.json(
      { error: 'Only cancelled payment links can be removed. Cancel it first.' },
      { status: 409 },
    )

  // A cancel whose Stripe step failed can leave a checkout open; keep the row
  // (and its retry button) visible until that checkout is closed.
  if (payment.stripeCheckoutSessionId) {
    try {
      const session = await getHostingCheckoutSession(payment.stripeCheckoutSessionId)
      if (session.status === 'open')
        return NextResponse.json(
          {
            error:
              'The client may still have a checkout open on this link. Click Cancel link again, then remove it.',
          },
          { status: 409 },
        )
    } catch (error) {
      if (!isStripeMissingResource(error))
        return NextResponse.json(
          { error: 'Could not reach Stripe to check this link. Try again in a minute.' },
          { status: 503 },
        )
    }
  }

  if (!payment.hiddenAt)
    await payload.update({
      collection: 'hosting-one-off-payments',
      id: payment.id,
      data: { hiddenAt: new Date().toISOString() },
      overrideAccess: true,
    })
  return NextResponse.json({ hidden: true })
}
