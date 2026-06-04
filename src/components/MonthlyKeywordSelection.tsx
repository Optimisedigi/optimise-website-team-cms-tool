'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { parseNegativeKeywordInput } from '../lib/parse-negative-keywords'

type MatchType = 'exact' | 'phrase' | 'broad'
type Decision = 'pending' | 'approved' | 'skipped'

type Term = { term: string; impressions: number; clicks: number; cost: number; conversions: number; status?: string }
type Month = { month: string; terms: Term[]; reviewComplete: boolean; reviewCompletedAt?: string | null }
type Selection = { yearMonth: string; searchTerm: string; negativeKeyword: string; matchType: MatchType; decision: Decision; appliedAt?: string | null }
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

export function MonthlyKeywordSelection({ clientId, customerId, slug, isAdmin = false }: { clientId: string; customerId: string; slug: string; isAdmin?: boolean }) {
  const [months, setMonths] = useState<Month[]>([])
  const [selections, setSelections] = useState<Record<string, Selection>>({})
  const [nkls, setNkls] = useState<Nkl[]>([])
  const [targetNklId, setTargetNklId] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [lastLoadSummary, setLastLoadSummary] = useState<{ misses?: number; missingMonths?: string[] } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    if (!clientId || !customerId || !slug) return
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
      if (!targetNklId && docs[0]?.id) setTargetNklId(String(docs[0].id))
    } catch {
      setNkls([])
    }
  }, [clientId, targetNklId])

  useEffect(() => { void load(); void loadNkls() }, [load, loadNkls])

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

  const updateTerm = (month: string, term: string, input: string, decision?: Decision) => {
    const parsed = parseNegativeKeywordInput(input) || { keyword: term, matchType: 'exact' as MatchType }
    const key = selectionKey(month, term)
    const next = {
      ...selections,
      [key]: {
        ...(selections[key] || {}),
        yearMonth: month,
        searchTerm: term,
        negativeKeyword: parsed.keyword,
        matchType: parsed.matchType,
        decision: decision || selections[key]?.decision || 'pending',
      },
    }
    setSelections(next)
    queueSave(next)
  }

  const setDecision = (month: string, term: string, decision: Decision) => {
    const key = selectionKey(month, term)
    const input = inputFromSelection(selections[key], term)
    updateTerm(month, term, input, decision)
  }

  const toggleComplete = async (month: string, complete: boolean) => {
    const res = await fetch('/api/monthly-keyword-selection/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ clientId: Number(clientId), yearMonth: month, complete }),
    })
    if (res.ok) {
      setMonths((current) => current.map((entry) => entry.month === month ? { ...entry, reviewComplete: complete } : entry))
    } else {
      setMessage('Failed to update month completion')
    }
  }

  const applyApproved = async () => {
    const approved = Object.values(selections).filter((selection) => selection.decision === 'approved')
    if (!targetNklId || approved.length === 0) return
    const res = await fetch('/api/monthly-keyword-selection/apply', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ clientId: Number(clientId), nklId: targetNklId, selections: approved }),
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

  const approvedCount = Object.values(selections).filter((selection) => selection.decision === 'approved').length

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
        <label style={{ fontWeight: 600 }}>Apply approved to</label>
        <select value={targetNklId} onChange={(event) => setTargetNklId(event.target.value)} style={{ minWidth: 260, padding: 8 }}>
          <option value="">Choose active NKL…</option>
          {nkls.map((nkl) => <option key={nkl.id} value={nkl.id}>{nkl.name}</option>)}
        </select>
        <button type="button" onClick={applyApproved} disabled={!targetNklId || approvedCount === 0} style={{ padding: '8px 12px' }}>Apply {approvedCount} approved</button>
        <span style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>{saving ? 'Saving…' : 'Auto-saved'}</span>
      </div>

      {message && <div style={{ marginBottom: 16, padding: 10, borderRadius: 6, background: '#fef3c7', color: '#92400e' }}>{message}</div>}

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
          {lastLoadSummary?.missingMonths && lastLoadSummary.missingMonths.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 12 }}>Last refresh still had {lastLoadSummary.missingMonths.length} missing month(s).</div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 20 }}>
        {months.map((month) => (
          <section key={month.month} style={{ minWidth: 340, maxWidth: 340, border: '1px solid var(--theme-elevation-150)', borderRadius: 10, background: month.reviewComplete ? 'var(--theme-elevation-50)' : 'var(--theme-bg)', opacity: month.reviewComplete ? 0.78 : 1 }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 1, padding: 12, borderBottom: '1px solid var(--theme-elevation-150)', background: 'inherit', borderRadius: '10px 10px 0 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <strong>{monthLabel(month.month)}</strong>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                  <input type="checkbox" checked={month.reviewComplete} onChange={(event) => void toggleComplete(month.month, event.target.checked)} />
                  {month.reviewComplete ? '✓ Complete' : 'Complete'}
                </label>
              </div>
              <div style={{ fontSize: 12, color: 'var(--theme-elevation-500)', marginTop: 4 }}>{month.terms.length} qualifying term{month.terms.length === 1 ? '' : 's'}</div>
            </div>
            <div style={{ padding: 10, display: 'grid', gap: 10 }}>
              {month.terms.map((term) => {
                const key = selectionKey(month.month, term.term)
                const selection = selections[key]
                const inputValue = inputFromSelection(selection, term.term)
                const parsed = parseNegativeKeywordInput(inputValue) || { keyword: term.term, matchType: 'exact' as MatchType }
                const alreadyInCms = cmsExisting.has(`${parsed.keyword.toLowerCase()}|${parsed.matchType}`)
                return (
                  <div key={key} style={{ padding: 10, border: '1px solid var(--theme-elevation-100)', borderRadius: 8, background: 'var(--theme-elevation-0)' }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{term.term}</div>
                    <div style={{ fontSize: 11, color: 'var(--theme-elevation-500)', marginBottom: 8 }}>
                      {term.impressions} impr · {term.clicks} clicks · ${Number(term.cost || 0).toFixed(2)}
                    </div>
                    <input
                      value={inputValue}
                      onChange={(event) => updateTerm(month.month, term.term, event.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '7px 8px', marginBottom: 6 }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 11, color: '#0369a1' }}>{parsed.matchType}</span>
                      {alreadyInCms && <span style={{ fontSize: 11, background: '#dcfce7', color: '#166534', padding: '2px 6px', borderRadius: 999 }}>Already in CMS NKL</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(['pending', 'approved', 'skipped'] as Decision[]).map((decision) => (
                        <button
                          key={decision}
                          type="button"
                          onClick={() => setDecision(month.month, term.term, decision)}
                          style={{
                            flex: 1,
                            padding: '5px 6px',
                            borderRadius: 5,
                            border: selection?.decision === decision ? '1px solid #0f766e' : '1px solid var(--theme-elevation-150)',
                            background: selection?.decision === decision ? '#ccfbf1' : 'transparent',
                            textTransform: 'capitalize',
                          }}
                        >{decision}</button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
