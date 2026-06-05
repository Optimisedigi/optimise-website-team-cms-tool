import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'

type MatchType = 'exact' | 'broad' | 'phrase'

type KeywordSelection = {
  yearMonth?: string
  searchTerm?: string
  keyword: string
  matchType: MatchType
  appliedToNKL?: number | string | null
}

const VALID_MATCH_TYPES = new Set(['exact', 'broad', 'phrase'])

function normaliseKeyword(value: any, fallbackNklId?: number | string | null): KeywordSelection | null {
  const keyword = typeof value?.negativeKeyword === 'string'
    ? value.negativeKeyword.trim()
    : typeof value?.keyword === 'string'
      ? value.keyword.trim()
      : ''
  const matchType = typeof value?.matchType === 'string' && VALID_MATCH_TYPES.has(value.matchType)
    ? value.matchType as MatchType
    : 'exact'
  const rawAppliedToNKL = typeof value?.appliedToNKL === 'object' && value.appliedToNKL !== null ? value.appliedToNKL.id : value?.appliedToNKL
  const appliedToNKL = typeof rawAppliedToNKL === 'string' || typeof rawAppliedToNKL === 'number' ? rawAppliedToNKL : fallbackNklId || null
  if (!keyword || !appliedToNKL) return null
  return {
    yearMonth: typeof value?.yearMonth === 'string' ? value.yearMonth : undefined,
    searchTerm: typeof value?.searchTerm === 'string' ? value.searchTerm : undefined,
    keyword,
    matchType,
    appliedToNKL,
  }
}

export async function POST(req: NextRequest) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: req.headers })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const clientId = Number(body?.clientId)
  const fallbackNklId = body?.nklId
  const keywords = Array.isArray(body?.selections)
    ? body.selections.map((selection: unknown) => normaliseKeyword(selection, fallbackNklId)).filter(Boolean) as KeywordSelection[]
    : []

  if (!Number.isInteger(clientId) || keywords.length === 0) {
    return NextResponse.json({ error: 'clientId and selections with target NKLs are required' }, { status: 400 })
  }

  const byNkl = new Map<string, { id: number | string; keywords: KeywordSelection[] }>()
  for (const keyword of keywords) {
    const nklId = keyword.appliedToNKL as number | string
    const nklKey = String(nklId)
    const group = byNkl.get(nklKey) || { id: nklId, keywords: [] }
    group.keywords.push(keyword)
    byNkl.set(nklKey, group)
  }

  const now = new Date().toISOString()
  let applied = 0
  let skipped = 0

  for (const { id: nklId, keywords: nklKeywords } of byNkl.values()) {
    const nkl = await payload.findByID({
      collection: 'negative-keyword-lists',
      id: nklId,
      depth: 0,
      overrideAccess: true,
    }) as any
    if (!nkl) return NextResponse.json({ error: `NKL ${nklId} not found` }, { status: 404 })

    const nklClientId = typeof nkl.client === 'object' ? Number(nkl.client?.id) : Number(nkl.client)
    if (nklClientId !== clientId) {
      return NextResponse.json({ error: `NKL ${nklId} does not belong to client` }, { status: 400 })
    }

    const currentKeywords = Array.isArray(nkl.keywords) ? nkl.keywords : []
    const existingSet = new Set(currentKeywords.map((kw: any) => `${String(kw.keyword || '').toLowerCase()}|${kw.matchType}`))
    const dedupIncoming = new Map<string, { keyword: string; matchType: MatchType }>()
    for (const keyword of nklKeywords) {
      dedupIncoming.set(`${keyword.keyword.toLowerCase()}|${keyword.matchType}`, keyword)
    }

    const newKeywords = Array.from(dedupIncoming.values())
      .filter((kw) => !existingSet.has(`${kw.keyword.toLowerCase()}|${kw.matchType}`))
      .map((kw) => ({
        keyword: kw.keyword,
        matchType: kw.matchType,
        flaggedForRemoval: false,
        negatedAt: now,
      }))

    if (newKeywords.length > 0) {
      await payload.update({
        collection: 'negative-keyword-lists',
        id: nklId,
        data: { keywords: [...currentKeywords, ...newKeywords] },
        overrideAccess: true,
      })
    }

    applied += newKeywords.length
    skipped += nklKeywords.length - newKeywords.length
  }

  const selectionDoc = await payload.find({
    collection: 'monthly-keyword-selections',
    where: { client: { equals: clientId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const doc = selectionDoc.docs[0] as any
  if (doc) {
    const appliedSelectionKeys = new Map(
      keywords
        .filter((keyword) => keyword.yearMonth && keyword.searchTerm)
        .map((keyword) => [`${keyword.yearMonth}|${String(keyword.searchTerm).toLowerCase()}`, keyword.appliedToNKL] as [string, number | string | null | undefined]),
    )
    const selections = (Array.isArray(doc.selections) ? doc.selections : []).map((selection: any) => {
      const selectionKey = `${String(selection.yearMonth)}|${String(selection.searchTerm || '').toLowerCase()}`
      const appliedToNKL = appliedSelectionKeys.get(selectionKey) || fallbackNklId
      if (!appliedToNKL) return selection
      return {
        ...selection,
        decision: 'approved',
        appliedToNKL,
        appliedAt: now,
      }
    })
    await payload.update({
      collection: 'monthly-keyword-selections',
      id: doc.id,
      data: { selections },
      overrideAccess: true,
    })
  }

  return NextResponse.json({
    success: true,
    applied,
    skipped,
  })
}
