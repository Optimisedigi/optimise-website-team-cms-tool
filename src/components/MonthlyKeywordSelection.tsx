'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { parseNegativeKeywordInput } from '../lib/parse-negative-keywords'
import { buildSuppressionIndex, buildSuppressionNegatives, isQualifyingListName, partitionTermsByNegation, type SuppressionNegative } from '../lib/negative-keyword-suppression'

type MatchType = 'exact' | 'phrase' | 'broad'
type Decision = 'pending' | 'approved' | 'skipped' | 'watch' | 'needs_review'
type WatchHorizon = 1 | 2 | 3 | 6

const WATCH_HORIZONS: WatchHorizon[] = [1, 2, 3, 6]
const DEFAULT_WATCH_HORIZON: WatchHorizon = 3

type Term = { term: string; impressions: number; clicks: number; cost: number; conversions: number; status?: string }
type Month = { month: string; terms: Term[]; reviewComplete: boolean; reviewCompletedAt?: string | null; diagnostics?: { rawRows?: number; parsedTerms?: number; qualifiedTerms?: number } }
type Selection = { yearMonth: string; searchTerm: string; rowIndex?: number; negativeKeyword: string; matchType: MatchType; decision: Decision; watchHorizonMonths?: number | null; watchUntil?: string | null; appliedToNKL?: number | string | { id?: number | string } | null; appliedAt?: string | null; appliedBy?: string | null; appliedByUserId?: string | null; removedComment?: string | null; removedBy?: string | null; removedByUserId?: string | null; removedAt?: string | null; decidedBy?: string | null; decidedByUserId?: string | null; reviewDismissedAt?: string | null; reviewDismissedBy?: string | null; reviewComment?: string | null; reviewCommentBy?: string | null; reviewCommentAt?: string | null; reviewCommentTaggedUserIds?: string | null; outcomeType?: string | null; outcomeDetail?: string | null; outcomeComment?: string | null; outcomeBy?: string | null; outcomeByUserId?: string | null; outcomeAt?: string | null; outcomeFollowUpComments?: FollowUpComment[] | null }
type FollowUpComment = { id?: string; comment: string; by?: string | null; byUserId?: string | null; at?: string | null; taggedUserIds?: string | null }
type Nkl = { id: number | string; name: string; isActive?: boolean; keywords?: Array<{ keyword: string; matchType: MatchType; negatedAt?: string | null }> }
type Teammate = { id: string; label: string }

const OUTCOME_PILL: Record<'Added' | 'Updated' | 'Moved' | 'Removed' | 'Dismissed', { bg: string; fg: string }> = {
  Added: { bg: '#dcfce7', fg: '#166534' },
  Updated: { bg: '#dbeafe', fg: '#1e40af' },
  Moved: { bg: '#e0e7ff', fg: '#3730a3' },
  Removed: { bg: '#fee2e2', fg: '#991b1b' },
  Dismissed: { bg: '#fef3c7', fg: '#92400e' },
}

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
  const [suppressionNklIdsConfigured, setSuppressionNklIdsConfigured] = useState(false)
  const [selectedSuppressionNklIds, setSelectedSuppressionNklIds] = useState<Set<string>>(new Set())
  const [suppressionPanelOpen, setSuppressionPanelOpen] = useState(false)
  const [suppressionSaving, setSuppressionSaving] = useState(false)
  const [activeMonth, setActiveMonth] = useState<string | null>(null)
  const [showAlreadyNegated, setShowAlreadyNegated] = useState(false)
  const [activeTab, setActiveTab] = useState<'months' | 'review' | 'submitted' | 'removed'>('months')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState(false)
  const [appliedJustNow, setAppliedJustNow] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [lastLoadSummary, setLastLoadSummary] = useState<{ misses?: number; missingMonths?: string[]; error?: string; diagnostics?: { customerId?: string; startDate?: string; endDate?: string; totalRows?: number; matchedRows?: number } } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveRequestId = useRef(0)
  // Latest selections, mirrored into a ref so the debounced flush reads current
  // values without being re-created on every keystroke.
  const selectionsRef = useRef<Record<string, Selection>>({})
  // Keys changed since the last flush. Only these rows are sent, so a single
  // Skip/Watch/Approve click no longer resends (and rewrites) the client's
  // entire decision set — the O(n)-per-click cost that caused save timeouts.
  const pendingKeysRef = useRef<Set<string>>(new Set())
  const monthsScrollerRef = useRef<HTMLDivElement | null>(null)
  const hasAutoScrolledRef = useRef(false)
  const titleBarRef = useRef<HTMLDivElement | null>(null)
  const [titleBarHeight, setTitleBarHeight] = useState(62)
  // Height of Payload's sticky `.app-header` (CMS breadcrumb bar). The month
  // section's own sticky headers must offset by this so they lock *below* the
  // CMS header rather than scrolling underneath it.
  const [appHeaderHeight, setAppHeaderHeight] = useState(0)

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
      setSuppressionNklIdsConfigured(data.suppressionNklIdsConfigured === true)
      setSelectedSuppressionNklIds(new Set(Array.isArray(data.suppressionNklIds) ? data.suppressionNklIds.map((id: string | number) => String(id)) : []))
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

  // Mirror selections into a ref so the debounced flush and retry path always
  // read current row values without re-creating the save callbacks.
  useEffect(() => { selectionsRef.current = selections }, [selections])

  // Broadcast autosave state so Payload's bottom Save button (GlimmerSaveButton,
  // a separate React tree) can mirror "Saving…" while our autosave is in flight.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('cms:external-save-state', { detail: { saving } }))
  }, [saving])

  // Clear the bottom button's mirrored state if this view unmounts mid-save so
  // it never gets stuck showing "Saving…".
  useEffect(() => () => {
    window.dispatchEvent(new CustomEvent('cms:external-save-state', { detail: { saving: false } }))
  }, [])

  useEffect(() => {
    if (suppressionNklIdsConfigured || nkls.length === 0) return
    setSelectedSuppressionNklIds(new Set(nkls.filter((nkl) => isQualifyingListName(nkl.name)).map((nkl) => String(nkl.id))))
  }, [nkls, suppressionNklIdsConfigured])

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

  const suppressionNkls = useMemo(
    () => nkls.filter((nkl) => selectedSuppressionNklIds.has(String(nkl.id))),
    [nkls, selectedSuppressionNklIds],
  )

  // Earliest review month a negative (keyword|matchType) was applied in via this
  // tool, targeting a selected suppression list. Used as informational context
  // in the already-negated panel.
  const establishedMonthByKey = useMemo(() => {
    const suppressionIds = new Set(suppressionNkls.map((nkl) => String(nkl.id)))
    const map = new Map<string, string>()
    for (const selection of Object.values(selections)) {
      if (!selection.appliedAt || !selection.appliedToNKL) continue
      const nklId = typeof selection.appliedToNKL === 'object' ? selection.appliedToNKL?.id : selection.appliedToNKL
      if (!suppressionIds.has(String(nklId))) continue
      if (selection.matchType !== 'exact' && selection.matchType !== 'phrase') continue
      const key = `${selection.negativeKeyword.toLowerCase()}|${selection.matchType}`
      const current = map.get(key)
      if (!current || selection.yearMonth < current) map.set(key, selection.yearMonth)
    }
    return map
  }, [selections, suppressionNkls])

  const suppressionNegatives = useMemo<SuppressionNegative[]>(
    () => buildSuppressionNegatives(suppressionNkls, establishedMonthByKey),
    [suppressionNkls, establishedMonthByKey],
  )
  const suppressionIndex = useMemo(
    () => buildSuppressionIndex(suppressionNegatives),
    [suppressionNegatives],
  )

  // For each search term (by normalized text) the single canonical review month
  // it should display in — the EARLIEST month it has a standing decision in —
  // plus the decision held there. A decided term shows red in that one month and
  // is hidden from every other month (even ones that also hold a decision row,
  // e.g. legacy data the old fan-out wrote across all months), giving the team
  // one clean place to see it rather than the same skip repeated down every
  // column. Derived once from selections (cheap, memoized) instead of
  // re-scanning per month.
  const decidedCanonicalByTerm = useMemo(() => {
    const map = new Map<string, { month: string; decision: Decision }>()
    for (const selection of Object.values(selections)) {
      if (Number(selection.rowIndex ?? 0) !== 0) continue
      const activeWatch = selection.decision === 'watch' && !isWatchDue(selection)
      // 'pending' is intentionally excluded so un-skipping a term (which resets
      // it to pending) makes it reappear in the other months again.
      const reviewed = selection.decision === 'approved' || selection.decision === 'skipped' || selection.decision === 'needs_review' || activeWatch
      if (!reviewed) continue
      const key = selection.searchTerm.trim().toLowerCase()
      const current = map.get(key)
      if (!current || selection.yearMonth < current.month) map.set(key, { month: selection.yearMonth, decision: selection.decision })
    }
    return map
  }, [selections])

  // Count of terms skipped per review month, surfaced in each month's header.
  // Counted by each term's canonical month so the figure matches the single red
  // row shown there and doesn't double-count legacy rows fanned across months.
  const skippedCountByMonth = useMemo(() => {
    const map = new Map<string, number>()
    for (const { month, decision } of decidedCanonicalByTerm.values()) {
      if (decision !== 'skipped') continue
      map.set(month, (map.get(month) || 0) + 1)
    }
    return map
  }, [decidedCanonicalByTerm])

  const visibleMonths = useMemo(() => {
    return months.map((month) => {
      const terms = month.terms.filter((term) => {
        const key = term.term.trim().toLowerCase()
        // A live exact negative on any active NKL covers this term everywhere.
        if (cmsExistingByKeyword.has(`${key}|exact`)) return false
        // Decided elsewhere → show only in its canonical (earliest decided)
        // month and hide it from every other month.
        const canonical = decidedCanonicalByTerm.get(key)
        if (canonical && canonical.month !== month.month) return false
        return true
      })
      // Hide terms already covered by a phrase/exact negative on a selected
      // suppression NKL, and surface them in the collapsed "Already negated"
      // section instead.
      const { visible, negated } = partitionTermsByNegation(month.month, terms, suppressionIndex)
      return { ...month, terms: visible, alreadyNegated: negated }
    })
  }, [cmsExistingByKeyword, months, decidedCanonicalByTerm, suppressionIndex])

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

  // Track the CMS app-header height so the sticky month title + column labels
  // lock directly under it. Measured from the live DOM node and kept in sync on
  // resize (the header can wrap/grow on narrow widths).
  useEffect(() => {
    const node = document.querySelector('.app-header')
    if (!(node instanceof HTMLElement)) return
    const measure = () => setAppHeaderHeight(node.getBoundingClientRect().height)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    window.addEventListener('resize', measure)
    return () => { observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [])

  // Persist a small set of changed rows (and optional deletions). `keys` are the
  // selection keys backing `rows`; on failure they are returned to the pending
  // set and retried so a transient timeout never silently drops a decision — the
  // bug that lost skipped keywords for whole months.
  const saveSelections = useCallback(async (
    rows: Selection[],
    options?: { deletions?: Array<{ yearMonth: string; searchTerm: string; rowIndex: number }>; keys?: string[]; attempt?: number },
  ) => {
    const deletions = options?.deletions
    const keys = options?.keys ?? []
    const attempt = options?.attempt ?? 0
    if (rows.length === 0 && !(deletions && deletions.length)) return
    const requestId = saveRequestId.current + 1
    saveRequestId.current = requestId
    setSaving(true)
    try {
      const res = await fetch('/api/monthly-keyword-selection/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ clientId: Number(clientId), selections: rows, ...(deletions && deletions.length ? { deletions } : {}) }),
      })
      if (!res.ok) throw new Error('Auto-save failed')
      // Only the latest save may change the status banner. Older requests can
      // finish late during rapid Skip/Watch clicks; their stale failures should
      // not put "Auto-save failed" back after a newer request has saved.
      if (saveRequestId.current === requestId) {
        setMessage((current) => (current === 'Auto-save failed' ? null : current))
      }
    } catch (error) {
      // Re-queue the changed keys so the decision is not lost, then retry once
      // automatically after a short backoff. If it still fails the keys stay
      // pending and the next interaction (or flush) will carry them again.
      for (const key of keys) pendingKeysRef.current.add(key)
      if (attempt < 2) {
        window.setTimeout(() => {
          const retryRows = keys.map((key) => selectionsRef.current[key]).filter(Boolean) as Selection[]
          for (const key of keys) pendingKeysRef.current.delete(key)
          void saveSelections(retryRows, { deletions, keys, attempt: attempt + 1 })
        }, 1500 * (attempt + 1))
      } else if (saveRequestId.current === requestId) {
        setMessage(error instanceof Error ? error.message : 'Auto-save failed')
      }
    } finally {
      if (saveRequestId.current === requestId) setSaving(false)
    }
  }, [clientId])

  // Accumulate changed keys across the debounce window, then flush only those
  // rows (read from the latest selections) in a single request.
  const queueSave = useCallback((changedKeys: string[]) => {
    for (const key of changedKeys) pendingKeysRef.current.add(key)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const keys = Array.from(pendingKeysRef.current)
      pendingKeysRef.current = new Set()
      const rows = keys.map((key) => selectionsRef.current[key]).filter(Boolean) as Selection[]
      void saveSelections(rows, { keys })
    }, 300)
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
    queueSave([key])
  }

  // The NKL target is a single choice shared across every sub-row of a search
  // term, so setting it fans the same NKL (or null) out to all rows.
  const setTargetListForTerm = (month: string, term: string, nklId: number | string | null) => {
    const next = { ...selections }
    const changedKeys: string[] = []
    for (const rowIndex of rowIndexesForTerm(month, term)) {
      const key = selectionKey(month, term, rowIndex)
      changedKeys.push(key)
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
    queueSave(changedKeys)
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
    queueSave([key])
  }

  // Delete an additional sub-row (index > 0). The primary row (0) is never
  // removable. Deletion is sent explicitly so the merge-based save prunes it.
  const removeSubRow = (month: string, term: string, rowIndex: number) => {
    if (rowIndex <= 0) return
    const key = selectionKey(month, term, rowIndex)
    const next = { ...selections }
    delete next[key]
    setSelections(next)
    void saveSelections([], { deletions: [{ yearMonth: month, searchTerm: term, rowIndex }] })
  }

  const markTermHandled = (month: string, term: string, decision: Extract<Decision, 'approved' | 'skipped' | 'needs_review'>) => {
    const key = selectionKey(month, term)
    const selection = selections[key]
    const parsed = parseNegativeKeywordInput(inputFromSelection(selection, term)) || { keyword: term, matchType: 'exact' as MatchType }
    const alreadySelected = selection?.decision === decision && !selection.appliedToNKL
    // Write the decision only to the clicked month. The editor hides a decided
    // term from every other month via decidedMonthsByTerm, so a skip no longer
    // needs to be fanned across all months (which previously made it vanish
    // from later months instead of highlighting red). Clicking the same
    // decision again toggles the term back to pending so it reappears.
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
    queueSave([key])
  }

  // Toggle a term into/out of the "watch" state. Like skip, the decision is
  // written only for the clicked month; the term is hidden from every other
  // month via decidedMonthsByTerm (active watch counts as decided), so it shows
  // once — in the month it was watched — rather than across every month.
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
    queueSave([key])
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
    // Only not-yet-applied approvals: once a selection has appliedAt it's
    // already on the list, so re-sending it would inflate the count and
    // re-stamp its history.
    const approved = Object.values(selections).filter((selection) => selection.decision === 'approved' && selection.appliedToNKL && !selection.appliedAt)
    if (approved.length === 0) return
    setApplying(true)
    let res: Response
    try {
      res = await fetch('/api/monthly-keyword-selection/apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ clientId: Number(clientId), selections: approved }),
      })
    } catch (error) {
      setApplying(false)
      setMessage(error instanceof Error ? error.message : 'Apply failed')
      return
    }
    const data = await res.json().catch(() => ({}))
    setApplying(false)
    if (res.ok) {
      const applied = data.applied || 0
      const skipped = data.skipped || 0
      const total = applied + skipped
      setMessage(`Submitted ${total} negative(s) — ${applied} newly added, ${skipped} already on the list.`)
      // Flash a transient "Saved ✓" on the Apply button so it's obvious the
      // press registered even when the screen otherwise looks unchanged.
      setAppliedJustNow(true)
      setTimeout(() => setAppliedJustNow(false), 2500)
      // Mirror the server's appliedAt stamp locally so the Apply button count
      // clears immediately without a full reload.
      const appliedAtNow = new Date().toISOString()
      setSelections((current) => {
        const next = { ...current }
        for (const selection of approved) {
          const key = selectionKey(selection.yearMonth, selection.searchTerm, selection.rowIndex ?? 0)
          if (next[key]) next[key] = { ...next[key], appliedAt: appliedAtNow }
        }
        return next
      })
      await loadNkls()
    } else {
      setMessage(data?.error || 'Apply failed')
    }
  }

  const rebuild = async () => {
    const confirmed = window.confirm(
      'Warning: Rebuild deletes this client’s cached Monthly negative KWs search-term months, then immediately re-pulls all complete months from Growth Tools / Google Ads. It does not delete your review decisions, NKLs, or negative keywords. This can take longer and should only be used if cached search-term data looks wrong. Continue?',
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

  const toggleSuppressionNkl = useCallback((id: string | number) => {
    const key = String(id)
    setSelectedSuppressionNklIds((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const saveSuppressionNkls = useCallback(async () => {
    setSuppressionSaving(true)
    try {
      const res = await fetch('/api/monthly-keyword-selection/suppression-lists', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ clientId: Number(clientId), suppressionNklIds: Array.from(selectedSuppressionNklIds) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to save suppression NKLs')
      setSuppressionNklIdsConfigured(true)
      setSelectedSuppressionNklIds(new Set(Array.isArray(data.suppressionNklIds) ? data.suppressionNklIds.map((id: string | number) => String(id)) : []))
      setMessage(`Saved ${Array.isArray(data.suppressionNklIds) ? data.suppressionNklIds.length : 0} suppression NKL${Array.isArray(data.suppressionNklIds) && data.suppressionNklIds.length === 1 ? '' : 's'}.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save suppression NKLs')
    } finally {
      setSuppressionSaving(false)
    }
  }, [clientId, selectedSuppressionNklIds])

  const visibleNkls = useMemo(() => nkls.filter((nkl) => !hiddenNklIds.has(String(nkl.id))), [hiddenNklIds, nkls])
  const hiddenNkls = useMemo(() => nkls.filter((nkl) => hiddenNklIds.has(String(nkl.id))), [hiddenNklIds, nkls])
  const approvedCount = Object.values(selections).filter((selection) => selection.decision === 'approved' && selection.appliedToNKL && !selection.appliedAt).length
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
  // "Review outcomes" = a single read-only learning log. Every term that was
  // added, updated, moved, removed, or dismissed contributes one entry showing
  // its most-recent outcome, so the original flagger/submitter can see what
  // happened. Recency = max(outcomeAt, removedAt, reviewDismissedAt).
  const reviewOutcomesByMonth = useMemo(() => {
    type OutcomeKind = 'Added' | 'Updated' | 'Moved' | 'Removed' | 'Dismissed'
    type OutcomeEntry = {
      key: string
      yearMonth: string
      searchTerm: string
      negativeKeyword: string
      matchType: MatchType
      type: OutcomeKind
      // Which canonical field this row's comment is persisted to, so an edit
      // writes back to the correct single comment field.
      source: 'outcome' | 'removed' | 'dismissed'
      rowIndex: number
      pills: OutcomeKind[]
      // detail split for placement: list move/target on the bottom-left, the
      // keyword/match-type before→after on the top-right next to the negative.
      listDetail: string
      changeDetail: string
      comment: string
      followUps: FollowUpComment[]
      by: string
      at: string
      originalHandler: string
      originalAction: 'flagged' | 'submitted'
      taggedLabels: string[]
      keywordChanged: boolean
      moved: boolean
    }
    const typeFromOutcome = (value?: string | null): OutcomeKind => {
      if (value === 'updated') return 'Updated'
      if (value === 'moved') return 'Moved'
      return 'Added'
    }
    const groups = new Map<string, OutcomeEntry[]>()
    for (const selection of Object.values(selections)) {
      const stamps: { at: string; source: 'outcome' | 'removed' | 'dismissed' }[] = []
      if (selection.outcomeAt) stamps.push({ at: String(selection.outcomeAt), source: 'outcome' })
      if (selection.removedAt) stamps.push({ at: String(selection.removedAt), source: 'removed' })
      if (selection.reviewDismissedAt) stamps.push({ at: String(selection.reviewDismissedAt), source: 'dismissed' })
      if (stamps.length === 0) continue
      const newest = stamps.sort((a, b) => b.at.localeCompare(a.at))[0]
      let entry: OutcomeEntry
      const base = {
        key: selectionKey(selection.yearMonth, selection.searchTerm, Number(selection.rowIndex ?? 0)),
        source: newest.source,
        rowIndex: Number(selection.rowIndex ?? 0),
        yearMonth: selection.yearMonth,
        searchTerm: selection.searchTerm,
        negativeKeyword: selection.negativeKeyword,
        matchType: selection.matchType,
        at: newest.at,
        pills: [] as OutcomeKind[],
        listDetail: '',
        changeDetail: '',
        taggedLabels: [] as string[],
        keywordChanged: false,
        moved: false,
      }
      if (newest.source === 'outcome') {
        const type = typeFromOutcome(selection.outcomeType)
        const detail = selection.outcomeDetail || ''
        // Server detail is ' · '-joined segments. For a move the first segment is
        // the list change ("List A → List B"); any following segments are the
        // keyword/match-type before→after. For an in-place update every segment
        // is a keyword/match change. For an add the whole string is list info.
        const segments = detail.split(' · ').map((s) => s.trim()).filter(Boolean)
        let listDetail = ''
        let changeDetail = ''
        if (type === 'Moved') {
          listDetail = segments[0] || ''
          changeDetail = segments.slice(1).join(' · ')
        } else if (type === 'Updated') {
          changeDetail = segments.join(' · ')
        } else {
          listDetail = detail
        }
        const keywordChanged = type === 'Updated' || (type === 'Moved' && changeDetail.length > 0)
        const moved = type === 'Moved'
        entry = {
          ...base,
          type,
          // Show both pills when a move also changed the keyword/match type.
          pills: moved && keywordChanged ? ['Moved', 'Updated'] : [type],
          listDetail,
          changeDetail,
          comment: selection.outcomeComment || '',
          followUps: Array.isArray(selection.outcomeFollowUpComments) ? selection.outcomeFollowUpComments : [],
          by: selection.outcomeBy || 'someone',
          originalHandler: type === 'Added' ? (selection.decidedBy || '') : (selection.appliedBy || ''),
          originalAction: type === 'Added' ? 'flagged' : 'submitted',
          keywordChanged,
          moved,
        }
      } else if (newest.source === 'removed') {
        entry = {
          ...base,
          type: 'Removed',
          pills: ['Removed'],
          comment: selection.removedComment || '',
          followUps: Array.isArray(selection.outcomeFollowUpComments) ? selection.outcomeFollowUpComments : [],
          by: selection.removedBy || 'someone',
          originalHandler: selection.appliedBy || '',
          originalAction: 'submitted',
        }
      } else {
        const taggedIds = (selection.reviewCommentTaggedUserIds || '').split(',').map((id) => id.trim()).filter(Boolean)
        entry = {
          ...base,
          type: 'Dismissed',
          pills: ['Dismissed'],
          comment: selection.reviewComment || '',
          followUps: Array.isArray(selection.outcomeFollowUpComments) ? selection.outcomeFollowUpComments : [],
          by: selection.reviewDismissedBy || 'someone',
          originalHandler: selection.decidedBy || '',
          originalAction: 'flagged',
          taggedLabels: taggedIds.map((id) => teammates.find((t) => t.id === id)?.label || `User ${id}`),
        }
      }
      const list = groups.get(selection.yearMonth) || []
      list.push(entry)
      groups.set(selection.yearMonth, list)
    }
    return Array.from(groups.entries())
      .sort((a, b) => String(b[0]).localeCompare(String(a[0])))
      .map(([month, items]) => ({
        month,
        items: items.sort((a, b) => b.at.localeCompare(a.at)),
      }))
  }, [selections, teammates])
  const reviewOutcomesCount = useMemo(
    () => Object.values(selections).filter((s) => s.outcomeAt || s.removedAt || s.reviewDismissedAt).length,
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
    movedHint?: boolean,
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
      const verb = data.moved || movedHint ? 'moved' : 'updated'
      setMessage(data.notified ? `Negative ${verb} · original submitter notified.` : `Negative keyword list ${verb}.`)
    }
    await Promise.all([load(), loadNkls()])
  }, [clientId, load, loadNkls])

  // Pending edits from the Submitted negatives rows, keyed by selection key.
  // Rows report their dirty edit (or null when clean) so the "Update all" button
  // can apply every change at once without a per-row comment prompt.
  type PendingRowEdit = { newKeyword: string; newMatchType: MatchType; newNklId: number | string | null }
  const [pendingRowEdits, setPendingRowEdits] = useState<Record<string, PendingRowEdit>>({})
  const registerRowEdit = useCallback((key: string, edit: PendingRowEdit | null) => {
    setPendingRowEdits((current) => {
      if (!edit) {
        if (!(key in current)) return current
        const next = { ...current }
        delete next[key]
        return next
      }
      const prev = current[key]
      if (prev && prev.newKeyword === edit.newKeyword && prev.newMatchType === edit.newMatchType && String(prev.newNklId) === String(edit.newNklId)) return current
      return { ...current, [key]: edit }
    })
  }, [])
  const pendingEditCount = Object.keys(pendingRowEdits).length

  // Rows ticked for removal via their checkbox. "Update all" removes these (no
  // comment) alongside applying every pending keyword/match/list edit. Use a
  // row's own Remove button when a specific removal note is wanted.
  const [pendingRemovals, setPendingRemovals] = useState<Set<string>>(new Set())
  const toggleRowRemoval = useCallback((key: string, marked: boolean) => {
    setPendingRemovals((current) => {
      if (marked === current.has(key)) return current
      const next = new Set(current)
      if (marked) next.add(key)
      else next.delete(key)
      return next
    })
  }, [])
  const removalCount = pendingRemovals.size
  // A removal-marked row reports a null edit, so edits and removals never double
  // count. The button acts on the sum of both.
  const pendingActionCount = pendingEditCount + removalCount

  // Apply every pending Submitted-negatives edit and removal in one pass. No
  // comment prompt — use a row's own Update list / Remove button when a specific
  // teaching note is wanted.
  const [updatingAll, setUpdatingAll] = useState(false)
  const updateAllSubmitted = useCallback(async () => {
    const editEntries = Object.entries(pendingRowEdits).filter(([key]) => !pendingRemovals.has(key))
    const removalKeys = Array.from(pendingRemovals)
    if (editEntries.length === 0 && removalKeys.length === 0) return
    setUpdatingAll(true)
    let updated = 0
    let removed = 0
    let failed = 0
    try {
      for (const key of removalKeys) {
        const item = selections[key]
        if (!item) continue
        const res = await fetch('/api/monthly-keyword-selection/revise', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            clientId: Number(clientId),
            yearMonth: item.yearMonth,
            searchTerm: item.searchTerm,
            rowIndex: Number(item.rowIndex ?? 0),
            action: 'remove',
          }),
        })
        if (res.ok) removed += 1
        else failed += 1
      }
      for (const [key, edit] of editEntries) {
        const item = selections[key]
        if (!item) continue
        const res = await fetch('/api/monthly-keyword-selection/revise', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            clientId: Number(clientId),
            yearMonth: item.yearMonth,
            searchTerm: item.searchTerm,
            rowIndex: Number(item.rowIndex ?? 0),
            action: 'update',
            newKeyword: edit.newKeyword,
            newMatchType: edit.newMatchType,
            ...(edit.newNklId != null ? { newNklId: edit.newNklId } : {}),
          }),
        })
        if (res.ok) updated += 1
        else failed += 1
      }
      setPendingRowEdits({})
      setPendingRemovals(new Set())
      const parts: string[] = []
      if (updated > 0) parts.push(`updated ${updated}`)
      if (removed > 0) parts.push(`removed ${removed}`)
      const summary = parts.length > 0 ? parts.join(' · ') : 'no changes'
      setMessage(failed === 0 ? `Done — ${summary}.` : `Done — ${summary} · ${failed} failed.`)
      await Promise.all([load(), loadNkls()])
    } finally {
      setUpdatingAll(false)
    }
  }, [pendingRowEdits, pendingRemovals, selections, clientId, load, loadNkls])

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

  // Edit the single canonical comment on one Review-outcomes row, or append a
  // follow-up reply that can retag teammates for back-and-forth learning.
  const saveOutcomeComment = useCallback(async (
    entry: { yearMonth: string; searchTerm: string; rowIndex: number; source: 'outcome' | 'removed' | 'dismissed' },
    comment: string,
    taggedUserIds: string[] = [],
    mode: 'replace' | 'append' = 'replace',
  ): Promise<boolean> => {
    const res = await fetch('/api/monthly-keyword-selection/outcome-comment', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ clientId: Number(clientId), yearMonth: entry.yearMonth, searchTerm: entry.searchTerm, rowIndex: entry.rowIndex, source: entry.source, comment, taggedUserIds, mode }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setMessage(data?.error || 'Failed to save comment'); return false }
    const field = entry.source === 'outcome' ? 'outcomeComment' : entry.source === 'removed' ? 'removedComment' : 'reviewComment'
    const key = selectionKey(entry.yearMonth, entry.searchTerm, entry.rowIndex)
    setSelections((current) => ({
      ...current,
      [key]: mode === 'append'
        ? { ...current[key], outcomeFollowUpComments: Array.isArray(data.followUps) ? data.followUps : current[key]?.outcomeFollowUpComments }
        : { ...current[key], [field]: comment },
    }))
    setMessage(mode === 'append'
      ? (data.notified > 0 ? `Reply added · ${data.notified} teammate${data.notified === 1 ? '' : 's'} notified.` : 'Reply added.')
      : 'Comment saved.')
    return true
  }, [clientId])

  // Dismiss a "needs review" term as feedback: resolves it as skipped (so it
  // leaves the queue and won't reappear), retains the comment, and notifies the
  // auto-tracked original handler plus any tagged teammates.
  const dismissReview = useCallback(async (
    item: Selection,
    comment: string,
    taggedUserIds: string[],
  ) => {
    const res = await fetch('/api/monthly-keyword-selection/dismiss-review', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ clientId: Number(clientId), yearMonth: item.yearMonth, searchTerm: item.searchTerm, rowIndex: Number(item.rowIndex ?? 0), comment, taggedUserIds }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setMessage(data?.error || 'Failed to dismiss with feedback'); return }
    setMessage(data.notified > 0 ? `Feedback saved · ${data.notified} teammate${data.notified === 1 ? '' : 's'} notified.` : 'Feedback saved.')
    await load()
  }, [clientId, load])

  // From the Needs review tab, picking a target list applies the negative
  // immediately (writes it to the NKL + stamps appliedAt) so it lands in the
  // Submitted negatives tab right away — rather than only staging it for the
  // separate top "Apply" button, which made the term appear to vanish.
  const applyNeedsReviewTarget = useCallback(async (item: Selection, nklId: string) => {
    const nklName = nklNameById.get(String(nklId)) || 'the list'
    // Optional teaching note. With or without it the flagger is notified; a note
    // gives them the “why”, which surfaces in the read-only Review outcomes tab.
    const note = window.prompt(
      `Optionally add a note for whoever flagged “${item.searchTerm}” explaining why it's being added to ${nklName}. They'll be notified either way.`,
      '',
    )
    if (note === null) return
    const comment = note.trim()
    const res = await fetch('/api/monthly-keyword-selection/apply', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        clientId: Number(clientId),
        ...(comment ? { comment } : {}),
        selections: [{
          yearMonth: item.yearMonth,
          searchTerm: item.searchTerm,
          rowIndex: Number(item.rowIndex ?? 0),
          negativeKeyword: item.negativeKeyword,
          matchType: item.matchType,
          appliedToNKL: nklId,
        }],
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setMessage(data?.error || 'Failed to add negative to the list'); return }
    setMessage(data.applied > 0 ? `Added “${item.negativeKeyword}” to ${nklName} · flagger notified · see Submitted negatives.` : `“${item.negativeKeyword}” is already on ${nklName}.`)
    await Promise.all([load(), loadNkls()])
  }, [clientId, load, loadNkls, nklNameById])
  const monthsToRender = activeMonth ? visibleMonths.filter((month) => month.month === activeMonth) : visibleMonths
  // Fixed, content-sized column tracks (no fractional units) so the grid stays
  // compact and doesn't stretch to fill the full-bleed width — the whole review
  // form fits without horizontal scrolling. Search term and negative keyword are
  // sized to typical terms (text wraps if longer); each NKL column is just wide
  // enough for its "Add negative" toggle to sit on one row. The focused month
  // section grows to max-content so the card border always wraps the full grid.
  const gridGap = 6
  const gridTemplate = `170px 292px 200px 64px repeat(${Math.max(visibleNkls.length, 1)}, 104px)`

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
              title="Admin only: deletes cached Monthly negative KWs search-term months, then re-pulls all complete months from Growth Tools / Google Ads. Does not delete review decisions, NKLs, or negative keywords."
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

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(420px, 1fr) minmax(360px, 0.9fr)', gap: 12, alignItems: 'start', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', minHeight: 66, padding: 12, border: '1px solid var(--theme-elevation-150)', borderRadius: 8 }}>
          <button type="button" onClick={applyApproved} disabled={approvedCount === 0 || applying} style={{ padding: '8px 12px' }}>{applying ? 'Saving…' : appliedJustNow ? 'Saved ✓' : `Apply ${approvedCount} added negative${approvedCount === 1 ? '' : 's'}`}</button>
          <span style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>{saving ? 'Saving…' : 'Auto-saved'} · Open a month, then tick the NKL column for each search term you want to add.</span>
          {hiddenNkls.length > 0 && (
            <button type="button" onClick={() => setHiddenNklIds(new Set())} style={{ padding: '6px 10px', fontSize: 12 }}>Show {hiddenNkls.length} hidden NKL{hiddenNkls.length === 1 ? '' : 's'}</button>
          )}
        </div>

        <section style={{ border: '1px solid var(--theme-elevation-150)', borderRadius: 8, background: 'var(--theme-bg)', overflow: 'hidden' }}>
          <button
            type="button"
            onClick={() => setSuppressionPanelOpen((current) => !current)}
            style={{ width: '100%', minHeight: 66, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 12px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
          >
            <span style={{ display: 'grid', gap: 2 }}>
              <strong>Suppression NKLs</strong>
              <span style={{ fontSize: 12, color: 'var(--theme-elevation-600)' }}>Selected NKLs hide matching search terms from the monthly review list based on match type.</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--theme-elevation-600)', whiteSpace: 'nowrap' }}>
              {selectedSuppressionNklIds.size}/{nkls.length} selected {suppressionPanelOpen ? '▴' : '▾'}
            </span>
          </button>
          {suppressionPanelOpen && (
            <div style={{ display: 'grid', gap: 10, padding: 12, borderTop: '1px solid var(--theme-elevation-150)', background: 'var(--theme-elevation-50)' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {nkls.map((nkl) => {
                  const checked = selectedSuppressionNklIds.has(String(nkl.id))
                  return (
                    <label key={nkl.id} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '6px 8px', borderRadius: 6, border: checked ? '1px solid #4f46e5' : '1px solid var(--theme-elevation-150)', background: checked ? '#eef2ff' : 'var(--theme-bg)', cursor: 'pointer', fontSize: 12 }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleSuppressionNkl(nkl.id)} />
                      {nkl.name || 'Unnamed NKL'}
                    </label>
                  )
                })}
                {nkls.length === 0 && <span style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>No active NKLs found for this client.</span>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'var(--theme-elevation-500)' }}>{suppressionNklIdsConfigured ? 'Saved custom suppression NKLs for this client.' : 'Defaulting to account-wide, competitor, and brand NKLs until saved.'}</span>
                <button type="button" onClick={saveSuppressionNkls} disabled={suppressionSaving} style={{ padding: '7px 12px', fontSize: 12 }}>
                  {suppressionSaving ? 'Saving…' : 'Save suppression NKLs'}
                </button>
              </div>
            </div>
          )}
        </section>
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
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, border: 'none', borderBottom: activeTab === 'removed' ? '2px solid #6366f1' : '2px solid transparent', background: 'transparent', color: activeTab === 'removed' ? '#4f46e5' : 'var(--theme-elevation-500)', cursor: 'pointer' }}
        >
          Review outcomes
          {reviewOutcomesCount > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: '#6366f1', color: '#fff', fontSize: 11, fontWeight: 700 }}>{reviewOutcomesCount}</span>
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
                onSetTarget={(nklId) => applyNeedsReviewTarget(item, nklId)}
                onWatch={(horizon) => setWatch(item.yearMonth, item.searchTerm, horizon)}
                onDismiss={(comment, taggedUserIds) => dismissReview(item, comment, taggedUserIds)}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--theme-elevation-600)', flex: '1 1 320px' }}>
              Every negative keyword that was applied to a list, grouped by review month. Edit the keyword — wrap it in <strong>'single quotes'</strong> for a phrase match, leave it bare for exact — change its list, or tick <strong>Remove</strong>, then press <strong>Update all</strong> to apply every edit and removal at once (no note). Use a row's own <strong>Update list</strong> / <strong>Remove</strong> button when you want to add a comment for that negative.
            </p>
            <button
              type="button"
              onClick={updateAllSubmitted}
              disabled={pendingActionCount === 0 || updatingAll}
              title="Apply every pending edit and ticked removal at once. No note is recorded — use a row's Update list / Remove button when you want to add a comment."
              style={{ padding: '8px 14px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', flex: '0 0 auto', color: pendingActionCount > 0 ? '#fff' : undefined, background: pendingActionCount > 0 ? '#0f766e' : undefined, borderColor: pendingActionCount > 0 ? '#0f766e' : undefined }}
            >{updatingAll ? 'Updating…' : `Update all${pendingActionCount > 0 ? ` (${pendingActionCount})` : ''}`}</button>
          </div>
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
                    onUpdate={(newKeyword, newMatchType, newNklId, comment) => reviseSubmitted(item, 'update', { newKeyword, newMatchType, ...(newNklId != null ? { newNklId } : {}), ...(comment ? { comment } : {}) }, newNklId != null)}
                    onDirtyChange={registerRowEdit}
                    markedForRemoval={pendingRemovals.has(selectionKey(item.yearMonth, item.searchTerm, Number(item.rowIndex ?? 0)))}
                    onToggleRemove={toggleRowRemoval}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {activeTab === 'removed' && reviewOutcomesCount === 0 && (
        <div style={{ padding: 24, border: '1px solid var(--theme-elevation-150)', borderRadius: 10, color: 'var(--theme-elevation-500)', textAlign: 'center' }}>
          Outcomes from the Needs review and Submitted negatives tabs collect here so whoever flagged or submitted a term can see what happened and why.
        </div>
      )}

      {activeTab === 'removed' && reviewOutcomesCount > 0 && (
        <div style={{ display: 'grid', gap: 18 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--theme-elevation-600)' }}>
            A read-only learning log. Every time a flagged or submitted term is added, updated, moved, removed, or dismissed, the outcome is recorded here — so whoever originally flagged or submitted it can see what happened and why. Edit terms in the <strong>Needs review</strong> and <strong>Submitted negatives</strong> tabs.
          </p>
          {reviewOutcomesByMonth.map(({ month, items }) => (
            <section key={month} style={{ border: '1px solid var(--theme-elevation-150)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--theme-elevation-150)', fontWeight: 700, background: 'var(--theme-elevation-50)' }}>
                {monthLabel(month)} · {items.length} outcome{items.length === 1 ? '' : 's'}
              </div>
              <div style={{ display: 'grid', gap: 5, padding: 10 }}>
                {items.map((item) => {
                  const attribution = `By ${item.by}${item.at ? ` on ${new Date(item.at).toLocaleDateString()}` : ''}`
                    + (item.originalHandler ? ` · originally ${item.originalAction} by ${item.originalHandler}` : '')
                    + (item.taggedLabels.length > 0 ? ` · tagged ${item.taggedLabels.map((l) => `@${l}`).join(', ')}` : '')
                  const negativeLabel = item.type === 'Added' ? 'Negative keyword added:'
                    : item.type === 'Updated' ? 'Updated negative keyword:'
                    : 'Negative keyword:'
                  return (
                  <div
                    key={item.key}
                    style={{ display: 'grid', gap: 4, padding: '6px 10px', borderRadius: 6, background: 'var(--theme-elevation-100)', border: '1px solid var(--theme-elevation-200)' }}
                  >
                    {/* Top row: type pill(s) + search term on the left; the
                        resulting negative, its 'keyword changed' flag and the
                        match/keyword before→after on the right where relevant. */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        {item.pills.map((p) => {
                          const pill = OUTCOME_PILL[p]
                          return <span key={p} style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: pill.bg, color: pill.fg }}>{p}</span>
                        })}
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{item.searchTerm}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 11, color: 'var(--theme-elevation-500)' }}>{negativeLabel} </span>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{item.negativeKeyword} <span style={{ color: 'var(--theme-elevation-500)', fontWeight: 400 }}>({matchTypeLabel(item.matchType)})</span></span>
                      </div>
                    </div>
                    {/* Second row: where it was added / moved to (with the
                        'moved to a new NKL' flag) on the left; the 'negative
                        keyword changed' flag + match/keyword before→after on the
                        right. */}
                    {(item.listDetail || item.moved || item.keywordChanged) && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          {item.listDetail && <span style={{ fontSize: 12, color: 'var(--theme-elevation-600)' }}>{item.listDetail}</span>}
                          {item.moved && (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: '#fee2e2', color: '#dc2626' }}>Moved to a new NKL</span>
                          )}
                        </div>
                        {item.keywordChanged && (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: '#fee2e2', color: '#dc2626' }}>Negative keyword changed</span>
                            {item.changeDetail && <span style={{ fontSize: 11, color: 'var(--theme-elevation-600)' }}>{item.changeDetail}</span>}
                          </div>
                        )}
                      </div>
                    )}
                    {/* Comment (near full width, editable) with attribution. */}
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                      <OutcomeCommentEditor
                        comment={item.comment}
                        followUps={item.followUps}
                        teammates={teammates}
                        onSave={(comment) => saveOutcomeComment({ yearMonth: item.yearMonth, searchTerm: item.searchTerm, rowIndex: item.rowIndex, source: item.source }, comment)}
                        onReply={(comment, taggedUserIds) => saveOutcomeComment({ yearMonth: item.yearMonth, searchTerm: item.searchTerm, rowIndex: item.rowIndex, source: item.source }, comment, taggedUserIds, 'append')}
                      />
                      <span style={{ fontSize: 11, color: 'var(--theme-elevation-500)', whiteSpace: 'nowrap', flex: '0 0 auto', textAlign: 'right' }}>{attribution}</span>
                    </div>
                  </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <div
        ref={monthsScrollerRef}
        style={activeMonth
          // Edit-month view: a single wide card. Turn the scroller into a
          // bounded region pinned just under the CMS app-header so its internal
          // sticky headers (month title + column labels) lock there while the
          // term rows scroll. overflow:auto handles both the long vertical list
          // and the wide NKL columns. (When this container is the horizontal
          // overflow:auto scroller AND not bounded, sticky children reference it
          // but it scrolls away with the page — hence the bounded+sticky region.)
          ? { display: activeTab === 'months' ? 'block' : 'none', position: 'sticky', top: appHeaderHeight, maxHeight: `calc(100vh - ${appHeaderHeight}px)`, overflow: 'auto', paddingBottom: 20, scrollBehavior: 'smooth' }
          // Overview: horizontal strip of month cards.
          : { display: activeTab === 'months' ? 'flex' : 'none', gap: 14, overflowX: 'auto', paddingBottom: 20, scrollBehavior: 'smooth' }
        }
      >
        {monthsToRender.map((month) => {
          const isFocused = activeMonth === month.month
          return (
          <section key={month.month} aria-label={`${monthLabel(month.month)}${month.reviewComplete ? ' complete' : ''}`} style={{ minWidth: isFocused ? '100%' : 340, maxWidth: isFocused ? 'none' : 340, width: isFocused ? 'max-content' : undefined, border: '1px solid var(--theme-elevation-150)', borderRadius: 10, background: month.reviewComplete ? 'var(--theme-elevation-50)' : 'var(--theme-bg)', opacity: month.reviewComplete ? 0.78 : 1 }}>
            <div ref={isFocused ? titleBarRef : undefined} style={{ position: 'sticky', top: 0, zIndex: 3, padding: 12, borderBottom: '1px solid var(--theme-elevation-150)', background: 'inherit', borderRadius: '10px 10px 0 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <strong>{monthLabel(month.month)}</strong>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button type="button" onClick={() => setActiveMonth(isFocused ? null : month.month)} style={{ padding: '4px 8px', fontSize: 12 }}>{isFocused ? 'Close' : 'Edit month'}</button>
                  {isFocused && month.alreadyNegated.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowAlreadyNegated((current) => !current)}
                      title="Show search terms already covered by a selected suppression NKL"
                      style={{ padding: '4px 8px', fontSize: 12, whiteSpace: 'nowrap', color: showAlreadyNegated ? '#3730a3' : undefined, borderColor: showAlreadyNegated ? '#a5b4fc' : undefined, background: showAlreadyNegated ? '#e0e7ff' : undefined }}
                    >{showAlreadyNegated ? 'Hide' : 'Show'} already negated ({month.alreadyNegated.length})</button>
                  )}
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                    <input type="checkbox" checked={month.reviewComplete} onChange={(event) => void toggleComplete(month.month, event.target.checked)} />
                    {month.reviewComplete ? '✓ Complete' : 'Complete'}
                  </label>
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--theme-elevation-500)', marginTop: 4 }}>
                {month.terms.length} qualifying term{month.terms.length === 1 ? '' : 's'}
                {month.alreadyNegated.length > 0 ? ` · refined list (${month.alreadyNegated.length} already-negated hidden)` : ''}
                {(skippedCountByMonth.get(month.month) || 0) > 0 ? ` · ${skippedCountByMonth.get(month.month)} skipped` : ''}
                {month.reviewComplete ? ' · Locked until unchecked' : ''}
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
              {isFocused && showAlreadyNegated && month.alreadyNegated.length > 0 && (
                <div style={{ border: '1px solid #c7d2fe', borderRadius: 8, background: '#eef2ff', display: 'grid', gap: 4, padding: 10 }}>
                  <p style={{ margin: '0 0 4px', fontSize: 11, color: '#3730a3' }}>
                    <strong>Already negated ({month.alreadyNegated.length})</strong> — filtered out because a negative on a selected suppression NKL
                    already covers them. The terms below are the refined list still needing review.
                  </p>
                  {month.alreadyNegated.map(({ term, negative }) => (
                    <div key={`${term.term}|${negative.keyword}|${negative.matchType}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', padding: '5px 8px', borderRadius: 6, background: 'var(--theme-elevation-0)', border: '1px solid var(--theme-elevation-100)' }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{term.term}</span>
                      <span style={{ fontSize: 11, color: 'var(--theme-elevation-500)' }}>
                        {negative.keyword} ({matchTypeLabel(negative.matchType)}) · {negative.listName}
                      </span>
                    </div>
                  ))}
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

function NeedsReviewRow({ item, nkls, teammates, onSetTarget, onWatch, onDismiss, onSaveComment }: {
  item: Selection
  nkls: Nkl[]
  teammates: Teammate[]
  onSetTarget: (nklId: string) => void
  onWatch: (horizon: WatchHorizon | null) => void
  onDismiss: (comment: string, taggedUserIds: string[]) => Promise<void>
  onSaveComment: (comment: string, taggedUserIds: string[]) => Promise<void>
}) {
  const initialTags = (item.reviewCommentTaggedUserIds || '').split(',').map((id) => id.trim()).filter(Boolean)
  const [comment, setComment] = useState(item.reviewComment || '')
  const [tags, setTags] = useState<string[]>(initialTags)
  const [savingComment, setSavingComment] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const [watchHorizon, setWatchHorizon] = useState<WatchHorizon>(DEFAULT_WATCH_HORIZON)
  // @-mention autocomplete: track the partial token being typed after an '@'
  // and where it starts in the textarea, so a picked teammate replaces it.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionStart, setMentionStart] = useState<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const dirty = comment !== (item.reviewComment || '') || tags.join(',') !== initialTags.join(',')

  const refreshMentionState = (value: string, caret: number): void => {
    const upToCaret = value.slice(0, caret)
    const match = upToCaret.match(/@([\p{L}\p{N}_.-]*)$/u)
    if (match) {
      setMentionStart(caret - match[0].length)
      setMentionQuery(match[1] ?? '')
    } else {
      setMentionStart(null)
      setMentionQuery(null)
    }
  }

  const mentionSuggestions = mentionQuery === null
    ? []
    : teammates
        .filter((mate) => mate.label.toLowerCase().startsWith(mentionQuery.toLowerCase()))
        .slice(0, 6)

  const insertMention = (mate: Teammate): void => {
    const caret = textareaRef.current?.selectionStart ?? comment.length
    const start = mentionStart ?? caret
    const before = comment.slice(0, start)
    const after = comment.slice(caret)
    const insert = `@${mate.label} `
    const next = `${before}${insert}${after}`
    setComment(next)
    setTags((current) => current.includes(mate.id) ? current : [...current, mate.id])
    setMentionStart(null)
    setMentionQuery(null)
    requestAnimationFrame(() => {
      const pos = (before + insert).length
      const node = textareaRef.current
      if (node) { node.focus(); node.setSelectionRange(pos, pos) }
    })
  }

  const handleSave = async (): Promise<void> => {
    setSavingComment(true)
    try { await onSaveComment(comment, tags) } finally { setSavingComment(false) }
  }
  const handleDismiss = async (): Promise<void> => {
    setDismissing(true)
    try { await onDismiss(comment, tags) } finally { setDismissing(false) }
  }

  const taggedLabels = tags.map((id) => teammates.find((mate) => mate.id === id)?.label).filter(Boolean) as string[]

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '8px 10px', borderRadius: 6, background: 'var(--theme-elevation-0)', border: '1px solid var(--theme-elevation-100)', alignItems: 'center' }}>
      <span style={{ fontSize: 11, color: 'var(--theme-elevation-600)', flex: '0 0 auto', minWidth: 56 }}>{monthLabel(item.yearMonth)}</span>
      <div style={{ flex: '1 1 160px', minWidth: 140 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{item.searchTerm}</div>
        <div style={{ fontSize: 11, color: 'var(--theme-elevation-500)' }}>→ {item.negativeKeyword} · {matchTypeLabel(item.matchType)}</div>
      </div>
      <select
        defaultValue=""
        onChange={(event) => { if (event.target.value) onSetTarget(event.target.value) }}
        title="Add this term as a negative keyword in the chosen list"
        style={{ fontSize: 11, padding: '4px 6px', flex: '0 1 150px', minWidth: 120 }}
      >
        <option value="" disabled>Set as negative in…</option>
        {nkls.map((nkl) => <option key={nkl.id} value={String(nkl.id)}>{nkl.name}</option>)}
      </select>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flex: '0 0 auto' }}>
        <button
          type="button"
          onClick={() => onWatch(watchHorizon)}
          title="Watch this term instead of resolving it. It is NOT added as a negative and keeps appearing across months until the re-check horizon passes, when its conversion performance is reviewed."
          style={{ padding: '4px 8px', fontSize: 11, lineHeight: 1.2, whiteSpace: 'nowrap', color: '#1d4ed8', borderColor: '#93c5fd', background: '#dbeafe' }}
        >👁 Watch</button>
        <select
          value={watchHorizon}
          onChange={(event) => setWatchHorizon(Number(event.target.value) as WatchHorizon)}
          title="Months until performance re-check"
          style={{ fontSize: 11, padding: '2px 3px' }}
        >
          {WATCH_HORIZONS.map((h) => <option key={h} value={h}>{h}mo</option>)}
        </select>
      </span>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flex: '0 0 auto' }}>
        <button type="button" onClick={handleSave} disabled={!dirty || savingComment} title="Save this comment and tags without resolving the term — keeps it in the Needs review queue." style={{ padding: '4px 12px', fontSize: 11, whiteSpace: 'nowrap' }}>{savingComment ? 'Saving…' : 'Save'}</button>
        <button
          type="button"
          onClick={handleDismiss}
          disabled={dismissing}
          title="Dismiss this term: saves the comment as feedback, resolves it so it won't appear in future months, and notifies whoever flagged it."
          style={{ padding: '4px 12px', fontSize: 11, whiteSpace: 'nowrap', color: '#92400e', borderColor: '#fcd34d', background: '#fef3c7' }}
        >{dismissing ? 'Dismissing…' : 'Dismiss'}</button>
      </div>
      <div style={{ flex: '1 1 100%', position: 'relative' }}>
        <textarea
          ref={textareaRef}
          value={comment}
          placeholder="Comment for the team — type @ to tag someone…"
          rows={2}
          onChange={(event) => { setComment(event.target.value); refreshMentionState(event.target.value, event.target.selectionStart ?? event.target.value.length) }}
          onKeyUp={(event) => refreshMentionState(event.currentTarget.value, event.currentTarget.selectionStart ?? event.currentTarget.value.length)}
          onClick={(event) => refreshMentionState(event.currentTarget.value, event.currentTarget.selectionStart ?? event.currentTarget.value.length)}
          onBlur={() => { window.setTimeout(() => { setMentionStart(null); setMentionQuery(null) }, 150) }}
          style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', fontSize: 12, resize: 'vertical', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.4 }}
        />
        {mentionSuggestions.length > 0 && (
          <div style={{ position: 'absolute', zIndex: 10, top: '100%', left: 0, minWidth: 200, maxWidth: 320, background: 'var(--theme-elevation-0)', border: '1px solid var(--theme-elevation-200)', borderRadius: 6, boxShadow: '0 6px 18px rgba(0,0,0,0.14)', overflow: 'hidden' }}>
            {mentionSuggestions.map((mate) => (
              <button
                key={mate.id}
                type="button"
                onMouseDown={(event) => { event.preventDefault(); insertMention(mate) }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', fontSize: 12, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--theme-text)' }}
              >@{mate.label}</button>
            ))}
          </div>
        )}
      </div>
      {taggedLabels.length > 0 && (
        <span style={{ fontSize: 11, color: '#0f766e', flex: '1 1 100%' }}>Tagging {taggedLabels.map((label) => `@${label}`).join(', ')}</span>
      )}
      {item.reviewCommentBy && item.reviewCommentAt && (
        <span style={{ fontSize: 11, color: 'var(--theme-elevation-500)', flex: '1 1 100%' }}>Last by {item.reviewCommentBy} · {new Date(item.reviewCommentAt).toLocaleString('en-AU')}</span>
      )}
    </div>
  )
}

function SubmittedRow({ item, nklId, nklName, nkls, onRemove, onUpdate, onDirtyChange, markedForRemoval, onToggleRemove }: {
  item: Selection
  nklId: number | string | null
  nklName: string
  nkls: Nkl[]
  onRemove: (comment?: string) => Promise<void>
  onUpdate: (newKeyword: string, newMatchType: MatchType, newNklId: number | string | null, comment?: string) => Promise<void>
  onDirtyChange: (key: string, edit: { newKeyword: string; newMatchType: MatchType; newNklId: number | string | null } | null) => void
  markedForRemoval: boolean
  onToggleRemove: (key: string, marked: boolean) => void
}) {
  // Single input drives both keyword text and match type, mirroring the Monthly
  // review tab: bare word = exact, 'word' = phrase. The resolved match type is
  // surfaced as small blue text rather than a separate dropdown.
  const [input, setInput] = useState(inputFromSelection(item, item.negativeKeyword))
  const parsed = parseNegativeKeywordInput(input) || { keyword: item.negativeKeyword, matchType: 'exact' as MatchType }
  const keyword = parsed.keyword
  const matchType = parsed.matchType
  const [targetNklId, setTargetNklId] = useState<string>(nklId != null ? String(nklId) : '')
  const [busy, setBusy] = useState(false)
  const listChanged = targetNklId !== '' && targetNklId !== (nklId != null ? String(nklId) : '')
  const dirty = keyword.trim() !== item.negativeKeyword || matchType !== item.matchType || listChanged

  // Report this row's pending edit (or null when clean) to the parent so the
  // "Update all" button can apply every change at once without a comment prompt.
  const rowKey = selectionKey(item.yearMonth, item.searchTerm, Number(item.rowIndex ?? 0))
  useEffect(() => {
    // A row ticked for removal reports no edit so removals and edits never
    // double-count in the bulk action.
    if (!markedForRemoval && dirty && keyword.trim()) {
      onDirtyChange(rowKey, { newKeyword: keyword.trim(), newMatchType: matchType as MatchType, newNklId: listChanged ? targetNklId : null })
    } else {
      onDirtyChange(rowKey, null)
    }
    return () => onDirtyChange(rowKey, null)
  }, [rowKey, markedForRemoval, dirty, keyword, matchType, listChanged, targetNklId, onDirtyChange])

  const handleUpdate = async (): Promise<void> => {
    if (!keyword.trim()) return
    // Optional teaching note. The original submitter is notified either way; a
    // note explains the change and surfaces in the read-only Review outcomes tab.
    const note = window.prompt(
      `Optionally add a note for whoever submitted “${item.negativeKeyword}” explaining this ${listChanged ? 'move' : 'change'}. ${item.appliedBy ? `${item.appliedBy} will be notified.` : 'They will be notified.'}`.trim(),
      '',
    )
    if (note === null) return
    const comment = note.trim() || undefined
    setBusy(true)
    try { await onUpdate(keyword.trim(), matchType as MatchType, listChanged ? targetNklId : null, comment) } finally { setBusy(false) }
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

  // A single 10px-tall caption sits under the keyword input (the match type).
  // Reserve the same height under the select and buttons so every control's box
  // lines up on one centre line regardless of the taller search-term cell.
  const captionSpacer = <span style={{ fontSize: 10, lineHeight: '14px', visibility: 'hidden' }}>.</span>
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px 240px 92px auto', gap: 10, alignItems: 'center', padding: '8px 10px', borderRadius: 6, background: markedForRemoval ? '#fff7f7' : 'var(--theme-elevation-0)', border: markedForRemoval ? '1px solid #fecaca' : '1px solid var(--theme-elevation-100)' }}>
      <div>
        <div style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>Search term</div>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{item.searchTerm}</div>
        <div style={{ fontSize: 11, color: '#0f766e' }}>added to {nklName}</div>
      </div>
      <div style={{ display: 'grid', gap: 2 }}>
        <input
          value={input}
          disabled={markedForRemoval}
          onChange={(event) => setInput(event.target.value)}
          title="Type the negative keyword. Wrap it in 'single quotes' for a phrase match; leave bare for an exact match."
          style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', fontSize: 12, textDecoration: markedForRemoval ? 'line-through' : undefined, opacity: markedForRemoval ? 0.6 : 1 }}
        />
        <span style={{ fontSize: 10, lineHeight: '14px', color: '#0369a1' }}>{matchTypeLabel(matchType)}</span>
      </div>
      <div style={{ display: 'grid', gap: 2 }}>
        <select
          value={targetNklId}
          disabled={markedForRemoval}
          onChange={(event) => setTargetNklId(event.target.value)}
          title="Move this negative to a different list"
          style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '6px 7px', borderColor: listChanged ? '#0f766e' : undefined, opacity: markedForRemoval ? 0.6 : 1 }}
        >
          {nklId != null && !nkls.some((nkl) => String(nkl.id) === String(nklId)) && (
            <option value={String(nklId)}>{nklName}</option>
          )}
          {nkls.map((nkl) => <option key={nkl.id} value={String(nkl.id)}>{nkl.name}</option>)}
        </select>
        {captionSpacer}
      </div>
      <div style={{ display: 'grid', gap: 2 }}>
        <label title="Tick to remove this negative from its list when you press Update all (no note recorded)." style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', color: markedForRemoval ? '#b91c1c' : 'var(--theme-elevation-600)' }}>
          <input type="checkbox" checked={markedForRemoval} onChange={(event) => onToggleRemove(rowKey, event.target.checked)} />
          Remove
        </label>
        {captionSpacer}
      </div>
      <div style={{ display: 'grid', gap: 2 }}>
        <div style={{ display: 'flex', gap: 6, whiteSpace: 'nowrap' }}>
          <button type="button" onClick={handleUpdate} disabled={!dirty || busy || markedForRemoval} title="Save keyword/match-type edits and move the negative if a different list is selected" style={{ padding: '6px 10px', fontSize: 11 }}>{listChanged ? 'Update & move' : 'Update list'}</button>
          <button type="button" onClick={handleRemove} disabled={busy || markedForRemoval} title="Remove this negative now with an optional note" style={{ padding: '6px 10px', fontSize: 11, color: '#b91c1c', borderColor: '#fecaca', background: '#fff7f7' }}>Remove</button>
        </div>
        {captionSpacer}
      </div>
    </div>
  )
}

// Editable single comment for a Review-outcomes row. Shows the comment with an
// Edit affordance, or an "Add comment" button when empty; editing reveals a
// textarea with Save/Cancel. Persists via the parent's onSave (returns true on
// success) which writes back to the row's canonical comment field.
function OutcomeCommentEditor({ comment, followUps, teammates, onSave, onReply }: {
  comment: string
  followUps: FollowUpComment[]
  teammates: Teammate[]
  onSave: (comment: string) => Promise<boolean>
  onReply: (comment: string, taggedUserIds: string[]) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(false)
  const [replying, setReplying] = useState(false)
  const [draft, setDraft] = useState(comment)
  const [replyDraft, setReplyDraft] = useState('')
  const [taggedUserIds, setTaggedUserIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const startEdit = (): void => { setDraft(comment); setEditing(true) }
  const cancel = (): void => { setDraft(comment); setEditing(false) }
  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      const ok = await onSave(draft.trim())
      if (ok) setEditing(false)
    } finally {
      setSaving(false)
    }
  }
  const saveReply = async (): Promise<void> => {
    if (!replyDraft.trim()) return
    setSaving(true)
    try {
      const ok = await onReply(replyDraft.trim(), taggedUserIds)
      if (ok) { setReplyDraft(''); setTaggedUserIds([]); setReplying(false) }
    } finally {
      setSaving(false)
    }
  }
  const toggleTag = (id: string, checked: boolean): void => {
    setTaggedUserIds((current) => checked ? Array.from(new Set([...current, id])) : current.filter((value) => value !== id))
  }

  if (editing) {
    return (
      <div style={{ flex: '1 1 320px', display: 'grid', gap: 6 }}>
        <textarea
          value={draft}
          rows={2}
          autoFocus
          placeholder="Add a comment for the team…"
          onChange={(event) => setDraft(event.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', fontSize: 12, resize: 'vertical', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.4 }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={save} disabled={saving || draft.trim() === comment.trim()} style={{ padding: '4px 12px', fontSize: 11 }}>{saving ? 'Saving…' : 'Save'}</button>
          <button type="button" onClick={cancel} disabled={saving} style={{ padding: '4px 12px', fontSize: 11 }}>Cancel</button>
        </div>
      </div>
    )
  }

  const commentBlock = comment ? (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 auto', fontSize: 13, padding: '6px 9px', borderRadius: 6, background: '#fff', border: '1px solid #000', color: 'var(--theme-elevation-800)' }}>
        <strong>Comment:</strong> {comment}
      </div>
      <button type="button" onClick={startEdit} style={{ padding: '4px 10px', fontSize: 11, flex: '0 0 auto' }}>Edit</button>
    </div>
  ) : (
    <button type="button" onClick={startEdit} style={{ justifySelf: 'start', padding: '4px 10px', fontSize: 11 }}>Add comment</button>
  )

  return (
    <div style={{ flex: '1 1 320px', display: 'grid', gap: 6 }}>
      {commentBlock}
      {followUps.length > 0 && (
        <div style={{ display: 'grid', gap: 5, paddingLeft: 10, borderLeft: '2px solid var(--theme-elevation-200)' }}>
          {followUps.map((reply, index) => {
            const tagged = (reply.taggedUserIds || '').split(',').map((id) => id.trim()).filter(Boolean)
            const taggedLabels = tagged.map((id) => teammates.find((t) => t.id === id)?.label || `User ${id}`)
            return (
              <div key={reply.id || `${reply.at || 'reply'}-${index}`} style={{ fontSize: 12, padding: '6px 8px', borderRadius: 6, background: '#fff', border: '1px solid var(--theme-elevation-150)' }}>
                <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{reply.comment}</div>
                <div style={{ marginTop: 3, fontSize: 10, color: 'var(--theme-elevation-500)' }}>
                  {reply.by || 'Someone'}{reply.at ? ` · ${new Date(reply.at).toLocaleDateString()}` : ''}{taggedLabels.length > 0 ? ` · tagged ${taggedLabels.map((label) => `@${label}`).join(', ')}` : ''}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {replying ? (
        <div style={{ display: 'grid', gap: 6, padding: 8, borderRadius: 6, background: 'var(--theme-elevation-50)', border: '1px solid var(--theme-elevation-150)' }}>
          <textarea value={replyDraft} rows={2} autoFocus placeholder="Add a follow-up reply…" onChange={(event) => setReplyDraft(event.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', fontSize: 12, resize: 'vertical', lineHeight: 1.4 }} />
          {teammates.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11 }}>
              <span style={{ color: 'var(--theme-elevation-500)' }}>Retag:</span>
              {teammates.map((teammate) => (
                <label key={teammate.id} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input type="checkbox" checked={taggedUserIds.includes(teammate.id)} onChange={(event) => toggleTag(teammate.id, event.target.checked)} />
                  @{teammate.label}
                </label>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={saveReply} disabled={saving || !replyDraft.trim()} style={{ padding: '4px 12px', fontSize: 11 }}>{saving ? 'Saving…' : 'Save reply'}</button>
            <button type="button" onClick={() => { setReplying(false); setReplyDraft(''); setTaggedUserIds([]) }} disabled={saving} style={{ padding: '4px 12px', fontSize: 11 }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setReplying(true)} style={{ justifySelf: 'start', padding: '4px 10px', fontSize: 11 }}>Add follow-up</button>
      )}
    </div>
  )
}
