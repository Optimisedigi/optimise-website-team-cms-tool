'use client'

import { useState, useEffect, useCallback } from 'react'

type Metric = 'clicks' | 'impressions' | 'position' | 'indexed'

interface SnapshotData {
  id: string
  snapshotDate: string
  periodStart: string
  periodEnd: string
  totalClicks: number | null
  totalImpressions: number | null
  avgCtr: number | null
  avgPosition: number | null
  indexedPages: number | null
  notIndexedPages: number | null
  clicksChange: number | null
  impressionsChange: number | null
  positionChange: number | null
  topKeywords: any[]
  topPages: any[]
  sitemaps: any[]
  cwvMobile: any
  cwvDesktop: any
  indexingIssues: any[]
}

interface ClientOption {
  id: string | number
  name: string
  slug: string
  gscConnected: boolean
}

interface AlertData {
  id: string
  severity: string
  category: string
  title: string
  description: string
  recommendation: string
  resolved: boolean
  createdAt: string
}

const METRIC_CONFIG: Record<Metric, { label: string; color: string; format: (v: number) => string; field: string }> = {
  clicks: { label: 'Clicks', color: '#2563eb', format: (v) => v.toLocaleString('en-AU'), field: 'totalClicks' },
  impressions: { label: 'Impressions', color: '#7c3aed', format: (v) => v.toLocaleString('en-AU'), field: 'totalImpressions' },
  position: { label: 'Avg Position', color: '#0891b2', format: (v) => v.toFixed(1), field: 'avgPosition' },
  indexed: { label: 'Pages Indexed', color: '#16a34a', format: (v) => v.toLocaleString('en-AU'), field: 'indexedPages' },
}

const GscDashboardView = () => {
  const [clients, setClients] = useState<ClientOption[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<SnapshotData[]>([])
  const [alerts, setAlerts] = useState<AlertData[]>([])
  const [selectedMetric, setSelectedMetric] = useState<Metric>('clicks')
  const [loading, setLoading] = useState(true)
  const [snapshotsLoading, setSnapshotsLoading] = useState(false)

  // Fetch clients on mount
  useEffect(() => {
    const fetchClients = async () => {
      try {
        const res = await fetch('/api/clients?limit=100&depth=0', { credentials: 'include' })
        const data = await res.json()
        const connected = (data.docs || []).filter((c: any) => c.gscConnected)
        setClients(connected)
        if (connected.length > 0) {
          setSelectedClientId(String(connected[0].id))
        }
      } catch {
        console.error('Failed to fetch clients')
      } finally {
        setLoading(false)
      }
    }
    fetchClients()
  }, [])

  // Fetch snapshots when client changes
  const fetchSnapshots = useCallback(async (clientId: string) => {
    setSnapshotsLoading(true)
    try {
      const [snapRes, alertRes] = await Promise.all([
        fetch(`/api/gsc-snapshots?where[client][equals]=${clientId}&sort=-snapshotDate&limit=12&depth=0`, { credentials: 'include' }),
        fetch(`/api/gsc-alerts?where[client][equals]=${clientId}&sort=-createdAt&limit=10&depth=0`, { credentials: 'include' }),
      ])
      const snapData = await snapRes.json()
      const alertData = await alertRes.json()
      setSnapshots((snapData.docs || []).reverse()) // oldest first for chart
      setAlerts(alertData.docs || [])
    } catch {
      console.error('Failed to fetch snapshots')
    } finally {
      setSnapshotsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedClientId) {
      fetchSnapshots(selectedClientId)
    }
  }, [selectedClientId, fetchSnapshots])

  const latestSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null

  if (loading) {
    return (
      <div style={styles.wrapper}>
        <p style={styles.muted}>Loading...</p>
      </div>
    )
  }

  if (clients.length === 0) {
    return (
      <div style={styles.wrapper}>
        <h1 style={styles.h1}>GSC Dashboard</h1>
        <p style={styles.muted}>
          No clients have Google Search Console connected. Connect GSC from a client&apos;s Search Console tab.
        </p>
      </div>
    )
  }

  return (
    <div style={styles.wrapper}>
      {/* Header */}
      <div style={styles.headerRow}>
        <h1 style={styles.h1}>GSC Dashboard</h1>
        <select
          value={selectedClientId || ''}
          onChange={(e) => setSelectedClientId(e.target.value)}
          style={styles.select}
        >
          {clients.map((c) => (
            <option key={c.id} value={String(c.id)}>{c.name}</option>
          ))}
        </select>
      </div>

      {snapshotsLoading && (
        <p style={styles.muted}>Loading data...</p>
      )}

      {!snapshotsLoading && snapshots.length === 0 && (
        <p style={styles.muted}>
          No snapshots yet for this client. Run a sync from the client&apos;s Search Console tab.
        </p>
      )}

      {!snapshotsLoading && snapshots.length > 0 && latestSnapshot && (
        <>
          {/* Summary cards */}
          <div style={styles.summaryRow}>
            <SummaryCard
              label="Clicks"
              value={fmt(latestSnapshot.totalClicks)}
              change={latestSnapshot.clicksChange}
            />
            <SummaryCard
              label="Impressions"
              value={fmt(latestSnapshot.totalImpressions)}
              change={latestSnapshot.impressionsChange}
            />
            <SummaryCard
              label="Avg CTR"
              value={`${latestSnapshot.avgCtr || 0}%`}
              change={null}
            />
            <SummaryCard
              label="Avg Position"
              value={String(latestSnapshot.avgPosition || 0)}
              change={latestSnapshot.positionChange ? -latestSnapshot.positionChange : null}
            />
            <SummaryCard
              label="Indexed"
              value={fmt(latestSnapshot.indexedPages)}
              change={null}
            />
          </div>

          {/* Metric selector + Bar chart */}
          <div style={styles.chartSection}>
            <div style={styles.metricTabs}>
              {(Object.keys(METRIC_CONFIG) as Metric[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedMetric(key)}
                  style={{
                    ...styles.metricTab,
                    ...(selectedMetric === key ? styles.metricTabActive : {}),
                    borderBottomColor: selectedMetric === key ? METRIC_CONFIG[key].color : 'transparent',
                  }}
                >
                  {METRIC_CONFIG[key].label}
                </button>
              ))}
            </div>
            <BarChart
              snapshots={snapshots}
              metric={selectedMetric}
            />
          </div>

          {/* Alerts */}
          {alerts.length > 0 && (
            <div style={styles.section}>
              <h2 style={styles.h2}>Recent Alerts</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {alerts.slice(0, 5).map((alert) => (
                  <div
                    key={alert.id}
                    style={{
                      ...styles.alertCard,
                      borderLeftColor:
                        alert.severity === 'critical' ? '#dc2626' :
                        alert.severity === 'warning' ? '#d97706' : '#2563eb',
                      opacity: alert.resolved ? 0.5 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span style={{
                        padding: '2px 8px',
                        background: alert.severity === 'critical' ? '#fef2f2' : alert.severity === 'warning' ? '#fffbeb' : '#eff6ff',
                        color: alert.severity === 'critical' ? '#dc2626' : alert.severity === 'warning' ? '#d97706' : '#2563eb',
                        borderRadius: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                      }}>
                        {alert.severity}
                      </span>
                      <span style={{ fontSize: 12, color: '#9ca3af', textTransform: 'capitalize' }}>{alert.category}</span>
                    </div>
                    <p style={{ fontWeight: 600, margin: '4px 0 0', fontSize: 13 }}>{alert.title}</p>
                    {alert.recommendation && (
                      <p style={{ fontSize: 12, color: '#3b82f6', margin: '4px 0 0', fontStyle: 'italic' }}>
                        {alert.recommendation}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Keywords */}
          {latestSnapshot.topKeywords && (latestSnapshot.topKeywords as any[]).length > 0 && (
            <div style={styles.section}>
              <h2 style={styles.h2}>Top Keywords</h2>
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Keyword</th>
                      <th style={styles.thRight}>Clicks</th>
                      <th style={styles.thRight}>Impressions</th>
                      <th style={styles.thRight}>CTR</th>
                      <th style={styles.thRight}>Position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(latestSnapshot.topKeywords as any[]).slice(0, 15).map((kw: any, i: number) => (
                      <tr key={i} style={i % 2 === 0 ? styles.rowEven : undefined}>
                        <td style={styles.td}>{kw.keyword}</td>
                        <td style={styles.tdRight}>{fmt(kw.clicks)}</td>
                        <td style={styles.tdRight}>{fmt(kw.impressions)}</td>
                        <td style={styles.tdRight}>{kw.ctr}%</td>
                        <td style={styles.tdRight}>{kw.position}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Footer */}
          <div style={{ borderTop: '1px solid var(--theme-elevation-150, #e5e7eb)', paddingTop: 12, marginTop: 16 }}>
            <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>
              Last synced: {formatDate(latestSnapshot.snapshotDate)} | Period: {formatDate(latestSnapshot.periodStart)} — {formatDate(latestSnapshot.periodEnd)}
            </p>
          </div>
        </>
      )}
    </div>
  )
}

function BarChart({ snapshots, metric }: { snapshots: SnapshotData[]; metric: Metric }) {
  const config = METRIC_CONFIG[metric]
  const values = snapshots.map((s) => {
    const val = (s as any)[config.field]
    return typeof val === 'number' ? val : 0
  })

  const maxVal = Math.max(...values, 1)
  // For position, lower is better — invert the bar height
  const isInverted = metric === 'position'

  return (
    <div style={styles.chartContainer}>
      <div style={styles.barsRow}>
        {snapshots.map((snap, i) => {
          const val = values[i]
          const barHeight = isInverted
            ? maxVal > 0 ? ((maxVal - val + 1) / maxVal) * 100 : 0
            : maxVal > 0 ? (val / maxVal) * 100 : 0
          const month = new Date(snap.snapshotDate).toLocaleDateString('en-AU', { month: 'short', year: '2-digit' })

          return (
            <div key={snap.id} style={styles.barCol}>
              <span style={styles.barValue}>{config.format(val)}</span>
              <div style={styles.barTrack}>
                <div
                  style={{
                    ...styles.bar,
                    height: `${Math.max(barHeight, 2)}%`,
                    background: config.color,
                  }}
                />
              </div>
              <span style={styles.barLabel}>{month}</span>
            </div>
          )
        })}
      </div>
      {isInverted && (
        <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 8, textAlign: 'center' }}>
          Lower position = better ranking (taller bar = better)
        </p>
      )}
    </div>
  )
}

function SummaryCard({ label, value, change }: { label: string; value: string; change: number | null | undefined }) {
  return (
    <div style={styles.summaryCard}>
      <span style={styles.summaryLabel}>{label}</span>
      <span style={styles.summaryValue}>{value}</span>
      {change != null && change !== 0 && (
        <span style={{ fontSize: 12, fontWeight: 600, color: change > 0 ? '#16a34a' : '#dc2626' }}>
          {change > 0 ? '+' : ''}{change}%
        </span>
      )}
    </div>
  )
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '0'
  return n.toLocaleString('en-AU')
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '\u2014'
  return new Date(d).toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' })
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    padding: '24px 40px',
    maxWidth: 1200,
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    flexWrap: 'wrap',
    gap: 16,
  },
  h1: {
    fontSize: 24,
    fontWeight: 800,
    margin: 0,
    color: 'var(--theme-text, #111827)',
  },
  h2: {
    fontSize: 16,
    fontWeight: 700,
    margin: '0 0 12px',
    color: 'var(--theme-text, #111827)',
  },
  muted: {
    fontSize: 14,
    color: 'var(--theme-elevation-400, #9ca3af)',
  },
  select: {
    padding: '8px 14px',
    fontSize: 14,
    borderRadius: 6,
    border: '1px solid var(--theme-elevation-150, #d1d5db)',
    background: 'var(--theme-input-bg, #fff)',
    color: 'var(--theme-text, #111827)',
    minWidth: 200,
  },
  summaryRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: 12,
    marginBottom: 28,
  },
  summaryCard: {
    background: 'var(--theme-elevation-50, #f9fafb)',
    borderRadius: 8,
    padding: '14px 16px',
    border: '1px solid var(--theme-elevation-150, #e5e7eb)',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--theme-elevation-400, #6b7280)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--theme-text, #111827)',
  },
  chartSection: {
    background: 'var(--theme-elevation-50, #f9fafb)',
    borderRadius: 10,
    border: '1px solid var(--theme-elevation-150, #e5e7eb)',
    marginBottom: 28,
    overflow: 'hidden',
  },
  metricTabs: {
    display: 'flex',
    borderBottom: '1px solid var(--theme-elevation-150, #e5e7eb)',
  },
  metricTab: {
    padding: '12px 20px',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--theme-elevation-400, #6b7280)',
    background: 'transparent',
    border: 'none',
    borderBottom: '3px solid transparent',
    cursor: 'pointer',
    transition: 'color 150ms, border-color 150ms',
  },
  metricTabActive: {
    color: 'var(--theme-text, #111827)',
  },
  chartContainer: {
    padding: '24px 20px 16px',
  },
  barsRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 8,
    height: 220,
  },
  barCol: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
  },
  barValue: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--theme-elevation-400, #6b7280)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '100%',
  },
  barTrack: {
    width: '100%',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    borderRadius: '4px 4px 0 0',
    overflow: 'hidden',
    minHeight: 0,
  },
  bar: {
    width: '100%',
    borderRadius: '4px 4px 0 0',
    transition: 'height 300ms ease',
    minHeight: 2,
  },
  barLabel: {
    fontSize: 11,
    color: 'var(--theme-elevation-400, #6b7280)',
    whiteSpace: 'nowrap',
  },
  section: {
    marginBottom: 28,
  },
  alertCard: {
    background: 'var(--theme-elevation-50, #f9fafb)',
    borderRadius: 8,
    padding: '12px 16px',
    border: '1px solid var(--theme-elevation-150, #e5e7eb)',
    borderLeft: '4px solid',
  },
  tableWrap: {
    overflowX: 'auto',
    borderRadius: 8,
    border: '1px solid var(--theme-elevation-150, #e5e7eb)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    textAlign: 'left',
    padding: '10px 14px',
    borderBottom: '2px solid var(--theme-elevation-150, #e5e7eb)',
    fontWeight: 600,
    color: 'var(--theme-elevation-400, #6b7280)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    background: 'var(--theme-elevation-50, #f9fafb)',
  },
  thRight: {
    textAlign: 'right',
    padding: '10px 14px',
    borderBottom: '2px solid var(--theme-elevation-150, #e5e7eb)',
    fontWeight: 600,
    color: 'var(--theme-elevation-400, #6b7280)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    background: 'var(--theme-elevation-50, #f9fafb)',
  },
  td: {
    padding: '8px 14px',
    borderBottom: '1px solid var(--theme-elevation-100, #f3f4f6)',
  },
  tdRight: {
    textAlign: 'right',
    padding: '8px 14px',
    borderBottom: '1px solid var(--theme-elevation-100, #f3f4f6)',
  },
  rowEven: {
    background: 'var(--theme-elevation-50, #fafafa)',
  },
}

export default GscDashboardView
