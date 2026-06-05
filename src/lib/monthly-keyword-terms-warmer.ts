import type { Payload } from 'payload'

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL
const GROWTH_TOOLS_API_KEY = process.env.INTERNAL_API_KEY
const DEFAULT_MONTHS_BACK = 36

export type MonthlyKeywordTerm = {
  term: string
  impressions: number
  clicks: number
  cost: number
  conversions: number
  status?: string
}

export type MonthlyKeywordTermsCacheRow = {
  id: number | string
  client: number | { id?: number }
  yearMonth: string
  terms: MonthlyKeywordTerm[]
  reviewComplete?: boolean | number
  reviewCompletedAt?: string | null
  reviewCompletedBy?: number | string | { id?: number | string } | null
  fetchedAt: string
}

export type MonthlyKeywordSelectionRow = {
  id?: string | number
  yearMonth: string
  searchTerm: string
  negativeKeyword: string
  matchType: 'broad' | 'phrase' | 'exact'
  decision: 'pending' | 'approved' | 'skipped'
  appliedToNKL?: number | string | { id?: number | string } | null
  appliedAt?: string | null
}

export type WarmMonthlyKeywordTermsResult = {
  misses: number
  durationMs: number
  error?: string
  months: Array<{
    month: string
    terms: MonthlyKeywordTerm[]
    reviewComplete: boolean
    reviewCompletedAt?: string | null
    reviewCompletedBy?: number | string | { id?: number | string } | null
    fetchedAt?: string
  }>
  selections: MonthlyKeywordSelectionRow[]
  missingMonths: string[]
}

function formatYearMonth(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export function buildCompleteMonthList(monthsBackInput = DEFAULT_MONTHS_BACK, today = new Date()): string[] {
  const monthsBack = Math.min(36, Math.max(1, Number(monthsBackInput) || DEFAULT_MONTHS_BACK))
  const months: string[] = []
  for (let i = monthsBack; i >= 1; i--) {
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1))
    months.push(formatYearMonth(date))
  }
  return months
}

function trimMonthsToEarliestCached(months: string[], cache: Map<string, MonthlyKeywordTermsCacheRow>): string[] {
  const cachedMonths = Array.from(cache.keys()).sort()
  const earliestCached = cachedMonths[0]
  if (!earliestCached) return months
  return months.filter((month) => month >= earliestCached)
}

function normaliseTerms(value: unknown): MonthlyKeywordTerm[] {
  const parsedValue = typeof value === 'string'
    ? (() => {
        try {
          return JSON.parse(value) as unknown
        } catch {
          return []
        }
      })()
    : value
  if (!Array.isArray(parsedValue)) return []
  return parsedValue
    .map((term) => ({
      term: typeof term?.term === 'string' ? term.term : '',
      impressions: Number(term?.impressions) || 0,
      clicks: Number(term?.clicks) || 0,
      cost: Number(term?.cost) || 0,
      conversions: Number(term?.conversions) || 0,
      status: typeof term?.status === 'string' ? term.status : undefined,
    }))
    .filter((term) => term.term.trim().length > 0)
}

async function fetchSelections(payload: Payload, clientId: number): Promise<MonthlyKeywordSelectionRow[]> {
  const result = await payload.find({
    collection: 'monthly-keyword-selections',
    where: { client: { equals: clientId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const doc = result.docs[0] as { selections?: MonthlyKeywordSelectionRow[] } | undefined
  return Array.isArray(doc?.selections) ? doc.selections : []
}

export async function warmMonthlyKeywordTermsForClient(
  payload: Payload,
  clientId: number,
  customerId: string,
  slug: string,
  monthsBackInput = DEFAULT_MONTHS_BACK,
): Promise<WarmMonthlyKeywordTermsResult> {
  const startedAt = Date.now()
  const lookbackMonths = buildCompleteMonthList(monthsBackInput)

  const cacheResult = await payload.find({
    collection: 'monthly-keyword-terms-cache',
    where: { client: { equals: clientId } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })

  const cache = new Map<string, MonthlyKeywordTermsCacheRow>()
  for (const row of cacheResult.docs as unknown as MonthlyKeywordTermsCacheRow[]) {
    if (lookbackMonths.includes(row.yearMonth)) cache.set(row.yearMonth, row)
  }

  const completeMonths = trimMonthsToEarliestCached(lookbackMonths, cache)
  const missingMonths = completeMonths.filter((month) => !cache.has(month))
  let misses = 0
  let error: string | undefined

  if (missingMonths.length > 0) {
    if (!GROWTH_TOOLS_URL || !GROWTH_TOOLS_API_KEY || !customerId) {
      error = 'missing upstream config'
    } else {
      try {
        const res = await fetch(
          `${GROWTH_TOOLS_URL}/api/google-ads/dashboard/${encodeURIComponent(slug)}/monthly-search-terms`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-internal-key': GROWTH_TOOLS_API_KEY,
            },
            body: JSON.stringify({
              customerId: customerId.replace(/-/g, ''),
              monthsBack: completeMonths.length,
              onlyMonths: missingMonths,
            }),
            cache: 'no-store',
          },
        )

        if (!res.ok) {
          const text = await res.text().catch(() => '')
          payload.logger?.warn?.(`[monthly-keyword-terms] Growth Tools ${res.status}: ${text}`)
          error = `Growth Tools ${res.status}`
        } else {
          const data = await res.json()
          if (data?.success === false) {
            error = typeof data.error === 'string' ? data.error : 'Growth Tools returned an unsuccessful monthly search terms response'
          }
          const upstreamMonths = Array.isArray(data?.months) ? data.months : []
          if (!error && upstreamMonths.length === 0) {
            error = 'Growth Tools returned no monthly search term months'
          }
          const fetchedAt = new Date().toISOString()
          const upstreamByMonth = new Map<string, unknown>(
            upstreamMonths
              .filter((entry: any) => missingMonths.includes(entry?.month))
              .map((entry: any) => [entry.month, entry] as [string, unknown]),
          )
          for (const [month, upstream] of upstreamByMonth) {
            const terms = normaliseTerms((upstream as any)?.terms)
            const created = await payload.create({
              collection: 'monthly-keyword-terms-cache',
              data: {
                client: clientId,
                yearMonth: month,
                terms: JSON.stringify(terms),
                reviewComplete: false,
                fetchedAt,
              },
              overrideAccess: true,
            })
            cache.set(month, created as unknown as MonthlyKeywordTermsCacheRow)
            misses += 1
          }
        }
      } catch (err) {
        payload.logger?.warn?.(`[monthly-keyword-terms] warmer failed: ${err}`)
        error = err instanceof Error ? err.message : 'monthly keyword warmer failed'
      }
    }
  }

  const remainingMissingMonths = completeMonths.filter((month) => !cache.has(month))
  const months = completeMonths
    .map((month) => {
      const row = cache.get(month)
      if (!row) return null
      return {
        month,
        terms: normaliseTerms(row.terms),
        reviewComplete: row.reviewComplete === true || row.reviewComplete === 1,
        reviewCompletedAt: row.reviewCompletedAt || null,
        reviewCompletedBy: row.reviewCompletedBy || null,
        fetchedAt: row.fetchedAt,
      }
    })
    .filter((month): month is NonNullable<typeof month> => month !== null)

  return {
    misses,
    durationMs: Date.now() - startedAt,
    error,
    months,
    selections: await fetchSelections(payload, clientId),
    missingMonths: remainingMissingMonths,
  }
}
