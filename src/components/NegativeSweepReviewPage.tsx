'use client'

import { useEffect, useState, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────

interface Candidate {
  id: string
  client: { id: string; name: string } | string
  searchTerm: string
  suggestedNegative?: string
  campaignName?: string
  adGroupName?: string
  clicks: number
  impressions: number
  cost: number
  conversions: number
  status: 'pending' | 'approved' | 'rejected'
  suggestedList?: string
  assignedList?: string
  matchType: 'exact' | 'phrase' | 'broad'
  aiReasoning?: string
  sweepDate: string
  writtenToSheet?: boolean
  writtenAt?: string
}

interface SheetList {
  name: string
  column: string
  regex: string
}

interface ClientOption {
  id: string
  name: string
}

type FilterTab = 'all' | 'pending' | 'approved' | 'rejected'

// ─── Helpers ──────────────────────────────────────────────

function formatCurrency(val: number): string {
  return '$' + val.toFixed(2)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// ─── Component ────────────────────────────────────────────

export default function NegativeSweepReviewPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [selectedClient, setSelectedClient] = useState<string>('')
  const [sheetLists, setSheetLists] = useState<SheetList[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<FilterTab>('pending')
  const [acting, setActing] = useState<Set<string>>(new Set())
  const [syncing, setSyncing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [sweepDateFilter, setSweepDateFilter] = useState<string>('')

  // ─── Fetch clients ──────────────────────────────────────

  useEffect(() => {
    fetch('/api/clients/list')
      .then((r) => r.json())
      .then((data) => {
        const docs = (data.docs || data || [])
          .filter((c: any) => c.gadsAuto?.negativeSweepEnabled)
          .map((c: any) => ({ id: String(c.id), name: c.name }))
        setClients(docs)
        if (docs.length > 0 && !selectedClient) {
          setSelectedClient(docs[0].id)
        }
      })
      .catch(() => {})
  }, [])

  // ─── Fetch candidates ──────────────────────────────────

  const fetchCandidates = useCallback(async () => {
    if (!selectedClient) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        where: JSON.stringify({
          client: { equals: selectedClient },
          ...(sweepDateFilter ? { sweepDate: { equals: sweepDateFilter } } : {}),
        }),
        limit: '500',
        sort: '-sweepDate',
        depth: '1',
      })
      const res = await fetch(`/api/negative-sweep-candidates?${params}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setCandidates(data.docs || [])
    } catch (err) {
      console.error('[NegativeSweep] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedClient, sweepDateFilter])

  useEffect(() => {
    fetchCandidates()
  }, [fetchCandidates])

  // ─── Fetch sheet lists ──────────────────────────────────

  useEffect(() => {
    if (!selectedClient) return
    fetch(`/api/negative-sweep/lists?clientId=${selectedClient}`)
      .then((r) => r.json())
      .then((data) => setSheetLists(data.lists || []))
      .catch(() => setSheetLists([]))
  }, [selectedClient])

  // ─── Actions ────────────────────────────────────────────

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const handleAction = async (
    ids: string[],
    action: 'approve' | 'reject',
    assignedList?: string,
    matchType?: string
  ) => {
    setActing((prev) => new Set([...prev, ...ids]))

    // Optimistic update
    const newStatus = action === 'approve' ? 'approved' : 'rejected'
    setCandidates((prev) =>
      prev.map((c) =>
        ids.includes(c.id)
          ? {
              ...c,
              status: newStatus as Candidate['status'],
              ...(assignedList ? { assignedList } : {}),
              ...(matchType ? { matchType: matchType as Candidate['matchType'] } : {}),
            }
          : c
      )
    )

    try {
      const res = await fetch('/api/negative-sweep/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateIds: ids, action, assignedList, matchType }),
      })
      if (!res.ok) {
        fetchCandidates()
        showToast('Failed to update candidates')
        return
      }
      showToast(`${ids.length} candidate${ids.length > 1 ? 's' : ''} ${newStatus}`)
    } catch {
      fetchCandidates()
      showToast('Failed to update candidates')
    } finally {
      setActing((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.delete(id))
        return next
      })
    }
  }

  const handleBulkApprove = () => {
    const pendingIds = filtered.filter((c) => c.status === 'pending').map((c) => c.id)
    if (pendingIds.length === 0) return
    handleAction(pendingIds, 'approve')
  }

  const handleSyncSheet = async () => {
    if (!selectedClient) return
    setSyncing(true)
    try {
      const res = await fetch('/api/negative-sweep/sync-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: selectedClient }),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast(data.error || 'Sync failed')
        return
      }
      showToast(`${data.written} keywords written to sheet`)
      fetchCandidates()
    } catch {
      showToast('Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  // ─── Filtering ──────────────────────────────────────────

  const filtered = candidates.filter((c) => {
    if (activeTab !== 'all' && c.status !== activeTab) return false
    return true
  })

  const counts = {
    all: candidates.length,
    pending: candidates.filter((c) => c.status === 'pending').length,
    approved: candidates.filter((c) => c.status === 'approved').length,
    rejected: candidates.filter((c) => c.status === 'rejected').length,
  }

  const sweepDates = [...new Set(candidates.map((c) => c.sweepDate))].sort().reverse()

  // ─── Styles ─────────────────────────────────────────────

  const cardStyle: React.CSSProperties = {
    background: 'var(--theme-elevation-50)',
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: 8,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    background: active ? 'var(--theme-elevation-150)' : 'transparent',
    color: 'var(--theme-text)',
  })

  const btnStyle = (variant: 'approve' | 'reject' | 'neutral'): React.CSSProperties => ({
    padding: '4px 10px',
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    background:
      variant === 'approve'
        ? 'var(--theme-success-500, #22c55e)'
        : variant === 'reject'
          ? 'var(--theme-error-500, #ef4444)'
          : 'var(--theme-elevation-150)',
    color: variant === 'neutral' ? 'var(--theme-text)' : '#fff',
  })

  const selectStyle: React.CSSProperties = {
    padding: '4px 8px',
    borderRadius: 4,
    border: '1px solid var(--theme-elevation-150)',
    background: 'var(--theme-elevation-0)',
    color: 'var(--theme-text)',
    fontSize: 12,
  }

  // ─── Render ─────────────────────────────────────────────

  return (
    <div style={{ padding: '24px 0', color: 'var(--theme-text)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Negative Keyword Sweep</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleBulkApprove} style={btnStyle('approve')} disabled={counts.pending === 0}>
            Approve All Pending ({counts.pending})
          </button>
          <button onClick={handleSyncSheet} style={btnStyle('neutral')} disabled={syncing || counts.approved === 0}>
            {syncing ? 'Writing...' : 'Write Approved to Sheet'}
          </button>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <select
          value={selectedClient}
          onChange={(e) => setSelectedClient(e.target.value)}
          style={{ ...selectStyle, padding: '6px 10px', fontSize: 13 }}
        >
          <option value="">Select client...</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {sweepDates.length > 0 && (
          <select
            value={sweepDateFilter}
            onChange={(e) => setSweepDateFilter(e.target.value)}
            style={{ ...selectStyle, padding: '6px 10px', fontSize: 13 }}
          >
            <option value="">All sweep dates</option>
            {sweepDates.map((d) => (
              <option key={d} value={d}>
                {formatDate(d)}
              </option>
            ))}
          </select>
        )}

        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {(['all', 'pending', 'approved', 'rejected'] as FilterTab[]).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={tabStyle(activeTab === tab)}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)} ({counts[tab]})
            </button>
          ))}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            background: 'var(--theme-elevation-800)',
            color: '#fff',
            padding: '10px 20px',
            borderRadius: 8,
            fontSize: 13,
            zIndex: 9999,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          {toast}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--theme-elevation-500)' }}>Loading...</div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            color: 'var(--theme-elevation-500)',
            background: 'var(--theme-elevation-50)',
            borderRadius: 8,
          }}
        >
          {candidates.length === 0
            ? 'No candidates found. Run a sweep first or select a different client.'
            : `No ${activeTab} candidates.`}
        </div>
      )}

      {/* Cards grid */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
          {filtered.map((c) => (
            <CandidateCard
              key={c.id}
              candidate={c}
              sheetLists={sheetLists}
              acting={acting.has(c.id)}
              onAction={handleAction}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Card Component ───────────────────────────────────────

function CandidateCard({
  candidate,
  sheetLists,
  acting,
  onAction,
}: {
  candidate: Candidate
  sheetLists: SheetList[]
  acting: boolean
  onAction: (ids: string[], action: 'approve' | 'reject', assignedList?: string, matchType?: string) => void
}) {
  const [localList, setLocalList] = useState(candidate.assignedList || candidate.suggestedList || '')
  const [localMatch, setLocalMatch] = useState(candidate.matchType || 'exact')

  const statusColor =
    candidate.status === 'approved'
      ? 'var(--theme-success-500, #22c55e)'
      : candidate.status === 'rejected'
        ? 'var(--theme-error-500, #ef4444)'
        : 'var(--theme-elevation-500)'

  const selectStyle: React.CSSProperties = {
    padding: '3px 6px',
    borderRadius: 4,
    border: '1px solid var(--theme-elevation-150)',
    background: 'var(--theme-elevation-0)',
    color: 'var(--theme-text)',
    fontSize: 11,
  }

  const btnSmall = (variant: 'approve' | 'reject'): React.CSSProperties => ({
    padding: '4px 10px',
    borderRadius: 4,
    border: 'none',
    cursor: acting ? 'not-allowed' : 'pointer',
    fontSize: 11,
    fontWeight: 500,
    opacity: acting ? 0.5 : 1,
    background:
      variant === 'approve' ? 'var(--theme-success-500, #22c55e)' : 'var(--theme-error-500, #ef4444)',
    color: '#fff',
  })

  return (
    <div
      style={{
        background: 'var(--theme-elevation-50)',
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 8,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        opacity: candidate.writtenToSheet ? 0.6 : 1,
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 600, fontSize: 14, wordBreak: 'break-word' }}>
            {candidate.searchTerm}
          </span>
          {candidate.suggestedNegative && candidate.suggestedNegative !== candidate.searchTerm && (
            <div style={{ fontSize: 12, marginTop: 2 }}>
              <span style={{ color: 'var(--theme-elevation-500)' }}>Suggested negative: </span>
              <span style={{ fontWeight: 600, color: 'var(--theme-success-500, #22c55e)' }}>
                {candidate.suggestedNegative}
              </span>
              <span style={{ fontSize: 10, color: 'var(--theme-elevation-400)', marginLeft: 4 }}>
                ({candidate.matchType})
              </span>
            </div>
          )}
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            color: statusColor,
            marginLeft: 8,
            flexShrink: 0,
          }}
        >
          {candidate.writtenToSheet ? 'In Sheet' : candidate.status}
        </span>
      </div>

      {/* Campaign / ad group */}
      {candidate.campaignName && (
        <div style={{ fontSize: 11, color: 'var(--theme-elevation-500)' }}>
          {candidate.campaignName}
          {candidate.adGroupName ? ` > ${candidate.adGroupName}` : ''}
        </div>
      )}

      {/* Metrics row */}
      <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
        <span>
          <strong>{formatCurrency(candidate.cost)}</strong> spend
        </span>
        <span>{candidate.clicks} clicks</span>
        <span>{candidate.impressions} impr</span>
        <span>{candidate.conversions} conv</span>
      </div>

      {/* AI reasoning */}
      {candidate.aiReasoning && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--theme-elevation-500)',
            fontStyle: 'italic',
            lineHeight: 1.3,
          }}
        >
          {candidate.aiReasoning}
        </div>
      )}

      {/* List + match type controls */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
        <select value={localList} onChange={(e) => setLocalList(e.target.value)} style={selectStyle}>
          <option value="">Select list...</option>
          {sheetLists.map((l) => (
            <option key={l.name} value={l.name}>
              {l.name}
            </option>
          ))}
          {candidate.suggestedList &&
            !sheetLists.find((l) => l.name === candidate.suggestedList) && (
              <option value={candidate.suggestedList}>{candidate.suggestedList} (AI)</option>
            )}
        </select>

        <select value={localMatch} onChange={(e) => setLocalMatch(e.target.value as any)} style={selectStyle}>
          <option value="exact">Exact</option>
          <option value="phrase">Phrase</option>
          <option value="broad">Broad</option>
        </select>

        {/* Action buttons */}
        {candidate.status === 'pending' && !candidate.writtenToSheet && (
          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
            <button
              onClick={() => onAction([candidate.id], 'approve', localList, localMatch)}
              disabled={acting}
              style={btnSmall('approve')}
            >
              Approve
            </button>
            <button
              onClick={() => onAction([candidate.id], 'reject')}
              disabled={acting}
              style={btnSmall('reject')}
            >
              Reject
            </button>
          </div>
        )}
      </div>

      {/* Sweep date */}
      <div style={{ fontSize: 10, color: 'var(--theme-elevation-400)', marginTop: 2 }}>
        Sweep: {formatDate(candidate.sweepDate)}
        {candidate.writtenAt && ` | Written: ${formatDate(candidate.writtenAt)}`}
      </div>
    </div>
  )
}
