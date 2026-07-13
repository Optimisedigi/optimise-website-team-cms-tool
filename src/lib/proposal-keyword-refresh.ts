export type KeywordMetric = Record<string, unknown> & {
  keyword?: string | null
  position?: number | null
  opportunity?: string | null
  searchVolume?: number | null
}

export type KeywordSnapshotSummary = {
  totalKeywords: number
  top10: number
  avgPosition: number | null
  opportunities: number
  rankingDistribution: {
    top10: number
    top20: number
    top50: number
    notFound: number
  }
}

export function normaliseKeywordKey(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function extractCategoryKeywords(
  categories: Array<{ keywords?: string | null }> | null | undefined,
): string[] {
  const seen = new Set<string>()
  const keywords: string[] = []

  for (const category of categories ?? []) {
    for (const value of (category?.keywords ?? '').split('\n')) {
      const keyword = value.trim()
      const key = normaliseKeywordKey(keyword)
      if (!key || seen.has(key)) continue
      seen.add(key)
      keywords.push(keyword)
    }
  }

  return keywords
}

export function findNewCategoryKeywords(
  categoryKeywords: string[],
  existingMetrics: KeywordMetric[],
): string[] {
  const existing = new Set(existingMetrics.map((metric) => normaliseKeywordKey(metric.keyword)).filter(Boolean))
  return categoryKeywords.filter((keyword) => !existing.has(normaliseKeywordKey(keyword)))
}

export function normaliseKeywordMetric(metric: KeywordMetric): KeywordMetric {
  const source = metric as Record<string, unknown>
  return {
    ...metric,
    searchVolume: (source.searchVolume ?? source.search_volume ?? source.volume ?? source.monthlySearches ?? source.monthly_searches ?? null) as number | null,
  }
}

export function mergeNewKeywordMetrics(
  existingMetrics: KeywordMetric[],
  returnedMetrics: KeywordMetric[],
): KeywordMetric[] {
  const merged = [...existingMetrics]
  const seen = new Set(existingMetrics.map((metric) => normaliseKeywordKey(metric.keyword)).filter(Boolean))

  for (const rawMetric of returnedMetrics) {
    const metric = normaliseKeywordMetric(rawMetric)
    const key = normaliseKeywordKey(metric.keyword)
    if (!key || seen.has(key)) continue
    seen.add(key)
    merged.push(metric)
  }

  return merged
}

function rankingPosition(metric: KeywordMetric): number | null {
  const value = typeof metric.position === 'number' ? metric.position : Number(metric.position)
  return Number.isFinite(value) && value > 0 ? value : null
}

export function summariseKeywordMetrics(metrics: KeywordMetric[]): KeywordSnapshotSummary {
  const positions = metrics.map(rankingPosition).filter((position): position is number => position != null)
  const top10 = positions.filter((position) => position <= 10).length
  const top20 = positions.filter((position) => position <= 20).length
  const top50 = positions.filter((position) => position <= 50).length
  const avgPosition = positions.length > 0
    ? Math.round((positions.reduce((sum, position) => sum + position, 0) / positions.length) * 10) / 10
    : null
  const opportunities = metrics.filter((metric) =>
    metric.opportunity === 'high' || metric.opportunity === 'medium',
  ).length

  return {
    totalKeywords: metrics.length,
    top10,
    avgPosition,
    opportunities,
    rankingDistribution: {
      top10,
      top20,
      top50,
      notFound: metrics.length - positions.length,
    },
  }
}
