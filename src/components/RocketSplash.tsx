'use client'

import './RocketSplash.css'

/**
 * The Optimise Digital rocket, shown while a page loads. The motion (a steady
 * accelerating lift-off with a side booster dropping away) and the compact
 * layout live in RocketSplash.css, so every surface that renders this,
 * including the OptiMate popout with no admin stylesheet, gets the same flight.
 *
 * `onLight` is opt-in rather than detected: the default source logo is black
 * and dark dashboards invert it to white. `whiteRocket` uses the dedicated
 * white artwork for OptiMate's dark in-panel loaders without changing other
 * loading surfaces.
 */
export default function RocketSplash({
  onLight = false,
  compact = false,
  whiteRocket = false,
}: {
  onLight?: boolean
  compact?: boolean
  whiteRocket?: boolean
}) {
  return (
    <div
      className={`od-splash${onLight ? ' od-splash--light' : ''}${compact ? ' od-splash--compact' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <div className="od-splash__scene">
        <div className="od-splash__flames">
          <div className="od-splash__flame od-splash__flame--1" />
          <div className="od-splash__flame od-splash__flame--2" />
          <div className="od-splash__flame od-splash__flame--3" />
        </div>
        <div className={`od-splash__booster${whiteRocket ? ' od-splash__booster--white' : ''}`} />
        <div className="od-splash__rocket">
          <img
            src={whiteRocket ? '/optimise-rocket-logo-white.webp' : '/optimise-rocket-logo-black.png'}
            alt=""
            width={48}
            height={48}
          />
        </div>
      </div>
      <div className="od-splash__text">Loading</div>
    </div>
  )
}
