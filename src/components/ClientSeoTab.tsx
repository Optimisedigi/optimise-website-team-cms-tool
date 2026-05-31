'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useEffect, useState } from 'react'
import SeoMigrationCheckView, { type MigrationResult } from './SeoMigrationCheckView'

/**
 * Per-client SEO tab (rendered inside the Clients collection "SEO" tab).
 *
 * Mirrors the Google Ads client tab: interactive tools scoped to THIS client.
 * Currently surfaces the Post-Migration SEO Review runner + quick links to the
 * client's SEO records (audits, GSC alerts, indexing audits).
 */

interface PastReview {
  id: number
  title: string
  status: string
  overallScore: number | null
  cutoverDate: string
  runAt: string | null
  createdAt: string
}

const ClientSeoTab = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()

  const gscConnected = !!fields?.gscConnected?.value

  const [cutoverDate, setCutoverDate] = useState('')
  const [isDomainMove, setIsDomainMove] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<MigrationResult | null>(null)
  const [past, setPast] = useState<PastReview[]>([])

  useEffect(() => {
    if (!id) return
    fetch(`/api/gsc/migration-check?clientId=${id}`)
      .then((r) => (r.ok ? r.json() : { reviews: [] }))
      .then((d) => setPast(Array.isArray(d.reviews) ? d.reviews : []))
      .catch(() => setPast([]))
  }, [id])

  if (!id) {
    return <div style={{ color: '#6b7280', fontSize: 13 }}>Save the client first to use SEO tools.</div>
  }

  const run = async () => {
    if (!cutoverDate) {
      setError('Enter the cutover date.')
      return
    }
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/gsc/migration-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: id, cutoverDate, isDomainMove }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Review failed')
      } else {
        setResult(data.result as MigrationResult)
        fetch(`/api/gsc/migration-check?clientId=${id}`)
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

  const loadPast = async (reviewId: number) => {
    setRunning(true)
    setError(null)
    try {
      const res = await fetch(`/api/seo-migration-checks/${reviewId}?depth=0`)
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

  const quickLinks: Array<{ label: string; href: string }> = [
    { label: 'SEO Audit Scores', href: `/admin/collections/seo-audits?where[client][equals]=${id}` },
    { label: 'GSC Indexing Audits', href: `/admin/collections/gsc-indexing-audits?where[client][equals]=${id}` },
    { label: 'GSC Alerts', href: `/admin/collections/gsc-alerts?where[client][equals]=${id}` },
    { label: 'Site Health Reports', href: `/admin/collections/site-health-reports?where[client][equals]=${id}` },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Post-Migration SEO Review */}
      <div className="od-box">
        <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>Post-Migration SEO Review</div>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
          After a site migration, check redirects, indexing, soft-404s, performance and Core Web Vitals
          against best practice for this client.
        </div>

        {!gscConnected && (
          <div style={{ fontSize: 13, color: '#b45309', marginBottom: 10 }}>
            This client isn’t connected to Google Search Console. Connect GSC on the Integrations tab to run a review.
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#475569' }}>
            Cutover date
            <input
              type="date"
              value={cutoverDate}
              onChange={(e) => setCutoverDate(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: '#475569', paddingBottom: 8 }}>
            <input type="checkbox" checked={isDomainMove} onChange={(e) => setIsDomainMove(e.target.checked)} />
            Domain move
          </label>
          <button
            type="button"
            onClick={run}
            disabled={running || !cutoverDate || !gscConnected}
            style={{
              padding: '8px 18px',
              fontSize: 13,
              borderRadius: 6,
              border: 'none',
              color: '#fff',
              background: running || !cutoverDate || !gscConnected ? '#9ca3af' : '#2563eb',
              cursor: running || !cutoverDate || !gscConnected ? 'not-allowed' : 'pointer',
            }}
          >
            {running ? 'Running…' : 'Run review'}
          </button>
        </div>
        {error && <div style={{ fontSize: 13, color: '#b91c1c', marginTop: 10 }}>{error}</div>}
        {running && (
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 10 }}>
            Tracing redirects + pulling GSC data. This can take 30–90 seconds for large sites.
          </div>
        )}

        {past.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 6, fontSize: 13 }}>Previous reviews</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {past.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => loadPast(p.id)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
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
      </div>

      {result && (
        <div className="od-box">
          <SeoMigrationCheckView result={result} />
        </div>
      )}

      {/* Quick links to this client's SEO records */}
      <div className="od-box">
        <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 10 }}>This client’s SEO records</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {quickLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              style={{
                padding: '6px 12px',
                fontSize: 13,
                borderRadius: 6,
                border: '1px solid #e2e8f0',
                color: '#2563eb',
                textDecoration: 'none',
                background: '#f8fafc',
              }}
            >
              {l.label} →
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  fontSize: 13,
}

export default ClientSeoTab
