/**
 * Slide 13 — Mission priorities ("Where to focus our energy"). Dynamic.
 *
 * Renders up to 4 priority cards from `proposal.missionPriorities` (defined
 * in the CMS Post-report-input tab). Returns null when no priorities are
 * defined so the slide is hidden entirely.
 */

import type { ReactElement } from 'react'

export type MissionPriority = {
  tag?: string | null
  title?: string | null
  description?: string | null
}

export function MissionPrioritiesSlide({
  priorities,
}: {
  priorities: MissionPriority[] | null
}): ReactElement | null {
  const filled = (priorities ?? []).filter(
    (p) => p?.tag && p?.title && p?.description,
  )
  if (filled.length === 0) return null

  return (
    <section className="slide" data-label="12 Priorities">
      <div className="brand-tag">
        <span className="dot"></span> 08 · Mission Priorities
      </div>
      <div className="slide-head">
        <div className="h-left">
          <div className="h-eyebrow">08 · Mission Priorities</div>
          <h1 className="h-title">Where to focus our energy</h1>
        </div>
        <div className="h-meta">First 90 days</div>
      </div>

      <div
        className="cards"
        style={{ gridTemplateColumns: '1fr 1fr', display: 'grid', gap: 24 }}
      >
        {filled.map((p, i) => (
          <div className="card" key={`${p.tag}-${i}`}>
            <div className="num-tag">{p.tag}</div>
            <div className="h">{p.title}</div>
            <div className="b">{p.description}</div>
          </div>
        ))}
      </div>

      <div className="slide-foot"></div>
    </section>
  )
}
