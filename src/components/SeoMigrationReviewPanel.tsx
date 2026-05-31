'use client'

import { useEffect, useMemo, useState } from 'react'
import SeoMigrationCheckView, { type MigrationResult } from './SeoMigrationCheckView'

/**
 * Live Post-Migration SEO Review tool (SEO hub tab).
 *
 * Pick a GSC-connected client + the cutover date, run the check, and render the
 * scored checklist. Past reviews for the client are listed for quick reload.
 */

interface ClientRow {
  id: number
  name: string
  gscConnected: boolean
}

interface PastReview {
  id: number
  title: string
  status: string
  cutoverDate: string
  overallScore: number | null
  runAt: string | null
  createdAt: string
}

const SeoMigrationReviewPanel = () => {
  const [clients, setClients] = useState<ClientRow[]>([])
  const [clientId, setClientId] = useState<number | ''>('')
  const [cutoverDate, setCutoverDate] = useState('')
  const [isDomainMove, setIsDomainMove] = useState(false)
  const [loadingClients, setLoadingClients] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<MigrationResult | null>(null)
  const [past, setPast] = useState<PastReview[]>([])

  useEffect(() => {
    fetch('/api/clients/list')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) setClients(data)
        setLoadingClients(false)
      })
      .catch(() => setLoadingClients(false))
  }, [])

  const connectedClients = useMemo(
    () => clients.filter((c) => c.gscConnected).sort((a, b) => a.name.localeCompare(b.name)),
    [clients],
  )

  // Load past reviews when a client is chosen.
  useEffect(() => {
    if (!clientId) {
      setPast([])
      return
    }
    fetch(`/api/gsc/migration-check?clientId=${clientId}`)
      .then((r) => (r.ok ? r.json() : { reviews: [] }))
      .then((d) => setPast(Array.isArray(d.reviews) ? d.reviews : []))
      .catch(() => setPast([]))
  }, [clientId])

  const run = async () => {
    if (!clientId || !cutoverDate) {
      setError('Select a client and the cutover date.')
      return
    }
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/gsc/migration-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, cutoverDate, isDomainMove }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Review failed')
      } else {
        setResult(data.result as MigrationResult)
        // Refresh the past list.
        fetch(`/api/gsc/migration-check?clientId=${clientId}`)
          .then((r) => (r.ok ? r.json() : { reviews: [] }))
          .then((d) => setPast(Array.isArray(d.reviews) ? d.reviews : []))
          .catch(() => {})
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setRunning(false)
    }
  }

  const loadPast = async (id: number) => {
    setRunning(true)
    setError(null)
    try {
      const res = await fetch(`/api/seo-migration-checks/${id}?depth=0`)
      if (res.ok) {
        const doc = await res.json()
        setResult({
          siteUrl: doc.siteUrl,
          cutoverDate: doc.cutoverDate,
          isDomainMove: doc.isDomainMove,
          overallScore: doc.overallScore,
          scoresByPhase: doc.scoresByPhase,
          checklist: doc.checklist,
          actions: doc.actions,
          performance: doc.performance,
          runAt: doc.runAt,
        })
      } else {
        setError('Could not load that review.')
      }
    } catch {
      setError('Could not load that review.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div>
      {/* Controls */}
      <div className="od-box" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#475569' }}>
            Client (GSC-connected)
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : '')}
              className="od-gsc-page__date-input"
              style={{ minWidth: 240 }}
              disabled={loadingClients}
            >
              <option value="">{loadingClients ? 'Loading…' : 'Select a client…'}</option>
              {connectedClients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#475569' }}>
            Cutover date
            <input
              type="date"
              value={cutoverDate}
              onChange={(e) => setCutoverDate(e.target.value)}
              className="od-gsc-page__date-input"
            />
          </label>

          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: '#475569', paddingBottom: 8 }}>
            <input type="checkbox" checked={isDomainMove} onChange={(e) => setIsDomainMove(e.target.checked)} />
            Domain move
          </label>

          <button
            type="button"
            onClick={run}
            disabled={running || !clientId || !cutoverDate}
            className="od-settings__btn od-settings__btn--primary"
            style={{ padding: '8px 18px', fontSize: 13 }}
          >
            {running ? 'Running…' : 'Run review'}
          </button>
        </div>
        {connectedClients.length === 0 && !loadingClients && (
          <div style={{ fontSize: 12, color: '#b45309', marginTop: 10 }}>
            No GSC-connected clients found. Connect Search Console on a client first.
          </div>
        )}
        {error && <div style={{ fontSize: 13, color: '#b91c1c', marginTop: 10 }}>{error}</div>}
        {running && (
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 10 }}>
            Tracing redirects + pulling GSC data. This can take 30–90 seconds for large sites.
          </div>
        )}
      </div>

      {/* Past reviews */}
      {past.length > 0 && (
        <div className="od-box" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 8, fontSize: 13 }}>Previous reviews</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {past.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => loadPast(p.id)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'none',
                  border: 'none',
                  borderBottom: '1px solid #f1f5f9',
                  padding: '6px 0',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 13,
                  color: '#0f172a',
                }}
              >
                <span>{p.title || `Review ${p.id}`}</span>
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  {p.overallScore != null ? `${p.overallScore}/100` : p.status} ·{' '}
                  {p.runAt || p.createdAt ? new Date(p.runAt || p.createdAt).toLocaleDateString('en-GB') : ''}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {result && <SeoMigrationCheckView result={result} />}
    </div>
  )
}

export default SeoMigrationReviewPanel
