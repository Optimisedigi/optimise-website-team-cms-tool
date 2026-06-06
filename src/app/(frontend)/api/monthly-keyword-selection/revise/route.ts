import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { userHasFeature } from '@/lib/access'

type MatchType = 'exact' | 'broad' | 'phrase'
type NklKeyword = { keyword?: string; matchType?: MatchType; flaggedForRemoval?: boolean | null; negatedAt?: string | null; id?: string | null }

const VALID_MATCH_TYPES = new Set<MatchType>(['exact', 'broad', 'phrase'])

function nklIdOf(value: unknown): string | null {
  if (value && typeof value === 'object' && 'id' in value) return String((value as { id: unknown }).id)
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  return null
}

/**
 * Safety-net revisions for negatives already applied to an NKL, driven from the
 * "Submitted negatives" tab.
 *
 *  - action 'remove': delete just this keyword+matchType from its NKL and mark
 *    the selection skipped so the term stays hidden in future months.
 *  - action 'update': replace the keyword text and/or match type in place inside
 *    the same NKL, keeping the selection applied.
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
  const action = body?.action === 'remove' || body?.action === 'update' ? body.action : null
  const newKeyword = typeof body?.newKeyword === 'string' ? body.newKeyword.trim() : ''
  const newMatchType = typeof body?.newMatchType === 'string' && VALID_MATCH_TYPES.has(body.newMatchType as MatchType)
    ? body.newMatchType as MatchType
    : null

  if (!Number.isInteger(clientId) || !/^\d{4}-\d{2}$/.test(yearMonth) || !searchTerm || !action) {
    return NextResponse.json({ error: 'clientId, yearMonth, searchTerm and a valid action are required' }, { status: 400 })
  }
  if (action === 'update' && (!newKeyword || !newMatchType)) {
    return NextResponse.json({ error: 'update requires newKeyword and newMatchType' }, { status: 400 })
  }

  const existing = await payload.find({
    collection: 'monthly-keyword-selections',
    where: { client: { equals: clientId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  // selections is intentionally loose (any[]) so the typed payload.update call
  // accepts the spread-and-patch rows, mirroring the bulk /save route.
  const doc = existing.docs[0] as { id: number | string; selections?: any[] } | undefined
  if (!doc) return NextResponse.json({ error: 'No selections found for client' }, { status: 404 })

  const selectionsArr = Array.isArray(doc.selections) ? doc.selections : []
  const target = selectionsArr.find((selection) =>
    String(selection.yearMonth) === yearMonth
    && String(selection.searchTerm || '').toLowerCase() === searchTerm.toLowerCase(),
  )
  if (!target) return NextResponse.json({ error: 'Matching term not found' }, { status: 404 })

  const nklId = nklIdOf(target.appliedToNKL)
  if (!nklId) return NextResponse.json({ error: 'Term is not applied to a negative keyword list' }, { status: 400 })

  const oldKeyword = String(target.negativeKeyword || '').trim()
  const oldMatchType = String(target.matchType || 'exact') as MatchType

  const nkl = await payload.findByID({
    collection: 'negative-keyword-lists',
    id: nklId,
    depth: 0,
    overrideAccess: true,
  }).catch(() => null) as { id: number | string; client?: unknown; keywords?: NklKeyword[] } | null
  if (!nkl) return NextResponse.json({ error: 'Negative keyword list not found' }, { status: 404 })

  const nklClientId = nkl.client && typeof nkl.client === 'object' ? Number((nkl.client as { id: unknown }).id) : Number(nkl.client)
  if (nklClientId !== clientId) {
    return NextResponse.json({ error: 'NKL does not belong to client' }, { status: 400 })
  }

  const currentKeywords: NklKeyword[] = Array.isArray(nkl.keywords) ? nkl.keywords : []
  const matchesOld = (kw: NklKeyword): boolean =>
    String(kw.keyword || '').toLowerCase() === oldKeyword.toLowerCase() && String(kw.matchType) === oldMatchType

  const now = new Date().toISOString()

  if (action === 'remove') {
    const nextKeywords = currentKeywords.filter((kw) => !matchesOld(kw))
    await payload.update({
      collection: 'negative-keyword-lists',
      id: nklId,
      data: { keywords: nextKeywords },
      overrideAccess: true,
    })
    const selections = selectionsArr.map((selection) =>
      selection === target
        ? { ...selection, decision: 'skipped', appliedToNKL: null, appliedAt: null }
        : selection,
    )
    await payload.update({
      collection: 'monthly-keyword-selections',
      id: doc.id,
      data: { selections },
      overrideAccess: true,
    })
    return NextResponse.json({ success: true, action, removed: currentKeywords.length - nextKeywords.length })
  }

  // action === 'update' — replace keyword/matchType in place inside the NKL.
  const duplicate = currentKeywords.some((kw) =>
    !matchesOld(kw)
    && String(kw.keyword || '').toLowerCase() === newKeyword.toLowerCase()
    && String(kw.matchType) === newMatchType,
  )
  let replaced = false
  const nextKeywords = currentKeywords
    .map((kw) => {
      if (!matchesOld(kw)) return kw
      replaced = true
      // If the revised keyword already exists elsewhere in the list, drop this
      // entry instead of creating a duplicate.
      if (duplicate) return null
      return { ...kw, keyword: newKeyword, matchType: newMatchType }
    })
    .filter((kw): kw is NklKeyword => kw !== null)

  if (!replaced) {
    return NextResponse.json({ error: 'Keyword no longer present in the list' }, { status: 409 })
  }

  await payload.update({
    collection: 'negative-keyword-lists',
    id: nklId,
    data: { keywords: nextKeywords },
    overrideAccess: true,
  })

  const selections = selectionsArr.map((selection) =>
    selection === target
      ? { ...selection, negativeKeyword: newKeyword, matchType: newMatchType, appliedAt: now }
      : selection,
  )
  await payload.update({
    collection: 'monthly-keyword-selections',
    id: doc.id,
    data: { selections },
    overrideAccess: true,
  })

  return NextResponse.json({ success: true, action, deduped: duplicate })
}
