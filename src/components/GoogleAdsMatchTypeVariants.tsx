'use client'

import { useAllFormFields, useDocumentInfo } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'
import MatchTypeViolationReview from './match-type-violations/MatchTypeViolationReview'

type TabKey = 'violations' | 'consolidations'

type RelationshipValue = string | number | { id?: string | number; value?: string | number } | null | undefined

interface ConsolidationCandidate {
  id: string | number
  phraseCandidate: string
  exactNegativesToRemove?: Array<{ keyword?: string } | string>
  exactCount?: number
  overlapRisk?: boolean
  overlapDetails?: string
  nklName?: string
  nkl?: { id: string | number; name?: string } | string | number
  status: 'pending' | 'approved' | 'rejected'
}

interface ConsolidationResponse {
  docs: ConsolidationCandidate[]
  totalDocs: number
  page: number
  totalPages: number
}

function relationshipId(value: RelationshipValue): string | null {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (value && typeof value === 'object') {
    if (typeof value.id === 'string' || typeof value.id === 'number') return String(value.id)
    if (typeof value.value === 'string' || typeof value.value === 'number') return String(value.value)
  }
  return null
}

function buttonStyle(variant: 'primary' | 'ghost' | 'danger', disabled = false): React.CSSProperties {
  const background = variant === 'primary' ? '#2563eb' : variant === 'danger' ? '#dc2626' : 'white'
  return {
    padding: '6px 12px',
    borderRadius: 6,
    border: variant === 'ghost' ? '1px solid #d1d5db' : 'none',
    background: disabled ? '#d1d5db' : background,
    color: variant === 'ghost' ? '#374151' : 'white',
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
  }
}

function badgeStyle(bg: string, color: string): React.CSSProperties {
  return {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 999,
    background: bg,
    color,
    fontSize: 11,
    fontWeight: 600,
  }
}

function statusBadge(status: string): React.CSSProperties {
  if (status === 'approved') return badgeStyle('#dcfce7', '#166534')
  if (status === 'rejected') return badgeStyle('#f3f4f6', '#4b5563')
  return badgeStyle('#dbeafe', '#1e40af')
}

function getExactKeyword(item: { keyword?: string } | string): string {
  return typeof item === 'string' ? item : item.keyword ?? ''
}

function ConsolidationReview({ clientId }: { clientId: string | null }) {
  const [docs, setDocs] = useState<ConsolidationCandidate[]>([])
  const [totalDocs, setTotalDocs] = useState(0)
  const [status, setStatus] = useState('pending')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<Set<string | number>>(new Set())

  const fetchDocs = useCallback(async () => {
    if (!clientId) return
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ client: clientId, limit: '50', page: '1' })
    if (status) params.set('status', status)

    try {
      const res = await fetch(`/api/consolidation-candidates?${params}`, { credentials: 'include' })
      if (!res.ok) throw new Error(await res.text())
      const data = (await res.json()) as ConsolidationResponse
      setDocs(data.docs)
      setTotalDocs(data.totalDocs)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load consolidation candidates')
    } finally {
      setLoading(false)
    }
  }, [clientId, status])

  useEffect(() => {
    void fetchDocs()
  }, [fetchDocs])

  const runAction = async (id: string | number, action: 'approve' | 'reject') => {
    if (action === 'approve' && !confirm('Approve this consolidation and apply it to Google Ads?')) return
    if (action === 'reject' && !confirm('Reject this consolidation candidate?')) return

    setActionLoading((prev) => new Set(prev).add(id))
    try {
      const res = await fetch(`/api/consolidation-candidates/${id}/${action}`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) throw new Error(await res.text())
      await fetchDocs()
    } catch (err) {
      alert(err instanceof Error ? err.message : `Failed to ${action} candidate`)
    } finally {
      setActionLoading((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  if (!clientId) {
    return (
      <div style={{ padding: 24, border: '1px solid #fcd34d', borderRadius: 8, background: '#fef3c7', color: '#92400e' }}>
        Save or link this record to a client to view consolidation candidates.
      </div>
    )
  }

  return (
    <div style={{ padding: '0 24px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Consolidation Candidates</h2>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
            Review phrase negatives that replace many exact negatives as NKLs approach the 5,000 limit.
          </p>
        </div>
        <select value={status} onChange={(event) => setStatus(event.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="">All Statuses</option>
        </select>
      </div>

      <div style={{ marginBottom: 16, padding: '12px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, color: '#1e40af', fontSize: 13, lineHeight: 1.6 }}>
        <strong>How it works —</strong> approving adds the proposed phrase negative, removes the listed exact negatives, syncs the change via Growth Tools, and dismisses related notifications. {totalDocs} candidate{totalDocs === 1 ? '' : 's'} match the current filter.
      </div>

      {error && <div style={{ padding: 12, border: '1px solid #fecaca', borderRadius: 6, background: '#fef2f2', color: '#dc2626', marginBottom: 16, fontSize: 13 }}>{error}</div>}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading…</div>
      ) : docs.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280', border: '1px dashed #d1d5db', borderRadius: 8 }}>No consolidation candidates found.</div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {docs.map((doc) => {
            const exacts = doc.exactNegativesToRemove ?? []
            const loadingAction = actionLoading.has(doc.id)
            const nklName = typeof doc.nkl === 'object' ? doc.nkl.name : doc.nklName
            return (
              <div key={String(doc.id)} style={{ border: '1px solid #e5e7eb', borderRadius: 8, background: 'white', padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                      <strong style={{ fontSize: 16 }}>&quot;{doc.phraseCandidate}&quot;</strong>
                      <span style={statusBadge(doc.status)}>{doc.status}</span>
                      {doc.overlapRisk && <span style={badgeStyle('#fee2e2', '#991b1b')}>Overlap risk</span>}
                    </div>
                    <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>
                      {doc.exactCount ?? exacts.length} exact negatives → one phrase negative{nklName ? ` · ${nklName}` : ''}
                    </p>
                  </div>
                  {doc.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button disabled={loadingAction} onClick={() => void runAction(doc.id, 'approve')} style={buttonStyle('primary', loadingAction)}>Approve</button>
                      <button disabled={loadingAction} onClick={() => void runAction(doc.id, 'reject')} style={buttonStyle('ghost', loadingAction)}>Reject</button>
                    </div>
                  )}
                </div>

                {doc.overlapDetails && (
                  <div style={{ marginTop: 12, padding: 10, borderRadius: 6, background: '#fef2f2', color: '#991b1b', fontSize: 12, whiteSpace: 'pre-wrap' }}>
                    {doc.overlapDetails}
                  </div>
                )}

                {exacts.length > 0 && (
                  <details style={{ marginTop: 12 }}>
                    <summary style={{ cursor: 'pointer', color: '#374151', fontSize: 13, fontWeight: 600 }}>
                      Exact negatives to remove ({exacts.length})
                    </summary>
                    <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {exacts.slice(0, 80).map((exact, index) => (
                        <span key={`${String(doc.id)}-${index}`} style={badgeStyle('#f3f4f6', '#374151')}>
                          [{getExactKeyword(exact)}]
                        </span>
                      ))}
                      {exacts.length > 80 && <span style={{ color: '#6b7280', fontSize: 12 }}>+{exacts.length - 80} more</span>}
                    </div>
                  </details>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function GoogleAdsMatchTypeVariants() {
  const { collectionSlug, id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [activeTab, setActiveTab] = useState<TabKey>('violations')
  const [auditClientId, setAuditClientId] = useState<string | null>(null)

  const clientFromForm = relationshipId(fields?.client?.value as RelationshipValue)
  const clientId = collectionSlug === 'clients' ? relationshipId(id as RelationshipValue) : clientFromForm ?? auditClientId

  useEffect(() => {
    if (collectionSlug !== 'google-ads-audits' || clientFromForm || !id) return

    fetch(`/api/google-ads-audits/${id}?depth=0`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((doc) => setAuditClientId(relationshipId(doc?.client as RelationshipValue)))
      .catch(() => setAuditClientId(null))
  }, [clientFromForm, collectionSlug, id])

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid #e5e7eb', margin: '0 24px 20px' }}>
        <button onClick={() => setActiveTab('violations')} style={{ padding: '10px 14px', border: 'none', borderBottom: activeTab === 'violations' ? '2px solid #2563eb' : '2px solid transparent', background: 'transparent', color: activeTab === 'violations' ? '#2563eb' : '#4b5563', fontWeight: 600, cursor: 'pointer' }}>
          Match type violations
        </button>
        <button onClick={() => setActiveTab('consolidations')} style={{ padding: '10px 14px', border: 'none', borderBottom: activeTab === 'consolidations' ? '2px solid #2563eb' : '2px solid transparent', background: 'transparent', color: activeTab === 'consolidations' ? '#2563eb' : '#4b5563', fontWeight: 600, cursor: 'pointer' }}>
          Consolidation candidates
        </button>
      </div>

      {activeTab === 'violations' ? (
        clientId ? <MatchTypeViolationReview initialClientId={clientId} /> : <div style={{ margin: '0 24px', padding: 24, border: '1px solid #fcd34d', borderRadius: 8, background: '#fef3c7', color: '#92400e' }}>Save or link this record to a client to view match type violations.</div>
      ) : (
        <ConsolidationReview clientId={clientId} />
      )}
    </div>
  )
}
