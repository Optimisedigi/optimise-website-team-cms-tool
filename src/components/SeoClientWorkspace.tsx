'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useCallback, useEffect, useState } from 'react'
import SeoMigrationCheckView, { type MigrationResult } from './SeoMigrationCheckView'

interface ClientSummary {
  id: number | string
  name: string
  gscConnected?: boolean
}

interface SeoClientWorkspaceProps {
  client: ClientSummary
}

interface RecordRow {
  id: number | string
  title?: string
  createdAt?: string
  status?: string
  score?: number | null
  url?: string
}

interface PastReview {
  id: number
  title: string
  status: string
  overallScore: number | null
  cutoverDate: string
  runAt: string | null
  createdAt: string
}

type TabKey = 'audits' | 'migration' | 'internalLinks' | 'quarterly' | 'health' | 'gsc'

type ApiRecord = Record<string, unknown>

const textValue = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)
const numberValue = (value: unknown): number | null => (typeof value === 'number' ? value : null)
const idValue = (value: unknown): string | number => (typeof value === 'string' || typeof value === 'number' ? value : '')

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'audits', label: 'SEO audit scores' },
  { key: 'migration', label: 'SEO migration' },
  { key: 'internalLinks', label: 'Internal link suggestions' },
  { key: 'quarterly', label: 'Quarterly organic growth snapshots' },
  { key: 'health', label: 'Site health reports' },
  { key: 'gsc', label: 'Search Console' },
]

const collectionUrl = (slug: string, clientId: string | number): string =>
  `/admin/collections/${slug}?where[client][equals]=${encodeURIComponent(String(clientId))}`

const recordUrl = (slug: string, id: string | number): string => `/admin/collections/${slug}/${id}`

const formatDate = (value?: string): string => {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const mapSeoAuditRecord = (doc: ApiRecord): RecordRow => ({
  id: idValue(doc.id),
  title: textValue(doc.title) || textValue(doc.auditName) || `SEO audit ${idValue(doc.id)}`,
  createdAt: textValue(doc.createdAt),
  status: textValue(doc.auditStatus),
  score: numberValue(doc.overallScore),
  url: recordUrl('seo-audits', idValue(doc.id)),
})

const mapQuarterlySnapshotRecord = (doc: ApiRecord): RecordRow => ({
  id: idValue(doc.id),
  title: textValue(doc.snapshotDate) || textValue(doc.quarter) || `Snapshot ${idValue(doc.id)}`,
  createdAt: textValue(doc.createdAt),
  status: textValue(doc.snapshotType),
  score: null,
  url: recordUrl('quarterly-organic-growth-snapshots', idValue(doc.id)),
})

const mapSiteHealthRecord = (doc: ApiRecord): RecordRow => ({
  id: idValue(doc.id),
  title: textValue(doc.siteUrl) || `Health report ${idValue(doc.id)}`,
  createdAt: textValue(doc.createdAt),
  status: textValue(doc.reportStatus),
  score: numberValue(doc.healthScore),
  url: recordUrl('site-health-reports', idValue(doc.id)),
})

const mapInternalLinkRecord = (doc: ApiRecord): RecordRow => ({
  id: idValue(doc.id),
  title: textValue(doc.anchorText) || textValue(doc.sourceUrl) || `Suggestion ${idValue(doc.id)}`,
  createdAt: textValue(doc.createdAt),
  status: textValue(doc.status),
  score: numberValue(doc.confidenceScore),
  url: recordUrl('internal-link-suggestions', idValue(doc.id)),
})

const mapGscSnapshotRecord = (doc: ApiRecord): RecordRow => ({
  id: idValue(doc.id),
  title: textValue(doc.propertyUrl) || textValue(doc.siteUrl) || `GSC snapshot ${idValue(doc.id)}`,
  createdAt: textValue(doc.createdAt),
  status: textValue(doc.status),
  score: null,
  url: recordUrl('gsc-snapshots', idValue(doc.id)),
})

const SeoClientWorkspace = ({ client }: SeoClientWorkspaceProps) => {
  const [activeTab, setActiveTab] = useState<TabKey>('audits')

  return (
    <div className="od-settings">
      <a href="/admin/growth-tools/seo" style={{ color: '#2563eb', fontSize: 13, textDecoration: 'none' }}>
        ← Back to SEO clients
      </a>
      <h2 className="od-settings__title" style={{ marginTop: 12 }}>{client.name} · SEO</h2>
      <p className="od-settings__subtitle">
        Client SEO workspace. Switch tabs here to review this client’s SEO tools and records inline.
      </p>

      <div className="od-box" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 0, overflowX: 'auto', borderBottom: '1px solid #e5e7eb', background: '#f8fafc' }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '12px 14px',
                border: 'none',
                borderBottom: activeTab === tab.key ? '3px solid #2563eb' : '3px solid transparent',
                background: activeTab === tab.key ? '#fff' : 'transparent',
                color: activeTab === tab.key ? '#0f172a' : '#64748b',
                fontWeight: activeTab === tab.key ? 700 : 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                fontSize: 13,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div style={{ padding: 16 }}>
          {activeTab === 'audits' && (
            <RecordList
              clientId={client.id}
              collection="seo-audits"
              title="SEO audit scores"
              description="SEO audit reports and score history for this client."
              mapRecord={mapSeoAuditRecord}
            />
          )}
          {activeTab === 'migration' && <MigrationTab client={client} />}
          {activeTab === 'internalLinks' && <InternalLinksTab clientId={client.id} />}
          {activeTab === 'quarterly' && (
            <RecordList
              clientId={client.id}
              collection="quarterly-organic-growth-snapshots"
              title="Quarterly organic growth snapshots"
              description="Quarterly organic performance snapshots for reporting and strategy reviews."
              mapRecord={mapQuarterlySnapshotRecord}
            />
          )}
          {activeTab === 'health' && (
            <RecordList
              clientId={client.id}
              collection="site-health-reports"
              title="Site health reports"
              description="Monthly site health monitoring reports for this client."
              mapRecord={mapSiteHealthRecord}
            />
          )}
          {activeTab === 'gsc' && (
            <RecordList
              clientId={client.id}
              collection="gsc-snapshots"
              title="Search Console snapshots"
              description="Search Console performance snapshots for this client."
              mapRecord={mapGscSnapshotRecord}
              extraLinks={[
                { label: 'Daily metrics', href: collectionUrl('gsc-daily', client.id) },
                { label: 'Alerts', href: collectionUrl('gsc-alerts', client.id) },
                { label: 'Indexing audits', href: collectionUrl('gsc-indexing-audits', client.id) },
              ]}
            />
          )}
        </div>
      </div>
    </div>
  )
}

const RecordList = ({
  clientId,
  collection,
  title,
  description,
  mapRecord,
  extraLinks = [],
  unfiltered = false,
}: {
  clientId: string | number
  collection: string
  title: string
  description: string
  mapRecord: (doc: ApiRecord) => RecordRow
  extraLinks?: Array<{ label: string; href: string }>
  unfiltered?: boolean
}) => {
  const [rows, setRows] = useState<RecordRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const query = unfiltered
      ? `sort=-createdAt&limit=25&depth=0`
      : `where[client][equals]=${encodeURIComponent(String(clientId))}&sort=-createdAt&limit=25&depth=0`
    fetch(`/api/${collection}?${query}`)
      .then((res) => (res.ok ? res.json() : { docs: [] }))
      .then((data) => setRows(Array.isArray(data.docs) ? data.docs.map(mapRecord) : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [clientId, collection, mapRecord, unfiltered])

  return (
    <div>
      <SectionHeader title={title} description={description} actionHref={collectionUrl(collection, clientId)} actionLabel="Open full list" extraLinks={extraLinks} />
      {loading ? (
        <EmptyMessage>Loading…</EmptyMessage>
      ) : rows.length === 0 ? (
        <EmptyMessage>No records found for this client.</EmptyMessage>
      ) : (
        <RecordTable rows={rows} />
      )}
    </div>
  )
}

const MigrationTab = ({ client }: { client: ClientSummary }) => {
  const [cutoverDate, setCutoverDate] = useState('')
  const [isDomainMove, setIsDomainMove] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<MigrationResult | null>(null)
  const [past, setPast] = useState<PastReview[]>([])

  const loadPastReviews = useCallback(() => {
    fetch(`/api/gsc/migration-check?clientId=${client.id}`)
      .then((r) => (r.ok ? r.json() : { reviews: [] }))
      .then((d) => setPast(Array.isArray(d.reviews) ? d.reviews : []))
      .catch(() => setPast([]))
  }, [client.id])

  useEffect(() => {
    loadPastReviews()
  }, [loadPastReviews])

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
        body: JSON.stringify({ clientId: client.id, cutoverDate, isDomainMove }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Review failed')
      } else {
        setResult(data.result as MigrationResult)
        loadPastReviews()
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionHeader
        title="SEO migration"
        description="Run and review post-migration SEO checks for redirects, indexing, soft 404s, performance, and Core Web Vitals."
        actionHref={collectionUrl('seo-migration-checks', client.id)}
        actionLabel="Open full list"
      />

      {!client.gscConnected && (
        <div style={{ fontSize: 13, color: '#b45309' }}>
          This client isn’t connected to Google Search Console. Connect GSC on the client integrations/search setup to run a review.
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#475569' }}>
          Cutover date
          <input type="date" value={cutoverDate} onChange={(e) => setCutoverDate(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: '#475569', paddingBottom: 8 }}>
          <input type="checkbox" checked={isDomainMove} onChange={(e) => setIsDomainMove(e.target.checked)} />
          Domain move
        </label>
        <button
          type="button"
          onClick={run}
          disabled={running || !cutoverDate || !client.gscConnected}
          style={{
            padding: '8px 18px',
            fontSize: 13,
            borderRadius: 6,
            border: 'none',
            color: '#fff',
            background: running || !cutoverDate || !client.gscConnected ? '#9ca3af' : '#2563eb',
            cursor: running || !cutoverDate || !client.gscConnected ? 'not-allowed' : 'pointer',
          }}
        >
          {running ? 'Running…' : 'Run review'}
        </button>
      </div>
      {error && <div style={{ fontSize: 13, color: '#b91c1c' }}>{error}</div>}

      {past.length > 0 && (
        <div>
          <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 6, fontSize: 13 }}>Previous reviews</div>
          {past.map((p) => (
            <button key={p.id} type="button" onClick={() => loadPast(p.id)} style={pastButtonStyle}>
              <span>{p.title || `Review ${p.id}`}</span>
              <span style={{ fontSize: 12, color: '#64748b' }}>
                {p.overallScore != null ? `${p.overallScore}/100` : p.status} · {formatDate(p.runAt || p.createdAt)}
              </span>
            </button>
          ))}
        </div>
      )}

      {result && (
        <div className="od-box">
          <SeoMigrationCheckView result={result} />
        </div>
      )}
    </div>
  )
}

const InternalLinksTab = ({ clientId }: { clientId: string | number }) => (
  <RecordList
    clientId={clientId}
    collection="internal-link-suggestions"
    title="Internal link suggestions"
    description="Review internal link suggestions inline. These are currently global records because this collection has no client field yet."
    mapRecord={mapInternalLinkRecord}
    unfiltered
  />
)

const SectionHeader = ({
  title,
  description,
  actionHref,
  actionLabel,
  extraLinks = [],
}: {
  title: string
  description: string
  actionHref: string
  actionLabel: string
  extraLinks?: Array<{ label: string; href: string }>
}) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 14 }}>
    <div>
      <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 16, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>{description}</div>
    </div>
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {extraLinks.map((link) => (
        <a key={link.href} href={link.href} style={headerLinkStyle}>
          {link.label} →
        </a>
      ))}
      <a href={actionHref} style={headerLinkStyle}>
        {actionLabel} →
      </a>
    </div>
  </div>
)

const RecordTable = ({ rows }: { rows: RecordRow[] }) => (
  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
    <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
      <tr>
        <th style={thStyle}>Record</th>
        <th style={thStyle}>Status</th>
        <th style={thStyle}>Score</th>
        <th style={thStyle}>Created</th>
        <th style={{ ...thStyle, textAlign: 'right' }}></th>
      </tr>
    </thead>
    <tbody>
      {rows.map((row) => (
        <tr key={row.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
          <td style={tdStyle}>{row.title || `Record ${row.id}`}</td>
          <td style={tdStyle}>{row.status || '—'}</td>
          <td style={tdStyle}>{row.score ?? '—'}</td>
          <td style={tdStyle}>{formatDate(row.createdAt)}</td>
          <td style={{ ...tdStyle, textAlign: 'right' }}>
            {row.url && <a href={row.url} style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>Open →</a>}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
)

const EmptyMessage = ({ children }: { children: ReactNode }) => (
  <div style={{ padding: 20, border: '1px dashed #cbd5e1', borderRadius: 8, color: '#64748b', fontSize: 13, background: '#f8fafc' }}>
    {children}
  </div>
)

const headerLinkStyle: CSSProperties = {
  color: '#2563eb',
  fontWeight: 600,
  fontSize: 13,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
}

const inputStyle: CSSProperties = {
  padding: '6px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  fontSize: 13,
}

const pastButtonStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  width: '100%',
  background: 'none',
  border: 'none',
  borderBottom: '1px solid #f1f5f9',
  padding: '6px 0',
  cursor: 'pointer',
  textAlign: 'left',
  fontSize: 13,
  color: '#0f172a',
}

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 12,
  fontWeight: 600,
  color: '#475569',
  textTransform: 'uppercase',
  letterSpacing: 0.3,
}

const tdStyle: CSSProperties = {
  padding: '12px',
  verticalAlign: 'top',
}

export default SeoClientWorkspace
