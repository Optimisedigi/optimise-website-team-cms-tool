/**
 * Slide 21 — Roadmap. Dynamic.
 *
 * Renders the Flight Plan roadmap from CMS-edited cells. Up to 6 cells
 * supported (enforced by the field's maxRows). When zero cells are defined
 * the slide is hidden entirely.
 */

import type { ReactElement } from 'react'
import { stripDashes } from './_text'

export type RoadmapCell = {
  week?: string | null
  step?: string | null
  body?: string | null
}

export function RoadmapSlide({
  cells,
  meta,
  note,
}: {
  cells: RoadmapCell[] | null
  meta: string | null
  note: string | null
}): ReactElement | null {
  const filled = (cells ?? []).filter((c) => c?.week && c?.step && c?.body)
  if (filled.length === 0) return null

  return (
    <section className="slide" data-label="22 Roadmap">
      <div className="brand-tag">
        <span className="dot"></span> 09 · Flight Plan
      </div>
      <div className="slide-head">
        <div className="h-left">
          <div className="h-eyebrow">09 · Flight Plan</div>
          <h1 className="h-title">Roadmap</h1>
        </div>
        {meta && <div className="h-meta">{meta}</div>}
      </div>

      <div
        className="roadmap"
        style={{ gridTemplateColumns: `repeat(${filled.length}, 1fr)` }}
      >
        {filled.map((c, i) => (
          <div className="road-cell" key={`${c.week}-${i}`}>
            <div className="week">{stripDashes(c.week)}</div>
            <div className="step">{stripDashes(c.step)}</div>
            <div className="desc">{stripDashes(c.body)}</div>
          </div>
        ))}
      </div>

      {note && (
        <p className="small" style={{ marginTop: 48 }}>
          {stripDashes(note)}
        </p>
      )}

      <div className="slide-foot"></div>
    </section>
  )
}
