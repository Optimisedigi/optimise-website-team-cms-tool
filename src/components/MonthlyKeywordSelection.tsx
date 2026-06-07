'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { parseNegativeKeywordInput } from '../lib/parse-negative-keywords'

type MatchType = 'exact' | 'phrase' | 'broad'
type Decision = 'pending' | 'approved' | 'skipped' | 'watch' | 'needs_review'
type WatchHorizon = 1 | 2 | 3 | 6

const WATCH_HORIZONS: WatchHorizon[] = [1, 2, 3, 6]
const DEFAULT_WATCH_HORIZON: WatchHorizon = 3

type Term = { term: string; impressions: number; clicks: number; cost: number; conversions: number; status?: string }
type Month = { month: string; terms: Term[]; reviewComplete: boolean; reviewCompletedAt?: string | null; diagnostics?: { rawRows?: number; parsedTerms?: number; qualifiedTerms?: number } }
type Selection = { yearMonth: string; searchTerm: string; rowIndex?: number; negativeKeyword: string; matchType: MatchType; decision: Decision; watchHorizonMonths?: number | null; watchUntil?: string | null; appliedToNKL?: number | string | { id?: number | string } | null; appliedAt?: string | null; appliedBy?: string | null; appliedByUserId?: string | null; removedComment?: string | null; removedBy?: string | null; removedByUserId?: string | null; removedAt?: string | null; reviewComment?: string | null; reviewCommentBy?: string | null; reviewCommentAt?: string | null; reviewCommentTaggedUserIds?: string | null }
type Nkl = { id: number | string; name: string; isActive?: boolean; keywords?: Array<{ keyword: string; matchType: MatchType }> }
type Teammate = { id: string; label: string }

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  if (!year || !monthNumber) return month
  return new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year, monthNumber - 1, 1)))
}

function selectionKey(yearMonth: string, searchTerm: string, rowIndex = 0): string {
  return `${yearMonth}|${searchTerm.toLowerCase()}|${rowIndex}`
}

function inputFromSelection(selection: Selection | undefined, term: string): string {
  if (!selection) return term
  return selection.matchType === 'phrase' ? `'${selection.negativeKeyword}'` : selection.negativeKeyword
}

function matchTypeLabel(matchType: MatchType): string {
  if (matchType === 'phrase') return 'Phrase match'
  if (matchType === 'broad') return 'Broad match'
  return 'Exact match'
}

function addMonthsIso(from: Date, months: number): string {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, from.getUTCDate())).toISOString()
}

function isWatchDue(selection: Selection | undefined): boolean {
  if (!selection || selection.decision !== 'watch' || !selection.watchUntil) return false
  return new Date(selection.watchUntil).getTime() <= Date.now()
}

export function MonthlyKeywordSelection({ clientId, customerId, slug, isAdmin = false, teammates = [] }: { clientId: string; customerId: string; slug: string; isAdmin?: boolean; teammates?: Teammate[] }) {
  const [months, setMonths] = useState<Month[]>([])
  const [selections, setSelections] = useState<Record<string, Selection>>({})
  const [nkls, setNkls] = useState<Nkl[]>([])
  const [hiddenNklIds, setHiddenNklIds] = useState<Set<string>>(new Set())
  const [activeMonth, setActiveMonth] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'months' | 'review' | 'submitted' | 'removed'>('months')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [lastLoadSummary, setLastLoadSummary] = useState<{ misses?: number; missingMonths?: string[]; error?: string; diagnostics?: { customerId?: string; startDate?: string; endDate?: string; totalRows?: number; matchedRows?: number } } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const monthsScrollerRef = useRef<HTMLDivElement | null>(null)
  const hasAutoScrolledRef = useRef(false)
  const titleBarRef = useRef<HTMLDivElement | null>(null)
  const [titleBarHeight, setTitleBarHeight] = useState(62)

  const load = useCallback(async () => {
    if (!clientId || !customerId || !slug) return
    hasAutoScrolledRef.current = false
    setLoading(true)
    setMessage(null)
    try {
      const params = new URLSearchParams({ clientId, customerId, slug })
      const res = await fetch(`/api/monthly-keyword-selection?${params.toString()}`, { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to load monthly keyword selection')
      setMonths(Array.isArray(data.months) ? data.months : [])
      setLastLoadSummary({
        misses: typeof data.misses === 'number' ? data.misses : undefined,
        missingMonths: Array.isArray(data.missingMonths) ? data.missingMonths : undefined,
        error: typeof data.error === 'string' ? data.error : undefined,
        diagnostics: data.diagnostics && typeof data.diagnostics === 'object' ? data.diagnostics : undefined,
      })
      const nextSelections: Record<string, Selection> = {}
      for (const selection of Array.isArray(data.selections) ? data.selections : []) {
        const rowIndex = Number(selection.rowIndex ?? 0)
        nextSelections[selectionKey(selection.yearMonth, selection.searchTerm, rowIndex)] = { ...selection, rowIndex }
      }
      setSelections(nextSelections)
      if (data.error) setMessage(data.error)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [clientId, customerId, slug])

  const loadNkls = useCallback(async () => {
    if (!clientId) return
    try {
      const res = await fetch(`/api/negative-keyword-lists?limit=200&depth=0&where[client][equals]=${encodeURIComponent(clientId)}&where[isActive][equals]=true`, { credentials: 'include' })
      const data = await res.json()
      const docs = Array.isArray(data?.docs) ? data.docs : []
      setNkls(docs.filter((doc: Nkl) => doc.isActive !== false))
    } catch {
      setNkls([])
    }
  }, [clientId])

  useEffect(() => { void load(); void loadNkls() }, [load, loadNkls])

  const scrollToFirstIncompleteMonth = useCallback((nextMonths: Month[], behavior: ScrollBehavior = 'smooth') => {
    const scroller = monthsScrollerRef.current
    if (!scroller) return
    const targetIndex = nextMonths.findIndex((month) => !month.reviewComplete)
    if (targetIndex < 0) return
    const target = scroller.children.item(targetIndex)
    if (!(target instanceof HTMLElement)) return
    scroller.scrollTo({ left: target.offsetLeft - scroller.offsetLeft, behavior })
  }, [])

  const cmsExistingByKeyword = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const nkl of nkls) {
      for (const kw of Array.isArray(nkl.keywords) ? nkl.keywords : []) {
        if (!kw?.keyword || !kw?.matchType) continue
        const key = `${kw.keyword.toLowerCase()}|${kw.matchType}`
        map.set(key, [...(map.get(key) || []), nkl.name || 'Unnamed NKL'])
      }
    }
    return map
  }, [nkls])

  const visibleMonths = useMemo(() => {
    const previouslyReviewedTerms = new Set<string>()
    return months.map((month) => {
      const terms = month.terms.filter((term) => {
        const exactTermKey = term.term.trim().toLowerCase()
        if (previouslyReviewedTerms.has(exactTermKey)) return false
        return true
      })
      for (const term of month.terms) {
        const selection = selections[selectionKey(month.month, term.term)]
        const searchTermAlreadyExactNegative = cmsExistingByKeyword.has(`${term.term.trim().toLowerCase()}|exact`)
        // 'watch' terms intentionally stay visible across months so their
        // performance can keep being re-checked until the horizon passes.
        const suppresses = selection?.decision === 'pending' || selection?.decision === 'approved' || selection?.decision === 'skipped' || selection?.decision === 'needs_review'
        if (suppresses || searchTermAlreadyExactNegative) {
          previouslyReviewedTerms.add(term.term.trim().toLowerCase())
        }
      }
      return { ...month, terms }
    })
  }, [cmsExistingByKeyword, months, selections])

  useEffect(() => {
    if (loading || visibleMonths.length === 0 || hasAutoScrolledRef.current) return
    hasAutoScrolledRef.current = true
    window.requestAnimationFrame(() => scrollToFirstIncompleteMonth(visibleMonths, 'auto'))
  }, [loading, visibleMonths, scrollToFirstIncompleteMonth])

  // Measure the focused month's title bar so the column-labels row can pin
  // directly beneath it instead of relying on a fragile hardcoded offset.
  useEffect(() => {
    const node = titleBarRef.current
    if (!node) return
    const measure = () => setTitleBarHeight(node.getBoundingClientRect().height)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [activeMonth, activeTab])

  const saveSelections = useCallback(async (next: Record<string, Selection>, deletions?: Array<{ yearMonth: string; searchTerm: string; rowIndex: number }>) => {
    setSaving(true)
    try {
      const res = await fetch('/api/monthly-keyword-selection/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ clientId: Number(clientId), selections: Object.values(next), ...(deletions && deletions.length ? { deletions } : {}) }),
      })
      if (!res.ok) throw new Error('Auto-save failed')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Auto-save failed')
    } finally {
      setSaving(false)
    }
  }, [clientId])

  const queueSave = useCallback((next: Record<string, Selection>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { void saveSelections(next) }, 600)
  }, [saveSelections])

  // All row indexes (primary 0 plus any added sub-rows) currently held for a
  // given month + search term.
  const rowIndexesForTerm = (month: string, term: string): number[] => {
    const lower = term.toLowerCase()
    const indexes = Object.values(selections)
      .filter((s) => s.yearMonth === month && s.searchTerm.toLowerCase() === lower)
      .map((s) => Number(s.rowIndex ?? 0))
    return Array.from(new Set([0, ...indexes])).sort((a, b) => a - b)
  }

  const updateTerm = (month: string, term: string, input: string, appliedToNKL?: number | string | null, rowIndex = 0) => {
    const parsed = parseNegativeKeywordInput(input) || { keyword: term, matchType: 'exact' as MatchType }
    const key = selectionKey(month, term, rowIndex)
    const existing = selections[key]
    const nextAppliedToNKL = appliedToNKL === undefined ? existing?.appliedToNKL : appliedToNKL
    const next = {
      ...selections,
      [key]: {
        ...(existing || {}),
        yearMonth: month,
        searchTerm: term,
        rowIndex,
        negativeKeyword: parsed.keyword,
        matchType: parsed.matchType,
        decision: nextAppliedToNKL ? 'approved' as Decision : 'pending' as Decision,
        appliedToNKL: nextAppliedToNKL || null,
      },
    }
    setSelections(next)
    queueSave(next)
  }

  // The NKL target is a single choice shared across every sub-row of a search
  // term, so setting it fans the same NKL (or null) out to all rows.
  const setTargetListForTerm = (month: string, term: string, nklId: number | string | null) => {
    const next = { ...selections }
    for (const rowIndex of rowIndexesForTerm(month, term)) {
      const key = selectionKey(month, term, rowIndex)
      const existing = selections[key]
      const parsed = parseNegativeKeywordInput(inputFromSelection(existing, term)) || { keyword: term, matchType: 'exact' as MatchType }
      next[key] = {
        ...(existing || {}),
        yearMonth: month,
        searchTerm: term,
        rowIndex,
        negativeKeyword: parsed.keyword,
        matchType: parsed.matchType,
        decision: nklId ? 'approved' as Decision : 'pending' as Decision,
        appliedToNKL: nklId || null,
      }
    }
    setSelections(next)
    queueSave(next)
  }

  // Append an empty additional negative-keyword row beneath a search term. It
  // inherits the term's shared NKL target so the single-NKL rule is preserved.
  const addSubRow = (month: string, term: string) => {
    const indexes = rowIndexesForTerm(month, term)
    const nextIndex = Math.max(...indexes) + 1
    const primary = selections[selectionKey(month, term, 0)]
    const inheritedNkl = primary?.appliedToNKL || null
    const key = selectionKey(month, term, nextIndex)
    const next = {
      ...selections,
      [key]: {
        yearMonth: month,
        searchTerm: term,
        rowIndex: nextIndex,
        negativeKeyword: term,
        matchType: 'exact' as MatchType,
        decision: inheritedNkl ? 'approved' as Decision : 'pending' as Decision,
        appliedToNKL: inheritedNkl,
      },
    }
    setSelections(next)
    queueSave(next)
  }

  // Delete an additional sub-row (index > 0). The primary row (0) is never
  // removable. Deletion is sent explicitly so the merge-based save prunes it.
  const removeSubRow = (month: string, term: string, rowIndex: number) => {
    if (rowIndex <= 0) return
    const key = selectionKey(month, term, rowIndex)
    const next = { ...selections }
    delete next[key]
    setSelections(next)
    void saveSelections(next, [{ yearMonth: month, searchTerm: term, rowIndex }])
  }

  const markTermHandled = (month: string, term: string, decision: Extract<Decision, 'approved' | 'skipped' | 'needs_review'>) => {
    const key = selectionKey(month, term)
    const selection = selections[key]
    const parsed = parseNegativeKeywordInput(inputFromSelection(selection, term)) || { keyword: term, matchType: 'exact' as MatchType }
    const alreadySelected = selection?.decision === decision && !selection.appliedToNKL
    const next = {
      ...selections,
      [key]: {
        ...(selection || {}),
        yearMonth: month,
        searchTerm: term,
        rowIndex: 0,
        negativeKeyword: parsed.keyword,
        matchType: parsed.matchType,
        decision: alreadySelected ? 'pending' as Decision : decision,
        watchHorizonMonths: null,
        watchUntil: null,
        appliedToNKL: null,
      },
    }
    setSelections(next)
    queueSave(next)
  }

  // Toggle a term into/out of the "watch" state. Watched terms are never added
  // to an NKL and keep appearing across months until the horizon passes, at
  // which point the team re-checks conversion performance.
  const setWatch = (month: string, term: string, horizon: WatchHorizon | null) => {
    const key = selectionKey(month, term)
    const selection = selections[key]
    const parsed = parseNegativeKeywordInput(inputFromSelection(selection, term)) || { keyword: term, matchType: 'exact' as MatchType }
    const clearing = horizon === null
    const next = {
      ...selections,
      [key]: {
        ...(selection || {}),
        yearMonth: month,
        searchTerm: term,
        rowIndex: 0,
        negativeKeyword: parsed.keyword,
        matchType: parsed.matchType,
        decision: clearing ? 'pending' as Decision : 'watch' as Decision,
        watchHorizonMonths: clearing ? null : horizon,
        watchUntil: clearing ? null : addMonthsIso(new Date(), horizon),
        appliedToNKL: null,
      },
    }
    setSelections(next)
    queueSave(next)
  }

  const resetToPending = (month: string, term: string, rowIndex = 0) => {
    const key = selectionKey(month, term, rowIndex)
    const selection = selections[key]
    const parsed = parseNegativeKeywordInput(inputFromSelection(selection, term)) || { keyword: term, matchType: 'exact' as MatchType }
    const next = {
      ...selections,
      [key]: {
        ...(selection || {}),
        yearMonth: month,
        searchTerm: term,
        rowIndex,
        negativeKeyword: parsed.keyword,
        matchType: parsed.matchType,
        decision: 'pending' as Decision,
        watchHorizonMonths: null,
        watchUntil: null,
        appliedToNKL: null,
      },
    }
    setSelections(next)
    queueSave(next)
  }

  const toggleComplete = async (month: string, complete: boolean) => {
    const res = await fetch('/api/monthly-keyword-selection/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ clientId: Number(clientId), yearMonth: month, complete }),
    })
    if (res.ok) {
      setMonths((current) => {
        const next = current.map((entry) => entry.month === month ? { ...entry, reviewComplete: complete } : entry)
        if (complete) window.requestAnimationFrame(() => scrollToFirstIncompleteMonth(visibleMonths))
        return next
      })
    } else {
      setMessage('Failed to update month completion')
    }
  }

  const applyApproved = async () => {
    const approved = Object.values(selections).filter((selection) => selection.decision === 'approved' && selection.appliedToNKL)
    if (approved.length === 0) return
    const res = await fetch('/api/monthly-keyword-selection/apply', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ clientId: Number(clientId), selections: approved }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      const applied = data.applied || 0
      const skipped = data.skipped || 0
      const total = applied + skipped
      setMessage(`Submitted ${total} negative(s) — ${applied} newly added, ${skipped} already on the list.`)
      await loadNkls()
    } else {
      setMessage(data?.error || 'Apply failed')
    }
  }

  const rebuild = async () => {
    const confirmed = window.confirm(
      'Warning: Rebuild clears the cached monthly search-term data for this client and then re-pulls every complete month from Google Ads. This can take longer and should only be used if the cached data looks wrong. Continue?',
    )
    if (!confirmed) return
    const res = await fetch('/api/monthly-keyword-selection/clear', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ clientId: Number(clientId) }),
    })
    if (res.ok) await load()
    else setMessage('Rebuild failed')
  }

  const visibleNkls = useMemo(() => nkls.filter((nkl) => !hiddenNklIds.has(String(nkl.id))), [hiddenNklIds, nkls])
  const hiddenNkls = useMemo(() => nkls.filter((nkl) => hiddenNklIds.has(String(nkl.id))), [hiddenNklIds, nkls])
  const approvedCount = Object.values(selections).filter((selection) => selection.decision === 'approved' && selection.appliedToNKL).length
  const needsReviewItems = useMemo(
    () => Object.values(selections)
      .filter((selection) => selection.decision === 'needs_review')
      .sort((a, b) => String(a.yearMonth).localeCompare(String(b.yearMonth)) || a.searchTerm.localeCompare(b.searchTerm)),
    [selections],
  )
  // "Submitted" = a negative that was actually written to an NKL (appliedAt set),
  // grouped by the review month the search-term data came from.
  const submittedByMonth = useMemo(() => {
    const groups = new Map<string, Selection[]>()
    for (const selection of Object.values(selections)) {
      if (!selection.appliedAt || !selection.appliedToNKL) continue
      const list = groups.get(selection.yearMonth) || []
      list.push(selection)
      groups.set(selection.yearMonth, list)
    }
    return Array.from(groups.entries())
      .sort((a, b) => String(b[0]).localeCompare(String(a[0])))
      .map(([month, items]) => ({
        month,
        items: items.sort((a, b) => a.searchTerm.localeCompare(b.searchTerm)),
      }))
  }, [selections])
  const submittedCount = useMemo(
    () => Object.values(selections).filter((s) => s.appliedAt && s.appliedToNKL).length,
    [selections],
  )
  // "Removed negatives explained" = already-applied negatives that were later
  // removed with an explanation comment, grouped by review month.
  const removedByMonth = useMemo(() => {
    const groups = new Map<string, Selection[]>()
    for (const selection of Object.values(selections)) {
      if (!selection.removedAt) continue
      const list = groups.get(selection.yearMonth) || []
      list.push(selection)
      groups.set(selection.yearMonth, list)
    }
    return Array.from(groups.entries())
      .sort((a, b) => String(b[0]).localeCompare(String(a[0])))
      .map(([month, items]) => ({
        month,
        items: items.sort((a, b) => String(b.removedAt).localeCompare(String(a.removedAt))),
      }))
  }, [selections])
  const removedCount = useMemo(
    () => Object.values(selections).filter((s) => s.removedAt).length,
    [selections],
  )
  const nklNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const nkl of nkls) map.set(String(nkl.id), nkl.name || `List ${nkl.id}`)
    return map
  }, [nkls])

  const reviseSubmitted = useCallback(async (
    item: Selection,
    action: 'remove' | 'update',
    extra?: { newKeyword?: string; newMatchType?: MatchType; newNklId?: number | string; comment?: string },
  ) => {
    const res = await fetch('/api/monthly-keyword-selection/revise', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ clientId: Number(clientId), yearMonth: item.yearMonth, searchTerm: item.searchTerm, rowIndex: Number(item.rowIndex ?? 0), action, ...extra }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setMessage(data?.error || 'Revision failed'); return }
    if (action === 'remove') {
      setMessage(data.notified ? 'Removed from the list · original submitter notified.' : 'Removed from the negative keyword list.')
    } else {
      setMessage('Negative keyword list updated.')
    }
    await Promise.all([load(), loadNkls()])
  }, [clientId, load, loadNkls])

  const saveComment = useCallback(async (
    item: Selection,
    comment: string,
    taggedUserIds: string[],
  ) => {
    const res = await fetch('/api/monthly-keyword-selection/comment', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ clientId: Number(clientId), yearMonth: item.yearMonth, searchTerm: item.searchTerm, rowIndex: Number(item.rowIndex ?? 0), comment, taggedUserIds }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setMessage(data?.error || 'Failed to save comment'); return }
    const key = selectionKey(item.yearMonth, item.searchTerm, Number(item.rowIndex ?? 0))
    setSelections((current) => ({
      ...current,
      [key]: { ...current[key], reviewComment: comment, reviewCommentBy: data.reviewCommentBy, reviewCommentAt: data.reviewCommentAt, reviewCommentTaggedUserIds: taggedUserIds.join(',') },
    }))
    setMessage(data.notified > 0 ? `Comment saved · ${data.notified} teammate${data.notified === 1 ? '' : 's'} notified.` : 'Comment saved.')
  }, [clientId])
  const monthsToRender = activeMonth ? visibleMonths.filter((month) => month.month === activeMonth) : visibleMonths
  // Compact column track sizes so more NKL columns fit before scrolling, and a
  // tighter inter-column gap. The focused month section grows to max-content
  // (see below) so the card border always wraps the full grid — columns never
  // spill past the border.
  const gridGap = 6
  const gridTemplate = `minmax(130px, 1fr) 292px minmax(200px, 1.3fr) 64px repeat(${Math.max(visibleNkls.length, 1)}, minmax(84px, 0.5fr))`

  return (
    // Layout (full-width breakout + zero left padding so content hugs the sidebar)
    // lives in custom.scss under `.od-fullbleed-tool` so it can be media-queried
    // for mobile. See the "Full-bleed tool pages" block.
    <div className="od-fullbleed-tool" style={{ color: 'var(--theme-text)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>Monthly negative KWs</h1>
          <p style={{ margin: '6px 0 0', color: 'var(--theme-elevation-600)' }}>Complete months only. Review terms, approve negatives, then apply them to an active NKL.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" onClick={load} disabled={loading} style={{ padding: '8px 12px' }}>{loading ? 'Refreshing…' : 'Refresh'}</button>
          {isAdmin && (
            <button
              type="button"
              onClick={rebuild}
              title="Admin only: clears this client's cached complete-month terms and re-pulls all complete months. Use only if cached data looks wrong."
              aria-label="Rebuild monthly keyword cache"
              style={{
                padding: '4px 8px',
                fontSize: 11,
                lineHeight: 1.2,
                color: '#b91c1c',
                borderColor: '#fecaca',
                background: '#fff7f7',
              }}
            >
              Rebuild ⚠
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, padding: 12, border: '1px solid var(--theme-elevation-150)', borderRadius: 8 }}>
        <button type="button" onClick={applyApproved} disabled={approvedCount === 0} style={{ padding: '8px 12px' }}>Apply {approvedCount} added negative{approvedCount === 1 ? '' : 's'}</button>
        <span style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>{saving ? 'Saving…' : 'Auto-saved'} · Open a month, then tick the NKL column for each search term you want to add.</span>
        {hiddenNkls.length > 0 && (
          <button type="button" onClick={() => setHiddenNklIds(new Set())} style={{ padding: '6px 10px', fontSize: 12 }}>Show {hiddenNkls.length} hidden NKL{hiddenNkls.length === 1 ? '' : 's'}</button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--theme-elevation-150)' }}>
        <button
          type="button"
          onClick={() => setActiveTab('months')}
          style={{ padding: '8px 14px', fontSize: 13, fontWeight: 600, border: 'none', borderBottom: activeTab === 'months' ? '2px solid var(--theme-text)' : '2px solid transparent', background: 'transparent', color: activeTab === 'months' ? 'var(--theme-text)' : 'var(--theme-elevation-500)', cursor: 'pointer' }}
        >Monthly review</button>
        <button
          type="button"
          onClick={() => setActiveTab('review')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, border: 'none', borderBottom: activeTab === 'review' ? '2px solid #d97706' : '2px solid transparent', background: 'transparent', color: needsReviewItems.length > 0 ? '#92400e' : 'var(--theme-elevation-500)', cursor: 'pointer' }}
        >
          Needs review
          {needsReviewItems.length > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: '#f59e0b', color: '#fff', fontSize: 11, fontWeight: 700 }}>{needsReviewItems.length}</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('submitted')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, border: 'none', borderBottom: activeTab === 'submitted' ? '2px solid #0f766e' : '2px solid transparent', background: 'transparent', color: activeTab === 'submitted' ? '#0f766e' : 'var(--theme-elevation-500)', cursor: 'pointer' }}
        >
          Submitted negatives
          {submittedCount > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: '#0f766e', color: '#fff', fontSize: 11, fontWeight: 700 }}>{submittedCount}</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('removed')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, border: 'none', borderBottom: activeTab === 'removed' ? '2px solid #b91c1c' : '2px solid transparent', background: 'transparent', color: activeTab === 'removed' ? '#b91c1c' : 'var(--theme-elevation-500)', cursor: 'pointer' }}
        >
          Removed negatives explained
          {removedCount > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: '#b91c1c', color: '#fff', fontSize: 11, fontWeight: 700 }}>{removedCount}</span>
          )}
        </button>
      </div>

      {message && <div style={{ marginBottom: 16, padding: 10, borderRadius: 6, background: '#fef3c7', color: '#92400e' }}>{message}</div>}

      {lastLoadSummary?.diagnostics && (
        <div style={{ marginBottom: 16, padding: 10, borderRadius: 6, border: '1px solid var(--theme-elevation-150)', color: 'var(--theme-elevation-600)', fontSize: 12 }}>
          Last Growth Tools pull: CID {lastLoadSummary.diagnostics.customerId || 'unknown'}, {lastLoadSummary.diagnostics.startDate || '?'} → {lastLoadSummary.diagnostics.endDate || '?'}, total rows {lastLoadSummary.diagnostics.totalRows ?? 0}, matched month rows {lastLoadSummary.diagnostics.matchedRows ?? 0}.
        </div>
      )}

      {activeTab === 'months' && loading && months.length === 0 && (
        <div style={{ marginBottom: 16, padding: 14, borderRadius: 8, border: '1px solid var(--theme-elevation-150)', background: 'var(--theme-elevation-50)', color: 'var(--theme-elevation-700)' }}>
          Pulling complete-month search terms from Google Ads. The first load can take a little while.
        </div>
      )}

      {activeTab === 'months' && !loading && months.length === 0 && (
        <div style={{ marginBottom: 16, padding: 14, borderRadius: 8, border: '1px solid #fde68a', background: '#fffbeb', color: '#92400e' }}>
          <strong>No monthly search terms loaded yet.</strong>
          <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5 }}>
            Press <strong>Refresh</strong> to fetch missing complete months. If this still stays empty, check that the linked client has the right Google Ads customer ID, Growth Tools has deployed the monthly search terms endpoint, and the account has complete-month spend with terms meeting ≥1 click or ≥5 impressions.
          </div>
          {lastLoadSummary?.error && (
            <div style={{ marginTop: 8, padding: 8, borderRadius: 6, background: '#fee2e2', color: '#991b1b', fontSize: 12 }}>
              Upstream error: {lastLoadSummary.error}
            </div>
          )}
          {lastLoadSummary?.missingMonths && lastLoadSummary.missingMonths.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 12 }}>After the last refresh, {lastLoadSummary.missingMonths.length} complete month(s) are still missing from the cache.</div>
          )}
        </div>
      )}

      {activeTab === 'review' && needsReviewItems.length === 0 && (
        <div style={{ padding: 24, border: '1px solid var(--theme-elevation-150)', borderRadius: 10, color: 'var(--theme-elevation-500)', textAlign: 'center' }}>
          No keywords flagged for review. Use the “Needs review” action on a term in the Monthly review tab to park it here.
        </div>
      )}

      {activeTab === 'review' && needsReviewItems.length > 0 && (
        <div style={{ marginBottom: 18, border: '1px solid #fcd34d', borderRadius: 10, background: '#fffbeb', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #fde68a', fontWeight: 700, color: '#92400e' }}>
            Needs review — {needsReviewItems.length} term{needsReviewItems.length === 1 ? '' : 's'} across all months
          </div>
          <div style={{ display: 'grid', gap: 8, padding: 12 }}>
            {needsReviewItems.map((item) => (
              <NeedsReviewRow
                key={selectionKey(item.yearMonth, item.searchTerm, Number(item.rowIndex ?? 0))}
                item={item}
                nkls={visibleNkls}
                teammates={teammates}
                onSetTarget={(nklId) => setTargetListForTerm(item.yearMonth, item.searchTerm, nklId)}
                onDismiss={() => resetToPending(item.yearMonth, item.searchTerm, Number(item.rowIndex ?? 0))}
                onSaveComment={(comment, taggedUserIds) => saveComment(item, comment, taggedUserIds)}
              />
            ))}
          </div>
        </div>
      )}

      {activeTab === 'submitted' && submittedCount === 0 && (
        <div style={{ padding: 24, border: '1px solid var(--theme-elevation-150)', borderRadius: 10, color: 'var(--theme-elevation-500)', textAlign: 'center' }}>
          No negatives submitted yet. Approve terms in the Monthly review tab and press “Apply” — everything added to a negative keyword list shows up here for a final safety check.
        </div>
      )}

      {activeTab === 'submitted' && submittedCount > 0 && (
        <div style={{ display: 'grid', gap: 18 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--theme-elevation-600)' }}>
            Every negative keyword that was applied to a list, grouped by review month. Tweak a keyword or match type and press <strong>Update list</strong>, or <strong>Remove</strong> it from the list if it shouldn’t have been added.
          </p>
          {submittedByMonth.map(({ month, items }) => (
            <section key={month} style={{ border: '1px solid var(--theme-elevation-150)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--theme-elevation-150)', fontWeight: 700, background: 'var(--theme-elevation-50)' }}>
                {monthLabel(month)} · {items.length} negative{items.length === 1 ? '' : 's'} added
              </div>
              <div style={{ display: 'grid', gap: 8, padding: 12 }}>
                {items.map((item) => (
                  <SubmittedRow
                    key={selectionKey(item.yearMonth, item.searchTerm, Number(item.rowIndex ?? 0))}
                    item={item}
                    nklId={typeof item.appliedToNKL === 'object' ? item.appliedToNKL?.id ?? null : item.appliedToNKL ?? null}
                    nklName={nklNameById.get(String(typeof item.appliedToNKL === 'object' ? item.appliedToNKL?.id : item.appliedToNKL)) || 'Unknown list'}
                    nkls={visibleNkls}
                    onRemove={(comment) => reviseSubmitted(item, 'remove', comment ? { comment } : undefined)}
                    onUpdate={(newKeyword, newMatchType, newNklId) => reviseSubmitted(item, 'update', { newKeyword, newMatchType, ...(newNklId != null ? { newNklId } : {}) })}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {activeTab === 'removed' && removedCount === 0 && (
        <div style={{ padding: 24, border: '1px solid var(--theme-elevation-150)', borderRadius: 10, color: 'var(--theme-elevation-500)', textAlign: 'center' }}>
          No removed negatives explained yet. When you remove an already-applied negative from the Submitted negatives tab and add an explanation, it shows up here.
        </div>
      )}

      {activeTab === 'removed' && removedCount > 0 && (
        <div style={{ display: 'grid', gap: 18 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--theme-elevation-600)' }}>
            Negatives that were applied to a list and later removed with an explanation, grouped by review month. This keeps a record of why a previously-submitted negative was pulled.
          </p>
          {removedByMonth.map(({ month, items }) => (
            <section key={month} style={{ border: '1px solid #fecaca', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid #fecaca', fontWeight: 700, background: '#fff7f7', color: '#b91c1c' }}>
                {monthLabel(month)} · {items.length} removed
              </div>
              <div style={{ display: 'grid', gap: 8, padding: 12 }}>
                {items.map((item) => (
                  <div
                    key={selectionKey(item.yearMonth, item.searchTerm, Number(item.rowIndex ?? 0))}
                    style={{ display: 'grid', gap: 6, padding: '10px 12px', borderRadius: 6, background: 'var(--theme-elevation-0)', border: '1px solid var(--theme-elevation-100)' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>Search term</div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{item.searchTerm}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>Removed negative</div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{item.negativeKeyword} <span style={{ color: 'var(--theme-elevation-500)', fontWeight: 400 }}>({matchTypeLabel(item.matchType)})</span></div>
                      </div>
                    </div>
                    {item.removedComment && (
                      <div style={{ fontSize: 13, padding: '8px 10px', borderRadius: 6, background: '#fff7f7', border: '1px solid #fecaca', color: '#7f1d1d' }}>
                        {item.removedComment}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>
                      Removed by {item.removedBy || 'someone'}{item.removedAt ? ` on ${new Date(item.removedAt).toLocaleDateString()}` : ''}
                      {item.appliedBy ? ` · originally submitted by ${item.appliedBy}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <div ref={monthsScrollerRef} style={{ display: activeTab === 'months' ? 'flex' : 'none', gap: 14, overflowX: 'auto', paddingBottom: 20, scrollBehavior: 'smooth' }}>
        {monthsToRender.map((month) => {
          const isFocused = activeMonth === month.month
          return (
          <section key={month.month} aria-label={`${monthLabel(month.month)}${month.reviewComplete ? ' complete' : ''}`} style={{ minWidth: isFocused ? '100%' : 340, maxWidth: isFocused ? 'none' : 340, width: isFocused ? 'max-content' : undefined, border: '1px solid var(--theme-elevation-150)', borderRadius: 10, background: month.reviewComplete ? 'var(--theme-elevation-50)' : 'var(--theme-bg)', opacity: month.reviewComplete ? 0.78 : 1 }}>
            <div ref={isFocused ? titleBarRef : undefined} style={{ position: 'sticky', top: 0, zIndex: 3, padding: 12, borderBottom: '1px solid var(--theme-elevation-150)', background: 'inherit', borderRadius: '10px 10px 0 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <strong>{monthLabel(month.month)}</strong>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button type="button" onClick={() => setActiveMonth(isFocused ? null : month.month)} style={{ padding: '4px 8px', fontSize: 12 }}>{isFocused ? 'Close' : 'Edit month'}</button>
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                    <input type="checkbox" checked={month.reviewComplete} onChange={(event) => void toggleComplete(month.month, event.target.checked)} />
                    {month.reviewComplete ? '✓ Complete' : 'Complete'}
                  </label>
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--theme-elevation-500)', marginTop: 4 }}>
                {month.terms.length} qualifying term{month.terms.length === 1 ? '' : 's'}{month.reviewComplete ? ' · Locked until unchecked' : ''}
              </div>
            </div>
            <div style={{ padding: 10, display: 'grid', gap: 10 }}>
              {isFocused && month.terms.length > 0 && (
                <div style={{ position: 'sticky', top: titleBarHeight, zIndex: 2, display: 'grid', gridTemplateColumns: gridTemplate, gap: gridGap, padding: '7px 8px', borderRadius: 6, background: 'var(--theme-elevation-150)', fontSize: 10, fontWeight: 700, color: 'var(--theme-elevation-800)', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                  <span>Search term</span>
                  <span>Actions</span>
                  <span>Negative keyword</span>
                  <span>Match type</span>
                  {visibleNkls.map((nkl) => (
                    <span key={nkl.id} style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                      {nkl.name}
                      <button type="button" onClick={() => setHiddenNklIds((current) => new Set([...current, String(nkl.id)]))} title={`Hide ${nkl.name}`} style={{ padding: '1px 5px', fontSize: 10, lineHeight: 1.2 }}>×</button>
                    </span>
                  ))}
                  {visibleNkls.length === 0 && <span>Negative keyword list</span>}
                </div>
              )}
              {month.terms.length === 0 && month.diagnostics && (
                <div style={{ fontSize: 12, color: 'var(--theme-elevation-500)', lineHeight: 1.45 }}>
                  Growth Tools rows: {month.diagnostics.rawRows ?? 0}; parsed terms: {month.diagnostics.parsedTerms ?? 0}; qualifying terms: {month.diagnostics.qualifiedTerms ?? 0}.
                </div>
              )}
              {month.terms.map((term) => {
                const primaryKey = selectionKey(month.month, term.term, 0)
                const primary = selections[primaryKey]
                const selectedNklId = primary?.appliedToNKL && typeof primary.appliedToNKL === 'object' ? primary.appliedToNKL.id : primary?.appliedToNKL
                const subRowIndexes = rowIndexesForTerm(month.month, term.term)
                return (
                  <div key={primaryKey} style={{ display: 'grid', gap: 4 }}>
                    {subRowIndexes.map((rowIndex) => {
                      const isPrimary = rowIndex === 0
                      const key = selectionKey(month.month, term.term, rowIndex)
                      const selection = selections[key]
                      const inputValue = inputFromSelection(selection, term.term)
                      const parsed = parseNegativeKeywordInput(inputValue) || { keyword: term.term, matchType: 'exact' as MatchType }
                      const cmsNklMatches = cmsExistingByKeyword.get(`${parsed.keyword.toLowerCase()}|${parsed.matchType}`) || []
                      const alreadyInCms = cmsNklMatches.length > 0
                      const isAutoAdded = selection?.decision === 'approved' && !selection.appliedToNKL || alreadyInCms
                      return (
                        <div key={key} style={{ display: 'grid', gridTemplateColumns: isFocused ? gridTemplate : '1fr', gap: gridGap, alignItems: 'center', padding: '6px 8px', border: '1px solid var(--theme-elevation-100)', borderRadius: 6, marginLeft: isPrimary ? 0 : 18, background: selection?.decision === 'skipped' ? '#fef2f2' : selection?.decision === 'needs_review' ? '#fffbeb' : selection?.decision === 'watch' ? '#eff6ff' : selection?.decision === 'approved' && !selection.appliedToNKL ? '#f0fdf4' : 'var(--theme-elevation-0)' }}>
                          <div>
                            {isPrimary ? (
                              <>
                                <div style={{ fontWeight: 600, marginBottom: 2 }}>{term.term}</div>
                                <div style={{ fontSize: 10, color: 'var(--theme-elevation-500)' }}>
                                  {term.impressions} impr · {term.clicks} clicks · ${Number(term.cost || 0).toFixed(2)}
                                </div>
                              </>
                            ) : (
                              <div style={{ fontSize: 10, color: 'var(--theme-elevation-400)', fontStyle: 'italic' }}>↳ {term.term}</div>
                            )}
                          </div>
                          {isFocused && isPrimary && (
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'center', flexWrap: 'nowrap' }}>
                              {selection?.decision === 'watch' ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  <button
                                    type="button"
                                    disabled={month.reviewComplete}
                                    onClick={() => setWatch(month.month, term.term, null)}
                                    title={`Watching — performance re-check due ${selection.watchUntil ? new Date(selection.watchUntil).toLocaleDateString('en-AU') : ''}. Click to stop watching.`}
                                    style={{ padding: '3px 5px', fontSize: 9, lineHeight: 1.2, whiteSpace: 'nowrap', color: '#1d4ed8', borderColor: '#93c5fd', background: '#dbeafe', cursor: month.reviewComplete ? 'not-allowed' : 'pointer' }}
                                  >👁 Watch</button>
                                  <select
                                    disabled={month.reviewComplete}
                                    value={WATCH_HORIZONS.includes(selection.watchHorizonMonths as WatchHorizon) ? Number(selection.watchHorizonMonths) : DEFAULT_WATCH_HORIZON}
                                    onChange={(event) => setWatch(month.month, term.term, Number(event.target.value) as WatchHorizon)}
                                    title="Months until performance re-check"
                                    style={{ fontSize: 9, padding: '1px 2px' }}
                                  >
                                    {WATCH_HORIZONS.map((h) => <option key={h} value={h}>{h}mo</option>)}
                                  </select>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={month.reviewComplete}
                                  onClick={() => setWatch(month.month, term.term, DEFAULT_WATCH_HORIZON)}
                                  title="On the fence? Watch this term. It is NOT added as a negative and keeps appearing across months until the re-check horizon (default 3 months) passes, when its conversion performance is reviewed."
                                  style={{ padding: '3px 6px', fontSize: 10, lineHeight: 1.2, fontWeight: 700, whiteSpace: 'nowrap', cursor: month.reviewComplete ? 'not-allowed' : 'pointer' }}
                                >?</button>
                              )}
                              <button
                                type="button"
                                disabled={month.reviewComplete}
                                onClick={() => markTermHandled(month.month, term.term, 'skipped')}
                                style={{ padding: '3px 6px', fontSize: 9, lineHeight: 1.2, whiteSpace: 'nowrap', color: selection?.decision === 'skipped' ? '#991b1b' : undefined, borderColor: selection?.decision === 'skipped' ? '#fca5a5' : undefined, background: selection?.decision === 'skipped' ? '#fee2e2' : undefined, cursor: month.reviewComplete ? 'not-allowed' : 'pointer' }}
                              >{selection?.decision === 'skipped' ? 'Skipped' : 'Skip'}</button>
                              <button
                                type="button"
                                disabled={month.reviewComplete}
                                onClick={() => markTermHandled(month.month, term.term, 'approved')}
                                title="Already covered by an existing negative keyword; hide this exact search term in future months without applying it again. Click again to unmark."
                                style={{ padding: '3px 6px', fontSize: 9, lineHeight: 1.2, whiteSpace: 'nowrap', color: isAutoAdded ? '#166534' : undefined, borderColor: isAutoAdded ? '#86efac' : undefined, background: isAutoAdded ? '#dcfce7' : undefined, cursor: month.reviewComplete ? 'not-allowed' : 'pointer' }}
                              >{isAutoAdded ? 'Added' : 'Already added'}</button>
                              <button
                                type="button"
                                disabled={month.reviewComplete}
                                onClick={() => markTermHandled(month.month, term.term, 'needs_review')}
                                title="Unsure whether this should be a negative? Type the negative keyword, then flag it for review. It is NOT added to any list — it is parked for an admin to decide, and surfaces in the Needs review panel."
                                style={{ padding: '3px 6px', fontSize: 9, lineHeight: 1.2, whiteSpace: 'nowrap', color: selection?.decision === 'needs_review' ? '#92400e' : undefined, borderColor: selection?.decision === 'needs_review' ? '#fcd34d' : undefined, background: selection?.decision === 'needs_review' ? '#fef3c7' : undefined, cursor: month.reviewComplete ? 'not-allowed' : 'pointer' }}
                              >{selection?.decision === 'needs_review' ? 'In review' : 'Needs review'}</button>
                            </div>
                          )}
                          {isFocused && !isPrimary && (
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'center' }}>
                              <button
                                type="button"
                                disabled={month.reviewComplete}
                                onClick={() => removeSubRow(month.month, term.term, rowIndex)}
                                title="Remove this additional negative keyword"
                                style={{ padding: '3px 8px', fontSize: 11, lineHeight: 1.2, color: '#b91c1c', borderColor: '#fecaca', background: '#fff7f7', cursor: month.reviewComplete ? 'not-allowed' : 'pointer' }}
                              >×</button>
                            </div>
                          )}
                          <div style={{ display: 'grid', gap: 4 }}>
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              <input
                                value={inputValue}
                                disabled={month.reviewComplete}
                                onChange={(event) => updateTerm(month.month, term.term, event.target.value, undefined, rowIndex)}
                                style={{ width: '100%', boxSizing: 'border-box', padding: '5px 7px', fontSize: 12, cursor: month.reviewComplete ? 'not-allowed' : 'text' }}
                              />
                              {isFocused && isPrimary && (
                                <button
                                  type="button"
                                  disabled={month.reviewComplete}
                                  onClick={() => addSubRow(month.month, term.term)}
                                  title="Add another negative keyword for this search term (shares the same negative keyword list)"
                                  style={{ padding: '4px 8px', fontSize: 12, lineHeight: 1.2, fontWeight: 700, cursor: month.reviewComplete ? 'not-allowed' : 'pointer' }}
                                >+</button>
                              )}
                            </div>
                            {alreadyInCms && <span title={cmsNklMatches.join(', ')} style={{ fontSize: 11, background: '#dcfce7', color: '#166534', padding: '2px 6px', borderRadius: 999, justifySelf: 'start' }}>Already in {cmsNklMatches.join(', ')}</span>}
                            {isPrimary && isWatchDue(selection) && <span style={{ fontSize: 11, background: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: 999, justifySelf: 'start' }}>Watch due — re-check performance</span>}
                          </div>
                          <div style={{ display: 'grid', gap: 4 }}>
                            <span style={{ fontSize: 10, color: '#0369a1' }}>{matchTypeLabel(parsed.matchType)}</span>
                          </div>
                          {isFocused && isPrimary && visibleNkls.map((nkl) => {
                            const isChecked = String(selectedNklId || '') === String(nkl.id)
                            return (
                              <label key={nkl.id} style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'center', minHeight: 28, padding: '3px 5px', borderRadius: 5, border: isChecked ? '1px solid #0f766e' : '1px solid var(--theme-elevation-150)', background: isChecked ? '#ccfbf1' : 'transparent', fontSize: 10, whiteSpace: 'nowrap', cursor: month.reviewComplete ? 'not-allowed' : 'pointer' }}>
                                <input type="checkbox" checked={isChecked} disabled={month.reviewComplete} onChange={() => setTargetListForTerm(month.month, term.term, isChecked ? null : nkl.id)} />
                                Add negative
                              </label>
                            )
                          })}
                          {isFocused && !isPrimary && visibleNkls.map((nkl) => (
                            <span key={nkl.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 28, fontSize: 9, color: 'var(--theme-elevation-400)' }}>{String(selectedNklId || '') === String(nkl.id) ? '↳ same list' : ''}</span>
                          ))}
                          {isFocused && isPrimary && visibleNkls.length === 0 && <span style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>No active NKLs shown</span>}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </section>
          )
        })}
      </div>
    </div>
  )
}

function NeedsReviewRow({ item, nkls, teammates, onSetTarget, onDismiss, onSaveComment }: {
  item: Selection
  nkls: Nkl[]
  teammates: Teammate[]
  onSetTarget: (nklId: string) => void
  onDismiss: () => void
  onSaveComment: (comment: string, taggedUserIds: string[]) => Promise<void>
}) {
  const initialTags = (item.reviewCommentTaggedUserIds || '').split(',').map((id) => id.trim()).filter(Boolean)
  const [comment, setComment] = useState(item.reviewComment || '')
  const [tags, setTags] = useState<string[]>(initialTags)
  const [savingComment, setSavingComment] = useState(false)
  const dirty = comment !== (item.reviewComment || '') || tags.join(',') !== initialTags.join(',')

  const toggleTag = (id: string): void => {
    setTags((current) => current.includes(id) ? current.filter((t) => t !== id) : [...current, id])
  }
  const handleSave = async (): Promise<void> => {
    setSavingComment(true)
    try { await onSaveComment(comment, tags) } finally { setSavingComment(false) }
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '6px 10px', borderRadius: 6, background: 'var(--theme-elevation-0)', border: '1px solid var(--theme-elevation-100)', alignItems: 'center' }}>
      <span style={{ fontSize: 11, color: 'var(--theme-elevation-600)', flex: '0 0 auto', minWidth: 56 }}>{monthLabel(item.yearMonth)}</span>
      <div style={{ flex: '1 1 160px', minWidth: 140 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{item.searchTerm}</div>
        <div style={{ fontSize: 11, color: 'var(--theme-elevation-500)' }}>→ {item.negativeKeyword} · {matchTypeLabel(item.matchType)}</div>
      </div>
      <select
        defaultValue=""
        onChange={(event) => { if (event.target.value) onSetTarget(event.target.value) }}
        style={{ fontSize: 11, padding: '4px 6px', flex: '0 1 150px', minWidth: 120 }}
      >
        <option value="" disabled>Set as negative in…</option>
        {nkls.map((nkl) => <option key={nkl.id} value={String(nkl.id)}>{nkl.name}</option>)}
      </select>
      <input
        value={comment}
        placeholder="Comment for the team…"
        onChange={(event) => setComment(event.target.value)}
        style={{ flex: '1 1 160px', minWidth: 140, boxSizing: 'border-box', padding: '4px 7px', fontSize: 12 }}
      />
      {teammates.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', flex: '0 1 auto' }}>
          {teammates.map((mate) => {
            const active = tags.includes(mate.id)
            return (
              <button
                key={mate.id}
                type="button"
                onClick={() => toggleTag(mate.id)}
                style={{ padding: '2px 8px', fontSize: 11, borderRadius: 999, cursor: 'pointer', border: active ? '1px solid #0f766e' : '1px solid var(--theme-elevation-150)', background: active ? '#ccfbf1' : 'transparent', color: active ? '#0f766e' : 'var(--theme-elevation-700)' }}
              >@{mate.label}</button>
            )
          })}
        </div>
      )}
      <button type="button" onClick={handleSave} disabled={!dirty || savingComment} style={{ padding: '4px 10px', fontSize: 11, whiteSpace: 'nowrap', flex: '0 0 auto' }}>{savingComment ? 'Saving…' : 'Save'}</button>
      <button type="button" onClick={onDismiss} style={{ padding: '4px 9px', fontSize: 11, whiteSpace: 'nowrap', flex: '0 0 auto' }}>Dismiss</button>
      {item.reviewCommentBy && item.reviewCommentAt && (
        <span style={{ fontSize: 11, color: 'var(--theme-elevation-500)', flex: '1 1 100%' }}>Last by {item.reviewCommentBy} · {new Date(item.reviewCommentAt).toLocaleString('en-AU')}</span>
      )}
    </div>
  )
}

function SubmittedRow({ item, nklId, nklName, nkls, onRemove, onUpdate }: {
  item: Selection
  nklId: number | string | null
  nklName: string
  nkls: Nkl[]
  onRemove: (comment?: string) => Promise<void>
  onUpdate: (newKeyword: string, newMatchType: MatchType, newNklId: number | string | null) => Promise<void>
}) {
  const [keyword, setKeyword] = useState(item.negativeKeyword)
  const [matchType, setMatchType] = useState<MatchType>(item.matchType)
  const [targetNklId, setTargetNklId] = useState<string>(nklId != null ? String(nklId) : '')
  const [busy, setBusy] = useState(false)
  const listChanged = targetNklId !== '' && targetNklId !== (nklId != null ? String(nklId) : '')
  const dirty = keyword.trim() !== item.negativeKeyword || matchType !== item.matchType || listChanged

  const handleUpdate = async (): Promise<void> => {
    if (!keyword.trim()) return
    setBusy(true)
    try { await onUpdate(keyword.trim(), matchType, listChanged ? targetNklId : null) } finally { setBusy(false) }
  }
  const handleRemove = async (): Promise<void> => {
    if (!window.confirm(`Remove “${item.negativeKeyword}” (${matchTypeLabel(item.matchType)}) from ${nklName}? It will be marked skipped so it stays hidden in future months.`)) return
    // Optional explanation. When given, it surfaces in the "Removed negatives
    // explained" tab and notifies the teammate who originally submitted it.
    const explanation = window.prompt(
      `Optionally explain why you're removing “${item.negativeKeyword}”. ${item.appliedBy ? `${item.appliedBy} (who submitted it) will be notified.` : ''}`.trim(),
      '',
    )
    if (explanation === null) return
    setBusy(true)
    try { await onRemove(explanation.trim() || undefined) } finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 120px 170px auto', gap: 10, alignItems: 'center', padding: '8px 10px', borderRadius: 6, background: 'var(--theme-elevation-0)', border: '1px solid var(--theme-elevation-100)' }}>
      <div>
        <div style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>Search term</div>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{item.searchTerm}</div>
        <div style={{ fontSize: 11, color: '#0f766e' }}>in {nklName}</div>
      </div>
      <input
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
        style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', fontSize: 12 }}
      />
      <select value={matchType} onChange={(event) => setMatchType(event.target.value as MatchType)} style={{ fontSize: 12, padding: '5px 7px' }}>
        <option value="exact">Exact match</option>
        <option value="phrase">Phrase match</option>
        <option value="broad">Broad match</option>
      </select>
      <select
        value={targetNklId}
        onChange={(event) => setTargetNklId(event.target.value)}
        title="Move this negative to a different list"
        style={{ fontSize: 12, padding: '5px 7px', borderColor: listChanged ? '#0f766e' : undefined }}
      >
        {nklId != null && !nkls.some((nkl) => String(nkl.id) === String(nklId)) && (
          <option value={String(nklId)}>{nklName}</option>
        )}
        {nkls.map((nkl) => <option key={nkl.id} value={String(nkl.id)}>{nkl.name}</option>)}
      </select>
      <div style={{ display: 'flex', gap: 6, whiteSpace: 'nowrap' }}>
        <button type="button" onClick={handleUpdate} disabled={!dirty || busy} title="Save keyword/match-type edits and move the negative if a different list is selected" style={{ padding: '5px 10px', fontSize: 11 }}>{listChanged ? 'Update & move' : 'Update list'}</button>
        <button type="button" onClick={handleRemove} disabled={busy} style={{ padding: '5px 10px', fontSize: 11, color: '#b91c1c', borderColor: '#fecaca', background: '#fff7f7' }}>Remove</button>
      </div>
    </div>
  )
}
