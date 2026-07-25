import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { shouldApplyHostingPriceChange } from '@/lib/hosting-billing'
import { applyHostingPriceChange } from '@/lib/stripe'

function isAuthorized(req: NextRequest): boolean {
  const apiKey = process.env.AUDIT_API_KEY
  const cronSecret = process.env.CRON_SECRET
  return Boolean(
    (apiKey && req.headers.get('x-api-key') === apiKey) ||
    (cronSecret && req.headers.get('authorization') === `Bearer ${cronSecret}`),
  )
}

async function sweep(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = await getPayload({ config: await config })
  const clients: any = await payload.find({
    collection: 'clients',
    where: {
      'hostingSubscription.stripeSubscriptionId': { exists: true },
    },
    limit: 1_000,
    overrideAccess: true,
  })
  let applied = 0

  for (const client of clients.docs) {
    const hosting = client.hostingSubscription || {}
    let changed = false
    for (const change of hosting.priceChanges || []) {
      if (!change.noticeSentAt || !shouldApplyHostingPriceChange(change)) {
        continue
      }

      try {
        await applyHostingPriceChange({
          subscriptionId: hosting.stripeSubscriptionId,
          hostingItemId: hosting.stripeHostingItemId,
          surchargeItemId: hosting.stripeSurchargeItemId,
          quote: change.newQuote,
          clientId: String(client.id),
          changeId: String(change.id),
        })
        change.status = 'applied'
        change.appliedAt = new Date().toISOString()
        change.stripeReference = hosting.stripeSubscriptionId
        change.lastError = null

        const quote = change.newQuote
        hosting.planName = quote.planName
        hosting.allowance = quote.allowance
        hosting.capacityClause = quote.clause
        if (quote.interval === 'year') {
          hosting.annualBaseCents = quote.baseCents
        } else {
          hosting.monthlyBaseCents = quote.baseCents
        }
        applied += 1
        changed = true
      } catch (error) {
        change.lastError =
          error instanceof Error ? error.message.slice(0, 500) : 'Stripe update failed'
        change.retryCount = Number(change.retryCount || 0) + 1
        changed = true
      }
    }

    if (changed) {
      await payload.update({
        collection: 'clients',
        id: client.id,
        data: {
          hostingSubscription: {
            ...hosting,
            priceChanges: hosting.priceChanges,
          },
        },
        overrideAccess: true,
      })
    }
  }

  return NextResponse.json({ applied })
}

export const GET = sweep
export const POST = sweep
