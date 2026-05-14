'use client'

import { useState, useEffect, useCallback } from 'react'
import InfrastructureTable from './InfrastructureTable'

interface ApiCostItem {
  count: number
  cost: number
}

interface WeekData {
  label: string
  startDate: string
  endDate: string
  apiCosts: Record<string, ApiCostItem>
  totalApiCost: number
  totalSubscriptionCost: number
  totalCost: number
}

interface Subscription {
  name: string
  category: string
  monthlyCost: number
  weeklyCost: number
}

interface UsageData {
  currentWeek: WeekData
  weeklyHistory: WeekData[]
  subscriptions: Subscription[]
  perUnitRates: Record<string, number>
}

function UsageDashboard() {
  const [data, setData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/usage')
      if (res.ok) {
        setData(await res.json())
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div style={{ padding: '20px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Usage &amp; Costs</h1>
        <button
          type="button"
          onClick={fetchData}
          disabled={loading}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px solid var(--theme-border-color)',
            background: loading ? 'var(--theme-elevation-50)' : 'var(--theme-elevation-100)',
            color: 'var(--theme-elevation-800)',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {!data && !loading && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--theme-elevation-400)' }}>
          No usage data available.
        </div>
      )}

      {data && (
        <>
          {/* This Week Summary */}
          <div className="od-box" style={{ marginBottom: 16 }}>
            <div className="od-box__head">
              <span className="od-box__title">This Week</span>
              <span style={{ fontSize: 12, color: 'var(--theme-elevation-400)' }}>
                {data.currentWeek.startDate} to {data.currentWeek.endDate}
              </span>
            </div>
            <div className="od-box__stats od-box__stats--4">
              <div className="od-box__stat">
                <span className="od-box__stat-value" style={{ color: '#6366f1' }}>
                  ${data.currentWeek.totalCost.toFixed(2)}
                </span>
                <span className="od-box__stat-label">Total Cost</span>
              </div>
              <div className="od-box__stat">
                <span className="od-box__stat-value">${data.currentWeek.totalApiCost.toFixed(2)}</span>
                <span className="od-box__stat-label">API Usage</span>
              </div>
              <div className="od-box__stat">
                <span className="od-box__stat-value">${data.currentWeek.totalSubscriptionCost.toFixed(2)}</span>
                <span className="od-box__stat-label">Subscriptions</span>
              </div>
              <div className="od-box__stat">
                <span className="od-box__stat-value">
                  {Object.values(data.currentWeek.apiCosts).reduce((sum, v) => sum + v.count, 0)}
                </span>
                <span className="od-box__stat-label">API Calls</span>
              </div>
            </div>
          </div>

          {/* API Breakdown Table */}
          <div className="od-box" style={{ marginBottom: 16 }}>
            <div className="od-box__head">
              <span className="od-box__title">Cost Breakdown (This Week)</span>
            </div>
            <div style={{ padding: '0 16px 16px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--theme-border-color)' }}>
                    <th style={thStyle}>Service</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Units</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Rate</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Cost (AUD)</th>
                  </tr>
                </thead>
                <tbody>
                  {/* API usage rows */}
                  {Object.entries(data.currentWeek.apiCosts).map(([key, val]) => (
                    <tr key={key} style={{ borderBottom: '1px solid var(--theme-border-color)' }}>
                      <td style={tdStyle}>{formatApiName(key)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{val.count}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--theme-elevation-400)' }}>
                        ${(data.perUnitRates[key.replace(/s$/, '').replace(/([A-Z])/g, (m) => m)] ?? 0).toFixed(3)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>${val.cost.toFixed(2)}</td>
                    </tr>
                  ))}
                  {/* Subscription rows */}
                  {data.subscriptions.map((sub) => (
                    <tr key={sub.name} style={{ borderBottom: '1px solid var(--theme-border-color)' }}>
                      <td style={tdStyle}>
                        {sub.name}
                        <span style={{ fontSize: 10, marginLeft: 6, color: 'var(--theme-elevation-400)', textTransform: 'uppercase' }}>
                          {sub.category}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--theme-elevation-400)' }}>—</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--theme-elevation-400)' }}>${sub.monthlyCost}/mo</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>${sub.weeklyCost.toFixed(2)}</td>
                    </tr>
                  ))}
                  {/* Total row */}
                  <tr>
                    <td style={{ ...tdStyle, fontWeight: 700 }} colSpan={3}>Total</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#6366f1' }}>
                      ${data.currentWeek.totalCost.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 12-Week Bar Graph */}
          <div className="od-box" style={{ marginBottom: 16 }}>
            <div className="od-box__head">
              <span className="od-box__title">Weekly Cost (Last 12 Weeks)</span>
            </div>
            <WeeklyBarChart weeks={data.weeklyHistory} />
          </div>

          {/* Infrastructure & Services inventory */}
          <InfrastructureTable />

          {/* Subscription Legend */}
          {data.subscriptions.length > 0 && (
            <div className="od-box" style={{ marginBottom: 16 }}>
              <div className="od-box__head">
                <span className="od-box__title">Active Subscriptions</span>
              </div>
              <div style={{ padding: '0 16px 16px', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {data.subscriptions.map((sub) => (
                  <div
                    key={sub.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: '1px solid var(--theme-border-color)',
                      background: 'var(--theme-elevation-50)',
                    }}
                  >
                    <span style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: sub.category === 'llm' ? '#6366f1' : sub.category === 'infra' ? '#74B3A8' : '#d97706',
                      flexShrink: 0,
                    }} />
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{sub.name}</span>
                    <span style={{ color: 'var(--theme-elevation-400)', fontSize: 12 }}>
                      ${sub.monthlyCost}/mo
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Weekly Bar Chart ───────────────────────────────

function WeeklyBarChart({ weeks }: { weeks: WeekData[] }) {
  const maxCost = Math.max(...weeks.map((w) => w.totalCost), 1)
  const chartHeight = 200

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <div style={{ display: 'flex', gap: 0 }}>
        {/* Left Y axis */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 6, fontSize: 10, color: 'var(--theme-elevation-400)', width: 40, flexShrink: 0, height: chartHeight }}>
          <span>${maxCost.toFixed(0)}</span>
          <span>${(maxCost / 2).toFixed(0)}</span>
          <span>$0</span>
        </div>

        {/* Bars */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 4, height: chartHeight }}>
          {weeks.map((week, i) => {
            const barH = (week.totalCost / maxCost) * (chartHeight - 20)
            const subH = (week.totalSubscriptionCost / maxCost) * (chartHeight - 20)
            const apiH = barH - subH
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  height: '100%',
                  position: 'relative',
                }}
                title={`${week.label}: $${week.totalCost.toFixed(2)} (API: $${week.totalApiCost.toFixed(2)}, Subs: $${week.totalSubscriptionCost.toFixed(2)})`}
              >
                <div style={{ borderRadius: '4px 4px 0 0', background: '#6366f1', height: apiH > 0 ? apiH : 0 }} />
                <div style={{ borderRadius: apiH > 0 ? '0 0 4px 4px' : '4px 4px 4px 4px', background: '#a5b4fc', height: subH > 0 ? subH : 0 }} />
              </div>
            )
          })}
        </div>
      </div>

      {/* X-axis labels */}
      <div style={{ display: 'flex', gap: 4, marginLeft: 40, marginTop: 4 }}>
        {weeks.map((week, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'var(--theme-elevation-400)' }}>
            {week.label}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="od-chart__legend" style={{ marginTop: 8 }}>
        <span className="od-chart__legend-item">
          <span className="od-chart__legend-dot" style={{ background: '#6366f1', borderRadius: 2 }} />
          API Usage
        </span>
        <span className="od-chart__legend-item">
          <span className="od-chart__legend-dot" style={{ background: '#a5b4fc', borderRadius: 2 }} />
          Subscriptions
        </span>
      </div>
    </div>
  )
}

// ── Helpers ──

const thStyle: React.CSSProperties = {
  padding: '8px 4px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--theme-elevation-400)',
}

const tdStyle: React.CSSProperties = {
  padding: '8px 4px',
}

function formatApiName(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim()
}

export default UsageDashboard
