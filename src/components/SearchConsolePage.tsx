'use client'

import { useEffect, useState, useCallback } from 'react'
import RocketSplash from './RocketSplash'

// ─── Types ────────────────────────────────────────────────

interface BrandMetrics {
  clicks: number
  impressions: number
  ctr: number
  position: number
  keywordCount?: number
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

interface DailyEntry {
  date: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

interface DailyBrandEntry {
  date: string
  clicks: number
}

interface QueryData {
  brandTerms: string[]
  summary: {
    totalClicks: number
    totalImpressions: number
    avgCtr: number
    avgPosition: number
  }
  topKeywords: QueryRow[]
  topPages: PageRow[]
  brandedData: BrandMetrics | null
  nonBrandedData: BrandMetrics | null
  daily: DailyEntry[]
  dailyBrand: DailyBrandEntry[]
  dailyGeneric: DailyBrandEntry[]
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

type DatePreset = '7d' | '28d' | '3m' | '12m' | '16m'

// ─── Helpers ──────────────────────────────────────────────

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return n.toString()
}

function getPresetDates(preset: DatePreset): { start: string; end: string } {
  const now = new Date()
  const end = new Date(now)
  end.setDate(end.getDate() - 1)

  let start: Date
  switch (preset) {
    case '7d':
      start = new Date(end)
      start.setDate(start.getDate() - 6)
      break
    case '28d':
      start = new Date(end)
      start.setDate(start.getDate() - 27)
      break
    case '3m':
      // 3 calendar months: 1st of (current month - 2) → yesterday
      // e.g. today 22 Feb 2026 → 1 Dec 2025 – 21 Feb 2026
      start = new Date(now.getFullYear(), now.getMonth() - 2, 1)
      break
    case '12m':
      // 12 calendar months: 1st of (current month - 11) → yesterday
      start = new Date(now.getFullYear(), now.getMonth() - 11, 1)
      break
    case '16m':
      // 16 calendar months: 1st of (current month - 15) → yesterday
      start = new Date(now.getFullYear(), now.getMonth() - 15, 1)
      break
    default:
      start = new Date(end)
  }
  return { start: formatDate(start), end: formatDate(end) }
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

// ─── Main Component ───────────────────────────────────────

interface ClientOption {
  id: string
  name: string
  slug: string
  gscConnected: boolean
}

const SearchConsolePage = () => {
  const [clients, setClients] = useState<ClientOption[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [snapshot, setSnapshot] = useState<SnapshotData | null>(null)
  const [queryData, setQueryData] = useState<QueryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [queryLoading, setQueryLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [queryFilter, setQueryFilter] = useState('')
  const [queryPage, setQueryPage] = useState(0)
  const [queryMode, setQueryMode] = useState<'all' | 'brand' | 'generic'>('all')
  const [activePreset, setActivePreset] = useState<DatePreset>('28d')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [brandTab, setBrandTab] = useState<'overview' | 'brand' | 'generic'>('overview')
  const [chartLine, setChartLine] = useState<'impressions' | 'ctr'>('impressions')
  const [chartFilter, setChartFilter] = useState<'all' | 'brand' | 'generic'>('all')
  const [indexingAudit, setIndexingAudit] = useState<{ id: string; status: string; inspectedCount: number; totalUrls: number; summaryStats?: any } | null>(null)
  const [auditLoading, setAuditLoading] = useState(false)
  const QUERIES_PER_PAGE = 15

  // Load client list, then fetch snapshot for first connected client
  useEffect(() => {
    fetch('/api/clients/list')
      .then((r) => r.ok ? r.json() : [])
      .then((data: ClientOption[]) => {
        const connected = data.filter((c) => c.gscConnected)
        setClients(connected)
        if (connected.length > 0) {
          setSelectedClientId(String(connected[0].id))
        } else {
          setLoading(false)
        }
      })
      .catch(() => setLoading(false))
  }, [])

  // Fetch snapshot whenever selectedClientId changes
  const fetchSnapshot = useCallback(async (clientId: string) => {
    setLoading(true)
    setQueryData(null)
    setIndexingAudit(null)
    try {
      const res = await fetch(`/api/gsc/snapshot?clientId=${clientId}`)
      const d = await res.json()
      setSnapshot(d.gsc || null)
    } catch {
      setSnapshot(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedClientId) {
      fetchSnapshot(selectedClientId)
    }
  }, [selectedClientId, fetchSnapshot])

  // Fetch query data for a date range
  const fetchQueryData = useCallback(async (start: string, end: string, clientId?: string) => {
    const cid = clientId || selectedClientId
    if (!cid) return
    setQueryLoading(true)
    try {
      const res = await fetch('/api/gsc/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: cid, startDate: start, endDate: end }),
      })
      const d = await res.json()
      setQueryData(d)
    } catch { /* ignore */ } finally {
      setQueryLoading(false)
    }
  }, [selectedClientId])

  // Initial query load when snapshot arrives
  useEffect(() => {
    if (snapshot?.clientId && !queryData) {
      const { start, end } = getPresetDates('28d')
      setStartDate(start)
      setEndDate(end)
      fetchQueryData(start, end, String(snapshot.clientId))
    }
  }, [snapshot?.clientId, queryData, fetchQueryData])

  const handleClientChange = (clientId: string) => {
    setSelectedClientId(clientId)
    setQueryData(null)
    setQueryFilter('')
    setQueryPage(0)
    setActivePreset('28d')
  }

  const handlePreset = (preset: DatePreset) => {
    setActivePreset(preset)
    const { start, end } = getPresetDates(preset)
    setStartDate(start)
    setEndDate(end)
    fetchQueryData(start, end)
  }

  const handleDateChange = (start: string, end: string) => {
    setStartDate(start)
    setEndDate(end)
    setActivePreset('28d') // clear preset highlight
    fetchQueryData(start, end)
  }

  const handleRefresh = async () => {
    if (!selectedClientId || refreshing) return
    setRefreshing(true)
    try {
      await fetch('/api/gsc/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: selectedClientId }),
      })
      await fetchSnapshot(selectedClientId)
      if (startDate && endDate) fetchQueryData(startDate, endDate)
    } catch { /* ignore */ } finally {
      setRefreshing(false)
    }
  }

  const handleStartAudit = async () => {
    if (!selectedClientId || auditLoading) return
    setAuditLoading(true)
    try {
      const res = await fetch('/api/gsc/indexing-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: selectedClientId }),
      })
      const data = await res.json()
      if (data.ok && data.auditId) {
        setIndexingAudit({ id: data.auditId, status: data.status || 'discovering', inspectedCount: 0, totalUrls: 0 })
      }
    } catch { /* ignore */ } finally {
      setAuditLoading(false)
    }
  }

  if (loading) {
    return <RocketSplash />
  }

  if (!snapshot || !snapshot.gscConnected) {
    return (
      <div className="od-gsc-page">
        <h2 className="od-gsc-page__title">Search Console</h2>
        <div className="od-box" style={{ padding: '40px 20px', textAlign: 'center' }}>
          <p style={{ color: '#6b7280', fontSize: 14 }}>
            {clients.length === 0
              ? 'No clients have GSC connected. Go to Settings \u2192 Integrations to connect a client.'
              : 'GSC is not connected for this client. Go to Settings \u2192 Integrations to connect.'}
          </p>
        </div>
      </div>
    )
  }

  // Use query data for metrics, fallback to snapshot
  const summary = queryData?.summary || {
    totalClicks: snapshot.totalClicks || 0,
    totalImpressions: snapshot.totalImpressions || 0,
    avgCtr: snapshot.avgCtr || 0,
    avgPosition: snapshot.avgPosition || 0,
  }
  const topKeywords = queryData?.topKeywords || snapshot.topKeywords || []
  const topPages = queryData?.topPages || snapshot.topPages || []

  const brandTermsLower = (queryData?.brandTerms || []).map((t) => t.toLowerCase())

  const allQueries = topKeywords.filter((q) => {
    const term = (q.keyword || q.query || '').toLowerCase()
    // Brand/generic filter
    if (queryMode !== 'all' && brandTermsLower.length > 0) {
      const isBrand = brandTermsLower.some((bt) => term.includes(bt))
      if (queryMode === 'brand' && !isBrand) return false
      if (queryMode === 'generic' && isBrand) return false
    }
    // Text filter
    if (queryFilter && !term.includes(queryFilter.toLowerCase())) return false
    return true
  })
  const pagedQueries = allQueries.slice(queryPage * QUERIES_PER_PAGE, (queryPage + 1) * QUERIES_PER_PAGE)
  const totalPages = Math.ceil(allQueries.length / QUERIES_PER_PAGE)

  return (
    <div className="od-gsc-page">
      <div className="od-gsc-page__header">
        <h2 className="od-gsc-page__title">Search Console</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {clients.length > 1 && (
            <select
              value={selectedClientId}
              onChange={(e) => handleClientChange(e.target.value)}
              className="od-gsc-page__date-input"
              style={{ minWidth: 180 }}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
          <button className="od-gsc__refresh" onClick={handleRefresh} disabled={refreshing} type="button">
            {refreshing ? 'Syncing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Date Picker */}
      <div className="od-gsc-page__datepicker">
        <div className="od-gsc-page__presets">
          {([['7d', 'Last 7 days'], ['28d', 'Last 28 days'], ['3m', 'Last 3 months'], ['12m', 'Last 12 months'], ['16m', 'Last 16 months']] as const).map(([key, label]) => (
            <button
              key={key}
              className={`od-gsc-page__preset ${activePreset === key ? 'od-gsc-page__preset--active' : ''}`}
              onClick={() => handlePreset(key)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="od-gsc-page__date-inputs">
          <input
            type="date"
            value={startDate}
            onChange={(e) => handleDateChange(e.target.value, endDate)}
            className="od-gsc-page__date-input"
          />
          <span style={{ color: '#9ca3af', fontSize: 12 }}>to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => handleDateChange(startDate, e.target.value)}
            className="od-gsc-page__date-input"
          />
        </div>
        {queryLoading && <span className="od-gsc-page__loading">Loading...</span>}
      </div>

      {/* Summary metrics */}
      <div className="od-box" style={{ marginBottom: 16 }}>
        <div className="od-box__stats od-box__stats--4">
          <div className="od-box__stat">
            <span className="od-box__stat-value">
              {summary.totalClicks.toLocaleString()}
              <ChangeArrow value={snapshot.clicksChange} />
            </span>
            <span className="od-box__stat-label">Clicks</span>
          </div>
          <div
            className={`od-box__stat od-box__stat--selectable ${chartLine === 'impressions' ? 'od-box__stat--selected' : ''}`}
            onClick={() => setChartLine('impressions')}
            role="button"
            tabIndex={0}
          >
            <span className="od-box__stat-value">
              {summary.totalImpressions.toLocaleString()}
              <ChangeArrow value={snapshot.impressionsChange} />
            </span>
            <span className="od-box__stat-label">Impressions</span>
          </div>
          <div
            className={`od-box__stat od-box__stat--selectable ${chartLine === 'ctr' ? 'od-box__stat--selected' : ''}`}
            onClick={() => setChartLine('ctr')}
            role="button"
            tabIndex={0}
          >
            <span className="od-box__stat-value">{summary.avgCtr.toFixed(1)}%</span>
            <span className="od-box__stat-label">CTR</span>
          </div>
          <div className="od-box__stat">
            <span className="od-box__stat-value">
              {summary.avgPosition.toFixed(1)}
              <ChangeArrow value={snapshot.positionChange} inverted />
            </span>
            <span className="od-box__stat-label">Avg Position</span>
          </div>
        </div>
      </div>

      {/* Performance Over Time chart + Time Analysis table */}
      {queryData?.daily && queryData.daily.length > 0 && (
        <div className="od-box" style={{ marginBottom: 16 }}>
          <div className="od-box__head">
            <span className="od-box__title">Total Performance Over Time</span>
            {queryData.dailyBrand?.length > 0 && (
              <div className="od-gsc-page__tabs" style={{ marginLeft: 'auto' }}>
                {(['all', 'brand', 'generic'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`od-gsc-page__tab ${chartFilter === f ? 'od-gsc-page__tab--active' : ''}`}
                    onClick={() => setChartFilter(f)}
                  >
                    {f === 'all' ? 'All' : f === 'brand' ? 'Brand' : 'Generic'}
                  </button>
                ))}
              </div>
            )}
          </div>
          <PerformanceChart
            daily={queryData.daily}
            dailyBrand={queryData.dailyBrand}
            dailyGeneric={queryData.dailyGeneric}
            startDate={startDate}
            endDate={endDate}
            rightMetric={chartLine}
            clickFilter={chartFilter}
          />
          <TimeAnalysisTable daily={queryData.daily} startDate={startDate} endDate={endDate} />
        </div>
      )}

      {/* Brand & Generic Performance */}
      {(queryData?.brandedData || queryData?.nonBrandedData) && (
        <div className="od-box" style={{ marginBottom: 16 }}>
          <div className="od-box__head">
            <span className="od-box__title">Brand &amp; Generic Performance</span>
            <div className="od-gsc-page__tabs">
              {(['overview', 'brand', 'generic'] as const).map((tab) => (
                <button
                  key={tab}
                  className={`od-gsc-page__tab ${brandTab === tab ? 'od-gsc-page__tab--active' : ''}`}
                  onClick={() => setBrandTab(tab)}
                  type="button"
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <BrandGenericSection
            brandedData={queryData.brandedData}
            nonBrandedData={queryData.nonBrandedData}
            dailyBrand={queryData.dailyBrand || []}
            dailyGeneric={queryData.dailyGeneric || []}
            activeTab={brandTab}
          />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Top Queries table (paginated + filterable) */}
        <div className="od-box">
          <div className="od-box__head">
            <span className="od-box__title">Top Queries</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="od-gsc-page__tabs">
                {(['all', 'brand', 'generic'] as const).map((mode) => (
                  <button
                    key={mode}
                    className={`od-gsc-page__tab ${queryMode === mode ? 'od-gsc-page__tab--active' : ''}`}
                    onClick={() => { setQueryMode(mode); setQueryPage(0) }}
                    type="button"
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Filter queries..."
                value={queryFilter}
                onChange={(e) => { setQueryFilter(e.target.value); setQueryPage(0) }}
                className="od-gsc-page__filter"
              />
            </div>
          </div>
          <table className="od-gsc__table">
            <thead>
              <tr><th>Query</th><th>Clicks</th><th>Impr.</th><th>CTR</th><th>Pos.</th></tr>
            </thead>
            <tbody>
              {pagedQueries.map((q) => (
                <tr key={q.keyword || q.query}>
                  <td className="od-gsc__table-query">{(q.keyword || q.query || '').replace(/^\d+:\s*/, '')}</td>
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
              {topPages.slice(0, 15).map((p) => (
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
              <span className="od-box__stat-value">{(snapshot.indexedPages ?? 0).toLocaleString()}</span>
              <span className="od-box__stat-label">Indexed</span>
            </div>
            <div className="od-box__stat">
              <span className="od-box__stat-value">{(snapshot.notIndexedPages ?? 0).toLocaleString()}</span>
              <span className="od-box__stat-label">Not Indexed</span>
            </div>
          </div>
          {snapshot.indexingIssues && snapshot.indexingIssues.length > 0 && (
            <div style={{ padding: '12px 16px' }}>
              {snapshot.indexingIssues.map((issue) => (
                <div key={issue.reason} style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                  <strong>{issue.reason}</strong> ({issue.count} page{issue.count !== 1 ? 's' : ''})
                </div>
              ))}
            </div>
          )}
          {/* Full Indexing Audit */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid #e5e7eb' }}>
            {indexingAudit && (indexingAudit.status === 'discovering' || indexingAudit.status === 'inspecting') ? (
              <div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                  Full audit in progress: {indexingAudit.inspectedCount}/{indexingAudit.totalUrls} URLs inspected
                </div>
                <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${indexingAudit.totalUrls > 0 ? (indexingAudit.inspectedCount / indexingAudit.totalUrls) * 100 : 0}%`,
                    background: '#3b82f6',
                    borderRadius: 3,
                  }} />
                </div>
                <a
                  href={`/admin/collections/gsc-indexing-audits/${indexingAudit.id}`}
                  style={{ fontSize: 12, color: '#3b82f6', marginTop: 6, display: 'inline-block' }}
                >
                  View audit details
                </a>
              </div>
            ) : indexingAudit && indexingAudit.status === 'completed' ? (
              <div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                  Last audit: {indexingAudit.summaryStats?.indexed ?? 0} indexed, {indexingAudit.summaryStats?.notIndexed ?? 0} not indexed
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <a
                    href={`/admin/collections/gsc-indexing-audits/${indexingAudit.id}`}
                    style={{ fontSize: 12, color: '#3b82f6' }}
                  >
                    View results
                  </a>
                  <button
                    onClick={handleStartAudit}
                    disabled={auditLoading}
                    style={{
                      fontSize: 12, padding: '4px 10px', borderRadius: 4,
                      border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer',
                    }}
                  >
                    {auditLoading ? 'Starting...' : 'Run New Audit'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleStartAudit}
                disabled={auditLoading}
                style={{
                  fontSize: 12, padding: '6px 14px', borderRadius: 4,
                  border: '1px solid #3b82f6', background: '#3b82f6', color: '#fff',
                  cursor: auditLoading ? 'default' : 'pointer', opacity: auditLoading ? 0.7 : 1,
                }}
              >
                {auditLoading ? 'Starting...' : 'Run Full Indexing Audit'}
              </button>
            )}
          </div>
        </div>

        {/* Core Web Vitals */}
        <div className="od-box">
          <div className="od-box__head">
            <span className="od-box__title">Core Web Vitals</span>
          </div>
          <div style={{ padding: 16, display: 'flex', gap: 12 }}>
            <CwvStatus label="Mobile" data={snapshot.cwvMobile} />
            <CwvStatus label="Desktop" data={snapshot.cwvDesktop} />
            {!snapshot.cwvMobile && !snapshot.cwvDesktop && (
              <p style={{ color: '#9ca3af', fontSize: 13, margin: 0 }}>No CWV data available</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Bucketing helpers ────────────────────────────────────

type BucketGranularity = 'day' | 'week' | 'month'

interface Bucket {
  label: string
  impressions: number
  clicks: number
  ctrSum: number
  posSum: number
  count: number
}

function getGranularity(startDate: string, endDate: string): BucketGranularity {
  const days = Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000)
  if (days > 90) return 'month'
  if (days > 28) return 'week'
  return 'day'
}

/** Week key based on the Monday of the week containing `d` */
function isoWeekKey(d: Date): string {
  const ws = weekStart(d)
  return `${ws.getFullYear()}-${String(ws.getMonth() + 1).padStart(2, '0')}-${String(ws.getDate()).padStart(2, '0')}`
}

/** Monday of the ISO week containing `d` */
function weekStart(d: Date): Date {
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday
  return new Date(d.getFullYear(), d.getMonth(), diff)
}

/** Parse "YYYY-MM-DD" as local date (avoids UTC timezone shift) */
function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function bucketDaily(daily: DailyEntry[], granularity: BucketGranularity): Bucket[] {
  const map = new Map<string, Bucket>()

  for (const d of daily) {
    const date = parseLocalDate(d.date)
    let key: string
    let label: string

    switch (granularity) {
      case 'month': {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        label = date.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' })
        break
      }
      case 'week': {
        key = isoWeekKey(date)
        const ws = weekStart(date)
        label = ws.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
        break
      }
      default: {
        key = d.date
        label = date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
        break
      }
    }

    const existing = map.get(key)
    if (existing) {
      existing.impressions += d.impressions
      existing.clicks += d.clicks
      existing.ctrSum += d.ctr
      existing.posSum += d.position
      existing.count++
    } else {
      map.set(key, { label, impressions: d.impressions, clicks: d.clicks, ctrSum: d.ctr, posSum: d.position, count: 1 })
    }
  }

  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, v]) => v)
}

// ─── Performance Chart (dual lines) ──────────────────────

function bucketBrandDaily(brandDaily: DailyBrandEntry[], granularity: BucketGranularity): { label: string; clicks: number }[] {
  const map = new Map<string, { label: string; clicks: number }>()

  for (const d of brandDaily) {
    const date = parseLocalDate(d.date)
    let key: string
    let label: string

    switch (granularity) {
      case 'month': {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        label = date.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' })
        break
      }
      case 'week': {
        key = isoWeekKey(date)
        const ws = weekStart(date)
        label = ws.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
        break
      }
      default: {
        key = d.date
        label = date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
        break
      }
    }

    const existing = map.get(key)
    if (existing) {
      existing.clicks += d.clicks
    } else {
      map.set(key, { label, clicks: d.clicks })
    }
  }

  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, v]) => v)
}

function PerformanceChart({ daily, dailyBrand, dailyGeneric, startDate, endDate, rightMetric = 'impressions', clickFilter = 'all' }: { daily: DailyEntry[]; dailyBrand?: DailyBrandEntry[]; dailyGeneric?: DailyBrandEntry[]; startDate: string; endDate: string; rightMetric?: 'impressions' | 'ctr'; clickFilter?: 'all' | 'brand' | 'generic' }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const granularity = getGranularity(startDate, endDate)
  const buckets = bucketDaily(daily, granularity)

  // Build filtered click values for bars based on brand/generic toggle
  const brandBuckets = dailyBrand?.length ? bucketBrandDaily(dailyBrand, granularity) : []
  const genericBuckets = dailyGeneric?.length ? bucketBrandDaily(dailyGeneric, granularity) : []

  const barClicks = buckets.map((b, i) => {
    if (clickFilter === 'brand') return brandBuckets[i]?.clicks ?? 0
    if (clickFilter === 'generic') return genericBuckets[i]?.clicks ?? 0
    return b.clicks
  })

  const chartHeight = 200
  const bucketCount = buckets.length
  const barWidth = bucketCount > 0 ? Math.min(100 / bucketCount * 0.6, 8) : 4
  const step = bucketCount > 0 ? 100 / bucketCount : 100

  // Left Y axis: Clicks (bar chart)
  const maxClicks = Math.max(...barClicks, 1)

  // Right Y axis: Impressions or CTR (line)
  const bucketCtr = buckets.map((b) => b.impressions > 0 ? (b.clicks / b.impressions) * 100 : 0)
  const lineValues = rightMetric === 'impressions'
    ? buckets.map((b) => b.impressions)
    : bucketCtr
  const maxLineVal = Math.max(...lineValues, 0.1)

  const linePoints = lineValues.map((val, i) => {
    const x = (i + 0.5) * step
    const y = chartHeight - (val / maxLineVal) * (chartHeight - 24)
    return `${x},${y}`
  }).join(' ')

  // Y axis tick values
  const clickTicks = [0, Math.round(maxClicks / 2), Math.round(maxClicks)]
  const lineTicks = rightMetric === 'impressions'
    ? [0, Math.round(maxLineVal / 2), Math.round(maxLineVal)]
    : [0, (maxLineVal / 2).toFixed(1), maxLineVal.toFixed(1)]

  // Only skip labels for daily granularity with many bars
  const labelEvery = granularity === 'day' && bucketCount > 14 ? Math.ceil(bucketCount / 10) : 1

  const granLabel = granularity === 'month' ? 'Monthly' : granularity === 'week' ? 'Weekly' : 'Daily'
  const lineLabel = rightMetric === 'impressions' ? 'Impressions' : 'CTR'

  return (
    <div className="od-perf-chart">
      <div style={{ display: 'flex', gap: 0 }}>
        {/* Left Y axis labels (Clicks) */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 6, fontSize: 10, color: 'rgba(255,255,255,0.45)', width: 40, flexShrink: 0, height: chartHeight }}>
          <span>{clickTicks[2].toLocaleString()}</span>
          <span>{clickTicks[1].toLocaleString()}</span>
          <span>0</span>
        </div>

        {/* Chart area */}
        <div
          className="od-perf-chart__area"
          style={{ height: chartHeight, position: 'relative', flex: 1 }}
          onMouseLeave={() => setHoveredIdx(null)}
        >
          {/* Invisible hover zones */}
          {buckets.map((_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${i * step}%`,
                width: `${step}%`,
                top: 0,
                bottom: 0,
              }}
              onMouseEnter={() => setHoveredIdx(i)}
            />
          ))}

          {/* Hover tooltip */}
          {hoveredIdx !== null && buckets[hoveredIdx] && (
            <div
              style={{
                position: 'absolute',
                left: `${(hoveredIdx + 0.5) * step}%`,
                top: 0,
                transform: 'translateX(-50%)',
                background: 'rgba(26, 26, 46, 0.5)',
                backdropFilter: 'blur(8px)',
                color: '#fff',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 12,
                lineHeight: 1.6,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                zIndex: 10,
                boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 13 }}>
                {buckets[hoveredIdx].label}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1', flexShrink: 0 }} />
                {clickFilter !== 'all' ? `${clickFilter === 'brand' ? 'Brand' : 'Generic'} Clicks` : 'Clicks'}: <strong>{barClicks[hoveredIdx].toLocaleString()}</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#74B3A8', flexShrink: 0 }} />
                Impressions: <strong>{buckets[hoveredIdx].impressions.toLocaleString()}</strong>
              </div>
              <div style={{ color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
                CTR: {bucketCtr[hoveredIdx].toFixed(1)}%
              </div>
            </div>
          )}

          {/* Bars (Clicks) + Line SVG */}
          <svg
            viewBox={`0 0 100 ${chartHeight}`}
            preserveAspectRatio="none"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          >
            {/* Click bars */}
            {buckets.map((_b, i) => {
              const x = (i + 0.5) * step
              const barH = (barClicks[i] / maxClicks) * (chartHeight - 24)
              return (
                <rect
                  key={i}
                  x={x - barWidth / 2}
                  y={chartHeight - barH}
                  width={barWidth}
                  height={barH}
                  fill={hoveredIdx === i ? '#818cf8' : '#6366f1'}
                  rx="1"
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}
            {/* Right metric line */}
            <polyline
              points={linePoints}
              fill="none"
              stroke="#74B3A8"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* Hover dot on line */}
          {hoveredIdx !== null && (
            <svg
              viewBox={`0 0 100 ${chartHeight}`}
              preserveAspectRatio="none"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            >
              <circle
                cx={(hoveredIdx + 0.5) * step}
                cy={chartHeight - (lineValues[hoveredIdx] / maxLineVal) * (chartHeight - 24)}
                r="3"
                fill="#74B3A8"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}
        </div>

        {/* Right Y axis labels */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-start', paddingLeft: 6, fontSize: 10, color: 'rgba(255,255,255,0.45)', width: 48, flexShrink: 0, height: chartHeight }}>
          <span>{rightMetric === 'ctr' ? `${lineTicks[2]}%` : Number(lineTicks[2]).toLocaleString()}</span>
          <span>{rightMetric === 'ctr' ? `${lineTicks[1]}%` : Number(lineTicks[1]).toLocaleString()}</span>
          <span>0</span>
        </div>
      </div>

      {/* X-axis labels */}
      <div className="od-perf-chart__labels" style={{ marginLeft: 40, marginRight: 48 }}>
        {buckets.map((bucket, i) => (
          i % labelEvery === 0 ? (
            <div key={i} className="od-perf-chart__label" style={{ left: `${(i + 0.5) * step}%` }}>
              {bucket.label}
            </div>
          ) : null
        ))}
      </div>

      <div className="od-chart__legend">
        <span className="od-chart__legend-item">
          <span className="od-chart__legend-dot" style={{ background: '#6366f1', borderRadius: 2 }} />
          {clickFilter !== 'all' ? `${clickFilter === 'brand' ? 'Brand' : 'Generic'} Clicks` : 'Clicks'} ({granLabel})
        </span>
        <span className="od-chart__legend-item">
          <span className="od-chart__legend-dot" style={{ background: '#74B3A8' }} />
          {lineLabel}
        </span>
      </div>
    </div>
  )
}

// ─── Time Analysis Table ──────────────────────────────────

function TimeAnalysisTable({ daily, startDate, endDate }: { daily: DailyEntry[]; startDate: string; endDate: string }) {
  const granularity = getGranularity(startDate, endDate)
  // Table uses same granularity as the chart, but always at least week-level
  const tableGran = granularity === 'day' ? 'week' : granularity
  const buckets = bucketDaily(daily, tableGran)

  if (buckets.length <= 1) return null

  const totals = buckets.reduce(
    (acc, b) => ({
      impressions: acc.impressions + b.impressions,
      clicks: acc.clicks + b.clicks,
      posSum: acc.posSum + b.posSum,
      count: acc.count + b.count,
    }),
    { impressions: 0, clicks: 0, posSum: 0, count: 0 },
  )

  const periodLabel = tableGran === 'month' ? 'Month' : 'Week of'

  return (
    <div className="od-time-table">
      <div className="od-time-table__title">Time Analysis</div>
      <table className="od-gsc__table">
        <thead>
          <tr>
            <th>{periodLabel}</th>
            <th>Impressions</th>
            <th>Clicks</th>
            <th>CTR</th>
            <th>Avg Position</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b, i) => {
            const ctr = b.impressions > 0 ? (b.clicks / b.impressions) * 100 : 0
            const pos = b.count > 0 ? b.posSum / b.count : 0
            return (
              <tr key={i}>
                <td>{b.label}</td>
                <td>{b.impressions.toLocaleString()}</td>
                <td>{b.clicks.toLocaleString()}</td>
                <td>{ctr.toFixed(1)}%</td>
                <td>{pos.toFixed(1)}</td>
              </tr>
            )
          })}
          <tr className="od-time-table__total">
            <td><strong>Total</strong></td>
            <td><strong>{totals.impressions.toLocaleString()}</strong></td>
            <td><strong>{totals.clicks.toLocaleString()}</strong></td>
            <td><strong>{totals.impressions > 0 ? ((totals.clicks / totals.impressions) * 100).toFixed(1) : '0.0'}%</strong></td>
            <td><strong>{totals.count > 0 ? (totals.posSum / totals.count).toFixed(1) : '0.0'}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ─── Brand & Generic Section ──────────────────────────────

function BrandGenericSection({
  brandedData,
  nonBrandedData,
  dailyBrand,
  dailyGeneric,
  activeTab,
}: {
  brandedData: BrandMetrics | null
  nonBrandedData: BrandMetrics | null
  dailyBrand: DailyBrandEntry[]
  dailyGeneric: DailyBrandEntry[]
  activeTab: 'overview' | 'brand' | 'generic'
}) {
  const brandClicks = brandedData?.clicks || 0
  const genericClicks = nonBrandedData?.clicks || 0
  const totalClicks = brandClicks + genericClicks
  const brandPct = totalClicks > 0 ? Math.round((brandClicks / totalClicks) * 100) : 0
  const genericPct = 100 - brandPct

  return (
    <div className="od-brand-section">
      <div className="od-brand-section__layout">
        {/* Left: Overview table + donut */}
        <div className="od-brand-section__left">
          {/* Donut Chart */}
          <div className="od-brand-section__donut">
            <svg viewBox="0 0 120 120" width="120" height="120">
              {/* Generic arc */}
              <circle
                cx="60" cy="60" r="50"
                fill="none"
                stroke="#74B3A8"
                strokeWidth="16"
                strokeDasharray={`${genericPct * 3.14} ${100 * 3.14}`}
                strokeDashoffset="0"
                transform="rotate(-90 60 60)"
              />
              {/* Brand arc */}
              <circle
                cx="60" cy="60" r="50"
                fill="none"
                stroke="#213843"
                strokeWidth="16"
                strokeDasharray={`${brandPct * 3.14} ${100 * 3.14}`}
                strokeDashoffset={`${-genericPct * 3.14}`}
                transform="rotate(-90 60 60)"
              />
              <text x="60" y="56" textAnchor="middle" fontSize="14" fontWeight="800" fill="#111827">{brandPct}%</text>
              <text x="60" y="72" textAnchor="middle" fontSize="9" fill="#6b7280">Brand</text>
            </svg>
          </div>

          {/* Overview table */}
          <table className="od-gsc__table" style={{ fontSize: 12 }}>
            <thead>
              <tr><th>Type</th><th>Keywords</th><th>Impressions</th><th>Clicks</th></tr>
            </thead>
            <tbody>
              {(activeTab === 'overview' || activeTab === 'brand') && brandedData && (
                <tr>
                  <td><span style={{ color: '#213843', fontWeight: 700 }}>Brand</span></td>
                  <td>{brandedData.keywordCount ?? '-'}</td>
                  <td>{brandedData.impressions.toLocaleString()}</td>
                  <td>{brandedData.clicks.toLocaleString()}</td>
                </tr>
              )}
              {(activeTab === 'overview' || activeTab === 'generic') && nonBrandedData && (
                <tr>
                  <td><span style={{ color: '#74B3A8', fontWeight: 700 }}>Generic</span></td>
                  <td>{nonBrandedData.keywordCount ?? '-'}</td>
                  <td>{nonBrandedData.impressions.toLocaleString()}</td>
                  <td>{nonBrandedData.clicks.toLocaleString()}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Right: Daily line chart */}
        <div className="od-brand-section__right">
          <BrandLineChart dailyBrand={dailyBrand} dailyGeneric={dailyGeneric} activeTab={activeTab} />
        </div>
      </div>
    </div>
  )
}

function BrandLineChart({
  dailyBrand,
  dailyGeneric,
  activeTab,
}: {
  dailyBrand: DailyBrandEntry[]
  dailyGeneric: DailyBrandEntry[]
  activeTab: 'overview' | 'brand' | 'generic'
}) {
  const showBrand = activeTab === 'overview' || activeTab === 'brand'
  const showGeneric = activeTab === 'overview' || activeTab === 'generic'

  const allClicks = [
    ...(showBrand ? dailyBrand.map((d) => d.clicks) : []),
    ...(showGeneric ? dailyGeneric.map((d) => d.clicks) : []),
  ]
  const maxClicks = Math.max(...allClicks, 1)
  const chartHeight = 140
  const dayCount = Math.max(dailyBrand.length, dailyGeneric.length, 1)
  const stepX = 100 / dayCount

  const buildLine = (data: DailyBrandEntry[]) =>
    data.map((d, i) => {
      const x = (i + 0.5) * stepX
      const y = chartHeight - (d.clicks / maxClicks) * (chartHeight - 16)
      return `${x},${y}`
    }).join(' ')

  const labelEvery = dayCount > 60 ? 7 : dayCount > 30 ? 3 : 1

  return (
    <div className="od-brand-chart">
      <div style={{ position: 'relative', height: chartHeight }}>
        <svg
          viewBox={`0 0 100 ${chartHeight}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: '100%' }}
        >
          {showGeneric && dailyGeneric.length > 0 && (
            <polyline
              points={buildLine(dailyGeneric)}
              fill="none"
              stroke="#74B3A8"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {showBrand && dailyBrand.length > 0 && (
            <polyline
              points={buildLine(dailyBrand)}
              fill="none"
              stroke="#213843"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      </div>

      {/* X-axis labels */}
      <div className="od-perf-chart__labels" style={{ position: 'relative', height: 20 }}>
        {(dailyBrand.length > 0 ? dailyBrand : dailyGeneric).map((entry, i) => (
          i % labelEvery === 0 ? (
            <div key={entry.date} className="od-perf-chart__label" style={{ left: `${(i + 0.5) * stepX}%` }}>
              {parseLocalDate(entry.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
            </div>
          ) : null
        ))}
      </div>

      <div className="od-chart__legend">
        {showBrand && (
          <span className="od-chart__legend-item">
            <span className="od-chart__legend-dot" style={{ background: '#213843' }} />
            Brand Clicks
          </span>
        )}
        {showGeneric && (
          <span className="od-chart__legend-item">
            <span className="od-chart__legend-dot" style={{ background: '#74B3A8' }} />
            Generic Clicks
          </span>
        )}
      </div>
    </div>
  )
}

export default SearchConsolePage
