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
  rowIndex?: number
  negativeKeyword: string
  matchType: 'broad' | 'phrase' | 'exact'
  decision: 'pending' | 'approved' | 'skipped' | 'watch' | 'needs_review'
  watchHorizonMonths?: number | null
  watchUntil?: string | null
  appliedToNKL?: number | string | { id?: number | string } | null
  appliedAt?: string | null
  appliedBy?: string | null
  appliedByUserId?: string | null
  decidedBy?: string | null
  decidedByUserId?: string | null
  reviewDismissedAt?: string | null
  reviewDismissedBy?: string | null
  reviewComment?: string | null
  reviewCommentBy?: string | null
  reviewCommentAt?: string | null
  reviewCommentTaggedUserIds?: string | null
}

export type WarmMonthlyKeywordTermsResult = {
  misses: number
  durationMs: number
  error?: string
  diagnostics?: { customerId?: string; startDate?: string; endDate?: string; totalRows?: number; matchedRows?: number }
  suppressionNklIdsConfigured?: boolean | number
  suppressionNklIds?: string | null
  months: Array<{
    month: string
    terms: MonthlyKeywordTerm[]
    reviewComplete: boolean
    diagnostics?: { rawRows?: number; parsedTerms?: number; qualifiedTerms?: number }
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

function isRowComplete(row: MonthlyKeywordTermsCacheRow): boolean {
  return row.reviewComplete === true || row.reviewComplete === 1
}

// Duplicate cache rows can exist for the same client+yearMonth. When merging
// them, completion must win: if ANY duplicate is complete the merged row is
// complete, and we prefer the completion metadata from a completed row so an
// incomplete duplicate never overwrites a completed one.
function mergeCacheRows(
  existing: MonthlyKeywordTermsCacheRow | undefined,
  incoming: MonthlyKeywordTermsCacheRow,
): MonthlyKeywordTermsCacheRow {
  if (!existing) return incoming
  const existingComplete = isRowComplete(existing)
  const incomingComplete = isRowComplete(incoming)
  // Base row carries the term payload; prefer the incoming row's data but keep
  // completion state from whichever row is complete.
  const completeSource = incomingComplete ? incoming : existingComplete ? existing : incoming
  return {
    ...incoming,
    reviewComplete: existingComplete || incomingComplete,
    reviewCompletedAt: completeSource.reviewCompletedAt ?? null,
    reviewCompletedBy: completeSource.reviewCompletedBy ?? null,
  }
}

function trimMonthsToEarliestCached(months: string[], cache: Map<string, MonthlyKeywordTermsCacheRow>): string[] {
  const cachedMonths = Array.from(cache.keys()).sort()
  const earliestCached = cachedMonths[0]
  if (!earliestCached) return months
  return months.filter((month) => month >= earliestCached)
}

function parseCachedTerms(value: unknown): {
  terms: MonthlyKeywordTerm[]
  diagnostics?: { rawRows?: number; parsedTerms?: number; qualifiedTerms?: number }
  pullDiagnostics?: WarmMonthlyKeywordTermsResult['diagnostics']
} {
  const parsedValue = typeof value === 'string'
    ? (() => {
        try {
          return JSON.parse(value) as unknown
        } catch {
          return []
        }
      })()
    : value
  const rawTerms = Array.isArray(parsedValue)
    ? parsedValue
    : Array.isArray((parsedValue as { terms?: unknown })?.terms)
      ? (parsedValue as { terms: unknown[] }).terms
      : []
  const cacheObject = !Array.isArray(parsedValue) && parsedValue && typeof parsedValue === 'object' ? parsedValue as {
    diagnostics?: { rawRows?: unknown; parsedTerms?: unknown; qualifiedTerms?: unknown }
    pullDiagnostics?: { customerId?: unknown; startDate?: unknown; endDate?: unknown; totalRows?: unknown; matchedRows?: unknown }
  } : undefined
  const diagnosticsValue = cacheObject?.diagnostics
  const diagnostics = diagnosticsValue
    ? {
        rawRows: typeof diagnosticsValue.rawRows === 'number' ? diagnosticsValue.rawRows : undefined,
        parsedTerms: typeof diagnosticsValue.parsedTerms === 'number' ? diagnosticsValue.parsedTerms : undefined,
        qualifiedTerms: typeof diagnosticsValue.qualifiedTerms === 'number' ? diagnosticsValue.qualifiedTerms : undefined,
      }
    : undefined
  const pullDiagnosticsValue = cacheObject?.pullDiagnostics
  const pullDiagnostics = pullDiagnosticsValue
    ? {
        customerId: typeof pullDiagnosticsValue.customerId === 'string' ? pullDiagnosticsValue.customerId : undefined,
        startDate: typeof pullDiagnosticsValue.startDate === 'string' ? pullDiagnosticsValue.startDate : undefined,
        endDate: typeof pullDiagnosticsValue.endDate === 'string' ? pullDiagnosticsValue.endDate : undefined,
        totalRows: typeof pullDiagnosticsValue.totalRows === 'number' ? pullDiagnosticsValue.totalRows : undefined,
        matchedRows: typeof pullDiagnosticsValue.matchedRows === 'number' ? pullDiagnosticsValue.matchedRows : undefined,
      }
    : undefined
  const terms = rawTerms
    .map((term) => ({
      term: typeof term?.term === 'string' ? term.term : '',
      impressions: Number(term?.impressions) || 0,
      clicks: Number(term?.clicks) || 0,
      cost: Number(term?.cost) || 0,
      conversions: Number(term?.conversions) || 0,
      status: typeof term?.status === 'string' ? term.status : undefined,
    }))
    .filter((term) => term.term.trim().length > 0)
  return { terms, diagnostics, pullDiagnostics }
}

function normaliseTerms(value: unknown): MonthlyKeywordTerm[] {
  return parseCachedTerms(value).terms
}

async function fetchSelectionConfig(payload: Payload, clientId: number): Promise<{
  selections: MonthlyKeywordSelectionRow[]
  suppressionNklIdsConfigured: boolean | number
  suppressionNklIds: string | null
}> {
  const result = await payload.find({
    collection: 'monthly-keyword-selections',
    where: { client: { equals: clientId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const doc = result.docs[0] as { selections?: MonthlyKeywordSelectionRow[]; suppressionNklIdsConfigured?: boolean | number; suppressionNklIds?: string | null } | undefined
  return {
    selections: Array.isArray(doc?.selections) ? doc.selections : [],
    suppressionNklIdsConfigured: doc?.suppressionNklIdsConfigured ?? false,
    suppressionNklIds: typeof doc?.suppressionNklIds === 'string' ? doc.suppressionNklIds : null,
  }
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
    if (!lookbackMonths.includes(row.yearMonth)) continue
    const existing = cache.get(row.yearMonth)
    cache.set(row.yearMonth, mergeCacheRows(existing, row))
  }

  const completeMonths = trimMonthsToEarliestCached(lookbackMonths, cache)
  const missingMonths = completeMonths.filter((month) => !cache.has(month))
  let misses = 0
  let error: string | undefined
  let diagnostics: WarmMonthlyKeywordTermsResult['diagnostics']
  const diagnosticsByMonth = new Map<string, { rawRows?: number; parsedTerms?: number; qualifiedTerms?: number }>()

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
          diagnostics = data?.diagnostics && typeof data.diagnostics === 'object'
            ? {
                customerId: typeof data.diagnostics.customerId === 'string' ? data.diagnostics.customerId : undefined,
                startDate: typeof data.diagnostics.startDate === 'string' ? data.diagnostics.startDate : undefined,
                endDate: typeof data.diagnostics.endDate === 'string' ? data.diagnostics.endDate : undefined,
                totalRows: typeof data.diagnostics.totalRows === 'number' ? data.diagnostics.totalRows : undefined,
                matchedRows: typeof data.diagnostics.matchedRows === 'number' ? data.diagnostics.matchedRows : undefined,
              }
            : undefined
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
            const upstreamEntry = upstream as any
            const monthDiagnostics = {
              rawRows: typeof upstreamEntry?.rawRows === 'number' ? upstreamEntry.rawRows : undefined,
              parsedTerms: typeof upstreamEntry?.parsedTerms === 'number' ? upstreamEntry.parsedTerms : undefined,
              qualifiedTerms: typeof upstreamEntry?.qualifiedTerms === 'number' ? upstreamEntry.qualifiedTerms : undefined,
            }
            diagnosticsByMonth.set(month, monthDiagnostics)
            const terms = normaliseTerms(upstreamEntry?.terms)
            const created = await payload.create({
              collection: 'monthly-keyword-terms-cache',
              data: {
                client: clientId,
                yearMonth: month,
                terms: JSON.stringify({ terms, diagnostics: monthDiagnostics, pullDiagnostics: diagnostics }),
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
  if (!diagnostics) {
    for (const row of cache.values()) {
      const cachedDiagnostics = parseCachedTerms(row.terms).pullDiagnostics
      if (cachedDiagnostics) {
        diagnostics = cachedDiagnostics
        break
      }
    }
  }
  const cachedMonths = completeMonths
    .map((month) => {
      const row = cache.get(month)
      if (!row) return null
      const cachedTerms = parseCachedTerms(row.terms)
      return {
        month,
        terms: cachedTerms.terms,
        reviewComplete: row.reviewComplete === true || row.reviewComplete === 1,
        diagnostics: diagnosticsByMonth.get(month) || cachedTerms.diagnostics,
        reviewCompletedAt: row.reviewCompletedAt || null,
        reviewCompletedBy: row.reviewCompletedBy || null,
        fetchedAt: row.fetchedAt,
      }
    })
    .filter((month): month is NonNullable<typeof month> => month !== null)
  const firstMonthWithTerms = cachedMonths.findIndex((month) => month.terms.length > 0)
  const months = firstMonthWithTerms >= 0 ? cachedMonths.slice(firstMonthWithTerms) : cachedMonths

  const selectionConfig = await fetchSelectionConfig(payload, clientId)

  return {
    misses,
    durationMs: Date.now() - startedAt,
    error,
    diagnostics,
    months,
    selections: selectionConfig.selections,
    suppressionNklIdsConfigured: selectionConfig.suppressionNklIdsConfigured,
    suppressionNklIds: selectionConfig.suppressionNklIds,
    missingMonths: remainingMissingMonths,
  }
}
