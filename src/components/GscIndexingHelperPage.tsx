'use client'

import { useState, useEffect } from 'react'
import RocketSplash from './RocketSplash'

interface ClientOption {
  id: string
  name: string
  slug: string
  gscConnected: boolean
}

interface GscSite {
  siteUrl: string
  permissionLevel: string
}

interface ActionItem {
  url: string
  reason: string
  fetchState: string
  lastCrawled: string | null
  action: string
  priority: 'high' | 'medium' | 'low'
  gscInspectionLink: string
}

interface IndexingResult {
  siteUrl: string
  summary: {
    totalPages: number
    indexed: number
    notIndexed: number
    indexRate: string
  }
  actionItems: ActionItem[]
  sitemapPingResult: string | null
  note: string
}

interface ContentRefreshResult {
  url: string
  status: number
  currentContent: {
    title: string
    metaDescription: string
    h1: string
    headings: string[]
    wordCount: number
    images: number
    internalLinks: number
  }
  gscStatus: string | null
  lastCrawled: string | null
  issues: string[]
  refreshedContent: {
    title: string
    metaDescription: string
    h1: string
    introduction: string
    sections: Array<{ heading: string; content: string }>
    conclusion: string
  } | null
}

const PRIORITY_COLORS: Record<string, { bg: string; color: string }> = {
  high: { bg: '#fee2e2', color: '#991b1b' },
  medium: { bg: '#fef3c7', color: '#92400e' },
  low: { bg: '#dbeafe', color: '#1e40af' },
}

export default function GscIndexingHelperPage() {
  const [clients, setClients] = useState<ClientOption[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [sites, setSites] = useState<GscSite[]>([])
  const [selectedSiteUrl, setSelectedSiteUrl] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<IndexingResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState<string | null>(null)
  const [refreshResult, setRefreshResult] = useState<ContentRefreshResult | null>(null)
  const [loadingSites, setLoadingSites] = useState(false)

  // Fetch clients
  useEffect(() => {
    fetch('/api/clients/list')
      .then((r) => r.ok ? r.json() : [])
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          const gscClients = data.filter((c: ClientOption) => c.gscConnected)
          setClients(gscClients)
          // Default to Optimise Digital
          const agency = gscClients.find((c: ClientOption) =>
            c.name.toLowerCase().includes('optimise digital'),
          )
          if (agency) setSelectedClientId(agency.id)
          else if (gscClients.length > 0) setSelectedClientId(gscClients[0].id)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Fetch GSC sites when client changes
  useEffect(() => {
    if (!selectedClientId) return
    setLoadingSites(true)
    setSites([])
    setSelectedSiteUrl('')
    setResult(null)

    fetch(`/api/gsc/indexing-helper/sites?clientId=${selectedClientId}`)
      .then((r) => r.ok ? r.json() : { sites: [] })
      .then((data) => {
        const sitesData = data.sites || []
        setSites(sitesData)
        if (sitesData.length > 0) {
          setSelectedSiteUrl(sitesData[0].siteUrl)
        }
        setLoadingSites(false)
      })
      .catch(() => setLoadingSites(false))
  }, [selectedClientId])

  const handleRunAudit = async () => {
    if (!selectedSiteUrl || running) return
    setRunning(true)
    setError(null)
    setResult(null)
    setRefreshResult(null)

    try {
      const res = await fetch('/api/gsc/indexing-helper/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteUrl: selectedSiteUrl, clientId: selectedClientId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || data.message || 'Failed to run indexing helper')
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setRunning(false)
    }
  }

  const handleContentRefresh = async (url: string) => {
    if (refreshing) return
    setRefreshing(url)
    setRefreshResult(null)

    try {
      const res = await fetch('/api/gsc/indexing-helper/content-refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, siteUrl: selectedSiteUrl, clientId: selectedClientId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || data.message || 'Content refresh failed')
      setRefreshResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setRefreshing(null)
    }
  }

  if (loading) return <RocketSplash />

  return (
    <div style={{ padding: '24px 0', maxWidth: 1200 }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
        GSC Indexing Helper
      </h2>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 24px' }}>
        Find non-indexed pages, get actionable fixes, and request indexing via Google Search Console.
      </p>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Client</label>
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            className="od-gsc-page__date-input"
            style={{ minWidth: 200 }}
          >
            {clients.length === 0 && <option value="">No GSC-connected clients</option>}
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>GSC Property</label>
          <select
            value={selectedSiteUrl}
            onChange={(e) => setSelectedSiteUrl(e.target.value)}
            className="od-gsc-page__date-input"
            style={{ minWidth: 300 }}
            disabled={loadingSites || sites.length === 0}
          >
            {loadingSites && <option value="">Loading sites...</option>}
            {!loadingSites && sites.length === 0 && <option value="">No properties found</option>}
            {sites.map((s) => (
              <option key={s.siteUrl} value={s.siteUrl}>{s.siteUrl}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleRunAudit}
          disabled={running || !selectedSiteUrl}
          style={{
            padding: '8px 20px',
            borderRadius: 6,
            border: 'none',
            background: running ? '#9ca3af' : '#6366f1',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            cursor: running ? 'default' : 'pointer',
          }}
          type="button"
        >
          {running ? 'Running...' : 'Run Indexing Helper'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '12px 16px', background: '#fee2e2', borderRadius: 8, color: '#991b1b', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <SummaryCard label="Total Pages" value={result.summary.totalPages} />
            <SummaryCard label="Indexed" value={result.summary.indexed} color="#22c55e" />
            <SummaryCard label="Not Indexed" value={result.summary.notIndexed} color="#ef4444" />
            <SummaryCard label="Index Rate" value={result.summary.indexRate} />
          </div>

          {/* Sitemap Ping */}
          {result.sitemapPingResult && (
            <div style={{ padding: '8px 12px', background: '#f0fdf4', borderRadius: 6, fontSize: 12, color: '#166534' }}>
              {result.sitemapPingResult}
            </div>
          )}

          {/* Action Items Table */}
          {result.actionItems.length > 0 && (
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>
                Action Items ({result.actionItems.length})
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                      <th style={{ textAlign: 'left', padding: 8, fontWeight: 600 }}>URL</th>
                      <th style={{ textAlign: 'left', padding: 8, fontWeight: 600, width: 90 }}>Priority</th>
                      <th style={{ textAlign: 'left', padding: 8, fontWeight: 600, width: 200 }}>Reason</th>
                      <th style={{ textAlign: 'left', padding: 8, fontWeight: 600 }}>Action</th>
                      <th style={{ textAlign: 'center', padding: 8, fontWeight: 600, width: 150 }}>Links</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.actionItems.map((item, i) => (
                      <tr key={item.url + i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '6px 8px', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.url}>
                          {stripOrigin(item.url)}
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <PriorityBadge priority={item.priority} />
                        </td>
                        <td style={{ padding: '6px 8px', fontSize: 12, color: '#6b7280' }}>
                          {item.reason}
                        </td>
                        <td style={{ padding: '6px 8px', fontSize: 12 }}>
                          {item.action}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                            <a
                              href={item.gscInspectionLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ padding: '3px 8px', borderRadius: 4, background: '#dbeafe', color: '#1e40af', fontSize: 11, fontWeight: 600, textDecoration: 'none' }}
                            >
                              GSC
                            </a>
                            <button
                              onClick={() => handleContentRefresh(item.url)}
                              disabled={!!refreshing}
                              style={{
                                padding: '3px 8px',
                                borderRadius: 4,
                                border: '1px solid #d1d5db',
                                background: refreshing === item.url ? '#f3f4f6' : '#fff',
                                color: '#374151',
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: refreshing ? 'default' : 'pointer',
                              }}
                              type="button"
                            >
                              {refreshing === item.url ? '...' : 'Refresh'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Content Refresh Result */}
          {refreshResult && (
            <ContentRefreshPanel result={refreshResult} />
          )}

          {/* Tip */}
          <div style={{ padding: '12px 16px', background: '#f0f9ff', borderRadius: 8, fontSize: 12, color: '#1e3a5f' }}>
            <strong>Tip:</strong> {result.note}
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div style={{ padding: 16, borderRadius: 8, border: '1px solid #e5e7eb', textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || 'var(--theme-elevation-800)' }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{label}</div>
    </div>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors = PRIORITY_COLORS[priority] || PRIORITY_COLORS.medium
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 600,
      background: colors.bg,
      color: colors.color,
      textTransform: 'uppercase',
    }}>
      {priority}
    </span>
  )
}

function ContentRefreshPanel({ result }: { result: ContentRefreshResult }) {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
          Content Refresh: {stripOrigin(result.url)}
        </h4>
      </div>
      <div style={{ padding: 16, fontSize: 13 }}>
        {/* Current Issues */}
        {result.issues.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <strong>Issues Found:</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
              {result.issues.map((issue, i) => (
                <li key={i} style={{ color: '#dc2626', marginBottom: 2 }}>{issue}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Current Content Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
          <StatChip label="Words" value={String(result.currentContent.wordCount)} />
          <StatChip label="Images" value={String(result.currentContent.images)} />
          <StatChip label="Internal Links" value={String(result.currentContent.internalLinks)} />
          <StatChip label="GSC Status" value={result.gscStatus || 'N/A'} />
        </div>

        {/* Refreshed Content */}
        {result.refreshedContent && (
          <div style={{ marginTop: 12, background: '#f0fdf4', borderRadius: 8, padding: 16 }}>
            <h5 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: '#166534' }}>Suggested Improvements</h5>
            <div style={{ marginBottom: 8 }}>
              <strong>Title:</strong> {result.refreshedContent.title}
            </div>
            <div style={{ marginBottom: 8 }}>
              <strong>Meta Description:</strong> {result.refreshedContent.metaDescription}
            </div>
            <div style={{ marginBottom: 8 }}>
              <strong>H1:</strong> {result.refreshedContent.h1}
            </div>
            <div style={{ marginBottom: 8 }}>
              <strong>Introduction:</strong>
              <p style={{ margin: '4px 0' }}>{result.refreshedContent.introduction}</p>
            </div>
            {result.refreshedContent.sections.map((section, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <strong>{section.heading}</strong>
                <p style={{ margin: '4px 0' }}>{section.content}</p>
              </div>
            ))}
            <div>
              <strong>Conclusion:</strong>
              <p style={{ margin: '4px 0' }}>{result.refreshedContent.conclusion}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '6px 8px', background: '#f3f4f6', borderRadius: 4, textAlign: 'center' }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 10, color: '#6b7280' }}>{label}</div>
    </div>
  )
}

function stripOrigin(url: string): string {
  try {
    const u = new URL(url)
    return u.pathname + u.search
  } catch {
    return url
  }
}
