'use client'

import { useEffect, useMemo, useState } from 'react'
import RocketSplash from './RocketSplash'

/**
 * SEO hub — nested under Growth Tools (mirrors the Google Ads hub).
 *
 * Lists clients and opens each one's dedicated SEO workspace, keeping SEO-only
 * records out of the general client edit screen.
 */

interface ClientRow {
  id: number
  name: string
  slug: string
  gscConnected: boolean
  latestSeoAudit: { id: number; overallScore: number | null; auditStatus: string | null; createdAt: string } | null
  latestMigration: { id: number; status: string | null; createdAt: string } | null
  counts: {
    seoAudits: number
    migrations: number
    internalLinks: number
    quarterlySnapshots: number
    siteHealthReports: number
  }
}

const destinationFor = (c: ClientRow): string => `/admin/growth-tools/seo/${c.slug || c.id}`

const scoreColor = (score: number | null) => {
  if (score == null) return { bg: '#f3f4f6', fg: '#6b7280' }
  if (score >= 8) return { bg: '#dcfce7', fg: '#166534' }
  if (score >= 5) return { bg: '#fef3c7', fg: '#92400e' }
  return { bg: '#fee2e2', fg: '#991b1b' }
}

const SeoHubPage = () => {
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'connected' | 'unconnected'>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/clients/seo-list')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) setClients(data)
        setLoading(false)
      })
      .catch((err) => {
        console.error('[SeoHub] fetch error:', err)
        setLoading(false)
      })
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return clients.filter((c) => {
      if (filter === 'connected' && !c.gscConnected) return false
      if (filter === 'unconnected' && c.gscConnected) return false
      if (q && !c.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [clients, filter, search])

  const stats = useMemo(() => {
    const total = clients.length
    const connected = clients.filter((c) => c.gscConnected).length
    const audited = clients.filter((c) => !!c.latestSeoAudit).length
    const migrations = clients.filter((c) => !!c.latestMigration).length
    return { total, connected, audited, migrations }
  }, [clients])

  if (loading) return <RocketSplash />

  return (
    <div className="od-settings">
      <h2 className="od-settings__title">SEO</h2>
      <p className="od-settings__subtitle">
        SEO tooling across all clients. Click a client to open their SEO workspace —
        SEO audit scores, migrations, internal link suggestions, quarterly organic growth snapshots, and site health reports.
      </p>

      {/* Summary stats */}
      <div className="od-box" style={{ marginBottom: 16 }}>
        <div className="od-box__stats od-box__stats--4">
          <div className="od-box__stat">
            <span className="od-box__stat-value">{stats.total}</span>
            <span className="od-box__stat-label">Active clients</span>
          </div>
          <div className="od-box__stat">
            <span className="od-box__stat-value">{stats.connected}</span>
            <span className="od-box__stat-label">GSC connected</span>
          </div>
          <div className="od-box__stat">
            <span className="od-box__stat-value">{stats.audited}</span>
            <span className="od-box__stat-label">SEO audited</span>
          </div>
          <div className="od-box__stat">
            <span className="od-box__stat-value">{stats.migrations}</span>
            <span className="od-box__stat-label">Migrations</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
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
              { key: 'connected', label: `GSC connected (${stats.connected})` },
              { key: 'unconnected', label: `Not connected (${clients.length - stats.connected})` },
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
      <div className="od-box" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
            <tr>
              <th style={thStyle}>Client</th>
              <th style={thStyle}>Search Console</th>
              <th style={thStyle}>Latest audit score</th>
              <th style={thStyle}>SEO records</th>
              <th style={{ ...thStyle, textAlign: 'right', paddingRight: 16 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>
                  No clients match the current filter.
                </td>
              </tr>
            )}
            {filtered.map((c) => {
              const href = destinationFor(c)
              const colors = scoreColor(c.latestSeoAudit?.overallScore ?? null)
              return (
                <tr
                  key={c.id}
                  style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                  onClick={() => {
                    window.location.href = href
                  }}
                >
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{c.name}</div>
                  </td>
                  <td style={tdStyle}>
                    {c.gscConnected ? (
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: '#dcfce7',
                          color: '#166534',
                          fontWeight: 600,
                          fontSize: 12,
                        }}
                      >
                        Connected
                      </span>
                    ) : (
                      <span style={{ color: '#9ca3af' }}>Not connected</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        display: 'inline-block',
                        minWidth: 38,
                        textAlign: 'center',
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: colors.bg,
                        color: colors.fg,
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      {c.latestSeoAudit?.overallScore ?? '—'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: '#475569', fontSize: 12 }}>
                      Audits {c.counts.seoAudits} · Migrations {c.counts.migrations} · Links {c.counts.internalLinks} · Quarterly {c.counts.quarterlySnapshots} · Health {c.counts.siteHealthReports}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', paddingRight: 16 }}>
                    <a
                      href={href}
                      onClick={(e) => e.stopPropagation()}
                      style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 500, fontSize: 13 }}
                    >
                      Open SEO →
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

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 12,
  fontWeight: 600,
  color: '#475569',
  textTransform: 'uppercase',
  letterSpacing: 0.3,
}

const tdStyle: React.CSSProperties = {
  padding: '12px',
  verticalAlign: 'top',
}

export default SeoHubPage
