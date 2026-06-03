import React from 'react'

export type Crumb = { label: string; strong?: boolean }

export function Topbar({
  crumbs,
  searchPlaceholder = 'Search clients, audits, invoices…',
  collapseGlyph,
}: {
  crumbs: Crumb[]
  searchPlaceholder?: string
  collapseGlyph?: React.ReactNode
}): React.ReactElement {
  return (
    <div className="topbar">
      {collapseGlyph ? <div className="collapse-btn">{collapseGlyph}</div> : null}
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <React.Fragment key={`${c.label}-${i}`}>
            {i > 0 ? <span className="sep">/</span> : null}
            {c.strong ? <b>{c.label}</b> : <span>{c.label}</span>}
          </React.Fragment>
        ))}
      </div>
      <div className="search">
        <span>🔍</span> {searchPlaceholder}
      </div>
      <div className="icon-btn">🔔</div>
      <div className="icon-btn">⚙️</div>
    </div>
  )
}
