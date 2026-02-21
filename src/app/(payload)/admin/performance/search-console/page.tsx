'use client'

import { useEffect, useState } from 'react'

interface BrandMetrics {
  clicks: number
  impressions: number
  ctr: number
  position: number
}

interface QueryRow {
  query?: string
  keyword?: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

interface PageRow {
  page: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

interface CwvData {
  lcp: number | null
  inp: number | null
  cls: number | null
  status: string
  source?: string
  performanceScore?: number
}

interface SnapshotData {
  totalClicks?: number
  totalImpressions?: number
  avgCtr?: number
  avgPosition?: number
  clicksChange?: number
  impressionsChange?: number
  positionChange?: number
  periodStart?: string
  periodEnd?: string
  brandedData?: BrandMetrics | null
  nonBrandedData?: (BrandMetrics & { topQueries?: QueryRow[] }) | null
  topKeywords?: QueryRow[]
  topPages?: PageRow[]
  indexedPages?: number
  notIndexedPages?: number
  indexingIssues?: Array<{ reason: string; count: number; urls: string[] }>
  cwvMobile?: CwvData | null
  cwvDesktop?: CwvData | null
  clientId?: string
  gscConnected?: boolean
}

function ChangeArrow({ value, inverted }: { value?: number; inverted?: boolean }) {
  if (value == null || value === 0) return null
  const isGood = inverted ? value < 0 : value > 0
  return (
    <span style={{ color: isGood ? '#22c55e' : '#ef4444', fontSize: 11, fontWeight: 700, marginLeft: 4 }}>
      {isGood ? '\u2191' : '\u2193'}{Math.abs(value).toFixed(1)}%
    </span>
  )
}

function CwvStatus({ label, data }: { label: string; data: CwvData | null | undefined }) {
  if (!data) return null
  const color = data.status === 'GOOD' ? '#22c55e' : data.status === 'POOR' ? '#ef4444' : '#f59e0b'
  return (
    <div className="od-gsc-page__cwv-card">
      <div className="od-gsc-page__cwv-header">
        <span>{label}</span>
        <span style={{ color, fontWeight: 700, fontSize: 11 }}>{data.status}</span>
      </div>
      <div className="od-gsc-page__cwv-metrics">
        {data.lcp != null && <div><span className="od-gsc-page__cwv-val">{(data.lcp / 1000).toFixed(2)}s</span><span className="od-gsc-page__cwv-lbl">LCP</span></div>}
        {data.inp != null && <div><span className="od-gsc-page__cwv-val">{data.inp}ms</span><span className="od-gsc-page__cwv-lbl">INP</span></div>}
        {data.cls != null && <div><span className="od-gsc-page__cwv-val">{data.cls}</span><span className="od-gsc-page__cwv-lbl">CLS</span></div>}
      </div>
      {data.source && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>Source: {data.source}{data.performanceScore != null ? ` (${data.performanceScore}/100)` : ''}</div>}
    </div>
  )
}

const SearchConsolePage = () => {
  const [data, setData] = useState<SnapshotData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [queryFilter, setQueryFilter] = useState('')
  const [queryPage, setQueryPage] = useState(0)
  const QUERIES_PER_PAGE = 15

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then((d) => { setData(d.gsc || null); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const handleRefresh = async () => {
    if (!data?.clientId || refreshing) return
    setRefreshing(true)
    try {
      await fetch('/api/gsc/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: data.clientId }),
      })
      const res = await fetch('/api/dashboard')
      const d = await res.json()
      setData(d.gsc || null)
    } catch { /* ignore */ } finally {
      setRefreshing(false)
    }
  }

  if (loading) {
    return <div className="od-gsc-page"><p style={{ color: '#6b7280', padding: '60px 0' }}>Loading Search Console data...</p></div>
  }

  if (!data || !data.gscConnected) {
    return (
      <div className="od-gsc-page">
        <h2 className="od-gsc-page__title">Search Console</h2>
        <div className="od-box" style={{ padding: '40px 20px', textAlign: 'center' }}>
          <p style={{ color: '#6b7280', fontSize: 14 }}>GSC is not connected. Go to Settings &rarr; Integrations to connect.</p>
        </div>
      </div>
    )
  }

  // All keywords for filterable table
  const allQueries = (data.topKeywords || []).filter((q) => {
    if (!queryFilter) return true
    const term = (q.keyword || q.query || '').toLowerCase()
    return term.includes(queryFilter.toLowerCase())
  })
  const pagedQueries = allQueries.slice(queryPage * QUERIES_PER_PAGE, (queryPage + 1) * QUERIES_PER_PAGE)
  const totalPages = Math.ceil(allQueries.length / QUERIES_PER_PAGE)

  return (
    <div className="od-gsc-page">
      <div className="od-gsc-page__header">
        <h2 className="od-gsc-page__title">Search Console</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {data.periodStart && data.periodEnd && (
            <span style={{ fontSize: 12, color: '#6b7280' }}>
              {new Date(data.periodStart).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
              {' \u2013 '}
              {new Date(data.periodEnd).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
            </span>
          )}
          <button className="od-gsc__refresh" onClick={handleRefresh} disabled={refreshing} type="button">
            {refreshing ? 'Syncing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Summary metrics */}
      <div className="od-box" style={{ marginBottom: 16 }}>
        <div className="od-box__stats od-box__stats--4">
          <div className="od-box__stat">
            <span className="od-box__stat-value">
              {(data.totalClicks ?? 0).toLocaleString()}
              <ChangeArrow value={data.clicksChange} />
            </span>
            <span className="od-box__stat-label">Clicks</span>
          </div>
          <div className="od-box__stat">
            <span className="od-box__stat-value">
              {(data.totalImpressions ?? 0).toLocaleString()}
              <ChangeArrow value={data.impressionsChange} />
            </span>
            <span className="od-box__stat-label">Impressions</span>
          </div>
          <div className="od-box__stat">
            <span className="od-box__stat-value">{(data.avgCtr ?? 0).toFixed(1)}%</span>
            <span className="od-box__stat-label">CTR</span>
          </div>
          <div className="od-box__stat">
            <span className="od-box__stat-value">
              {(data.avgPosition ?? 0).toFixed(1)}
              <ChangeArrow value={data.positionChange} inverted />
            </span>
            <span className="od-box__stat-label">Avg Position</span>
          </div>
        </div>
      </div>

      {/* Brand vs Non-Brand */}
      {(data.brandedData || data.nonBrandedData) && (
        <div className="od-box" style={{ marginBottom: 16 }}>
          <div className="od-box__head">
            <span className="od-box__title">Brand vs Non-Brand</span>
          </div>
          <div className="od-gsc__split">
            {data.brandedData && (
              <div className="od-gsc__split-col">
                <div className="od-gsc__split-header">Brand</div>
                <div className="od-gsc__split-row"><span className="od-gsc__split-val">{data.brandedData.clicks.toLocaleString()}</span><span className="od-gsc__split-lbl">clicks</span></div>
                <div className="od-gsc__split-row"><span className="od-gsc__split-val">{data.brandedData.impressions.toLocaleString()}</span><span className="od-gsc__split-lbl">impressions</span></div>
                <div className="od-gsc__split-row"><span className="od-gsc__split-val">{data.brandedData.ctr.toFixed(1)}%</span><span className="od-gsc__split-lbl">CTR</span></div>
                <div className="od-gsc__split-row"><span className="od-gsc__split-val">{data.brandedData.position.toFixed(1)}</span><span className="od-gsc__split-lbl">position</span></div>
              </div>
            )}
            {data.nonBrandedData && (
              <div className="od-gsc__split-col">
                <div className="od-gsc__split-header">Non-Brand</div>
                <div className="od-gsc__split-row"><span className="od-gsc__split-val">{data.nonBrandedData.clicks.toLocaleString()}</span><span className="od-gsc__split-lbl">clicks</span></div>
                <div className="od-gsc__split-row"><span className="od-gsc__split-val">{data.nonBrandedData.impressions.toLocaleString()}</span><span className="od-gsc__split-lbl">impressions</span></div>
                <div className="od-gsc__split-row"><span className="od-gsc__split-val">{data.nonBrandedData.ctr.toFixed(1)}%</span><span className="od-gsc__split-lbl">CTR</span></div>
                <div className="od-gsc__split-row"><span className="od-gsc__split-val">{data.nonBrandedData.position.toFixed(1)}</span><span className="od-gsc__split-lbl">position</span></div>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Top Queries table (paginated + filterable) */}
        <div className="od-box">
          <div className="od-box__head">
            <span className="od-box__title">Top Queries</span>
            <input
              type="text"
              placeholder="Filter queries..."
              value={queryFilter}
              onChange={(e) => { setQueryFilter(e.target.value); setQueryPage(0) }}
              className="od-gsc-page__filter"
            />
          </div>
          <table className="od-gsc__table">
            <thead>
              <tr><th>Query</th><th>Clicks</th><th>Impr.</th><th>CTR</th><th>Pos.</th></tr>
            </thead>
            <tbody>
              {pagedQueries.map((q) => (
                <tr key={q.keyword || q.query}>
                  <td className="od-gsc__table-query">{q.keyword || q.query}</td>
                  <td>{q.clicks}</td>
                  <td>{q.impressions.toLocaleString()}</td>
                  <td>{q.ctr.toFixed(1)}%</td>
                  <td>{q.position.toFixed(1)}</td>
                </tr>
              ))}
              {pagedQueries.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9ca3af', padding: 16 }}>No queries found</td></tr>
              )}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="od-gsc-page__pagination">
              <button disabled={queryPage === 0} onClick={() => setQueryPage(queryPage - 1)} type="button">Prev</button>
              <span>{queryPage + 1} / {totalPages}</span>
              <button disabled={queryPage >= totalPages - 1} onClick={() => setQueryPage(queryPage + 1)} type="button">Next</button>
            </div>
          )}
        </div>

        {/* Top Pages table */}
        <div className="od-box">
          <div className="od-box__head">
            <span className="od-box__title">Top Pages</span>
          </div>
          <table className="od-gsc__table">
            <thead>
              <tr><th>Page</th><th>Clicks</th><th>Impr.</th><th>CTR</th><th>Pos.</th></tr>
            </thead>
            <tbody>
              {(data.topPages || []).slice(0, 15).map((p) => (
                <tr key={p.page}>
                  <td className="od-gsc__table-query">{p.page.replace(/^https?:\/\/[^/]+/, '')}</td>
                  <td>{p.clicks}</td>
                  <td>{p.impressions.toLocaleString()}</td>
                  <td>{p.ctr.toFixed(1)}%</td>
                  <td>{p.position.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Indexing + Core Web Vitals */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Indexing Status */}
        <div className="od-box">
          <div className="od-box__head">
            <span className="od-box__title">Indexing Status</span>
          </div>
          <div className="od-box__stats od-box__stats--2">
            <div className="od-box__stat">
              <span className="od-box__stat-value">{(data.indexedPages ?? 0).toLocaleString()}</span>
              <span className="od-box__stat-label">Indexed</span>
            </div>
            <div className="od-box__stat">
              <span className="od-box__stat-value">{(data.notIndexedPages ?? 0).toLocaleString()}</span>
              <span className="od-box__stat-label">Not Indexed</span>
            </div>
          </div>
          {data.indexingIssues && data.indexingIssues.length > 0 && (
            <div style={{ padding: '12px 16px' }}>
              {data.indexingIssues.map((issue) => (
                <div key={issue.reason} style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                  <strong>{issue.reason}</strong> ({issue.count} page{issue.count !== 1 ? 's' : ''})
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Core Web Vitals */}
        <div className="od-box">
          <div className="od-box__head">
            <span className="od-box__title">Core Web Vitals</span>
          </div>
          <div style={{ padding: 16, display: 'flex', gap: 12 }}>
            <CwvStatus label="Mobile" data={data.cwvMobile} />
            <CwvStatus label="Desktop" data={data.cwvDesktop} />
            {!data.cwvMobile && !data.cwvDesktop && (
              <p style={{ color: '#9ca3af', fontSize: 13, margin: 0 }}>No CWV data available</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default SearchConsolePage
