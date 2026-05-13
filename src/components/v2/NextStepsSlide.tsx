/**
 * Slide 25 — Next Steps / Launch Requirements. Dynamic.
 *
 * Renders three step cards and up to four secondary "DURING BUILD" /
 * "POST LAUNCH" blocks from CMS data. Vertical layout is tightened (gap +
 * padding + font-sizes) so the slide stays inside the fixed 1080px stage
 * even when the maximum number of blocks is configured.
 *
 * Returns null when both `steps` and `blocks` are empty.
 */

import type { ReactElement } from 'react'
import { stripDashes } from './_text'

export type LaunchStep = {
  stepLabel?: string | null
  title?: string | null
  body?: string | null
}

export type LaunchBlock = {
  tag?: string | null
  title?: string | null
  body?: string | null
}

export function NextStepsSlide({
  steps,
  blocks,
  meta,
}: {
  steps: LaunchStep[] | null
  blocks: LaunchBlock[] | null
  meta: string | null
}): ReactElement | null {
  const filledSteps = (steps ?? []).filter(
    (s) => s?.stepLabel && s?.title && s?.body,
  )
  const filledBlocks = (blocks ?? []).filter(
    (b) => b?.tag && b?.title && b?.body,
  )

  if (filledSteps.length === 0 && filledBlocks.length === 0) return null

  return (
    <section
      className="slide"
      data-label="26 Next Steps"
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      <div className="brand-tag">
        <span className="dot"></span> 10 · Launch Requirements
      </div>
      <div className="slide-head">
        <div className="h-left">
          <div className="h-eyebrow">10 · Launch Requirements</div>
          <h1 className="h-title">Next steps</h1>
        </div>
        {meta && <div className="h-meta">{meta}</div>}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          marginTop: 18,
          flex: 1,
          minHeight: 0,
        }}
      >
        {filledSteps.length > 0 && (
          <div
            className="cards"
            style={{
              gridTemplateColumns: `repeat(${filledSteps.length}, 1fr)`,
              display: 'grid',
              gap: 18,
            }}
          >
            {filledSteps.map((s, i) => (
              <div
                className="card"
                key={`${s.stepLabel}-${i}`}
                style={{ padding: '24px 28px', gap: 10 }}
              >
                <div className="num-tag">{stripDashes(s.stepLabel)}</div>
                <div className="h" style={{ fontSize: 26 }}>{stripDashes(s.title)}</div>
                <div className="b" style={{ fontSize: 22 }}>{stripDashes(s.body)}</div>
              </div>
            ))}
          </div>
        )}

        {filledBlocks.map((b, i) => (
          <div
            className="card"
            key={`${b.tag}-${i}`}
            style={{
              background: 'var(--bg-paper-2)',
              padding: '20px 28px',
              gap: 8,
            }}
          >
            <div className="num-tag">{stripDashes(b.tag)}</div>
            <div className="h" style={{ fontSize: 26 }}>{stripDashes(b.title)}</div>
            <div className="b" style={{ fontSize: 22 }}>{stripDashes(b.body)}</div>
          </div>
        ))}
      </div>

      <div className="slide-foot"></div>
    </section>
  )
}
