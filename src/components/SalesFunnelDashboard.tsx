'use client'

import { useEffect, useState } from 'react'

// ─── Types ────────────────────────────────────────────────

interface FunnelStage {
  stage: string
  label: string
  count: number
}

interface ChannelData {
  channel: string
  label: string
  color: string
  total: number
  active: number
  won: number
  lost: number
  totalValue: number
  wonValue: number
  conversionRate: number
  avgDaysToClose: number
  stages: Record<string, number>
}

interface MonthlyTrend {
  month: string
  leads: number
  won: number
  lost: number
  value: number
}

interface RecentLead {
  id: string
  businessName: string
  channel: string
  stage: string
  estimatedValue: number
  contactName: string
  createdAt: string
  updatedAt: string
}

interface SalesFunnelData {
  summary: {
    totalLeads: number
    totalWon: number
    totalLost: number
    totalActive: number
    totalPipelineValue: number
    totalWonValue: number
    overallConversionRate: number
    bestChannel: { label: string; conversionRate: number } | null
  }
  funnel: FunnelStage[]
  channels: ChannelData[]
  monthlyTrend: MonthlyTrend[]
  lostReasons: Record<string, number>
  recentLeads: RecentLead[]
  stageLabels: Record<string, string>
}

// ─── Constants ────────────────────────────────────────────

const CHANNEL_ICONS: Record<string, string> = {
  referral: '\uD83E\uDD1D',
  website: '\uD83C\uDF10',
  bni: '\uD83C\uDFE2',
  advertising: '\uD83D\uDCE3',
  cold_outreach: '\u2744\uFE0F',
}

const STAGE_ICONS: Record<string, string> = {
  new_lead: '\u2B50',
  contacted: '\uD83D\uDCDE',
  meeting_booked: '\uD83D\uDCC5',
  proposal_sent: '\uD83D\uDCC4',
  contract_sent: '\u270D\uFE0F',
  client: '\u2705',
  lost: '\u274C',
}

const LOST_REASON_LABELS: Record<string, string> = {
  price: 'Too Expensive',
  competitor: 'Chose Competitor',
  not_ready: 'Not Ready',
  no_response: 'No Response',
  bad_fit: 'Bad Fit',
  other: 'Other',
}

const PERIODS = [
  { value: 'all', label: 'All Time' },
  { value: 'ytd', label: 'YTD' },
  { value: '90d', label: '90 Days' },
  { value: '30d', label: '30 Days' },
]

// ─── Helpers ──────────────────────────────────────────────

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

// ─── Main Component ───────────────────────────────────────

const SalesFunnelDashboard = () => {
  const [data, setData] = useState<SalesFunnelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('all')
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null)

  const fetchData = (p: string) => {
    setLoading(true)
    fetch(`/api/sales-funnel?period=${p}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && !d.error) setData(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    fetchData(period)
  }, [period])

  if (loading && !data) {
    return (
      <div className="od-funnel" style={{ padding: '60px 0', textAlign: 'center' }}>
        <p style={{ color: '#6b7280', fontSize: 13 }}>Loading sales funnel data...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="od-funnel" style={{ padding: '60px 0', textAlign: 'center' }}>
        <p style={{ color: '#6b7280', fontSize: 13 }}>
          No sales funnel data available. Add your first lead in{' '}
          <a href="/admin/collections/sales-leads" style={{ color: '#6366f1' }}>
            Sales Leads
          </a>.
        </p>
      </div>
    )
  }

  const { summary, funnel, channels, monthlyTrend, lostReasons, recentLeads } = data
  const activeChannels = selectedChannel
    ? channels.filter((c) => c.channel === selectedChannel)
    : channels

  return (
    <div className="od-funnel">
      {/* Header */}
      <div className="od-funnel__header">
        <div>
          <h2 className="od-funnel__title">Sales Funnel</h2>
          <p className="od-funnel__subtitle">Track leads from first contact to signed client</p>
        </div>
        <div className="od-funnel__controls">
          <div className="od-funnel__periods">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                className={`od-funnel__period-btn ${period === p.value ? 'od-funnel__period-btn--active' : ''}`}
                onClick={() => setPeriod(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <a
            href="/admin/collections/sales-leads/create"
            className="od-funnel__add-btn"
          >
            + New Lead
          </a>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="od-funnel__summary">
        <div className="od-funnel__card">
          <span className="od-funnel__card-value">{summary.totalLeads}</span>
          <span className="od-funnel__card-label">Total Leads</span>
        </div>
        <div className="od-funnel__card">
          <span className="od-funnel__card-value">{summary.totalActive}</span>
          <span className="od-funnel__card-label">Active Pipeline</span>
        </div>
        <div className="od-funnel__card">
          <span className="od-funnel__card-value">{summary.totalWon}</span>
          <span className="od-funnel__card-label">Won</span>
        </div>
        <div className="od-funnel__card">
          <span className="od-funnel__card-value">{summary.totalLost}</span>
          <span className="od-funnel__card-label">Lost</span>
        </div>
        <div className="od-funnel__card">
          <span className="od-funnel__card-value">{summary.overallConversionRate}%</span>
          <span className="od-funnel__card-label">Win Rate</span>
        </div>
        <div className="od-funnel__card">
          <span className="od-funnel__card-value">${summary.totalPipelineValue.toLocaleString()}</span>
          <span className="od-funnel__card-label">Pipeline Value /mo</span>
        </div>
        <div className="od-funnel__card">
          <span className="od-funnel__card-value">${summary.totalWonValue.toLocaleString()}</span>
          <span className="od-funnel__card-label">Won Value /mo</span>
        </div>
        <div className="od-funnel__card">
          <span className="od-funnel__card-value">
            {summary.bestChannel ? summary.bestChannel.label : '--'}
          </span>
          <span className="od-funnel__card-label">
            Best Channel{summary.bestChannel ? ` (${summary.bestChannel.conversionRate}%)` : ''}
          </span>
        </div>
      </div>

      <div className="od-funnel__layout">
        {/* Left Column */}
        <div className="od-funnel__main">
          {/* Visual Funnel */}
          <div className="od-box">
            <div className="od-box__head">
              <span className="od-box__title">Funnel Overview</span>
              {selectedChannel && (
                <button
                  type="button"
                  className="od-funnel__clear-filter"
                  onClick={() => setSelectedChannel(null)}
                >
                  Clear filter: {channels.find((c) => c.channel === selectedChannel)?.label}
                  {' '}
                  &times;
                </button>
              )}
            </div>
            <div className="od-funnel__visual">
              <FunnelVisualization
                funnel={funnel}
                channels={activeChannels}
                selectedChannel={selectedChannel}
              />
            </div>
          </div>

          {/* Channel Performance Table */}
          <div className="od-box">
            <div className="od-box__head">
              <span className="od-box__title">Channel Performance</span>
            </div>
            <div className="od-funnel__channels">
              <table className="od-funnel__table">
                <thead>
                  <tr>
                    <th>Channel</th>
                    <th>Leads</th>
                    <th>Active</th>
                    <th>Won</th>
                    <th>Lost</th>
                    <th>Win Rate</th>
                    <th>Avg Days</th>
                    <th>Pipeline</th>
                    <th>Won Value</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.map((ch) => (
                    <tr
                      key={ch.channel}
                      className={`od-funnel__channel-row ${selectedChannel === ch.channel ? 'od-funnel__channel-row--selected' : ''}`}
                      onClick={() =>
                        setSelectedChannel(
                          selectedChannel === ch.channel ? null : ch.channel,
                        )
                      }
                    >
                      <td>
                        <span className="od-funnel__channel-name">
                          <span
                            className="od-funnel__channel-dot"
                            style={{ background: ch.color }}
                          />
                          <span>{CHANNEL_ICONS[ch.channel]}</span>
                          {ch.label}
                        </span>
                      </td>
                      <td>{ch.total}</td>
                      <td>{ch.active}</td>
                      <td style={{ color: ch.won > 0 ? '#22c55e' : undefined, fontWeight: ch.won > 0 ? 700 : undefined }}>
                        {ch.won}
                      </td>
                      <td style={{ color: ch.lost > 0 ? '#ef4444' : undefined }}>
                        {ch.lost}
                      </td>
                      <td>
                        <span className={`od-funnel__rate ${ch.conversionRate >= 50 ? 'od-funnel__rate--good' : ch.conversionRate >= 25 ? 'od-funnel__rate--ok' : 'od-funnel__rate--low'}`}>
                          {ch.conversionRate}%
                        </span>
                      </td>
                      <td>{ch.avgDaysToClose > 0 ? `${ch.avgDaysToClose}d` : '--'}</td>
                      <td>${(ch.totalValue - ch.wonValue).toLocaleString()}</td>
                      <td style={{ fontWeight: 700 }}>${ch.wonValue.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td><strong>Total</strong></td>
                    <td><strong>{summary.totalLeads}</strong></td>
                    <td><strong>{summary.totalActive}</strong></td>
                    <td style={{ color: '#22c55e', fontWeight: 700 }}>{summary.totalWon}</td>
                    <td style={{ color: '#ef4444' }}>{summary.totalLost}</td>
                    <td><strong>{summary.overallConversionRate}%</strong></td>
                    <td>--</td>
                    <td><strong>${summary.totalPipelineValue.toLocaleString()}</strong></td>
                    <td style={{ fontWeight: 700 }}>${summary.totalWonValue.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Monthly Trend */}
          <div className="od-box">
            <div className="od-box__head">
              <span className="od-box__title">Monthly Trend</span>
            </div>
            <div className="od-funnel__trend">
              <MonthlyTrendChart data={monthlyTrend} />
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="od-funnel__side">
          {/* Channel Mix Donut */}
          <div className="od-box">
            <div className="od-box__head">
              <span className="od-box__title">Channel Mix</span>
            </div>
            <div className="od-funnel__mix">
              <ChannelMixChart channels={channels} onSelect={setSelectedChannel} selected={selectedChannel} />
            </div>
          </div>

          {/* Lost Reasons */}
          {Object.keys(lostReasons).length > 0 && (
            <div className="od-box">
              <div className="od-box__head">
                <span className="od-box__title">Lost Reasons</span>
              </div>
              <div className="od-funnel__lost-reasons">
                {Object.entries(lostReasons)
                  .sort(([, a], [, b]) => b - a)
                  .map(([reason, count]) => {
                    const total = Object.values(lostReasons).reduce((a, b) => a + b, 0)
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0
                    return (
                      <div key={reason} className="od-funnel__lost-item">
                        <div className="od-funnel__lost-header">
                          <span>{LOST_REASON_LABELS[reason] || reason}</span>
                          <span className="od-funnel__lost-count">{count} ({pct}%)</span>
                        </div>
                        <div className="od-funnel__lost-bar-bg">
                          <div
                            className="od-funnel__lost-bar"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* Recent Leads */}
          <div className="od-box od-box--feed">
            <div className="od-box__head">
              <span className="od-box__title">Recent Leads</span>
              <a href="/admin/collections/sales-leads" className="od-feed__see-all">
                View all
              </a>
            </div>
            <div className="od-feed">
              {recentLeads.length === 0 ? (
                <div style={{ padding: '24px 20px', color: '#6b7280', fontSize: 13 }}>
                  No leads yet
                </div>
              ) : (
                recentLeads.map((lead) => (
                  <a
                    key={lead.id}
                    href={`/admin/collections/sales-leads/${lead.id}`}
                    className="od-feed__item"
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <div className="od-feed__dot" style={{
                      background: lead.stage === 'client' ? '#22c55e' : lead.stage === 'lost' ? '#ef4444' : '#6366f1',
                    }} />
                    <div className="od-feed__body">
                      <div className="od-feed__title">
                        <span className="od-feed__badge">
                          {CHANNEL_ICONS[lead.channel]} {channels.find((c) => c.channel === lead.channel)?.label}
                        </span>
                        {lead.businessName}
                      </div>
                      <div className="od-feed__desc">
                        {STAGE_ICONS[lead.stage]} {data.stageLabels[lead.stage]}
                        {lead.estimatedValue ? ` | $${lead.estimatedValue.toLocaleString()}/mo` : ''}
                      </div>
                      <div className="od-feed__meta">
                        {lead.contactName || 'No contact'}
                        {' \u00B7 '}
                        {timeAgo(lead.updatedAt)}
                      </div>
                    </div>
                  </a>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Funnel Visualization ─────────────────────────────────

function FunnelVisualization({
  funnel,
  channels,
  selectedChannel,
}: {
  funnel: FunnelStage[]
  channels: ChannelData[]
  selectedChannel: string | null
}) {
  // If a channel is selected, re-calculate funnel counts for just that channel
  const displayFunnel = selectedChannel
    ? funnel.map((stage) => {
        const ch = channels[0]
        if (!ch) return { ...stage, count: 0 }
        // Count leads at or past this stage for the selected channel
        const stageOrder = ['new_lead', 'contacted', 'meeting_booked', 'proposal_sent', 'contract_sent', 'client']
        const stageIdx = stageOrder.indexOf(stage.stage)
        let count = 0
        for (let i = stageIdx; i < stageOrder.length; i++) {
          count += ch.stages[stageOrder[i]] || 0
        }
        return { ...stage, count }
      })
    : funnel

  const maxCount = Math.max(...displayFunnel.map((s) => s.count), 1)

  return (
    <div className="od-funnel__viz">
      {displayFunnel.map((stage, i) => {
        const widthPct = Math.max((stage.count / maxCount) * 100, 12)
        const prevCount = i > 0 ? displayFunnel[i - 1].count : stage.count
        const dropoff = prevCount > 0 && i > 0
          ? Math.round(((prevCount - stage.count) / prevCount) * 100)
          : 0

        return (
          <div key={stage.stage} className="od-funnel__stage">
            <div className="od-funnel__stage-label">
              <span className="od-funnel__stage-icon">{STAGE_ICONS[stage.stage]}</span>
              <span>{stage.label}</span>
            </div>
            <div className="od-funnel__stage-bar-wrap">
              <div
                className="od-funnel__stage-bar"
                style={{
                  width: `${widthPct}%`,
                  background: `linear-gradient(90deg, ${getStageColor(i, displayFunnel.length)})`,
                }}
              >
                <span className="od-funnel__stage-count">{stage.count}</span>
              </div>
              {/* Channel breakdown dots */}
              {!selectedChannel && stage.count > 0 && (
                <div className="od-funnel__stage-channels">
                  {channels
                    .filter((ch) => {
                      // Count leads at or past this stage for this channel
                      const stageOrder = ['new_lead', 'contacted', 'meeting_booked', 'proposal_sent', 'contract_sent', 'client']
                      const stageIdx = stageOrder.indexOf(stage.stage)
                      let count = 0
                      for (let j = stageIdx; j < stageOrder.length; j++) {
                        count += ch.stages[stageOrder[j]] || 0
                      }
                      return count > 0
                    })
                    .map((ch) => {
                      const stageOrder = ['new_lead', 'contacted', 'meeting_booked', 'proposal_sent', 'contract_sent', 'client']
                      const stageIdx = stageOrder.indexOf(stage.stage)
                      let count = 0
                      for (let j = stageIdx; j < stageOrder.length; j++) {
                        count += ch.stages[stageOrder[j]] || 0
                      }
                      return (
                        <span
                          key={ch.channel}
                          className="od-funnel__stage-ch-dot"
                          style={{ background: ch.color }}
                          title={`${ch.label}: ${count}`}
                        >
                          {count}
                        </span>
                      )
                    })}
                </div>
              )}
            </div>
            {dropoff > 0 && (
              <span className="od-funnel__dropoff">-{dropoff}%</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function getStageColor(index: number, total: number): string {
  const colors = [
    '#6366f1, #818cf8', // indigo
    '#4f46e5, #6366f1', // deeper indigo
    '#3b82f6, #60a5fa', // blue
    '#0ea5e9, #38bdf8', // sky
    '#14b8a6, #2dd4bf', // teal
    '#22c55e, #4ade80', // green
  ]
  return colors[Math.min(index, colors.length - 1)]
}

// ─── Channel Mix Chart (CSS donut) ────────────────────────

function ChannelMixChart({
  channels,
  onSelect,
  selected,
}: {
  channels: ChannelData[]
  onSelect: (channel: string | null) => void
  selected: string | null
}) {
  const total = channels.reduce((sum, ch) => sum + ch.total, 0)
  if (total === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
        No leads to display
      </div>
    )
  }

  // Build conic gradient segments
  let cumulative = 0
  const segments = channels
    .filter((ch) => ch.total > 0)
    .map((ch) => {
      const pct = (ch.total / total) * 100
      const start = cumulative
      cumulative += pct
      return { ...ch, pct, start, end: cumulative }
    })

  const gradient = segments
    .map((s) => `${s.color} ${s.start}% ${s.end}%`)
    .join(', ')

  return (
    <div className="od-funnel__donut-wrap">
      <div
        className="od-funnel__donut"
        style={{
          background: `conic-gradient(${gradient})`,
        }}
      >
        <div className="od-funnel__donut-center">
          <span className="od-funnel__donut-total">{total}</span>
          <span className="od-funnel__donut-label">Total</span>
        </div>
      </div>
      <div className="od-funnel__donut-legend">
        {segments.map((s) => (
          <button
            key={s.channel}
            type="button"
            className={`od-funnel__legend-item ${selected === s.channel ? 'od-funnel__legend-item--selected' : ''}`}
            onClick={() => onSelect(selected === s.channel ? null : s.channel)}
          >
            <span
              className="od-funnel__legend-dot"
              style={{ background: s.color }}
            />
            <span className="od-funnel__legend-label">{s.label}</span>
            <span className="od-funnel__legend-value">{s.total} ({Math.round(s.pct)}%)</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Monthly Trend Chart (SVG bars + line) ────────────────

function MonthlyTrendChart({ data }: { data: MonthlyTrend[] }) {
  if (!data || data.length === 0) return null

  const maxLeads = Math.max(...data.map((d) => d.leads), 1)
  const chartHeight = 160
  const step = 100 / data.length
  const barWidth = Math.min(step * 0.5, 12)

  return (
    <div className="od-funnel__chart">
      <div className="od-funnel__chart-area" style={{ height: chartHeight }}>
        <svg
          viewBox={`0 0 100 ${chartHeight}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: '100%' }}
        >
          {data.map((d, i) => {
            const x = (i + 0.5) * step
            const totalH = (d.leads / maxLeads) * (chartHeight - 20)
            const wonH = (d.won / maxLeads) * (chartHeight - 20)

            return (
              <g key={d.month}>
                {/* Total leads bar */}
                <rect
                  x={x - barWidth / 2}
                  y={chartHeight - totalH}
                  width={barWidth}
                  height={totalH}
                  fill="#e0e7ff"
                  rx="1"
                />
                {/* Won overlay */}
                <rect
                  x={x - barWidth / 2}
                  y={chartHeight - wonH}
                  width={barWidth}
                  height={wonH}
                  fill="#22c55e"
                  rx="1"
                />
                {/* Count label */}
                {d.leads > 0 && (
                  <text
                    x={x}
                    y={chartHeight - totalH - 4}
                    textAnchor="middle"
                    fill="#6b7280"
                    fontSize="6"
                    fontWeight="700"
                  >
                    {d.leads}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* X-axis labels */}
      <div className="od-funnel__chart-labels">
        {data.map((d) => (
          <div key={d.month} className="od-funnel__chart-label" style={{ width: `${step}%` }}>
            {d.month}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="od-chart__legend">
        <span className="od-chart__legend-item">
          <span className="od-chart__legend-dot" style={{ background: '#e0e7ff', borderRadius: 2 }} />
          Total Leads
        </span>
        <span className="od-chart__legend-item">
          <span className="od-chart__legend-dot" style={{ background: '#22c55e', borderRadius: 2 }} />
          Won
        </span>
      </div>
    </div>
  )
}

export default SalesFunnelDashboard
