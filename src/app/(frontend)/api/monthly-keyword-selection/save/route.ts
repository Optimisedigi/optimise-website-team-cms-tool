import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { userHasFeature } from '@/lib/access'
import type { MonthlyKeywordSelectionRow } from '@/lib/monthly-keyword-terms-warmer'

const VALID_MATCH_TYPES = new Set(['broad', 'phrase', 'exact'])
const VALID_DECISIONS = new Set(['pending', 'approved', 'skipped', 'watch', 'needs_review'])
const VALID_WATCH_HORIZONS = new Set([1, 2, 3, 6])
const DEFAULT_WATCH_HORIZON = 3

function addMonthsIso(from: Date, months: number): string {
  const next = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, from.getUTCDate()))
  return next.toISOString()
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
  const existingDoc = existingResult.docs[0] as any
  const existingSelections = Array.isArray(existingDoc?.selections) ? existingDoc.selections : []
  const byTerm = new Map<string, any>()

  const rowKey = (yearMonth: string, searchTerm: string, rowIndex: number): string =>
    `${yearMonth}|${String(searchTerm).toLowerCase()}|${rowIndex}`

  for (const selection of existingSelections) {
    byTerm.set(rowKey(selection.yearMonth, selection.searchTerm, Number(selection.rowIndex ?? 0)), selection)
  }
  const now = new Date()
  for (const selection of incoming) {
    const key = rowKey(selection.yearMonth, selection.searchTerm, Number(selection.rowIndex ?? 0))
    const prev = byTerm.get(key) || {}
    const merged: any = { ...prev, ...selection }
    // Auto-track who set the decision so the original handler can be notified
    // when a needs-review term is later dismissed as feedback. Stamped from the
    // authenticated session only — never trusted from the request body.
    if (merged.decision !== 'pending' && (prev.decision !== merged.decision || !prev.decidedByUserId)) {
      merged.decidedByUserId = String(user.id)
      merged.decidedBy = (user as { name?: string; email?: string }).name || (user as { email?: string }).email || null
    }
    if (merged.decision === 'watch') {
      const horizon = VALID_WATCH_HORIZONS.has(Number(merged.watchHorizonMonths)) ? Number(merged.watchHorizonMonths) : DEFAULT_WATCH_HORIZON
      merged.watchHorizonMonths = horizon
      const horizonChanged = Number(prev.watchHorizonMonths) !== horizon
      merged.watchUntil = prev.decision === 'watch' && prev.watchUntil && !horizonChanged ? prev.watchUntil : addMonthsIso(now, horizon)
    } else {
      merged.watchHorizonMonths = null
      merged.watchUntil = null
    }
    byTerm.set(key, merged)
  }

  for (const d of deletions) {
    byTerm.delete(rowKey(d.yearMonth, d.searchTerm, d.rowIndex))
  }

  const selections = Array.from(byTerm.values()).sort((a, b) =>
    String(a.yearMonth).localeCompare(String(b.yearMonth))
    || String(a.searchTerm).localeCompare(String(b.searchTerm))
    || Number(a.rowIndex ?? 0) - Number(b.rowIndex ?? 0),
  )

  // Guard 1: never shrink a populated array to empty. An autosave should never
  // legitimately clear every row — if the merge produced nothing while the
  // stored doc still has rows, treat it as a corrupt/partial read and abort
  // rather than overwriting good data. (A genuine wipe would still happen one
  // explicit deletion at a time, never as a single empty write.)
  if (selections.length === 0 && existingSelections.length > 0) {
    payload.logger?.warn?.(
      `[monthly-keyword-save] refused to clear ${existingSelections.length} selection(s) for client ${clientId}; aborting empty write.`,
    )
    return NextResponse.json(
      { error: 'Refused to clear all selections — no rows to save against existing data.' },
      { status: 409 },
    )
  }

  const doc = existingDoc
    ? await payload.update({
        collection: 'monthly-keyword-selections',
        id: existingDoc.id,
        data: { selections },
        overrideAccess: true,
      })
    : await payload.create({
        collection: 'monthly-keyword-selections',
        data: { client: clientId, status: 'active', selections },
        overrideAccess: true,
      })

  return NextResponse.json({ success: true, selectionCount: selections.length, docId: doc.id })
}
