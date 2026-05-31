'use client'

import { useEffect, useMemo, useState } from 'react'
import RocketSplash from './RocketSplash'

/**
 * SEO hub — nested under Growth Tools (mirrors the Google Ads hub).
 *
 * Lists clients and opens each one's edit view, where the per-client "SEO" tab
 * lives (Post-Migration SEO Review + links to the client's SEO records).
 *
 * Note: Payload v3's Tabs field does not select a tab from the URL hash, so the
 * `#tab-N` anchor (kept for parity with the Google Ads hub) only scrolls; the
 * user clicks the SEO tab. We therefore avoid relying on a brittle positional
 * index that silently drifts whenever a tab is inserted.
 */

// 0-based position of the "SEO" tab in Clients.ts — used only for the scroll
// anchor, matching the Google Ads hub convention. Not load-bearing for tab
// selection (Payload ignores the hash).
const TAB_INDEX_SEO = 7

interface ClientRow {
  id: number
  name: string
  gscConnected: boolean
}

const destinationFor = (c: ClientRow): string =>
  `/admin/collections/clients/${c.id}#tab-${TAB_INDEX_SEO}`

const SeoHubPage = () => {
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'connected' | 'unconnected'>('connected')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/clients/list')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          setClients(
            data.map((c: { id: number; name: string; gscConnected?: boolean }) => ({
              id: c.id,
              name: c.name,
              gscConnected: !!c.gscConnected,
            })),
          )
        }
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
    return { total, connected }
  }, [clients])

  if (loading) return <RocketSplash />

  return (
    <div className="od-settings">
      <h2 className="od-settings__title">SEO</h2>
      <p className="od-settings__subtitle">
        SEO tooling across all clients. Click a client to open their SEO tab —
        run a Post-Migration SEO Review and jump to their audits, indexing, and alerts.
      </p>

      {/* Summary stats */}
      <div className="od-box" style={{ marginBottom: 16 }}>
        <div className="od-box__stats od-box__stats--2">
          <div className="od-box__stat">
            <span className="od-box__stat-value">{stats.total}</span>
            <span className="od-box__stat-label">Active clients</span>
          </div>
          <div className="od-box__stat">
            <span className="od-box__stat-value">{stats.connected}</span>
            <span className="od-box__stat-label">GSC connected</span>
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
              <th style={{ ...thStyle, textAlign: 'right', paddingRight: 16 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={3} style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>
                  No clients match the current filter.
                </td>
              </tr>
            )}
            {filtered.map((c) => {
              const href = destinationFor(c)
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
                  <td style={{ ...tdStyle, textAlign: 'right', paddingRight: 16 }}>
                    <a
                      href={href}
                      onClick={(e) => e.stopPropagation()}
                      style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 500, fontSize: 13 }}
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
