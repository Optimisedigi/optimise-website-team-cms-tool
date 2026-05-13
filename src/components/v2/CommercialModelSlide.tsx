/**
 * Slide 23 — Commercial model. Dynamic.
 *
 * Renders pricing cards from the CMS `commercialPhases` array. The slide
 * supports 1-4 phases; cards visually shrink when more than 2 are present so
 * everything continues to fit the fixed 1920×1080 stage.
 *
 * Returns null when no phases are defined.
 */

import type { CSSProperties, ReactElement } from 'react'
import { stripDashes } from './_text'

export type CommercialFeature = {
  item?: string | null
}

export type CommercialPhase = {
  tier?: string | null
  name?: string | null
  amount?: string | null
  amountSub?: string | null
  featured?: boolean | null
  features?: CommercialFeature[] | null
}

type Scale = {
  cardPadding: string
  cardGap: number
  wrapGap: number
  nameSize: number
  amtSize: number
  amtSmallSize: number
  featureSize: number
}

function scaleFor(count: number): Scale {
  // 1-2 phases: original design.
  if (count <= 2) {
    return {
      cardPadding: '56px 52px',
      cardGap: 28,
      wrapGap: 36,
      nameSize: 56,
      amtSize: 96,
      amtSmallSize: 28,
      featureSize: 24,
    }
  }
  // 3 phases: shrink ~25 %.
  if (count === 3) {
    return {
      cardPadding: '40px 36px',
      cardGap: 22,
      wrapGap: 24,
      nameSize: 44,
      amtSize: 72,
      amtSmallSize: 24,
      featureSize: 22,
    }
  }
  // 4 phases: shrink ~40 %.
  return {
    cardPadding: '32px 28px',
    cardGap: 18,
    wrapGap: 18,
    nameSize: 36,
    amtSize: 56,
    amtSmallSize: 20,
    featureSize: 20,
  }
}

export function CommercialModelSlide({
  phases,
  meta,
  note,
}: {
  phases: CommercialPhase[] | null
  meta: string | null
  note: string | null
}): ReactElement | null {
  const filled = (phases ?? []).filter((p) => p?.tier && p?.name && p?.amount)
  if (filled.length === 0) return null

  const s = scaleFor(filled.length)

  const wrapStyle: CSSProperties = {
    gridTemplateColumns: `repeat(${filled.length}, 1fr)`,
    gap: s.wrapGap,
  }
  const cardStyleBase: CSSProperties = {
    padding: s.cardPadding,
    gap: s.cardGap,
  }
  const nameStyle: CSSProperties = { fontSize: s.nameSize }
  const amtStyle: CSSProperties = { fontSize: s.amtSize }
  const smallStyle: CSSProperties = { fontSize: s.amtSmallSize }
  const featureStyle: CSSProperties = { fontSize: s.featureSize }

  return (
    <section className="slide" data-label="24 Commercial">
      <div className="brand-tag">
        <span className="dot"></span> 10 · Mission Resources
      </div>
      <div className="slide-head">
        <div className="h-left">
          <div className="h-eyebrow">10 · Mission Resources</div>
          <h1 className="h-title">Commercial model</h1>
        </div>
        {meta && <div className="h-meta">{meta}</div>}
      </div>

      <div className="price-wrap" style={wrapStyle}>
        {filled.map((p, i) => {
          const features = (p.features ?? []).filter((f) => f?.item)
          return (
            <div
              key={`${p.tier}-${i}`}
              className={p.featured ? 'price-card feature' : 'price-card'}
              style={cardStyleBase}
            >
              <div className="tier">{stripDashes(p.tier)}</div>
              <div className="name" style={nameStyle}>{stripDashes(p.name)}</div>
              <div className="amt" style={amtStyle}>
                {stripDashes(p.amount)}
                {p.amountSub && (
                  <small style={smallStyle}>&nbsp;{stripDashes(p.amountSub)}</small>
                )}
              </div>
              {features.length > 0 && (
                <ul className="features">
                  {features.map((f, j) => (
                    <li key={`${f.item}-${j}`} style={featureStyle}>
                      {stripDashes(f.item)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>

      {note && (
        <p
          className="small"
          style={{
            marginTop: 24,
            textAlign: 'center',
            fontStyle: 'italic',
            // No horizontal padding + nowrap so the disclaimer sits on a
            // single line across the slide. The deck is a fixed 1920px stage
            // so we don't need to worry about narrow viewports.
            whiteSpace: 'nowrap',
          }}
        >
          {stripDashes(note)}
        </p>
      )}

      <div className="slide-foot"></div>
    </section>
  )
}
