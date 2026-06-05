import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { userHasFeature } from '@/lib/access'

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
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  const row = result.docs[0] as any
  if (!row) return NextResponse.json({ error: 'Month cache row not found' }, { status: 404 })

  const updated = await payload.update({
    collection: 'monthly-keyword-terms-cache',
    id: row.id,
    data: {
      reviewComplete: complete,
      reviewCompletedAt: complete ? new Date().toISOString() : null,
      reviewCompletedBy: complete ? user.id : null,
    },
    overrideAccess: true,
  })

  return NextResponse.json({
    success: true,
    month: yearMonth,
    reviewComplete: complete,
    reviewCompletedAt: (updated as any).reviewCompletedAt || null,
  })
}
