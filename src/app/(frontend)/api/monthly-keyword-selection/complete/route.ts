import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { userHasFeature } from '@/lib/access'
import { notifyMonthlyNegativesComplete } from '@/lib/monthly-keyword-needs-review-notify'

export async function POST(req: NextRequest) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: req.headers })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!userHasFeature(user, 'negative-keyword-lists')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const clientId = Number(body?.clientId)
  const yearMonth = typeof body?.yearMonth === 'string' ? body.yearMonth : ''
  const complete = Boolean(body?.complete)

  if (!Number.isInteger(clientId) || !/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json({ error: 'Invalid clientId or yearMonth' }, { status: 400 })
  }

  const result = await payload.find({
    collection: 'monthly-keyword-terms-cache',
    where: {
      and: [
        { client: { equals: clientId } },
        { yearMonth: { equals: yearMonth } },
      ],
    },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })

  const rows = result.docs as any[]
  if (rows.length === 0) return NextResponse.json({ error: 'Month cache row not found' }, { status: 404 })

  // There can be duplicate cache rows for the same client+yearMonth. Update
  // every matching row so completion state is consistent regardless of which
  // row a reader (e.g. the warmer) happens to pick.
  const reviewCompletedAt = complete ? new Date().toISOString() : null
  const reviewCompletedBy = complete ? user.id : null
  const updatedRows = await Promise.all(
    rows.map((row) =>
      payload.update({
        collection: 'monthly-keyword-terms-cache',
        id: row.id,
        data: {
          reviewComplete: complete,
          reviewCompletedAt,
          reviewCompletedBy,
        },
        overrideAccess: true,
      }),
    ),
  )
  const updated = updatedRows[0]

  // When a month is marked complete, tell admins it is ready for review and
  // surface any "needs review" terms to staff via the bell + activity feed.
  if (complete) {
    const selectionResult = await payload.find({
      collection: 'monthly-keyword-selections',
      where: { client: { equals: clientId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const selectionDoc = selectionResult.docs[0] as { selections?: Array<{ yearMonth?: string; decision?: string }> } | undefined
    const needsReviewCount = (Array.isArray(selectionDoc?.selections) ? selectionDoc.selections : []).filter(
      (s) => s?.yearMonth === yearMonth && s?.decision === 'needs_review',
    ).length

    const client = await payload.findByID({ collection: 'clients', id: clientId, depth: 0, overrideAccess: true }).catch(() => null) as { name?: string } | null
    await notifyMonthlyNegativesComplete(payload, {
      clientId,
      clientName: client?.name || `Client ${clientId}`,
      yearMonth,
      needsReviewCount,
      triggeredByUserId: user.id,
      triggeredByName: (user as { name?: string; email?: string }).name || (user as { email?: string }).email || null,
    })
  }

  return NextResponse.json({
    success: true,
    month: yearMonth,
    reviewComplete: complete,
    reviewCompletedAt: (updated as any).reviewCompletedAt || null,
  })
}
