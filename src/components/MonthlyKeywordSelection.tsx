'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { parseNegativeKeywordInput } from '../lib/parse-negative-keywords'

type MatchType = 'exact' | 'phrase' | 'broad'
type Decision = 'pending' | 'approved' | 'skipped'

type Term = { term: string; impressions: number; clicks: number; cost: number; conversions: number; status?: string }
type Month = { month: string; terms: Term[]; reviewComplete: boolean; reviewCompletedAt?: string | null; diagnostics?: { rawRows?: number; parsedTerms?: number; qualifiedTerms?: number } }
type Selection = { yearMonth: string; searchTerm: string; negativeKeyword: string; matchType: MatchType; decision: Decision; appliedToNKL?: number | string | { id?: number | string } | null; appliedAt?: string | null }
type Nkl = { id: number | string; name: string; isActive?: boolean; keywords?: Array<{ keyword: string; matchType: MatchType }> }

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  if (!year || !monthNumber) return month
  return new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year, monthNumber - 1, 1)))
}

function selectionKey(yearMonth: string, searchTerm: string): string {
  return `${yearMonth}|${searchTerm.toLowerCase()}`
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

export function MonthlyKeywordSelection({ clientId, customerId, slug, isAdmin = false }: { clientId: string; customerId: string; slug: string; isAdmin?: boolean }) {
  const [months, setMonths] = useState<Month[]>([])
  const [selections, setSelections] = useState<Record<string, Selection>>({})
  const [nkls, setNkls] = useState<Nkl[]>([])
  const [hiddenNklIds, setHiddenNklIds] = useState<Set<string>>(new Set())
  const [activeMonth, setActiveMonth] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [lastLoadSummary, setLastLoadSummary] = useState<{ misses?: number; missingMonths?: string[]; error?: string; diagnostics?: { customerId?: string; startDate?: string; endDate?: string; totalRows?: number; matchedRows?: number } } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const monthsScrollerRef = useRef<HTMLDivElement | null>(null)
  const hasAutoScrolledRef = useRef(false)

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
        nextSelections[selectionKey(selection.yearMonth, selection.searchTerm)] = selection
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
        if (selection?.decision === 'pending' || selection?.decision === 'approved' || selection?.decision === 'skipped') {
          previouslyReviewedTerms.add(term.term.trim().toLowerCase())
        }
      }
      return { ...month, terms }
    })
  }, [months, selections])

  useEffect(() => {
    if (loading || visibleMonths.length === 0 || hasAutoScrolledRef.current) return
    hasAutoScrolledRef.current = true
    window.requestAnimationFrame(() => scrollToFirstIncompleteMonth(visibleMonths, 'auto'))
  }, [loading, visibleMonths, scrollToFirstIncompleteMonth])

  const cmsExisting = useMemo(() => {
    const set = new Set<string>()
    for (const nkl of nkls) {
      for (const kw of Array.isArray(nkl.keywords) ? nkl.keywords : []) {
        if (kw?.keyword && kw?.matchType) set.add(`${kw.keyword.toLowerCase()}|${kw.matchType}`)
      }
    }
    return set
  }, [nkls])

  const saveSelections = useCallback(async (next: Record<string, Selection>) => {
    setSaving(true)
    try {
      const res = await fetch('/api/monthly-keyword-selection/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ clientId: Number(clientId), selections: Object.values(next) }),
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

  const updateTerm = (month: string, term: string, input: string, appliedToNKL?: number | string | null) => {
    const parsed = parseNegativeKeywordInput(input) || { keyword: term, matchType: 'exact' as MatchType }
    const key = selectionKey(month, term)
    const existing = selections[key]
    const nextAppliedToNKL = appliedToNKL === undefined ? existing?.appliedToNKL : appliedToNKL
    const next = {
      ...selections,
      [key]: {
        ...(existing || {}),
        yearMonth: month,
        searchTerm: term,
        negativeKeyword: parsed.keyword,
        matchType: parsed.matchType,
        decision: nextAppliedToNKL ? 'approved' as Decision : 'pending' as Decision,
        appliedToNKL: nextAppliedToNKL || null,
      },
    }
    setSelections(next)
    queueSave(next)
  }

  const setTargetListForTerm = (month: string, term: string, nklId: number | string | null) => {
    const key = selectionKey(month, term)
    const input = inputFromSelection(selections[key], term)
    updateTerm(month, term, input, nklId)
  }

  const markTermHandled = (month: string, term: string, decision: Extract<Decision, 'approved' | 'skipped'>) => {
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
        negativeKeyword: parsed.keyword,
        matchType: parsed.matchType,
        decision: alreadySelected ? 'pending' as Decision : decision,
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
      setMessage(`Applied ${data.applied || 0}; skipped ${data.skipped || 0} duplicate(s).`)
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
  const monthsToRender = activeMonth ? visibleMonths.filter((month) => month.month === activeMonth) : visibleMonths

  return (
    <div style={{ padding: 24, color: 'var(--theme-text)' }}>
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

      {message && <div style={{ marginBottom: 16, padding: 10, borderRadius: 6, background: '#fef3c7', color: '#92400e' }}>{message}</div>}

      {lastLoadSummary?.diagnostics && (
        <div style={{ marginBottom: 16, padding: 10, borderRadius: 6, border: '1px solid var(--theme-elevation-150)', color: 'var(--theme-elevation-600)', fontSize: 12 }}>
          Last Growth Tools pull: CID {lastLoadSummary.diagnostics.customerId || 'unknown'}, {lastLoadSummary.diagnostics.startDate || '?'} → {lastLoadSummary.diagnostics.endDate || '?'}, total rows {lastLoadSummary.diagnostics.totalRows ?? 0}, matched month rows {lastLoadSummary.diagnostics.matchedRows ?? 0}.
        </div>
      )}

      {loading && months.length === 0 && (
        <div style={{ marginBottom: 16, padding: 14, borderRadius: 8, border: '1px solid var(--theme-elevation-150)', background: 'var(--theme-elevation-50)', color: 'var(--theme-elevation-700)' }}>
          Pulling complete-month search terms from Google Ads. The first load can take a little while.
        </div>
      )}

      {!loading && months.length === 0 && (
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

      <div ref={monthsScrollerRef} style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 20, scrollBehavior: 'smooth' }}>
        {monthsToRender.map((month) => {
          const isFocused = activeMonth === month.month
          return (
          <section key={month.month} aria-label={`${monthLabel(month.month)}${month.reviewComplete ? ' complete' : ''}`} style={{ minWidth: isFocused ? '100%' : 340, maxWidth: isFocused ? '100%' : 340, border: '1px solid var(--theme-elevation-150)', borderRadius: 10, background: month.reviewComplete ? 'var(--theme-elevation-50)' : 'var(--theme-bg)', opacity: month.reviewComplete ? 0.78 : 1 }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 1, padding: 12, borderBottom: '1px solid var(--theme-elevation-150)', background: 'inherit', borderRadius: '10px 10px 0 0' }}>
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
                <div style={{ position: 'sticky', top: 62, zIndex: 2, display: 'grid', gridTemplateColumns: `minmax(190px, 1.25fr) 158px minmax(190px, 0.9fr) 88px repeat(${Math.max(visibleNkls.length, 1)}, minmax(100px, 0.55fr))`, gap: 10, padding: '7px 8px', borderRadius: 6, background: 'var(--theme-elevation-150)', fontSize: 10, fontWeight: 700, color: 'var(--theme-elevation-800)', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
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
                const key = selectionKey(month.month, term.term)
                const selection = selections[key]
                const inputValue = inputFromSelection(selection, term.term)
                const parsed = parseNegativeKeywordInput(inputValue) || { keyword: term.term, matchType: 'exact' as MatchType }
                const alreadyInCms = cmsExisting.has(`${parsed.keyword.toLowerCase()}|${parsed.matchType}`)
                const selectedNklId = selection?.appliedToNKL && typeof selection.appliedToNKL === 'object' ? selection.appliedToNKL.id : selection?.appliedToNKL
                return (
                  <div key={key} style={{ display: 'grid', gridTemplateColumns: isFocused ? `minmax(190px, 1.25fr) 158px minmax(190px, 0.9fr) 88px repeat(${Math.max(visibleNkls.length, 1)}, minmax(100px, 0.55fr))` : '1fr', gap: 10, alignItems: 'center', padding: '6px 8px', border: '1px solid var(--theme-elevation-100)', borderRadius: 6, background: selection?.decision === 'skipped' ? '#fef2f2' : selection?.decision === 'approved' && !selection.appliedToNKL ? '#f0fdf4' : 'var(--theme-elevation-0)' }}>
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>{term.term}</div>
                      <div style={{ fontSize: 10, color: 'var(--theme-elevation-500)' }}>
                        {term.impressions} impr · {term.clicks} clicks · ${Number(term.cost || 0).toFixed(2)}
                      </div>
                    </div>
                    {isFocused && (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
                        <button
                          type="button"
                          disabled={month.reviewComplete}
                          onClick={() => markTermHandled(month.month, term.term, 'skipped')}
                          style={{ padding: '4px 7px', fontSize: 10, lineHeight: 1.2, whiteSpace: 'nowrap', color: selection?.decision === 'skipped' ? '#991b1b' : undefined, borderColor: selection?.decision === 'skipped' ? '#fca5a5' : undefined, background: selection?.decision === 'skipped' ? '#fee2e2' : undefined, cursor: month.reviewComplete ? 'not-allowed' : 'pointer' }}
                        >{selection?.decision === 'skipped' ? 'Skipped' : 'Skip'}</button>
                        <button
                          type="button"
                          disabled={month.reviewComplete}
                          onClick={() => markTermHandled(month.month, term.term, 'approved')}
                          title="Already covered by an existing negative keyword; hide this exact search term in future months without applying it again. Click again to unmark."
                          style={{ padding: '4px 7px', fontSize: 10, lineHeight: 1.2, whiteSpace: 'nowrap', color: selection?.decision === 'approved' && !selection.appliedToNKL ? '#166534' : undefined, borderColor: selection?.decision === 'approved' && !selection.appliedToNKL ? '#86efac' : undefined, background: selection?.decision === 'approved' && !selection.appliedToNKL ? '#dcfce7' : undefined, cursor: month.reviewComplete ? 'not-allowed' : 'pointer' }}
                        >{selection?.decision === 'approved' && !selection.appliedToNKL ? 'Added' : 'Already added'}</button>
                      </div>
                    )}
                    <input
                      value={inputValue}
                      disabled={month.reviewComplete}
                      onChange={(event) => updateTerm(month.month, term.term, event.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '5px 7px', fontSize: 12, cursor: month.reviewComplete ? 'not-allowed' : 'text' }}
                    />
                    <div style={{ display: 'grid', gap: 4 }}>
                      <span style={{ fontSize: 10, color: '#0369a1' }}>{matchTypeLabel(parsed.matchType)}</span>
                      {alreadyInCms && <span style={{ fontSize: 11, background: '#dcfce7', color: '#166534', padding: '2px 6px', borderRadius: 999 }}>Already in CMS NKL</span>}
                    </div>
                    {isFocused && visibleNkls.map((nkl) => {
                      const isChecked = String(selectedNklId || '') === String(nkl.id)
                      return (
                        <label key={nkl.id} style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'center', minHeight: 28, padding: '3px 5px', borderRadius: 5, border: isChecked ? '1px solid #0f766e' : '1px solid var(--theme-elevation-150)', background: isChecked ? '#ccfbf1' : 'transparent', fontSize: 10, whiteSpace: 'nowrap', cursor: month.reviewComplete ? 'not-allowed' : 'pointer' }}>
                          <input type="checkbox" checked={isChecked} disabled={month.reviewComplete} onChange={() => setTargetListForTerm(month.month, term.term, isChecked ? null : nkl.id)} />
                          Add negative
                        </label>
                      )
                    })}
                    {isFocused && visibleNkls.length === 0 && <span style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>No active NKLs shown</span>}
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
