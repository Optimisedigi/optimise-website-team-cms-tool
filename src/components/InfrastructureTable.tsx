'use client'

import { useMemo, useState } from 'react'
import {
  INFRASTRUCTURE_SERVICES,
  type InfrastructureService,
  type UsedBy,
} from '../lib/infrastructure-services'

type UsedByFilter = 'All' | UsedBy

const USED_BY_OPTIONS: UsedByFilter[] = ['All', 'CMS', 'Growth Tools', 'Both']

const USED_BY_COLOR: Record<UsedBy, string> = {
  CMS: '#6366f1',
  'Growth Tools': '#74B3A8',
  Both: '#d97706',
}

function InfrastructureTable() {
  const [filter, setFilter] = useState<UsedByFilter>('All')

  const rows = useMemo<InfrastructureService[]>(() => {
    const filtered =
      filter === 'All'
        ? INFRASTRUCTURE_SERVICES
        : INFRASTRUCTURE_SERVICES.filter((s) => s.usedBy === filter)
    return [...filtered].sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category)
      return a.name.localeCompare(b.name)
    })
  }, [filter])

  const counts = useMemo(() => {
    const c = { CMS: 0, 'Growth Tools': 0, Both: 0 }
    for (const s of INFRASTRUCTURE_SERVICES) c[s.usedBy] += 1
    return c
  }, [])

  return (
    <div className="od-box" style={{ marginBottom: 16 }}>
      <div className="od-box__head" style={{ flexWrap: 'wrap', gap: 8 }}>
        <span className="od-box__title">Infrastructure &amp; Services</span>
        <span style={{ fontSize: 12, color: 'var(--theme-elevation-400)' }}>
          {INFRASTRUCTURE_SERVICES.length} live services
          {' · '}
          <span style={{ color: USED_BY_COLOR.CMS }}>CMS: {counts.CMS}</span>
          {' · '}
          <span style={{ color: USED_BY_COLOR['Growth Tools'] }}>
            Growth Tools: {counts['Growth Tools']}
          </span>
          {' · '}
          <span style={{ color: USED_BY_COLOR.Both }}>Both: {counts.Both}</span>
        </span>
      </div>

      {/* Filter chips */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          padding: '0 16px',
          marginBottom: 8,
          flexWrap: 'wrap',
        }}
      >
        {USED_BY_OPTIONS.map((opt) => {
          const active = filter === opt
          return (
            <button
              key={opt}
              type="button"
              onClick={() => setFilter(opt)}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: `1px solid ${active ? '#38bdf8' : 'var(--theme-border-color)'}`,
                background: active
                  ? 'rgba(56, 189, 248, 0.12)'
                  : 'var(--theme-elevation-50)',
                color: active ? '#38bdf8' : 'var(--theme-elevation-800)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {opt}
            </button>
          )
        })}
      </div>

      <div style={{ padding: '0 16px 16px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--theme-border-color)' }}>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Category</th>
              <th style={thStyle}>Used by</th>
              <th style={thStyle}>Plan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr
                key={s.name}
                title={s.tooltip}
                style={{
                  borderBottom: '1px solid var(--theme-border-color)',
                  cursor: 'help',
                }}
              >
                <td style={tdStyle}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 600 }}>{s.name}</span>
                    <InfoIcon />
                  </span>
                </td>
                <td style={{ ...tdStyle, color: 'var(--theme-elevation-500)' }}>
                  {s.category}
                </td>
                <td style={tdStyle}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '2px 8px',
                      borderRadius: 12,
                      background: 'var(--theme-elevation-50)',
                      border: '1px solid var(--theme-border-color)',
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: USED_BY_COLOR[s.usedBy],
                      }}
                    />
                    {s.usedBy}
                  </span>
                </td>
                <td
                  style={{
                    ...tdStyle,
                    color:
                      s.plan === '?'
                        ? 'var(--theme-elevation-400)'
                        : 'var(--theme-elevation-800)',
                    fontStyle: s.plan === '?' ? 'italic' : 'normal',
                  }}
                >
                  {s.plan}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  style={{
                    ...tdStyle,
                    textAlign: 'center',
                    color: 'var(--theme-elevation-400)',
                    padding: 24,
                  }}
                >
                  No services match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p
          style={{
            margin: '12px 0 0',
            fontSize: 11,
            color: 'var(--theme-elevation-400)',
            fontStyle: 'italic',
          }}
        >
          Hover any row to see what the service is and why we use it. To update
          plan tiers or add services, edit{' '}
          <code style={{ fontSize: 11 }}>src/lib/infrastructure-services.ts</code>.
        </p>
      </div>
    </div>
  )
}

function InfoIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: 'var(--theme-elevation-400)', flexShrink: 0 }}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  )
}

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

export default InfrastructureTable
