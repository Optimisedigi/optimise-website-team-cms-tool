"use client"

import { useEffect, useState } from "react"

interface ClientOption {
  id: string
  name: string
  ga4Connected: boolean
}

interface ChannelData {
  channel: string
  users: number
  newUsers: number
  sessions: number
  bounceRate: number
  avgSessionDuration: number
  keyEvents: number
}

interface PageData {
  pagePath: string
  pageTitle: string
  users: number
  pageviews: number
}

interface DailyData {
  date: string
  users: number
  sessions: number
  pageviews: number
}

interface Ga4Report {
  ga4Connected: boolean
  clientId?: string
  clientName?: string
  propertyId?: string
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
  channels?: ChannelData[]
  topPages?: PageData[]
  daily?: DailyData[]
  periodStart?: string
  periodEnd?: string
}

const PERIODS = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "12m", label: "12 months" },
] as const

type PeriodValue = typeof PERIODS[number]["value"]

export default function Ga4PerformancePage() {
  const [clients, setClients] = useState<ClientOption[]>([])
  const [selectedClient, setSelectedClient] = useState<string>("")
  const [period, setPeriod] = useState<PeriodValue>("30d")
  const [data, setData] = useState<Ga4Report | null>(null)
  const [loading, setLoading] = useState(false)

  // Load clients
  useEffect(() => {
    fetch("/api/clients/list")
      .then((r) => r.json())
      .then((list: ClientOption[]) => {
        setClients(list)
        const connected = list.find((c) => c.ga4Connected)
        if (connected) setSelectedClient(connected.id)
      })
      .catch(() => {})
  }, [])

  // Fetch GA4 data when client or period changes
  useEffect(() => {
    if (!selectedClient) return
    setLoading(true)
    fetch(`/api/ga4/query?clientId=${selectedClient}&period=${period}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [selectedClient, period])

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60)
    const secs = Math.round(s % 60)
    return `${mins}:${String(secs).padStart(2, "0")}`
  }

  const connectedClients = clients.filter((c) => c.ga4Connected)

  return (
    <div style={{ paddingBottom: 40 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Google Analytics</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {connectedClients.length > 0 && (
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid var(--theme-elevation-150)",
                background: "var(--theme-input-bg)",
                color: "inherit",
                fontSize: 13,
              }}
            >
              {connectedClients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
          <div style={{ display: "flex", gap: 4 }}>
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPeriod(p.value)}
                style={{
                  fontSize: 12,
                  padding: "5px 12px",
                  borderRadius: 6,
                  border: "1px solid",
                  borderColor: period === p.value ? "var(--theme-elevation-400)" : "var(--theme-elevation-150)",
                  background: period === p.value ? "var(--theme-elevation-100)" : "transparent",
                  color: "inherit",
                  cursor: "pointer",
                  fontWeight: period === p.value ? 600 : 400,
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {connectedClients.length === 0 && !loading && (
        <div className="od-box od-box--muted">
          <div className="od-box__body" style={{ padding: "40px 20px", textAlign: "center" }}>
            <p style={{ color: "var(--theme-elevation-400)", fontSize: 14, margin: 0 }}>
              No clients have GA4 connected. Go to{" "}
              <a href="/admin/settings/integrations" style={{ color: "var(--theme-elevation-600)", textDecoration: "underline" }}>
                Settings &rarr; Integrations
              </a>{" "}
              to connect a Google Analytics property.
            </p>
          </div>
        </div>
      )}

      {loading && !data && (
        <div className="od-box od-box--muted">
          <div className="od-box__body" style={{ padding: "40px 20px", textAlign: "center" }}>
            <p style={{ color: "var(--theme-elevation-400)", fontSize: 14, margin: 0 }}>Loading GA4 data...</p>
          </div>
        </div>
      )}

      {data && !data.ga4Connected && (
        <div className="od-box od-box--muted">
          <div className="od-box__body" style={{ padding: "40px 20px", textAlign: "center" }}>
            <p style={{ color: "var(--theme-elevation-400)", fontSize: 14, margin: 0 }}>
              GA4 is not connected for this client. Connect it in{" "}
              <a href="/admin/settings/integrations" style={{ color: "var(--theme-elevation-600)", textDecoration: "underline" }}>
                Integrations
              </a>.
            </p>
          </div>
        </div>
      )}

      {data?.ga4Connected && (
        <>
          {/* Period label */}
          {data.periodStart && data.periodEnd && (
            <p style={{ fontSize: 13, color: "var(--theme-elevation-400)", margin: "0 0 16px" }}>
              {new Date(data.periodStart).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
              {" \u2013 "}
              {new Date(data.periodEnd).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
              {data.propertyId && <span> &middot; Property {data.propertyId}</span>}
            </p>
          )}

          {/* Overview KPIs */}
          {data.overview && (
            <div className="od-box" style={{ marginBottom: 16 }}>
              <div className="od-box__stats od-box__stats--8">
                <div className="od-box__stat">
                  <span className="od-box__stat-value">{data.overview.users.toLocaleString()}</span>
                  <span className="od-box__stat-label">Users</span>
                </div>
                <div className="od-box__stat">
                  <span className="od-box__stat-value">{data.overview.newUsers.toLocaleString()}</span>
                  <span className="od-box__stat-label">New Users</span>
                </div>
                <div className="od-box__stat">
                  <span className="od-box__stat-value">{data.overview.sessions.toLocaleString()}</span>
                  <span className="od-box__stat-label">Sessions</span>
                </div>
                <div className="od-box__stat">
                  <span className="od-box__stat-value">{data.overview.pageviews.toLocaleString()}</span>
                  <span className="od-box__stat-label">Pageviews</span>
                </div>
                <div className="od-box__stat">
                  <span className="od-box__stat-value">{(data.overview.bounceRate * 100).toFixed(1)}%</span>
                  <span className="od-box__stat-label">Bounce Rate</span>
                </div>
                <div className="od-box__stat">
                  <span className="od-box__stat-value">{formatDuration(data.overview.avgSessionDuration)}</span>
                  <span className="od-box__stat-label">Avg Duration</span>
                </div>
                <div className="od-box__stat">
                  <span className="od-box__stat-value">{(data.overview.engagementRate * 100).toFixed(1)}%</span>
                  <span className="od-box__stat-label">Engagement</span>
                </div>
                <div className="od-box__stat">
                  <span className="od-box__stat-value">{data.overview.conversions.toLocaleString()}</span>
                  <span className="od-box__stat-label">Conversions</span>
                </div>
              </div>
            </div>
          )}

          {/* Daily chart */}
          {data.daily && data.daily.length > 0 && (
            <div className="od-box" style={{ marginBottom: 16, padding: "16px 20px" }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "var(--theme-elevation-500)" }}>Daily Sessions</div>
              <div style={{ height: 120, display: "flex", alignItems: "flex-end", gap: 1 }}>
                {data.daily.map((d, i) => {
                  const maxVal = Math.max(...data.daily!.map((x) => x.sessions), 1)
                  return (
                    <div
                      key={i}
                      title={`${d.date}: ${d.sessions.toLocaleString()} sessions, ${d.users.toLocaleString()} users`}
                      style={{
                        width: `${100 / data.daily!.length}%`,
                        height: `${Math.max((d.sessions / maxVal) * 100, 2)}%`,
                        background: "#468D8B",
                        borderRadius: "2px 2px 0 0",
                        minHeight: 2,
                        transition: "height 300ms",
                      }}
                    />
                  )
                })}
              </div>
            </div>
          )}

          {/* Channel grouping table */}
          {data.channels && data.channels.length > 0 && (
            <div className="od-box" style={{ marginBottom: 16 }}>
              <div className="od-box__head">
                <span className="od-box__title">Channel Grouping</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--theme-elevation-100)" }}>
                      <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--theme-elevation-500)" }}>Channel</th>
                      <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: "var(--theme-elevation-500)" }}>Sessions</th>
                      <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: "var(--theme-elevation-500)" }}>Users</th>
                      <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: "var(--theme-elevation-500)" }}>New Users</th>
                      <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: "var(--theme-elevation-500)" }}>Bounce Rate</th>
                      <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: "var(--theme-elevation-500)" }}>Avg Duration</th>
                      <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: "var(--theme-elevation-500)" }}>Key Events</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.channels.map((ch) => (
                      <tr key={ch.channel} style={{ borderBottom: "1px solid var(--theme-elevation-50)" }}>
                        <td style={{ padding: "8px 16px", fontWeight: 500, color: "var(--theme-elevation-700)" }}>{ch.channel}</td>
                        <td style={{ padding: "8px 16px", textAlign: "right", fontWeight: 600 }}>{ch.sessions.toLocaleString()}</td>
                        <td style={{ padding: "8px 16px", textAlign: "right" }}>{ch.users.toLocaleString()}</td>
                        <td style={{ padding: "8px 16px", textAlign: "right" }}>{ch.newUsers.toLocaleString()}</td>
                        <td style={{ padding: "8px 16px", textAlign: "right" }}>{(ch.bounceRate * 100).toFixed(1)}%</td>
                        <td style={{ padding: "8px 16px", textAlign: "right" }}>{formatDuration(ch.avgSessionDuration)}</td>
                        <td style={{ padding: "8px 16px", textAlign: "right", fontWeight: 600 }}>{ch.keyEvents.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Top pages table */}
          {data.topPages && data.topPages.length > 0 && (
            <div className="od-box">
              <div className="od-box__head">
                <span className="od-box__title">Top Pages</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--theme-elevation-100)" }}>
                      <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--theme-elevation-500)" }}>Page</th>
                      <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: "var(--theme-elevation-500)", whiteSpace: "nowrap" }}>Pageviews</th>
                      <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: "var(--theme-elevation-500)" }}>Users</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topPages.map((pg) => (
                      <tr key={pg.pagePath} style={{ borderBottom: "1px solid var(--theme-elevation-50)" }}>
                        <td style={{ padding: "8px 16px", maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${pg.pageTitle}\n${pg.pagePath}`}>
                          <span style={{ color: "var(--theme-elevation-700)" }}>{pg.pagePath}</span>
                          {pg.pageTitle && <span style={{ color: "var(--theme-elevation-400)", marginLeft: 8, fontSize: 11 }}>{pg.pageTitle}</span>}
                        </td>
                        <td style={{ padding: "8px 16px", textAlign: "right", fontWeight: 600 }}>{pg.pageviews.toLocaleString()}</td>
                        <td style={{ padding: "8px 16px", textAlign: "right" }}>{pg.users.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
