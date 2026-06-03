'use client'

import { useEffect, useMemo, useState } from 'react'
import { avatarColor, avatarInitial } from './clients-list/avatar-gradient'
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
    <div className="od-settings od-admin-list-style" style={{ maxWidth: 'none', width: '100%' }}>
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
      <div className="table">
        <table>
          <thead>
            <tr>
              <th className="cell-name">Client</th>
              <th>Search Console</th>
              <th>Latest audit score</th>
              <th>SEO records</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 32, textAlign: 'center' }} className="od-cell-muted">
                  No clients match the current filter.
                </td>
              </tr>
            )}
            {filtered.map((c) => {
              const href = destinationFor(c)
              const score = c.latestSeoAudit?.overallScore ?? null
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
                    {c.gscConnected ? (
                      <span className="od-pill od-pill--green">Connected</span>
                    ) : (
                      <span className="od-cell-muted">Not connected</span>
                    )}
                  </td>
                  <td>
                    {score != null ? (
                      <span className={`od-pill ${score >= 8 ? 'od-pill--green' : score >= 5 ? 'od-pill--amber' : 'od-pill--red'}`}>
                        {score}/10
                      </span>
                    ) : (
                      <span className="od-cell-muted">—</span>
                    )}
                  </td>
                  <td>
                    <span className="od-cell-muted">
                      Audits {c.counts.seoAudits} · Migrations {c.counts.migrations} · Links {c.counts.internalLinks} · Quarterly {c.counts.quarterlySnapshots} · Health {c.counts.siteHealthReports}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
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


export default SeoHubPage
