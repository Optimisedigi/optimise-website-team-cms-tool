'use client'

import { useCallback, useEffect, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Candidate {
  id: string | number
  client?: { id: string | number; name?: string } | string | number
  searchTerm: string
  triggeringKeyword: string
  campaignName: string
  adGroupName: string
  matchType: 'EXACT' | 'PHRASE'
  violationType: 'exact_close_variant' | 'phrase_missing_word'
  impressions: number
  clicks: number
  status: 'pending' | 'approved' | 'rejected'
  assignedListId?: { id: string | number; name?: string } | string | number
  lastSeenAt: string
  firstSeenAt: string
}

interface NegativeKeywordList {
  id: string | number
  name: string
  client?: { id: string | number; name?: string } | string | number
}

interface ListResponse {
  docs: Candidate[]
  totalDocs: number
  page: number
  totalPages: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VIOLATION_LABELS: Record<string, string> = {
  exact_close_variant: 'Exact Close Variant',
  phrase_missing_word: 'Phrase Missing Word',
}

const MATCH_TYPE_LABELS: Record<string, string> = {
  EXACT: 'Exact',
  PHRASE: 'Phrase',
}

function violationColor(type: string): string {
  return type === 'exact_close_variant'
    ? '#dc2626'
    : type === 'phrase_missing_word'
    ? '#d97706'
    : '#6b7280'
}

function statusColor(status: string): string {
  switch (status) {
    case 'pending': return '#2563eb'
    case 'approved': return '#16a34a'
    case 'rejected': return '#6b7280'
    default: return '#6b7280'
  }
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-GB').format(n)
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ─── NKL Picker Modal ─────────────────────────────────────────────────────────

function NklPickerModal({
  lists,
  onConfirm,
  onCancel,
  pendingCount,
}: {
  lists: NegativeKeywordList[]
  onConfirm: (listId: string | number) => void
  onCancel: () => void
  pendingCount: number
}) {
  const [selected, setSelected] = useState<string | number | ''>('')
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.5)',
    }}>
      <div style={{
        background: 'white', borderRadius: 8, padding: 24, width: 420, maxWidth: '90vw',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>
          Select Negative Keyword List
        </h3>
        <p style={{ margin: '0 0 16px', color: '#6b7280', fontSize: 13 }}>
          {pendingCount === 1
            ? 'Add this violation as a negative keyword.'
            : `Add ${pendingCount} violations as negative keywords.`}
        </p>
        <select
          value={String(selected)}
          onChange={(e) => setSelected(e.target.value)}
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db',
            fontSize: 14, marginBottom: 16,
          }}
        >
          <option value="">— Select a list —</option>
          {lists.map((l) => (
            <option key={String(l.id)} value={String(l.id)}>
              {l.name}
            </option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={btnStyle('ghost')}>Cancel</button>
          <button
            onClick={() => selected && onConfirm(selected)}
            disabled={!selected}
            style={btnStyle('primary', !selected)}
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  )
}

function btnStyle(variant: 'primary' | 'ghost', disabled?: boolean): React.CSSProperties {
  if (variant === 'primary') {
    return {
      padding: '7px 16px', borderRadius: 6, border: 'none',
      background: disabled ? '#d1d5db' : '#2563eb', color: 'white',
      fontSize: 13, fontWeight: 500, cursor: disabled ? 'not-allowed' : 'pointer',
    }
  }
  return {
    padding: '7px 16px', borderRadius: 6, border: '1px solid #d1d5db',
    background: 'white', color: '#374151', fontSize: 13, cursor: 'pointer',
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MatchTypeViolationReview({
  initialClientId,
}: {
  initialClientId?: string
}) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [totalDocs, setTotalDocs] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncRunCount, setSyncRunCount] = useState<number | null>(null)

  // Filters
  const [filterClient, setFilterClient] = useState(initialClientId ?? '')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterMatchType, setFilterMatchType] = useState('')
  const [filterViolationType, setFilterViolationType] = useState('')
  const [page, setPage] = useState(1)
  const limit = 50

  // Bulk selection
  const [selected, setSelected] = useState<Set<string | number>>(new Set())
  const [showNklPicker, setShowNklPicker] = useState(false)
  const [nklLists, setNklLists] = useState<NegativeKeywordList[]>([])
  const [bulkLoading, setBulkLoading] = useState(false)

  // Per-row action loading
  const [actionLoading, setActionLoading] = useState<Set<string | number>>(new Set())

  // Fetch total sync run count from activity log
  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/activity-log?where[type][equals]=match_type_violation_sync&limit=1&depth=0')
        if (res.ok) {
          const data = await res.json()
          setSyncRunCount(data.totalDocs ?? 0)
        }
      } catch { /* non-critical */ }
    })()
  }, [])

  const fetchCandidates = useCallback(async () => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ limit: String(limit), page: String(page) })
    if (filterClient) params.set('client', filterClient)
    if (filterStatus) params.set('status', filterStatus)
    if (filterMatchType) params.set('matchType', filterMatchType)
    if (filterViolationType) params.set('violationType', filterViolationType)

    try {
      const res = await fetch(`/api/match-type-violations?${params}`)
      if (!res.ok) throw new Error(await res.text())
      const data: ListResponse = await res.json()
      setCandidates(data.docs)
      setTotalDocs(data.totalDocs)
      setSelected(new Set())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [filterClient, filterStatus, filterMatchType, filterViolationType, page])

  const fetchNklLists = useCallback(async () => {
    const clientId = filterClient
    const params = new URLSearchParams({ limit: '100' })
    if (clientId) params.set('where[client][equals]', clientId)
    const res = await fetch(`/api/negative-keyword-lists?${params}`)
    if (res.ok) {
      const data = await res.json()
      setNklLists(data.docs ?? [])
    }
  }, [filterClient])

  useEffect(() => { void fetchCandidates() }, [fetchCandidates])

  const handleApprove = async (id: string | number, listId: string | number) => {
    setActionLoading((prev) => new Set(prev).add(id))
    try {
      const res = await fetch(`/api/match-type-violations/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedListId: listId }),
      })
      if (!res.ok) throw new Error(await res.text())
      await fetchCandidates()
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    } finally {
      setActionLoading((prev) => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  const handleReject = async (id: string | number) => {
    if (!confirm('Reject this violation?')) return
    setActionLoading((prev) => new Set(prev).add(id))
    try {
      const res = await fetch(`/api/match-type-violations/${id}/reject`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      await fetchCandidates()
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    } finally {
      setActionLoading((prev) => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  const handleBulkApprove = async (listId: string | number) => {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    setBulkLoading(true)
    try {
      const res = await fetch('/api/match-type-violations/bulk-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateIds: ids, assignedListId: listId }),
      })
      if (!res.ok) throw new Error(await res.text())
      setShowNklPicker(false)
      await fetchCandidates()
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    } finally {
      setBulkLoading(false)
    }
  }

  const openBulkPicker = async () => {
    await fetchNklLists()
    setShowNklPicker(true)
  }

  const toggleAll = (checked: boolean) => {
    if (checked) {
      const pendingIds = candidates
        .filter((c) => c.status === 'pending')
        .map((c) => c.id)
      setSelected(new Set(pendingIds))
    } else {
      setSelected(new Set())
    }
  }

  const toggleOne = (id: string | number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const pendingSelected = candidates.filter(
    (c) => selected.has(c.id) && c.status === 'pending',
  )

  const totalPages = Math.ceil(totalDocs / limit)

  return (
    <div style={{ padding: '0 24px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Match Type Violations</h2>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
            Review violations where Google served non-conforming search terms
          </p>
        </div>
        {pendingSelected.length > 0 && (
          <button
            onClick={openBulkPicker}
            style={{ ...btnStyle('primary'), display: 'flex', alignItems: 'center', gap: 6 }}
          >
            Approve {pendingSelected.length} Selected
          </button>
        )}
      </div>

      {/* How it works info box */}
      <div style={{
        marginBottom: 20, padding: '12px 16px', background: '#eff6ff',
        border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 13, color: '#1e40af',
      }}>
        <strong>How it works —</strong> runs daily (~17:00 UTC) · {syncRunCount !== null ? (
          <span title="Number of times the monitor has run">{syncRunCount} sync{syncRunCount !== 1 ? 's' : ''} to date</span>
        ) : '…'} · {totalDocs} candidate{totalDocs !== 1 ? 's' : ''} total
        <br />
        The monitor flags Exact and Phrase keywords that served search terms with different intent.
        Cosmetic close variants (plurals, accents, word order, stopword swaps, and typos) are ignored — only genuine intent shifts surface:
        <ul style={{ margin: '6px 0 0 18px', padding: 0, lineHeight: 1.7 }}>
          <li><strong>Exact close variant</strong> — an exact keyword served a query with an added/removed/substituted content word (e.g. "ppc services" triggered "pay per click management").</li>
          <li><strong>Phrase missing word</strong> — a phrase keyword served a query missing one of its content words (e.g. "running shoes" triggered "buy shoes online").</li>
        </ul>
        For <strong>exact</strong> keywords the monitor now checks each search term against the <strong>full set of exact keywords you actually own</strong>: a term is valid only if it equals one of them (allowing plurals, typos, stopwords, accents, and word reorder — no synonyms). Anything else is a leak that belongs to phrase match, not exact, so it surfaces here.
        Approving adds a negative — by default the specific offending word(s) as a <strong>phrase</strong> negative (blocking the whole drift family), otherwise the whole term as an <strong>exact</strong> negative. The recommendation is editable per row, and a phrase negative that would block an owned keyword safely falls back to exact. The negative routes into the candidate’s <strong>ad-group list</strong> (auto-matched or created), or you can assign an existing list. Reject to dismiss it.
        Only terms with ≥2 impressions in the past 90 days are flagged.
        <br />
        Per client you can enable <strong>Exact</strong> and <strong>Phrase</strong> monitoring independently, and scope monitoring to specific campaigns or ad groups via the allow-list on the client record — leave it empty to monitor the whole account.
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap',
        padding: '12px 16px', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb',
      }}>
        {!initialClientId && (
          <select value={filterClient} onChange={(e) => { setFilterClient(e.target.value); setPage(1) }}
            style={filterStyle()}>
            <option value="">All Clients</option>
          </select>
        )}
        <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1) }}
          style={filterStyle()}>
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <select value={filterMatchType} onChange={(e) => { setFilterMatchType(e.target.value); setPage(1) }}
          style={filterStyle()}>
          <option value="">All Match Types</option>
          <option value="EXACT">Exact</option>
          <option value="PHRASE">Phrase</option>
        </select>
        <select value={filterViolationType} onChange={(e) => { setFilterViolationType(e.target.value); setPage(1) }}
          style={filterStyle()}>
          <option value="">All Violation Types</option>
          <option value="exact_close_variant">Exact Close Variant</option>
          <option value="phrase_missing_word">Phrase Missing Word</option>
        </select>
        {((!initialClientId && filterClient) || filterStatus || filterMatchType || filterViolationType) && (
          <button onClick={() => {
            if (!initialClientId) setFilterClient('')
            setFilterStatus(''); setFilterMatchType('')
            setFilterViolationType(''); setPage(1)
          }} style={{ ...btnStyle('ghost'), fontSize: 12 }}>
            Clear Filters
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, marginBottom: 16, color: '#dc2626', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Loading…</div>
      ) : candidates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#6b7280', border: '1px dashed #d1d5db', borderRadius: 8 }}>
          No violations found.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: 'white' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={thStyle()}>
                  <input
                    type="checkbox"
                    checked={pendingSelected.length > 0 && pendingSelected.length === candidates.filter(c => c.status === 'pending').length}
                    onChange={(e) => toggleAll(e.target.checked)}
                  />
                </th>
                <th style={thStyle()}>Search Term</th>
                <th style={thStyle()}>Triggering Keyword</th>
                <th style={thStyle()}>Match Type</th>
                <th style={thStyle()}>Violation</th>
                <th style={thStyle()}>Impressions</th>
                <th style={thStyle()}>Clicks</th>
                <th style={thStyle()}>Campaign</th>
                <th style={thStyle()}>Status</th>
                <th style={thStyle()}>Last Seen</th>
                <th style={thStyle()}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={String(c.id)} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={tdStyle()}>
                    {c.status === 'pending' && (
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggleOne(c.id)}
                      />
                    )}
                  </td>
                  <td style={tdStyle()}>
                    <span title={c.searchTerm} style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', whiteSpace: 'nowrap' }}>
                      {c.searchTerm}
                    </span>
                  </td>
                  <td style={tdStyle()}>
                    <span title={c.triggeringKeyword} style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', whiteSpace: 'nowrap' }}>
                      {c.triggeringKeyword}
                    </span>
                  </td>
                  <td style={tdStyle()}>
                    <span style={{ ...badgeStyle('#e0e7ff', '#3730a3'), textTransform: 'uppercase', fontSize: 11 }}>
                      {MATCH_TYPE_LABELS[c.matchType] ?? c.matchType}
                    </span>
                  </td>
                  <td style={tdStyle()}>
                    <span style={{ ...badgeStyle(
                      violationColor(c.violationType) + '20',
                      violationColor(c.violationType),
                    ), fontSize: 11 }}>
                      {VIOLATION_LABELS[c.violationType] ?? c.violationType}
                    </span>
                  </td>
                  <td style={{ ...tdStyle(), textAlign: 'right' }}>{formatNumber(c.impressions)}</td>
                  <td style={{ ...tdStyle(), textAlign: 'right' }}>{formatNumber(c.clicks)}</td>
                  <td style={tdStyle()}>
                    <span title={c.campaignName} style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', whiteSpace: 'nowrap' }}>
                      {c.campaignName || '—'}
                    </span>
                  </td>
                  <td style={tdStyle()}>
                    <span style={{ ...badgeStyle(
                      statusColor(c.status) + '20',
                      statusColor(c.status),
                    ), fontSize: 11 }}>
                      {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                    </span>
                  </td>
                  <td style={tdStyle()}>
                    <span title={new Date(c.lastSeenAt).toLocaleString()}>
                      {timeAgo(c.lastSeenAt)}
                    </span>
                  </td>
                  <td style={tdStyle()}>
                    {c.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <NklDropdown
                          candidateId={c.id}
                          onApprove={handleApprove}
                          loading={actionLoading.has(c.id)}
                          clientId={filterClient ? String(filterClient) : undefined}
                        />
                        <button
                          onClick={() => handleReject(c.id)}
                          disabled={actionLoading.has(c.id)}
                          style={{ ...btnStyle('ghost'), fontSize: 11, padding: '4px 8px' }}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
          <span style={{ fontSize: 13, color: '#6b7280' }}>
            {totalDocs} total · Page {page} of {totalPages}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={btnStyle('ghost')}>
              Previous
            </button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={btnStyle('ghost')}>
              Next
            </button>
          </div>
        </div>
      )}

      {/* NKL Picker Modal */}
      {showNklPicker && (
        <NklPickerModal
          lists={nklLists}
          pendingCount={pendingSelected.length}
          onConfirm={handleBulkApprove}
          onCancel={() => setShowNklPicker(false)}
        />
      )}
    </div>
  )
}

// ─── NKL Dropdown ─────────────────────────────────────────────────────────────

function NklDropdown({
  candidateId,
  onApprove,
  loading,
  clientId,
}: {
  candidateId: string | number
  onApprove: (id: string | number, listId: string | number) => Promise<void>
  loading: boolean
  clientId?: string
}) {
  const [open, setOpen] = useState(false)
  const [lists, setLists] = useState<NegativeKeywordList[]>([])
  const [fetching, setFetching] = useState(false)
  const ref = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    const handler = (e: MouseEvent) => {
      if (!node.contains(e.target as Node)) setOpen(false)
    }
    node.addEventListener('blur', handler as any)
    return () => node.removeEventListener('blur', handler as any)
  }, [])

  const fetchLists = async () => {
    setFetching(true)
    const params = new URLSearchParams({ limit: '100' })
    if (clientId) params.set('where[client][equals]', clientId)
    const res = await fetch(`/api/negative-keyword-lists?${params}`)
    if (res.ok) {
      const data = await res.json()
      setLists(data.docs ?? [])
    }
    setFetching(false)
  }

  const handleOpen = async () => {
    if (open) { setOpen(false); return }
    if (lists.length === 0) await fetchLists()
    setOpen(true)
  }

  return (
    <div ref={ref as any} style={{ position: 'relative' }}>
      <button
        onClick={handleOpen}
        disabled={loading}
        style={{ ...btnStyle('primary'), fontSize: 11, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
      >
        {loading ? '…' : 'Approve'}
        <span style={{ fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', zIndex: 100,
          background: 'white', border: '1px solid #e5e7eb', borderRadius: 6,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)', minWidth: 180, marginTop: 4,
        }}>
          {fetching ? (
            <div style={{ padding: '8px 12px', fontSize: 12, color: '#6b7280' }}>Loading…</div>
          ) : lists.length === 0 ? (
            <div style={{ padding: '8px 12px', fontSize: 12, color: '#6b7280' }}>No lists found</div>
          ) : (
            lists.map((l) => (
              <button
                key={String(l.id)}
                onClick={async () => { setOpen(false); await onApprove(candidateId, l.id) }}
                style={{
                  display: 'block', width: '100%', padding: '7px 12px', border: 'none',
                  background: 'none', textAlign: 'left', fontSize: 12, cursor: 'pointer',
                  borderBottom: '1px solid #f3f4f6',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f9fafb')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                {l.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function thStyle(): React.CSSProperties {
  return {
    padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600,
    color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em',
    whiteSpace: 'nowrap',
  }
}

function tdStyle(): React.CSSProperties {
  return { padding: '10px 12px', verticalAlign: 'middle' }
}

function badgeStyle(bg: string, color: string): React.CSSProperties {
  return {
    display: 'inline-block', padding: '2px 8px', borderRadius: 9999,
    background: bg, color, fontWeight: 500,
  }
}

function filterStyle(): React.CSSProperties {
  return {
    padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db',
    fontSize: 13, background: 'white', color: '#374151',
  }
}
