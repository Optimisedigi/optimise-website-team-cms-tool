import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'

type MatchType = 'exact' | 'broad' | 'phrase'

const VALID_MATCH_TYPES = new Set(['exact', 'broad', 'phrase'])

function normaliseKeyword(value: any): { keyword: string; matchType: MatchType } | null {
  const keyword = typeof value?.negativeKeyword === 'string'
    ? value.negativeKeyword.trim()
    : typeof value?.keyword === 'string'
      ? value.keyword.trim()
      : ''
  const matchType = typeof value?.matchType === 'string' && VALID_MATCH_TYPES.has(value.matchType)
    ? value.matchType as MatchType
    : 'exact'
  if (!keyword) return null
  return { keyword, matchType }
}

export async function POST(req: NextRequest) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: req.headers })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const clientId = Number(body?.clientId)
  const nklId = body?.nklId
  const keywords = Array.isArray(body?.selections) ? body.selections.map(normaliseKeyword).filter(Boolean) as Array<{ keyword: string; matchType: MatchType }> : []

  if (!Number.isInteger(clientId) || !nklId || keywords.length === 0) {
    return NextResponse.json({ error: 'clientId, nklId, and selections are required' }, { status: 400 })
  }

  const nkl = await payload.findByID({
    collection: 'negative-keyword-lists',
    id: nklId,
    depth: 0,
    overrideAccess: true,
  }) as any
  if (!nkl) return NextResponse.json({ error: 'NKL not found' }, { status: 404 })

  const nklClientId = typeof nkl.client === 'object' ? Number(nkl.client?.id) : Number(nkl.client)
  if (nklClientId !== clientId) {
    return NextResponse.json({ error: 'NKL does not belong to client' }, { status: 400 })
  }

  const currentKeywords = Array.isArray(nkl.keywords) ? nkl.keywords : []
  const existingSet = new Set(currentKeywords.map((kw: any) => `${String(kw.keyword || '').toLowerCase()}|${kw.matchType}`))
  const dedupIncoming = new Map<string, { keyword: string; matchType: MatchType }>()
  for (const keyword of keywords) {
    dedupIncoming.set(`${keyword.keyword.toLowerCase()}|${keyword.matchType}`, keyword)
  }

  const now = new Date().toISOString()
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

  const selectionDoc = await payload.find({
    collection: 'monthly-keyword-selections',
    where: { client: { equals: clientId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const doc = selectionDoc.docs[0] as any
  if (doc) {
    const appliedKeys = new Set(Array.from(dedupIncoming.values()).map((kw) => `${kw.keyword.toLowerCase()}|${kw.matchType}`))
    const selections = (Array.isArray(doc.selections) ? doc.selections : []).map((selection: any) => {
      const key = `${String(selection.negativeKeyword || '').toLowerCase()}|${selection.matchType}`
      if (!appliedKeys.has(key)) return selection
      return {
        ...selection,
        decision: 'approved',
        appliedToNKL: typeof nkl.id === 'string' ? Number(nkl.id) || nkl.id : nkl.id,
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
    applied: newKeywords.length,
    skipped: keywords.length - newKeywords.length,
  })
}
