import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { userHasFeature } from '@/lib/access'

const SOURCE_FIELD = {
  outcome: 'outcomeComment',
  removed: 'removedComment',
  dismissed: 'reviewComment',
} as const

type OutcomeSource = keyof typeof SOURCE_FIELD

/**
 * Edit the single canonical comment on one Review-outcomes row. The field
 * written depends on which outcome the row was sourced from so the log keeps a
 * single comment per row rather than a thread:
 *   outcome → outcomeComment · removed → removedComment · dismissed → reviewComment
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: req.headers })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!userHasFeature(user, 'negative-keyword-lists')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const clientId = Number(body?.clientId)
  const yearMonth = typeof body?.yearMonth === 'string' ? body.yearMonth.trim() : ''
  const searchTerm = typeof body?.searchTerm === 'string' ? body.searchTerm.trim() : ''
  const rowIndex = Number.isInteger(body?.rowIndex) ? Number(body.rowIndex) : 0
  const source = body?.source as OutcomeSource
  const comment = typeof body?.comment === 'string' ? body.comment : ''

  if (!Number.isInteger(clientId) || !/^\d{4}-\d{2}$/.test(yearMonth) || !searchTerm) {
    return NextResponse.json({ error: 'clientId, yearMonth and searchTerm are required' }, { status: 400 })
  }
  if (source !== 'outcome' && source !== 'removed' && source !== 'dismissed') {
    return NextResponse.json({ error: 'source must be one of outcome, removed, dismissed' }, { status: 400 })
  }

  const existing = await payload.find({
    collection: 'monthly-keyword-selections',
    where: { client: { equals: clientId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const doc = existing.docs[0] as { id: number | string; selections?: Array<Record<string, unknown>> } | undefined
  if (!doc) return NextResponse.json({ error: 'No selections found for client' }, { status: 404 })

  const field = SOURCE_FIELD[source]
  let matched = false
  const selections = (Array.isArray(doc.selections) ? doc.selections : []).map((selection) => {
    const sameRow = String(selection.yearMonth) === yearMonth
      && String(selection.searchTerm || '').toLowerCase() === searchTerm.toLowerCase()
      && Number(selection.rowIndex ?? 0) === rowIndex
    if (!sameRow) return selection
    matched = true
    return { ...selection, [field]: comment }
  })

  if (!matched) return NextResponse.json({ error: 'Matching outcome not found' }, { status: 404 })

  await payload.update({
    collection: 'monthly-keyword-selections',
    id: doc.id,
    data: { selections },
    overrideAccess: true,
  })

  return NextResponse.json({ success: true })
}
