'use client'

import { useState } from 'react'

/**
 * Info note: full text on desktop; on phones it collapses to an ⓘ button that
 * reveals the same text on tap (CSS in mobile/_pages.scss).
 */
export function InfoNote({ role, label, style, children }: { role: 'note' | 'status'; label: string; style: React.CSSProperties; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div role={role} className="od-costs-note" data-open={open ? 'true' : 'false'} style={style}>
      <button
        type="button"
        className="od-costs-note__toggle"
        aria-expanded={open}
        aria-label={open ? `Hide: ${label}` : label}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">ⓘ</span>
        <span className="od-costs-note__toggle-label">{label}</span>
      </button>
      <span className="od-costs-note__text">{children}</span>
    </div>
  )
}
