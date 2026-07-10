export type ManualCompetitorRow = Record<string, any> & {
  name?: string | null
  websiteUrl?: string | null
  serpAveragePosition?: number | string | null
  serpKeywordsFound?: number | string | null
}

export type ManualCompetitorBuckets = {
  needsFetch: Array<{ index: number; competitor: ManualCompetitorRow; websiteUrl: string }>
  alreadyFilled: Array<{ index: number; competitor: ManualCompetitorRow }>
  skippedNoDomain: Array<{ index: number; competitor: ManualCompetitorRow }>
}

export type TrackedKeywordSerpSummary = {
  averagePosition: number | null
  keywordsFound: number | null
  keywordPositions: Array<{ keyword: string; position: number }>
}

function hasMetric(value: unknown): boolean {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
}

export function normaliseManualCompetitorDomain(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
    return url.hostname.replace(/^www\./i, '')
  } catch {
    return trimmed.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/[/?#].*$/, '')
  }
}

function usableCompetitorUrl(competitor: ManualCompetitorRow): string {
  const websiteUrl = typeof competitor.websiteUrl === 'string' ? competitor.websiteUrl.trim() : ''
  if (normaliseManualCompetitorDomain(websiteUrl)) return websiteUrl

  const name = typeof competitor.name === 'string' ? competitor.name.trim() : ''
  const normalisedName = normaliseManualCompetitorDomain(name)
  if (normalisedName.includes('.')) return name

  return ''
}

export function classifyManualCompetitors(competitors: ManualCompetitorRow[] | null | undefined): ManualCompetitorBuckets {
  const buckets: ManualCompetitorBuckets = {
    needsFetch: [],
    alreadyFilled: [],
    skippedNoDomain: [],
  }

  for (const [index, competitor] of (competitors ?? []).entries()) {
    const websiteUrl = usableCompetitorUrl(competitor)
    if (!websiteUrl) {
      buckets.skippedNoDomain.push({ index, competitor })
      continue
    }

    const hasAveragePosition = hasMetric(competitor.serpAveragePosition)
    const hasKeywordsFound = hasMetric(competitor.serpKeywordsFound)
    if (hasAveragePosition && hasKeywordsFound) {
      buckets.alreadyFilled.push({ index, competitor })
      continue
    }

    buckets.needsFetch.push({ index, competitor, websiteUrl })
  }

  return buckets
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

export function summarizeTrackedKeywordSerpMetrics(rawKeywords: unknown): TrackedKeywordSerpSummary {
  if (!Array.isArray(rawKeywords)) {
    return { averagePosition: null, keywordsFound: null, keywordPositions: [] }
  }

  const keywordPositions = rawKeywords.flatMap((row: any) => {
    const position = finiteNumber(row?.position)
    const keyword = typeof row?.keyword === 'string' ? row.keyword.trim() : ''
    return position !== null && keyword ? [{ keyword, position }] : []
  })

  const keywordsFound = keywordPositions.length
  const averagePosition =
    keywordsFound > 0
      ? Math.round((keywordPositions.reduce((sum, row) => sum + row.position, 0) / keywordsFound) * 10) / 10
      : null

  return { averagePosition, keywordsFound, keywordPositions }
}

export function buildProposalKeywords(proposal: Record<string, any>): string[] {
  const categoryKeywords = Array.isArray(proposal.keywordCategories)
    ? proposal.keywordCategories.flatMap((category: any) => splitKeywords(category?.keywords))
    : []

  const fallbackKeywords = splitKeywords(proposal.keywords)
  return (categoryKeywords.length > 0 ? categoryKeywords : fallbackKeywords).slice(0, 20)
}

function splitKeywords(raw: unknown): string[] {
  if (typeof raw !== 'string') return []
  return raw
    .split(/[\n,]+/)
    .map((keyword) => keyword.trim())
    .filter(Boolean)
}
