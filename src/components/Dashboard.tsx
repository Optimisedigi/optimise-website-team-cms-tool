'use client'

import { useEffect, useState, useRef } from 'react'
import RocketSplash from './RocketSplash'
import SalesFunnelDashboard from './SalesFunnelDashboard'

// ─── Types ────────────────────────────────────────────────

interface GscData {
  totalClicks?: number
  totalImpressions?: number
  avgCtr?: number
  avgPosition?: number
  clicksChange?: number
  impressionsChange?: number
  positionChange?: number
  ctrChange?: number
  uniqueKeywords?: number
  uniquePages?: number
  periodStart?: string
  periodEnd?: string
  clientId?: string
  gscConnected?: boolean
}

interface GscMonthlyEntry {
  month: string
  clicks: number
  impressions: number
}

interface ActivityEntry {
  id: string
  type: string
  title: string
  description?: string
  createdAt: string
  user?: { name?: string; email?: string } | null
  client?: { name?: string } | null
}

interface CostHistoryEntry {
  label: string
  infrastructure: number
  api: number
  llm: number
}

interface DashboardData {
  gsc: GscData | null
  gscMonthly: GscMonthlyEntry[]
  activeClients: number
  totalRetainer: number
  ytdRevenue: number
  activity: ActivityEntry[]
  userRole: string
  userName: string
  proposals: {
    active: number
    converted: number
    total: number
    conversionRate: number
  }
  usage: {
    seoAudits: number
    croAudits: number
    keywordSnapshots: number
    competitorAnalyses: number
    contentResearches: number
    mediaUploads: number
  }
  costs: {
    api: Record<string, number>
    apiTotal: number
    infrastructure: Record<string, number>
    infraTotal: number
    llm: Record<string, number>
    llmTotal: number
    total: number
  }
  costHistory: CostHistoryEntry[]
  totalLeads?: number
  businessCosts?: {
    totalThisMonth: number
    uncategorisedCount: number
  }
  month: string
}

// ─── Helpers ──────────────────────────────────────────────

const typeLabels: Record<string, string> = {
  blog_published: 'Blog',
  seo_audit_completed: 'SEO Audit',
  cro_audit_completed: 'CRO Audit',
  keyword_analysis: 'Keywords',
  client_added: 'New Client',
  retainer_changed: 'Retainer',
  proposal_created: 'Proposal',
  gsc_snapshot: 'GSC',
  time_tracked: 'Time Tracked',
  lead_created: 'New Lead',
  lead_stage_changed: 'Lead Update',
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
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

const infraLabels: Record<string, string> = {
  vercel: 'Vercel Pro',
  railway: 'Railway',
  turso: 'Turso DB',
  blobStorage: 'Blob Storage',
  screenshotOne: 'ScreenshotOne',
  sendGrid: 'SendGrid',
  domain: 'Domain',
}

const apiLabels: Record<string, string> = {
  seoAudits: 'SEO Audits',
  croAudits: 'CRO Audits',
  keywords: 'Keywords',
  competitors: 'Competitors',
  content: 'Content Research',
  blogImages: 'Image Gen',
}

const llmLabels: Record<string, string> = {
  claudeCode: 'Claude Code',
  chatGPT: 'ChatGPT',
  kimi: 'Kimi',
}

const CHART_COLORS = {
  infrastructure: '#213843', // dark
  api: '#468D8B',            // mid
  llm: '#74B3A8',            // light
}

// ─── Main ─────────────────────────────────────────────────

const Dashboard = () => {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [gscRefreshing, setGscRefreshing] = useState(false)
  const [gscSeeding, setGscSeeding] = useState(false)

  const fetchDashboard = () => {
    return fetch('/api/dashboard')
      .then((r) => {
        if (!r.ok) {
          console.error('[Dashboard] API returned', r.status, r.statusText)
          return null
        }
        return r.json()
      })
      .then((d) => { if (d && !d.error) setData(d); setLoading(false) })
      .catch((err) => { console.error('[Dashboard] fetch error:', err); setLoading(false) })
  }

  const handleGscSeed = async () => {
    if (gscSeeding) return
    setGscSeeding(true)
    try {
      await fetch('/api/gsc/seed', { method: 'POST' })
      await fetchDashboard()
    } catch {
      // silently fail
    } finally {
      setGscSeeding(false)
    }
  }

  const handleGscRefresh = async () => {
    if (!data?.gsc?.clientId || gscRefreshing) return
    setGscRefreshing(true)
    try {
      await fetch('/api/gsc/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: data.gsc.clientId }),
      })
      await fetchDashboard()
    } catch {
      // silently fail
    } finally {
      setGscRefreshing(false)
    }
  }

  useEffect(() => {
    fetchDashboard()
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      if (!gscRefreshing) {
        fetch('/api/dashboard')
          .then((r) => r.ok ? r.json() : null)
          .then((d) => { if (d && !d.error) setData(d) })
          .catch((err) => console.error('[Dashboard] refresh error:', err))
      }
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return <RocketSplash />
  }

  if (!data) {
    return (
      <div className="od-dash">
        <p style={{ color: 'var(--theme-elevation-400)', padding: '60px 0' }}>Could not load dashboard data. Check the browser console for details.</p>
        <button type="button" onClick={() => { setLoading(true); fetchDashboard() }} style={{ background: 'var(--theme-elevation-100)', border: '1px solid var(--theme-elevation-200)', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', color: 'inherit' }}>Retry</button>
      </div>
    )
  }

  const totalAudits =
    data.usage.seoAudits +
    data.usage.croAudits +
    data.usage.keywordSnapshots +
    data.usage.competitorAnalyses +
    data.usage.contentResearches

  return (
    <div className="od-dash">
      {/* Header */}
      <div className="od-dash__header">
        <span className="od-dash__month">{data.month}</span>
      </div>

      <div className="od-dash__layout">
        {/* ── Left Column ── */}
        <div className="od-dash__main">

          {/* Topline Overview */}
          <div className="od-box">
            <div className="od-box__head">
              <span className="od-box__title">Topline Agency Data</span>
            </div>
            <div className="od-box__stats od-box__stats--8">
              <div className="od-box__stat">
                <span className="od-box__stat-value">{data.activeClients}</span>
                <span className="od-box__stat-label">Active Clients</span>
              </div>
              <div className="od-box__stat">
                <span className="od-box__stat-value">{data.totalLeads ?? 0}</span>
                <span className="od-box__stat-label">Total Leads</span>
              </div>
              <div className="od-box__stat">
                <span className="od-box__stat-value">${data.totalRetainer.toLocaleString()}</span>
                <span className="od-box__stat-label">Monthly Revenue</span>
              </div>
              <div className="od-box__stat">
                <span className="od-box__stat-value">${data.ytdRevenue.toLocaleString()}</span>
                <span className="od-box__stat-label">YTD Revenue</span>
              </div>
              <div className="od-box__stat">
                <span className="od-box__stat-value">{data.proposals.active}</span>
                <span className="od-box__stat-label">Active Proposals</span>
              </div>
              <div className="od-box__stat">
                <span className="od-box__stat-value">{data.proposals.conversionRate}%</span>
                <span className="od-box__stat-label">Proposal Conversion Rate</span>
              </div>
              <div className="od-box__stat">
                <span className="od-box__stat-value">${data.costs.total.toFixed(2)}</span>
                <span className="od-box__stat-label">MTD Costs (AUD)</span>
              </div>
              <div className="od-box__stat">
                <span className="od-box__stat-value">{totalAudits}</span>
                <span className="od-box__stat-label">Audits This Month</span>
              </div>
            </div>
          </div>

          {/* Search Console */}
          <GscCard gsc={data.gsc} gscMonthly={data.gscMonthly} refreshing={gscRefreshing} onRefresh={handleGscRefresh} onSeed={handleGscSeed} seeding={gscSeeding} />

          {/* Costs */}
          <div className="od-box">
            <div className="od-box__head">
              <span className="od-box__title">Costs</span>
              <span className="od-box__period">AUD</span>
            </div>
            <div className="od-box__body">
              {/* Stacked bar chart */}
              <CostChart history={data.costHistory} />

              {/* Cost summary — 3 columns + total + collapsible details */}
              <CostBreakdown data={data} />
            </div>
          </div>

          {/* Business Costs Summary */}
          {data.businessCosts && (
            <div className="od-box">
              <div className="od-box__head">
                <span className="od-box__title">Business Costs</span>
                <a href="/admin/finance/costs" style={{ fontSize: 12, color: 'var(--theme-elevation-500)', textDecoration: 'none' }}>
                  View all &rarr;
                </a>
              </div>
              <div className="od-box__stats od-box__stats--2" style={{ padding: '16px 20px' }}>
                <div className="od-box__stat">
                  <span className="od-box__stat-value">${data.businessCosts.totalThisMonth.toFixed(2)}</span>
                  <span className="od-box__stat-label">Total This Month (AUD)</span>
                </div>
                <div className="od-box__stat">
                  <span className="od-box__stat-value" style={data.businessCosts.uncategorisedCount > 0 ? { color: '#f59e0b' } : {}}>
                    {data.businessCosts.uncategorisedCount}
                  </span>
                  <span className="od-box__stat-label">Uncategorised</span>
                </div>
              </div>
            </div>
          )}

          {/* Google Analytics */}
          <Ga4Card />
        </div>

        {/* ── Right Column ── */}
        <div className="od-dash__side">
          <ActivityFeed entries={data.activity} />

          {/* Action Items */}
          <div className="od-box">
            <div className="od-box__head">
              <span className="od-box__title">Action Items</span>
              <span className="od-box__badge">Coming Soon</span>
            </div>
            <div className="od-box__body" style={{ padding: '24px 20px', textAlign: 'center' }}>
              <p style={{ color: 'var(--theme-elevation-400)', fontSize: 13, margin: 0 }}>
                Weekly tasks and action items will appear here once the Tasks tab is connected.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Sales Funnel (full-width below main grid) ── */}
      <SalesFunnelDashboard />
    </div>
  )
}

// ─── GSC Card ─────────────────────────────────────────────

function GscCard({
  gsc,
  gscMonthly,
  refreshing,
  onRefresh,
  onSeed,
  seeding,
}: {
  gsc: GscData | null
  gscMonthly: GscMonthlyEntry[]
  refreshing: boolean
  onRefresh: () => void
  onSeed: () => void
  seeding: boolean
}) {
  if (!gsc || (!gsc.totalClicks && !gsc.gscConnected)) {
    return (
      <div className="od-box od-box--muted">
        <div className="od-box__head">
          <span className="od-box__title">Google Search Console</span>
        </div>
        <div className="od-box__body" style={{ padding: '24px 20px', textAlign: 'center' }}>
          <p style={{ color: 'var(--theme-elevation-400)', fontSize: 13, margin: '0 0 12px' }}>
            Connect GSC in Settings &rarr; Integrations to see search performance data.
          </p>
          <button
            className="od-gsc__refresh"
            onClick={onSeed}
            disabled={seeding}
            type="button"
            style={{ fontSize: 12 }}
          >
            {seeding ? 'Seeding...' : 'Seed Demo Data'}
          </button>
        </div>
      </div>
    )
  }

  const hasSnapshot = (gsc.totalClicks ?? 0) > 0 || (gsc.totalImpressions ?? 0) > 0

  return (
    <div className="od-box">
      <div className="od-box__head">
        <span className="od-box__title">Google Search Console</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {gsc.periodStart && gsc.periodEnd && (
            <span className="od-box__period">
              {new Date(gsc.periodStart).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
              {' \u2013 '}
              {new Date(gsc.periodEnd).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
            </span>
          )}
          <button
            className="od-gsc__refresh"
            onClick={onSeed}
            disabled={seeding}
            type="button"
            title="Re-seed 13 months of demo data"
            style={{ fontSize: 11 }}
          >
            {seeding ? 'Seeding...' : 'Re-seed'}
          </button>
          <button
            className="od-gsc__refresh"
            onClick={onRefresh}
            disabled={refreshing}
            type="button"
            title="Refresh GSC data"
          >
            {refreshing ? 'Syncing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {hasSnapshot ? (
        <>
          <div className="od-box__stats od-box__stats--6">
            <div className="od-box__stat">
              <span className="od-box__stat-value">
                {(gsc.totalClicks ?? 0).toLocaleString()}
                <ChangeArrow value={gsc.clicksChange} />
              </span>
              <span className="od-box__stat-label">Clicks</span>
            </div>
            <div className="od-box__stat">
              <span className="od-box__stat-value">
                {(gsc.totalImpressions ?? 0).toLocaleString()}
                <ChangeArrow value={gsc.impressionsChange} />
              </span>
              <span className="od-box__stat-label">Impressions</span>
            </div>
            <div className="od-box__stat">
              <span className="od-box__stat-value">
                {(gsc.avgCtr ?? 0).toFixed(1)}%
                <ChangeArrow value={gsc.ctrChange} />
              </span>
              <span className="od-box__stat-label">CTR</span>
            </div>
            <div className="od-box__stat">
              <span className="od-box__stat-value">
                {(gsc.avgPosition ?? 0).toFixed(1)}
                <ChangeArrow value={gsc.positionChange} inverted />
              </span>
              <span className="od-box__stat-label">Avg Position</span>
            </div>
            <div className="od-box__stat">
              <span className="od-box__stat-value">{(gsc.uniqueKeywords ?? 0).toLocaleString()}</span>
              <span className="od-box__stat-label">Unique Keywords</span>
            </div>
            <div className="od-box__stat">
              <span className="od-box__stat-value">{(gsc.uniquePages ?? 0).toLocaleString()}</span>
              <span className="od-box__stat-label">Unique Pages</span>
            </div>
          </div>

          {gscMonthly.length > 0 && <GscChart data={gscMonthly} />}
        </>
      ) : (
        <div className="od-box__body" style={{ padding: '24px 20px', textAlign: 'center' }}>
          <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>
            GSC is connected. Click Refresh to pull the first snapshot.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── GSC Monthly Chart (dual lines, pure CSS/SVG) ──────

function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return n.toString()
}

function GscChart({ data }: { data: GscMonthlyEntry[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const maxImpressions = Math.max(...data.map((d) => d.impressions), 1)
  const maxClicks = Math.max(...data.map((d) => d.clicks), 1)
  const chartHeight = 180
  const count = data.length
  const step = count > 0 ? 100 / count : 100
  const barWidth = count > 0 ? Math.min(100 / count * 0.6, 10) : 6

  // Build SVG polyline points for impressions line (right axis)
  const impressionPoints = data.map((d, i) => {
    const x = (i + 0.5) * step
    const y = chartHeight - (d.impressions / maxImpressions) * (chartHeight - 20)
    return `${x},${y}`
  }).join(' ')

  // Y axis tick values
  const clickTicks = [0, Math.round(maxClicks / 2), Math.round(maxClicks)]
  const impTicks = [0, Math.round(maxImpressions / 2), Math.round(maxImpressions)]

  return (
    <div className="od-gsc-chart">
      <div style={{ display: 'flex', gap: 0 }}>
        {/* Left Y axis (Clicks) */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 4, fontSize: 9, color: 'var(--theme-elevation-400)', width: 36, flexShrink: 0, height: chartHeight }}>
          <span>{formatCompact(clickTicks[2])}</span>
          <span>{formatCompact(clickTicks[1])}</span>
          <span>0</span>
        </div>

        <div
          className="od-gsc-chart__area"
          style={{ height: chartHeight, position: 'relative', flex: 1 }}
          onMouseLeave={() => setHoveredIdx(null)}
        >
          {/* Invisible hover zones */}
          {data.map((_, i) => (
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
          {hoveredIdx !== null && data[hoveredIdx] && (
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
                {data[hoveredIdx].month}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1', flexShrink: 0 }} />
                Clicks: <strong>{data[hoveredIdx].clicks.toLocaleString()}</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#74B3A8', flexShrink: 0 }} />
                Impressions: <strong>{data[hoveredIdx].impressions.toLocaleString()}</strong>
              </div>
            </div>
          )}

          <svg
            viewBox={`0 0 100 ${chartHeight}`}
            preserveAspectRatio="none"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          >
            {/* Click bars (left axis) */}
            {data.map((d, i) => {
              const x = (i + 0.5) * step
              const barH = (d.clicks / maxClicks) * (chartHeight - 20)
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
            {/* Impressions line (right axis) */}
            <polyline
              points={impressionPoints}
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
                cy={chartHeight - (data[hoveredIdx].impressions / maxImpressions) * (chartHeight - 20)}
                r="3"
                fill="#74B3A8"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}
        </div>

        {/* Right Y axis (Impressions) */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-start', paddingLeft: 4, fontSize: 9, color: 'var(--theme-elevation-400)', width: 40, flexShrink: 0, height: chartHeight }}>
          <span>{formatCompact(impTicks[2])}</span>
          <span>{formatCompact(impTicks[1])}</span>
          <span>0</span>
        </div>
      </div>

      {/* X-axis labels */}
      <div className="od-gsc-chart__labels" style={{ marginLeft: 36, marginRight: 40 }}>
        {data.map((entry) => (
          <div key={entry.month} className="od-gsc-chart__label" style={{ width: `${100 / count}%` }}>
            {entry.month}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="od-chart__legend">
        <span className="od-chart__legend-item">
          <span className="od-chart__legend-dot" style={{ background: '#6366f1', borderRadius: 2 }} />
          Clicks
        </span>
        <span className="od-chart__legend-item">
          <span className="od-chart__legend-dot" style={{ background: '#74B3A8' }} />
          Impressions
        </span>
      </div>
    </div>
  )
}

// ─── Cost Chart (stacked bar, pure CSS/SVG) ───────────────

function CostChart({ history }: { history: CostHistoryEntry[] }) {
  if (!history || history.length === 0) return null

  const maxTotal = Math.max(...history.map((h) => h.infrastructure + h.api + h.llm), 1)
  const chartHeight = 160
  const barWidth = 100 / history.length

  return (
    <div className="od-chart">
      <div className="od-chart__area" style={{ height: chartHeight }}>
        {history.map((entry, i) => {
          const total = entry.infrastructure + entry.api + entry.llm
          const infraH = (entry.infrastructure / maxTotal) * chartHeight
          const apiH = (entry.api / maxTotal) * chartHeight
          const llmH = (entry.llm / maxTotal) * chartHeight
          return (
            <div
              key={entry.label}
              className="od-chart__bar-group"
              style={{ width: `${barWidth}%` }}
            >
              <div className="od-chart__bar" style={{ height: chartHeight }}>
                <div
                  className="od-chart__segment"
                  style={{ height: llmH, background: CHART_COLORS.llm }}
                  title={`LLM: $${entry.llm.toFixed(2)}`}
                />
                <div
                  className="od-chart__segment"
                  style={{ height: apiH, background: CHART_COLORS.api }}
                  title={`API: $${entry.api.toFixed(2)}`}
                />
                <div
                  className="od-chart__segment od-chart__segment--label"
                  style={{ height: infraH, background: CHART_COLORS.infrastructure }}
                  title={`Infra: $${entry.infrastructure.toFixed(2)}`}
                >
                  <span className="od-chart__bar-value">${total.toFixed(0)}</span>
                </div>
              </div>
              <div className="od-chart__label">{entry.label}</div>
            </div>
          )
        })}
      </div>
      <div className="od-chart__legend">
        <span className="od-chart__legend-item">
          <span className="od-chart__legend-dot" style={{ background: CHART_COLORS.infrastructure }} />
          Infrastructure
        </span>
        <span className="od-chart__legend-item">
          <span className="od-chart__legend-dot" style={{ background: CHART_COLORS.api }} />
          API Usage
        </span>
        <span className="od-chart__legend-item">
          <span className="od-chart__legend-dot" style={{ background: CHART_COLORS.llm }} />
          LLM Models
        </span>
      </div>
    </div>
  )
}

// ─── Cost Breakdown (3 columns + collapsible details) ─────

function CostBreakdown({ data }: { data: DashboardData }) {
  const [open, setOpen] = useState(false)

  const countMap: Record<string, number> = {
    seoAudits: data.usage.seoAudits,
    croAudits: data.usage.croAudits,
    keywords: data.usage.keywordSnapshots,
    competitors: data.usage.competitorAnalyses,
    content: data.usage.contentResearches,
    blogImages: data.usage.mediaUploads,
  }

  return (
    <div className="od-costs">
      {/* 4-column summary: Total | Infrastructure | API Usage | LLM Models */}
      <div className="od-costs__summary-row">
        <div className="od-costs__summary od-costs__summary--total">
          <span className="od-costs__summary-label">Total</span>
          <span className="od-costs__summary-value">${data.costs.total.toFixed(2)}</span>
          <span className="od-costs__summary-sub">AUD / month</span>
        </div>
        <div className="od-costs__summary">
          <span className="od-costs__summary-dot" style={{ background: CHART_COLORS.infrastructure }} />
          <span className="od-costs__summary-label">Infrastructure</span>
          <span className="od-costs__summary-value">${data.costs.infraTotal.toFixed(2)}</span>
        </div>
        <div className="od-costs__summary">
          <span className="od-costs__summary-dot" style={{ background: CHART_COLORS.api }} />
          <span className="od-costs__summary-label">API Usage</span>
          <span className="od-costs__summary-value">${data.costs.apiTotal.toFixed(2)}</span>
        </div>
        <div className="od-costs__summary">
          <span className="od-costs__summary-dot" style={{ background: CHART_COLORS.llm }} />
          <span className="od-costs__summary-label">LLM Models</span>
          <span className="od-costs__summary-value">${data.costs.llmTotal.toFixed(2)}</span>
        </div>
      </div>

      {/* Collapsible details toggle */}
      <button
        className="od-costs__toggle"
        onClick={() => setOpen(!open)}
        type="button"
      >
        {open ? 'Hide details' : 'View details'}
        <span className={`od-costs__toggle-arrow ${open ? 'od-costs__toggle-arrow--open' : ''}`}>&#9662;</span>
      </button>

      {/* Collapsible detail rows — 4 columns matching summary */}
      {open && (
        <div className="od-costs__details">
          <div className="od-costs__detail-row">
            {/* Empty first column (aligns under Total) */}
            <div className="od-costs__col" />

            {/* Infrastructure details */}
            <div className="od-costs__col">
              <div className="od-costs__section">
                <span className="od-costs__section-dot" style={{ background: CHART_COLORS.infrastructure }} />
                Infrastructure
              </div>
              <div className="od-costs__grid">
                {Object.entries(data.costs.infrastructure).map(([key, cost]) => (
                  <div key={key} className="od-costs__row">
                    <span className="od-costs__label">{infraLabels[key] || key}</span>
                    <span className="od-costs__value">${(cost as number).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* API Usage details */}
            <div className="od-costs__col">
              <div className="od-costs__section">
                <span className="od-costs__section-dot" style={{ background: CHART_COLORS.api }} />
                API Usage
              </div>
              <div className="od-costs__grid">
                {Object.entries(data.costs.api).map(([key, cost]) => (
                  <div key={key} className="od-costs__row">
                    <span className="od-costs__label">
                      {apiLabels[key] || key}
                      <span className="od-costs__count">&times;{countMap[key] ?? 0}</span>
                    </span>
                    <span className="od-costs__value">${(cost as number).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* LLM Models details */}
            <div className="od-costs__col">
              <div className="od-costs__section">
                <span className="od-costs__section-dot" style={{ background: CHART_COLORS.llm }} />
                LLM Models
              </div>
              <div className="od-costs__grid">
                {Object.entries(data.costs.llm).map(([key, cost]) => (
                  <div key={key} className="od-costs__row">
                    <span className="od-costs__label">{llmLabels[key] || key}</span>
                    <span className="od-costs__value">${(cost as number).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Activity Feed ────────────────────────────────────────

function ActivityFeed({ entries }: { entries: ActivityEntry[] }) {
  return (
    <div className="od-box od-box--feed">
      <div className="od-box__head">
        <span className="od-box__title">Activity Feed</span>
        <a href="/admin/collections/activity-log" className="od-feed__see-all">
          See all activity
        </a>
      </div>
      {entries.length === 0 ? (
        <div style={{ padding: '24px 20px', color: 'var(--theme-elevation-400)', fontSize: 13 }}>
          No recent activity
        </div>
      ) : (
        <div className="od-feed">
          {entries.map((entry) => (
            <div key={entry.id} className="od-feed__item">
              <div className="od-feed__dot" />
              <div className="od-feed__body">
                <div className="od-feed__title">
                  <span className="od-feed__badge">{typeLabels[entry.type] || entry.type}</span>
                  {entry.title}
                </div>
                {entry.description && (
                  <div className="od-feed__desc">{entry.description}</div>
                )}
                <div className="od-feed__meta">
                  {entry.user?.name || entry.user?.email || 'System'}
                  {entry.client?.name ? ` \u00B7 ${entry.client.name}` : ''}
                  {' \u00B7 '}
                  {timeAgo(entry.createdAt)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── GA4 Card ────────────────────────────────────────────

interface Ga4Data {
  ga4Connected: boolean
  overview?: {
    users: number
    newUsers: number
    sessions: number
    pageviews: number
    bounceRate: number
    avgSessionDuration: number
    engagementRate: number
    conversions: number
  }
  channels?: { channel: string; users: number; sessions: number; conversions: number }[]
  topPages?: { pagePath: string; pageTitle: string; users: number; pageviews: number }[]
  daily?: { date: string; users: number; sessions: number; pageviews: number }[]
  periodStart?: string
  periodEnd?: string
}

function Ga4Card() {
  const [data, setData] = useState<Ga4Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('30d')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/ga4/query?period=${period}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [period])

  if (loading && !data) {
    return (
      <div className="od-box od-box--muted">
        <div className="od-box__head">
          <span className="od-box__title">Google Analytics</span>
        </div>
        <div className="od-box__body" style={{ padding: '24px 20px', textAlign: 'center' }}>
          <p style={{ color: 'var(--theme-elevation-400)', fontSize: 13, margin: 0 }}>Loading GA4 data...</p>
        </div>
      </div>
    )
  }

  if (!data?.ga4Connected) {
    return (
      <div className="od-box od-box--muted">
        <div className="od-box__head">
          <span className="od-box__title">Google Analytics</span>
        </div>
        <div className="od-box__body" style={{ padding: '24px 20px', textAlign: 'center' }}>
          <p style={{ color: 'var(--theme-elevation-400)', fontSize: 13, margin: '0 0 8px' }}>
            Connect GA4 in <a href="/admin/settings/integrations" style={{ color: 'var(--theme-elevation-600)', textDecoration: 'underline' }}>Settings &rarr; Integrations</a> to see live traffic and conversion data.
          </p>
        </div>
      </div>
    )
  }

  const ov = data.overview
  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60)
    const secs = Math.round(s % 60)
    return `${mins}:${String(secs).padStart(2, '0')}`
  }

  return (
    <div className="od-box">
      <div className="od-box__head">
        <span className="od-box__title">Google Analytics</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {data.periodStart && data.periodEnd && (
            <span className="od-box__period">
              {new Date(data.periodStart).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
              {' \u2013 '}
              {new Date(data.periodEnd).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
            </span>
          )}
          {(['30d', '90d', '12m'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              style={{
                fontSize: 11,
                padding: '3px 8px',
                borderRadius: 4,
                border: '1px solid',
                borderColor: period === p ? 'var(--theme-elevation-400)' : 'var(--theme-elevation-150)',
                background: period === p ? 'var(--theme-elevation-100)' : 'transparent',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              {p === '30d' ? '30d' : p === '90d' ? '90d' : '12m'}
            </button>
          ))}
        </div>
      </div>

      {ov && (
        <div className="od-box__stats od-box__stats--6">
          <div className="od-box__stat">
            <span className="od-box__stat-value">{ov.users.toLocaleString()}</span>
            <span className="od-box__stat-label">Users</span>
          </div>
          <div className="od-box__stat">
            <span className="od-box__stat-value">{ov.sessions.toLocaleString()}</span>
            <span className="od-box__stat-label">Sessions</span>
          </div>
          <div className="od-box__stat">
            <span className="od-box__stat-value">{ov.pageviews.toLocaleString()}</span>
            <span className="od-box__stat-label">Pageviews</span>
          </div>
          <div className="od-box__stat">
            <span className="od-box__stat-value">{(ov.bounceRate * 100).toFixed(1)}%</span>
            <span className="od-box__stat-label">Bounce Rate</span>
          </div>
          <div className="od-box__stat">
            <span className="od-box__stat-value">{formatDuration(ov.avgSessionDuration)}</span>
            <span className="od-box__stat-label">Avg Duration</span>
          </div>
          <div className="od-box__stat">
            <span className="od-box__stat-value">{ov.conversions.toLocaleString()}</span>
            <span className="od-box__stat-label">Conversions</span>
          </div>
        </div>
      )}

      {/* Daily chart */}
      {data.daily && data.daily.length > 0 && (
        <div style={{ padding: '12px 20px 4px' }}>
          <Ga4Chart data={data.daily} />
        </div>
      )}

      {/* Traffic channels + Top pages side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderTop: '1px solid var(--theme-elevation-100)' }}>
        {data.channels && data.channels.length > 0 && (
          <div style={{ padding: '12px 20px', borderRight: '1px solid var(--theme-elevation-100)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--theme-elevation-500)' }}>Traffic Channels</div>
            {data.channels.slice(0, 8).map((ch) => (
              <div key={ch.channel} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: 'var(--theme-elevation-600)' }}>
                <span>{ch.channel}</span>
                <span style={{ fontWeight: 600 }}>{ch.sessions.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
        {data.topPages && data.topPages.length > 0 && (
          <div style={{ padding: '12px 20px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--theme-elevation-500)' }}>Top Pages</div>
            {data.topPages.slice(0, 8).map((pg) => (
              <div key={pg.pagePath} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: 'var(--theme-elevation-600)', gap: 8 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={pg.pagePath}>{pg.pagePath}</span>
                <span style={{ fontWeight: 600, flexShrink: 0 }}>{pg.pageviews.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Simple sparkline chart for daily GA4 data
function Ga4Chart({ data }: { data: { date: string; users: number; sessions: number }[] }) {
  const maxVal = Math.max(...data.map((d) => d.sessions), 1)
  const w = 100 / data.length

  return (
    <div style={{ height: 60, display: 'flex', alignItems: 'flex-end', gap: 1 }}>
      {data.map((d, i) => (
        <div
          key={i}
          title={`${d.date}: ${d.sessions} sessions, ${d.users} users`}
          style={{
            width: `${w}%`,
            height: `${Math.max((d.sessions / maxVal) * 100, 2)}%`,
            background: '#468D8B',
            borderRadius: '2px 2px 0 0',
            minHeight: 2,
            transition: 'height 300ms',
          }}
        />
      ))}
    </div>
  )
}

export default Dashboard
