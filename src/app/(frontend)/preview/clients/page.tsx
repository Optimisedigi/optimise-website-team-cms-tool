'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Shell } from '../_components/Shell'
import { Icon } from '../_components/Icon'
import { CLIENT_ROWS } from '../_data/mock'

type ColKey = 'slug' | 'status' | 'services' | 'pin' | 'mgr' | 'months' | 'type' | 'health'

const COLUMNS: { key: ColKey; label: string }[] = [
  { key: 'slug', label: 'Slug' },
  { key: 'status', label: 'Status' },
  { key: 'services', label: 'Services' },
  { key: 'pin', label: 'PIN' },
  { key: 'mgr', label: 'Account Mgr' },
  { key: 'months', label: 'Months Active' },
  { key: 'type', label: 'Type' },
  { key: 'health', label: 'Health' },
]

export default function ClientsPreview(): React.ReactElement {
  const [menuOpen, setMenuOpen] = useState(false)
  const [visible, setVisible] = useState<Record<ColKey, boolean>>({
    slug: true,
    status: true,
    services: true,
    pin: true,
    mgr: true,
    months: true,
    type: true,
    health: true,
  })
  const menuWrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent): void {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  function toggleCol(key: ColKey): void {
    setVisible((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <Shell
      mini
      activeKey="clients"
      crumbs={[{ label: 'Clients' }]}
      searchPlaceholder="Search clients…"
      collapseGlyph="⇥"
    >
      <div className="page-head">
        <div>
          <h1>Clients</h1>
          <div className="sub">24 active · 6 prospects</div>
        </div>
        <div className="spacer" />
        <div style={{ position: 'relative' }} ref={menuWrapRef}>
          <button
            className="btn"
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen((o) => !o)
            }}
          >
            <Icon name="columns" /> Columns
          </button>
          {menuOpen ? (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                right: 0,
                background: '#fff',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r)',
                boxShadow: 'var(--sh-lg)',
                padding: 8,
                minWidth: 170,
                zIndex: 50,
              }}
            >
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '.06em',
                  color: 'var(--t3)',
                  padding: '4px 8px 8px',
                }}
              >
                Toggle columns
              </div>
              {COLUMNS.map((c) => (
                <label className="col-toggle" key={c.key}>
                  <input type="checkbox" checked={visible[c.key]} onChange={() => toggleCol(c.key)} /> {c.label}
                </label>
              ))}
            </div>
          ) : null}
        </div>
        <button className="btn primary">＋ New Client</button>
      </div>

      <div className="card">
        <div className="card-h">
          <h3>All Clients</h3>
          <div className="spacer" />
          <div className="search" style={{ margin: 0, width: 220, height: 32 }}>
            🔍 Filter rows…
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 34 }}>
                <input type="checkbox" />
              </th>
              <th>Client</th>
              {visible.slug ? <th>Slug</th> : null}
              {visible.status ? <th>Status</th> : null}
              {visible.services ? <th>Services</th> : null}
              {visible.pin ? <th>PIN</th> : null}
              {visible.mgr ? <th>Account Mgr</th> : null}
              {visible.months ? <th className="num">Months Active</th> : null}
              {visible.type ? <th>Type</th> : null}
              {visible.health ? <th>Health</th> : null}
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {CLIENT_ROWS.map((row) => (
              <tr key={row.slug}>
                <td>
                  <input type="checkbox" />
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="avatar" style={{ background: row.avatarBg }}>
                      {row.initial}
                    </div>
                    <div>
                      <div className="t-strong">{row.name}</div>
                      <div className="t-muted" style={{ fontSize: 11 }}>
                        {row.domain}
                      </div>
                    </div>
                  </div>
                </td>
                {visible.slug ? (
                  <td className="t-muted" style={{ fontSize: 12, fontFamily: 'monospace' }}>
                    {row.slug}
                  </td>
                ) : null}
                {visible.status ? (
                  <td>
                    <span className={`pill ${row.statusVariant}`}>{row.status}</span>
                  </td>
                ) : null}
                {visible.services ? (
                  <td>
                    {row.services.map((s, i) => (
                      <React.Fragment key={s.label}>
                        {i > 0 ? ' ' : null}
                        <span className={`pill ${s.variant}`}>{s.label}</span>
                      </React.Fragment>
                    ))}
                  </td>
                ) : null}
                {visible.pin ? (
                  <td className="t-muted" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '.05em' }}>
                    {row.pin}
                  </td>
                ) : null}
                {visible.mgr ? <td className="t-muted">{row.mgr}</td> : null}
                {visible.months ? <td className="num t-muted">{row.months}</td> : null}
                {visible.type ? (
                  <td>
                    <span className={`pill ${row.typeVariant}`}>{row.type}</span>
                  </td>
                ) : null}
                {visible.health ? (
                  <td>
                    <span className={`pill ${row.healthVariant}`}>{row.health}</span>
                  </td>
                ) : null}
                <td className="t-muted">⋯</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  )
}
