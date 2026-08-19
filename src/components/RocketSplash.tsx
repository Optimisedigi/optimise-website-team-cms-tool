'use client'

/**
 * The Optimise Digital rocket, shown while a page loads.
 *
 * `onLight` is opt-in rather than detected: the source logo is black and the
 * dark dashboards invert it to white, which leaves it invisible on a light
 * surface. Callers on a light background ask for the un-inverted mark, so no
 * existing dark usage changes.
 */
export default function RocketSplash({ onLight = false }: { onLight?: boolean }) {
  return (
    <div
      className={`od-splash${onLight ? ' od-splash--light' : ''}`}
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
        <div className="od-splash__rocket">
          <img src="/optimise-rocket-logo-black.png" alt="" width={48} height={48} />
        </div>
      </div>
      <div className="od-splash__text">Loading</div>
    </div>
  )
}
