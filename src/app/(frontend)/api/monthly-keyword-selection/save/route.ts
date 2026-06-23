import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { userHasFeature } from '@/lib/access'
import type { MonthlyKeywordSelectionRow } from '@/lib/monthly-keyword-terms-warmer'
import { countSelectionRows, deleteSelectionRows, normaliseSearchTermKey, upsertSelectionRows } from '@/lib/monthly-keyword-selection-rows'

const VALID_MATCH_TYPES = new Set(['broad', 'phrase', 'exact'])
const VALID_DECISIONS = new Set(['pending', 'approved', 'skipped', 'watch', 'needs_review'])
const VALID_WATCH_HORIZONS = new Set([1, 2, 3, 6])
const DEFAULT_WATCH_HORIZON = 3

type CachedTermsRow = { yearMonth?: string; terms?: unknown }

function parseCachedTerms(value: unknown): Array<{ term: string }> {
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
  return rawTerms
    .map((term) => {
      const value = term && typeof term === 'object' && 'term' in term ? (term as { term?: unknown }).term : ''
      return { term: typeof value === 'string' ? value : '' }
    })
    .filter((term) => term.term.trim().length > 0)
}

async function expandClientWideReviewRows(payload: any, clientId: number, rows: MonthlyKeywordSelectionRow[]): Promise<MonthlyKeywordSelectionRow[]> {
  const globalRows = rows.filter((row) => row.rowIndex === 0 && (row.decision === 'skipped' || row.decision === 'watch'))
  if (globalRows.length === 0) return rows

  const cacheResult = await payload.find({
    collection: 'monthly-keyword-terms-cache',
    where: { client: { equals: clientId } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  }) as { docs?: CachedTermsRow[] }

  const expanded = new Map<string, MonthlyKeywordSelectionRow>()
  for (const row of rows) {
    expanded.set(`${row.yearMonth}|${normaliseSearchTermKey(row.searchTerm)}|${Number(row.rowIndex ?? 0)}`, row)
  }

  for (const source of globalRows) {
    const sourceTermKey = normaliseSearchTermKey(source.searchTerm)
    for (const cacheRow of cacheResult.docs ?? []) {
      const yearMonth = typeof cacheRow.yearMonth === 'string' ? cacheRow.yearMonth : ''
      if (!/^\d{4}-\d{2}$/.test(yearMonth)) continue
      const matchingTerm = parseCachedTerms(cacheRow.terms).find((term) => normaliseSearchTermKey(term.term) === sourceTermKey)
      if (!matchingTerm) continue
      expanded.set(`${yearMonth}|${sourceTermKey}|0`, {
        ...source,
        yearMonth,
        searchTerm: matchingTerm.term,
        rowIndex: 0,
      })
    }
  }

  return Array.from(expanded.values())
}

function normaliseSelection(value: any): MonthlyKeywordSelectionRow | null {
  const yearMonth = typeof value?.yearMonth === 'string' ? value.yearMonth.trim() : ''
  const searchTerm = typeof value?.searchTerm === 'string' ? value.searchTerm.trim() : ''
  const negativeKeyword = typeof value?.negativeKeyword === 'string' ? value.negativeKeyword.trim() : searchTerm
  const rowIndex = Number.isFinite(Number(value?.rowIndex)) ? Math.max(0, Math.trunc(Number(value.rowIndex))) : 0
  const matchType = typeof value?.matchType === 'string' && VALID_MATCH_TYPES.has(value.matchType) ? value.matchType : 'exact'
  const decision = typeof value?.decision === 'string' && VALID_DECISIONS.has(value.decision) ? value.decision : 'pending'
  const rawAppliedToNKL = typeof value?.appliedToNKL === 'object' && value.appliedToNKL !== null ? value.appliedToNKL.id : value?.appliedToNKL
  const appliedToNKL = typeof rawAppliedToNKL === 'string' || typeof rawAppliedToNKL === 'number' ? rawAppliedToNKL : null
  const rawHorizon = Number(value?.watchHorizonMonths)
  const watchHorizonMonths = VALID_WATCH_HORIZONS.has(rawHorizon) ? rawHorizon : DEFAULT_WATCH_HORIZON

  if (!/^\d{4}-\d{2}$/.test(yearMonth) || !searchTerm || !negativeKeyword) return null
  const base: MonthlyKeywordSelectionRow = { yearMonth, searchTerm, rowIndex, negativeKeyword, matchType, decision, appliedToNKL, watchHorizonMonths } as MonthlyKeywordSelectionRow
  // Comment fields are authored via the dedicated /comment route. Only forward
  // them when the client actually sent strings so a routine autosave can never
  // wipe a comment that another reviewer saved after this client last loaded.
  if (typeof value?.reviewComment === 'string') base.reviewComment = value.reviewComment
  if (typeof value?.reviewCommentBy === 'string') base.reviewCommentBy = value.reviewCommentBy
  if (typeof value?.reviewCommentAt === 'string') base.reviewCommentAt = value.reviewCommentAt
  if (typeof value?.reviewCommentTaggedUserIds === 'string') base.reviewCommentTaggedUserIds = value.reviewCommentTaggedUserIds
  return base
}

export async function POST(req: NextRequest) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: req.headers })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!userHasFeature(user, 'negative-keyword-lists')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const clientId = Number(body?.clientId)
  if (!Number.isInteger(clientId)) {
    return NextResponse.json({ error: 'Invalid clientId' }, { status: 400 })
  }

  const incoming = Array.isArray(body?.selections) ? body.selections.map(normaliseSelection).filter(Boolean) as MonthlyKeywordSelectionRow[] : []
  // Explicit sub-row deletions: { yearMonth, searchTerm, rowIndex }. These prune
  // a removed additional negative even though it is absent from `selections`.
  const deletions = Array.isArray(body?.deletions)
    ? (body.deletions as Array<{ yearMonth?: unknown; searchTerm?: unknown; rowIndex?: unknown }>)
        .map((d) => ({
          yearMonth: typeof d?.yearMonth === 'string' ? d.yearMonth.trim() : '',
          searchTerm: typeof d?.searchTerm === 'string' ? d.searchTerm.trim() : '',
          rowIndex: Number.isFinite(Number(d?.rowIndex)) ? Math.trunc(Number(d.rowIndex)) : 0,
        }))
        .filter((d) => d.yearMonth && d.searchTerm)
    : []

  // Guard 2: a blank autosave (no rows to upsert and nothing to delete) must
  // never rewrite the stored array. There is nothing to persist, so return
  // early before touching the doc — this stops an empty request from being
  // able to clear existing selections.
  if (incoming.length === 0 && deletions.length === 0) {
    return NextResponse.json({ success: true, selectionCount: null, skipped: 'empty-input' })
  }

  const existingResult = await payload.find({
    collection: 'monthly-keyword-selections',
    where: { client: { equals: clientId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const existingDoc = existingResult.docs[0] as { id: string | number } | undefined
  const doc = existingDoc || (await payload.create({
    collection: 'monthly-keyword-selections',
    data: { client: clientId, status: 'active' },
    overrideAccess: true,
  }) as { id: string | number })

  const rowsToSave = incoming.map((selection) => {
    if (selection.decision === 'watch') {
      const horizon = VALID_WATCH_HORIZONS.has(Number(selection.watchHorizonMonths)) ? Number(selection.watchHorizonMonths) : DEFAULT_WATCH_HORIZON
      return { ...selection, watchHorizonMonths: horizon }
    }
    return { ...selection, watchHorizonMonths: null, watchUntil: null }
  })

  const expandedRowsToSave = await expandClientWideReviewRows(payload, clientId, rowsToSave)

  await upsertSelectionRows(payload, clientId, expandedRowsToSave, user)
  await deleteSelectionRows(payload, clientId, deletions)
  const selectionCount = await countSelectionRows(payload, clientId)

  return NextResponse.json({ success: true, selectionCount, docId: doc.id })
}
