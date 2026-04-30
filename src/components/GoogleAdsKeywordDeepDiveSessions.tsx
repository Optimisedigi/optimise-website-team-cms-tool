'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

/**
 * Renders inside the Google Ads Audit edit view as the "Negative Keyword
 * Submits" tab. Lists every submission made by the client from the dashboard's
 * Keyword Deep Dive tool and lets the agency open a submission to review and
 * apply its keywords to a Negative Keyword List.
 *
 * Mirrors the look-and-feel of GoogleAdsNegativeKeywordLists for consistency.
 */

interface SessionRecord {
  id: number
  title: string
  keywordCount: number
  status: 'pending' | 'applied' | 'archived'
  appliedToNKL?: { id: number; name: string } | number | null
  createdAt: string
  updatedAt: string
}

const card: React.CSSProperties = {
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  padding: 16,
  marginBottom: 12,
}

const badge = (color: 'green' | 'blue' | 'amber' | 'gray' | 'red'): React.CSSProperties => ({
  display: 'inline-block',
  padding: '2px 10px',
  borderRadius: 12,
  fontSize: 12,
  fontWeight: 600,
  background:
    color === 'green'
      ? '#dcfce7'
      : color === 'blue'
        ? '#dbeafe'
        : color === 'amber'
          ? '#fef3c7'
          : color === 'red'
            ? '#fee2e2'
            : '#f1f5f9',
  color:
    color === 'green'
      ? '#166534'
      : color === 'blue'
        ? '#1e40af'
        : color === 'amber'
          ? '#92400e'
          : color === 'red'
            ? '#991b1b'
            : '#475569',
})

const statusMeta: Record<SessionRecord['status'], { label: string; color: 'green' | 'amber' | 'gray' }> = {
  pending: { label: 'Pending Review', color: 'amber' },
  applied: { label: 'Applied to NKL', color: 'green' },
  archived: { label: 'Archived', color: 'gray' },
}

const GoogleAdsKeywordDeepDiveSessions = () => {
  const { id } = useDocumentInfo()

  const [clientId, setClientId] = useState<number | null>(null)
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Resolve the client ID from the audit doc.
  useEffect(() => {
    if (!id) return
    fetch(`/api/google-ads-audits/${id}?depth=0`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((doc) => {
        if (doc?.client) {
          const cid = typeof doc.client === 'object' ? doc.client.id : doc.client
          setClientId(cid)
        }
      })
      .catch(() => {})
  }, [id])

  // Fetch sessions for this client (depth=1 so we can show the linked NKL name).
  useEffect(() => {
    if (!clientId) {
      setLoading(false)
      return
    }
    setLoading(true)
    fetch(
      `/api/keyword-deep-dive-sessions?where[client][equals]=${clientId}&sort=-createdAt&limit=100&depth=1`,
      { credentials: 'include' },
    )
      .then((res) => {
        if (!res.ok) throw new Error(`Failed (${res.status})`)
        return res.json()
      })
      .then((data) => setSessions(data.docs || []))
      .catch((err) => setError(err.message || 'Failed to load sessions'))
      .finally(() => setLoading(false))
  }, [clientId])

  if (!id) return null

  if (!clientId && !loading) {
    return (
      <div style={{ maxWidth: 960 }}>
        <div style={{ ...card, background: '#fef3c7', borderColor: '#fcd34d' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#92400e' }}>
            <strong>No client linked.</strong> Link a client in the sidebar to view their Negative Keyword Submits.
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 960, padding: 16 }}>
        <p style={{ fontSize: 13, color: '#94a3b8' }}>Loading negative keyword submits…</p>
      </div>
    )
  }

  const totalKeywords = sessions.reduce((sum, s) => sum + (s.keywordCount || 0), 0)
  const pending = sessions.filter((s) => s.status === 'pending')
  const applied = sessions.filter((s) => s.status === 'applied')

  return (
    <div style={{ maxWidth: 960 }}>
      {/* Info banner */}
      <div style={{ ...card, background: '#eff6ff', borderColor: '#bfdbfe', marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: '#1e40af', lineHeight: 1.6 }}>
          <strong>Negative Keyword Submits</strong> — Submissions sent by the client from the Google Ads dashboard's
          Keyword Deep Dive tool. Each submission is a batch of search terms the client flagged for the team to
          review. Open a submission to apply its keywords to one of this client's Negative Keyword Lists.
        </p>
      </div>

      {error && (
        <div style={{ ...card, background: '#fee2e2', borderColor: '#fca5a5' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#991b1b' }}>{error}</p>
        </div>
      )}

      {/* Summary */}
      <div
        style={{
          ...card,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Total Submits</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{sessions.length}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Pending Review</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#d97706' }}>{pending.length}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Applied</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#16a34a' }}>{applied.length}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Total Keywords</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{totalKeywords.toLocaleString()}</div>
        </div>
      </div>

      {/* Empty state */}
      {sessions.length === 0 && (
        <div style={card}>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            No negative keyword submits yet. The client will create these from the Google Ads dashboard by
            selecting irrelevant search terms and clicking <strong>Save for Review</strong>.
          </p>
        </div>
      )}

      {/* Session cards */}
      {sessions.map((s) => {
        const meta = statusMeta[s.status]
        const appliedNKL =
          s.appliedToNKL && typeof s.appliedToNKL === 'object'
            ? s.appliedToNKL
            : null
        const borderColor =
          s.status === 'applied' ? '#16a34a' : s.status === 'pending' ? '#d97706' : '#94a3b8'

        return (
          <div
            key={s.id}
            style={{
              ...card,
              opacity: s.status === 'archived' ? 0.6 : 1,
              borderLeft: `4px solid ${borderColor}`,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: 1, minWidth: 200 }}>
                <a
                  href={`/admin/collections/keyword-deep-dive-sessions/${s.id}`}
                  target="_blank"
                  style={{
                    fontWeight: 600,
                    fontSize: 14,
                    color: '#1e293b',
                    textDecoration: 'none',
                  }}
                >
                  {s.title || `Submit #${s.id}`}
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ marginLeft: 6, verticalAlign: 'middle' }}
                  >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <span style={badge(meta.color)}>{meta.label}</span>
                  <span style={badge('blue')}>{s.keywordCount || 0} keywords</span>
                  {appliedNKL && (
                    <span style={badge('green')}>
                      → {appliedNKL.name}
                    </span>
                  )}
                </div>
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: '#94a3b8',
                  textAlign: 'right',
                  whiteSpace: 'nowrap',
                }}
              >
                Created {new Date(s.createdAt).toLocaleDateString()}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default GoogleAdsKeywordDeepDiveSessions
