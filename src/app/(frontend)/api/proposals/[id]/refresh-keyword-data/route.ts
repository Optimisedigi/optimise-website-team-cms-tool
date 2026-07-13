import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import {
  extractCategoryKeywords,
  findNewCategoryKeywords,
  mergeNewKeywordMetrics,
  normaliseKeywordKey,
  summariseKeywordMetrics,
  type KeywordMetric,
} from '@/lib/proposal-keyword-refresh'

export const maxDuration = 240

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY

function relationshipId(value: unknown): number | string | null {
  if (typeof value === 'number' || typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    return typeof id === 'number' || typeof id === 'string' ? id : null
  }
  return null
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: req.headers })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY) {
    return NextResponse.json(
      { error: 'Server misconfigured: missing GROWTH_TOOLS_URL or INTERNAL_API_KEY' },
      { status: 500 },
    )
  }

  const proposal: any = await payload.findByID({
    collection: 'client-proposals',
    id,
    overrideAccess: true,
  })
  const snapshotId = relationshipId(proposal.keywordSnapshot)
  if (snapshotId == null) {
    return NextResponse.json(
      { error: 'Run the proposal audit once before refreshing newly added keywords.' },
      { status: 422 },
    )
  }

  const categoryKeywords = extractCategoryKeywords(proposal.keywordCategories)
  if (categoryKeywords.length === 0) {
    return NextResponse.json(
      { error: 'No saved keyword-category keywords found.' },
      { status: 400 },
    )
  }

  const snapshot: any = await payload.findByID({
    collection: 'keyword-snapshots',
    id: snapshotId as any,
    overrideAccess: true,
  })
  const existingMetrics: KeywordMetric[] = Array.isArray(snapshot.keywords)
    ? snapshot.keywords
    : []
  const newKeywords = findNewCategoryKeywords(categoryKeywords, existingMetrics)
  if (newKeywords.length === 0) {
    return NextResponse.json({ ok: true, requested: 0, added: 0, totalKeywords: existingMetrics.length })
  }

  const response = await fetch(`${GROWTH_TOOLS_URL}/api/track-keywords`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': INTERNAL_API_KEY,
    },
    body: JSON.stringify({
      website: proposal.websiteUrl,
      keywords: newKeywords.join('\n'),
      location: proposal.targetLocation || undefined,
      language: proposal.searchLanguage || undefined,
    }),
    signal: AbortSignal.timeout(210_000),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    return NextResponse.json(
      { error: `Keyword refresh failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ''}` },
      { status: 502 },
    )
  }

  const providerData: any = await response.json()
  const providerMetricsRaw = providerData?.keywords ?? providerData?.results ?? providerData
  const requestedKeys = new Set(newKeywords.map(normaliseKeywordKey))
  const returnedMetrics: KeywordMetric[] = Array.isArray(providerMetricsRaw)
    ? providerMetricsRaw.filter((metric: KeywordMetric) => requestedKeys.has(normaliseKeywordKey(metric?.keyword)))
    : []
  const mergedMetrics = mergeNewKeywordMetrics(existingMetrics, returnedMetrics)
  const summary = summariseKeywordMetrics(mergedMetrics)

  await payload.update({
    collection: 'keyword-snapshots',
    id: snapshotId as any,
    data: {
      keywords: mergedMetrics,
      ...summary,
    } as any,
    overrideAccess: true,
  })

  const added = mergedMetrics.length - existingMetrics.length
  return NextResponse.json({
    ok: true,
    requested: newKeywords.length,
    added,
    missing: newKeywords.length - added,
    totalKeywords: summary.totalKeywords,
  })
}
