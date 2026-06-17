'use client'

import { useEffect, useMemo, useState } from 'react'
import { avatarColor, avatarInitial } from './clients-list/avatar-gradient'
import RocketSplash from './RocketSplash'

/**
 * Google Ads hub.
 *
 * Lists every active client and links each one to that client's Google Ads
 * tab in the admin (`/admin/collections/clients/<id>#tab-5`). Surfaces:
 *  - whether a Google Ads customer ID is configured
 *  - the latest audit's score + status
 *  - automation flags (dashboard, weekly report, negative sweep, re-audit)
 *
 * Mirrors the look/feel of IntegrationsPage and Ga4PerformancePage so the
 * hub blends in with the other in-house admin tools.
 */

interface ClientRow {
  id: number
  name: string
  slug: string
  googleAdsCustomerId: string | null
  createdAt: string
  latestAudit: {
    id: number
    overallScore: number | null
    auditStatus: string | null
    createdAt: string
  } | null
  scoreTrajectory: {
    latest: number | null
    previous: number | null
    change: number | null
    trend: string | null
  }
  automation: {
    dashboardEnabled: boolean
    weeklyReportEnabled: boolean
    negativeSweepEnabled: boolean
    reauditEnabled: boolean
  }
}

const TAB_INDEX_GOOGLE_ADS = 5 // Position of the Google Ads tab in Clients.ts

// Build the destination URL when clicking a client row in the hub. If there's
// a Google Ads audit, jump straight to its edit view — that's where all the
// per-feature tabs live (Budget Management, Negative Keyword Lists, Keyword
// Deep Dive Sessions, Automations, etc.). If there's no audit yet, fall back
// to the client's Google Ads tab so the user can run the first audit.
const destinationFor = (c: ClientRow): string => {
  if (c.latestAudit?.id) {
    return `/admin/collections/google-ads-audits/${c.latestAudit.id}`
  }
  return `/admin/collections/clients/${c.id}#tab-${TAB_INDEX_GOOGLE_ADS}`
}

const trendIcon = (trend: string | null, change: number | null) => {
  if (!trend || trend === 'flat' || change == null || change === 0) {
    return <span style={{ color: '#9ca3af' }}>—</span>
  }
  if (trend === 'up' || change > 0) {
    return <span style={{ color: '#15803d' }}>▲ {Math.abs(change)}</span>
  }
  return <span style={{ color: '#b91c1c' }}>▼ {Math.abs(change)}</span>
}

const formatStatus = (status: string | null) => {
  if (!status) return 'Never run'
  return status
    .split(/[-_]/)
    .map((s) => s[0]?.toUpperCase() + s.slice(1))
    .join(' ')
}

const GoogleAdsHubPage = () => {
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'active' | 'unconfigured'>('active')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/clients/google-ads-list')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) setClients(data)
        setLoading(false)
      })
      .catch((err) => {
        console.error('[GoogleAdsHub] fetch error:', err)
        setLoading(false)
      })
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return clients.filter((c) => {
      if (filter === 'active' && !c.googleAdsCustomerId) return false
      if (filter === 'unconfigured' && c.googleAdsCustomerId) return false
      if (q && !c.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [clients, filter, search])

  const stats = useMemo(() => {
    const total = clients.length
    const configured = clients.filter((c) => !!c.googleAdsCustomerId).length
    const audited = clients.filter((c) => !!c.latestAudit).length
    const automated = clients.filter(
      (c) =>
        c.automation.dashboardEnabled ||
        c.automation.weeklyReportEnabled ||
        c.automation.negativeSweepEnabled ||
        c.automation.reauditEnabled,
    ).length
    return { total, configured, audited, automated }
  }, [clients])

  if (loading) return <RocketSplash />

  return (
    <div className="od-settings od-admin-list-style" style={{ maxWidth: 'none', width: '100%' }}>
      <h2 className="od-settings__title">Google Ads</h2>
      <p className="od-settings__subtitle">
        Manage Google Ads work across all clients. Click a client to open their
        Google Ads tab — audits, negative keyword lists, deep dive sessions,
        budgets, and automation settings.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <button
          type="button"
          className="od-settings__btn od-settings__btn--primary"
          onClick={() => {
            window.location.href = '/admin/google-ads/change-tracker'
          }}
        >
          Change Tracker
        </button>
      </div>

      {/* Summary stats */}
      <div className="od-box" style={{ marginBottom: 16 }}>
        <div className="od-box__stats od-box__stats--4">
          <div className="od-box__stat">
            <span className="od-box__stat-value">{stats.total}</span>
            <span className="od-box__stat-label">Active clients</span>
          </div>
          <div className="od-box__stat">
            <span className="od-box__stat-value">{stats.configured}</span>
            <span className="od-box__stat-label">Customer ID set</span>
          </div>
          <div className="od-box__stat">
            <span className="od-box__stat-value">{stats.audited}</span>
            <span className="od-box__stat-label">Audited</span>
          </div>
          <div className="od-box__stat">
            <span className="od-box__stat-value">{stats.automated}</span>
            <span className="od-box__stat-label">Automated</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          marginBottom: 12,
          flexWrap: 'wrap',
        }}
      >
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients…"
          className="od-gsc-page__date-input"
          style={{ minWidth: 240 }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          {(
            [
              { key: 'all', label: `All (${clients.length})` },
              {
                key: 'active',
                label: `Configured (${clients.filter((c) => !!c.googleAdsCustomerId).length})`,
              },
              {
                key: 'unconfigured',
                label: `Unconfigured (${clients.filter((c) => !c.googleAdsCustomerId).length})`,
              },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setFilter(opt.key)}
              className={
                filter === opt.key
                  ? 'od-settings__btn od-settings__btn--primary'
                  : 'od-settings__btn'
              }
              style={{ padding: '6px 12px', fontSize: 13 }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Client table */}
      <div className="table">
        <table>
          <thead>
            <tr>
              <th className="cell-name">Client</th>
              <th>Customer ID</th>
              <th>Created</th>
              <th>Latest score</th>
              <th>Trend</th>
              <th>Last audit</th>
              <th>Automation</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: 32, textAlign: 'center' }} className="od-cell-muted">
                  No clients match the current filter.
                </td>
              </tr>
            )}
            {filtered.map((c) => {
              const score = c.latestAudit?.overallScore ?? c.scoreTrajectory.latest
              const automationCount = [
                c.automation.dashboardEnabled,
                c.automation.weeklyReportEnabled,
                c.automation.negativeSweepEnabled,
                c.automation.reauditEnabled,
              ].filter(Boolean).length
              const href = destinationFor(c)
              return (
                <tr
                  key={c.id}
                  onClick={() => {
                    window.location.href = href
                  }}
                >
                  <td className="cell-name">
                    <div className="od-client-cell">
                      <span
                        className="od-client-cell__avatar"
                        style={{ background: avatarColor(c.id, c.name) }}
                      >
                        {avatarInitial(c.name)}
                      </span>
                      <span className="od-client-cell__text">
                        <span className="od-client-cell__name">{c.name}</span>
                        <span className="od-client-cell__domain">{c.slug}</span>
                      </span>
                    </div>
                  </td>
                  <td>
                    {c.googleAdsCustomerId ? (
                      <code className="od-cell-slug">{c.googleAdsCustomerId}</code>
                    ) : (
                      <span className="od-cell-muted">Not set</span>
                    )}
                  </td>
                  <td>
                    {c.createdAt ? (
                      <span className="od-cell-muted">
                        {new Date(c.createdAt).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    ) : (
                      <span className="od-cell-muted">—</span>
                    )}
                  </td>
                  <td>
                    {score != null ? (
                      <span className={`od-pill ${score >= 80 ? 'od-pill--green' : score >= 60 ? 'od-pill--amber' : 'od-pill--red'}`}>
                        {score}/100
                      </span>
                    ) : (
                      <span className="od-cell-muted">—</span>
                    )}
                  </td>
                  <td>
                    {trendIcon(c.scoreTrajectory.trend, c.scoreTrajectory.change)}
                  </td>
                  <td>
                    {c.latestAudit ? (
                      <>
                        <div>
                          <span className={`od-pill ${c.latestAudit.auditStatus === 'completed' ? 'od-pill--green' : c.latestAudit.auditStatus === 'failed' ? 'od-pill--red' : 'od-pill--amber'}`}>
                            {formatStatus(c.latestAudit.auditStatus)}
                          </span>
                        </div>
                        <div className="od-client-cell__domain">
                          {new Date(c.latestAudit.createdAt).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </div>
                      </>
                    ) : (
                      <span className="od-cell-muted">Never run</span>
                    )}
                  </td>
                  <td>
                    {automationCount === 0 ? (
                      <span className="od-cell-muted">None</span>
                    ) : (
                      <span>{automationCount} / 4</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <a
                      href={href}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        color: '#2563eb',
                        textDecoration: 'none',
                        fontWeight: 500,
                        fontSize: 13,
                      }}
                    >
                      Open →
                    </a>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}


export default GoogleAdsHubPage
