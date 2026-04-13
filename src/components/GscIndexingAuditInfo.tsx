'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useState, useEffect, useRef } from 'react'

export default function GscIndexingAuditInfo() {
  const { initialData } = useDocumentInfo()
  const data = initialData as any

  const clientId = typeof data?.client === 'object' ? data?.client?.id : data?.client
  const auditId = data?.id

  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ ok?: boolean; error?: string; auditId?: string } | null>(null)
  const [liveStatus, setLiveStatus] = useState<string | undefined>(data?.status)
  const [liveInspectedCount, setLiveInspectedCount] = useState<number>(data?.inspectedCount || 0)
  const [liveTotalUrls, setLiveTotalUrls] = useState<number>(data?.totalUrls || 0)
  const [liveError, setLiveError] = useState<string | undefined>(data?.error)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const status = liveStatus ?? data?.status

  // Track whether an inspection batch is in-flight to avoid overlapping calls
  const inspectingRef = useRef(false)

  // Auto-poll when audit is active, and drive inspection forward
  useEffect(() => {
    if (!auditId) return
    const isActive = status === 'discovering' || status === 'inspecting'
    if (!isActive) {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }

    const poll = async () => {
      try {
        // If status is "inspecting" and we're not already running a batch,
        // trigger the inspect endpoint to process the next batch of URLs
        if (status === 'inspecting' && !inspectingRef.current) {
          inspectingRef.current = true
          try {
            const inspectRes = await fetch(`/api/gsc/indexing-audit/${auditId}/inspect`, { method: 'POST' })
            const inspectData = await inspectRes.json()
            setLiveStatus(inspectData.status)
            setLiveInspectedCount(inspectData.inspectedCount || 0)
            setLiveTotalUrls(inspectData.totalUrls || 0)
            if (inspectData.error) setLiveError(inspectData.error)
            if (inspectData.status === 'completed' || inspectData.status === 'failed') {
              if (pollRef.current) clearInterval(pollRef.current)
              window.location.reload()
              return
            }
          } finally {
            inspectingRef.current = false
          }
          return // inspect endpoint already gave us fresh data
        }

        // For "discovering" status or fallback, just poll for state
        const res = await fetch(`/api/gsc/indexing-audit/${auditId}`)
        if (!res.ok) return
        const audit = await res.json()
        setLiveStatus(audit.status)
        setLiveInspectedCount(audit.inspectedCount || 0)
        setLiveTotalUrls(audit.totalUrls || 0)
        if (audit.error) setLiveError(audit.error)

        if (audit.status === 'completed' || audit.status === 'failed') {
          if (pollRef.current) clearInterval(pollRef.current)
          window.location.reload()
        }
      } catch {
        inspectingRef.current = false
      }
    }

    pollRef.current = setInterval(poll, 5000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [auditId, status])

  const handleRunAudit = async () => {
    if (!clientId) return
    setRunning(true)
    setResult(null)
    try {
      const res = await fetch('/api/gsc/indexing-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: String(clientId) }),
      })
      const json = await res.json()
      if (res.ok && json.ok) {
        setResult({ ok: true, auditId: json.auditId })
        // Redirect to the new audit if it's a different one
        if (json.auditId && String(json.auditId) !== String(data?.id)) {
          window.location.href = `/admin/collections/gsc-indexing-audits/${json.auditId}`
        } else {
          // Same audit (was already active), just reload to see updates
          window.location.reload()
        }
      } else {
        setResult({ error: json.error || 'Failed to start audit' })
      }
    } catch {
      setResult({ error: 'Network error. Check your connection.' })
    } finally {
      setRunning(false)
    }
  }

  // Consider audit stuck if status is active but updatedAt is >5 minutes ago
  const updatedAt = data?.updatedAt ? new Date(data.updatedAt).getTime() : 0
  const stuckMinutes = updatedAt ? (Date.now() - updatedAt) / 60000 : 0
  const isStuck = (status === 'discovering' || status === 'inspecting') && stuckMinutes > 5

  const isStuckOrFailed = status === 'failed' || status === 'completed' || isStuck
  const isActive = (status === 'discovering' || status === 'inspecting') && !isStuck

  return (
    <div
      style={{
        background: '#f0f9ff',
        border: '1px solid #bae6fd',
        borderRadius: 8,
        padding: '16px 20px',
        marginBottom: 8,
        fontSize: 13,
        lineHeight: 1.6,
        color: '#1e3a5f',
      }}
    >
      <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700 }}>How Indexing Audits Work</h4>

      <p style={{ margin: '0 0 8px' }}>
        This feature inspects <strong>every URL</strong> on a client's site through Google's URL Inspection API
        to build a complete picture of what's indexed and what's not, with specific reasons for each page.
      </p>

      <ol style={{ margin: '0 0 8px', paddingLeft: 20 }}>
        <li>
          <strong>URL Discovery</strong> — The system finds all URLs from the client's sitemaps
          (parsed recursively) and from search analytics data (last 90 days).
        </li>
        <li>
          <strong>Inspection</strong> — Each URL is inspected via the URL Inspection API. URLs are processed
          in batches of 25 and saved as they go, so partial results are visible while inspection continues.
        </li>
        <li>
          <strong>Results</strong> — Open the <strong>Results</strong> tab to see a summary, breakdown by
          coverage state, and a searchable/filterable table of every URL with its status and recommended actions.
        </li>
      </ol>

      {/* Run / Re-run audit button */}
      {clientId && (
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleRunAudit}
            disabled={running || isActive}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: 'none',
              background: isActive ? '#94a3b8' : '#2563eb',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: running || isActive ? 'default' : 'pointer',
              opacity: running || isActive ? 0.7 : 1,
            }}
          >
            {running
              ? 'Starting audit...'
              : isActive
              ? 'Audit in progress...'
              : isStuckOrFailed || status === 'completed'
              ? 'Run New Audit'
              : 'Run Indexing Audit'}
          </button>

          {isActive && (
            <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 500 }}>
              {status === 'discovering'
                ? 'Discovering URLs from sitemaps...'
                : `Inspecting URLs... ${liveInspectedCount}/${liveTotalUrls}`}
              <span style={{ marginLeft: 6, display: 'inline-block', animation: 'pulse 1.5s infinite' }}>
                Auto-refreshing
              </span>
            </span>
          )}

          {isStuck && (
            <span style={{ fontSize: 12, color: '#d97706', fontWeight: 500 }}>
              This audit appears stuck (no progress for {Math.round(stuckMinutes)} min). Click "Run New Audit" to start fresh.
            </span>
          )}

          {result?.error && (
            <span style={{ color: '#dc2626', fontSize: 12 }}>{result.error}</span>
          )}

          {liveError && (
            <div style={{ marginTop: 8, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#991b1b', width: '100%' }}>
              <strong>Error:</strong> {liveError}
            </div>
          )}
        </div>
      )}

      {!clientId && (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: '#64748b' }}>
          Select a client in the sidebar to enable running an audit.
        </p>
      )}

      <p style={{ margin: '12px 0 0', fontSize: 12, color: '#64748b' }}>
        <strong>Statuses:</strong> Discovering (finding URLs) → Inspecting (batches running, partial results visible) →
        Completed (all URLs checked). If something goes wrong, it shows as Failed with an error message.
      </p>
    </div>
  )
}
