/**
 * Closing slide — final v2 deck section. Dynamic.
 *
 * - "For" shows the business name only (no URL), clickable through to the
 *   client's website when a URL is present.
 * - Optimise Digital white logo sits top-left, linking to optimisedigital.online.
 * - Space station hero top-right.
 * - H1 font-size overridden in CSS to 70 % of the original.
 * - Download PDF button mounted client-side at 50 % opacity → 100 % on hover.
 */

import Image from 'next/image'
import type { ReactElement } from 'react'

const OD_URL =
  'https://optimisedigital.online?utm_source=direct&utm_medium=proposal-preso'

export function ClosingSlide({
  businessName,
  websiteUrl,
}: {
  businessName: string
  websiteUrl: string | null
}): ReactElement {
  const clientHref = websiteUrl
    ? websiteUrl.startsWith('http')
      ? websiteUrl
      : `https://${websiteUrl}`
    : null

  const forNode = clientHref ? (
    <a
      href={clientHref}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: 'inherit', textDecoration: 'none' }}
    >
      {businessName}
    </a>
  ) : (
    <>{businessName}</>
  )

  return (
    <section className="slide dark closing" data-label="27 Closing">
      <div className="starfield" id="sf-close" aria-hidden="true" />
      <div
        className="orbit-deco"
        style={{ width: 1600, height: 1600, right: -700, bottom: -600 }}
      />
      <div
        className="orbit-deco"
        style={{
          width: 1100,
          height: 1100,
          right: -400,
          bottom: -300,
          borderColor: 'rgba(77,148,255,0.1)',
        }}
      />

      {/* Space station hero — mirrors the OLD .slide-18-station recipe. */}
      <div className="closing-station" aria-hidden="true">
        <img src="/slides/Space-station-optimise-digital.png" alt="" />
      </div>

      {/* Optimise Digital white logo — links to OD website. */}
      <a
        href={OD_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="closing-od-logo"
        aria-label="Visit Optimise Digital"
      >
        <Image
          src="/optimise-digital-logo-white.webp"
          alt="Optimise Digital"
          width={291}
          height={42}
          style={{ height: 42, width: 'auto' }}
        />
      </a>

      <div className="h1">
        Built to reach
        <br />
        <em>growth orbit</em>
      </div>

      <div className="who">
        <div className="col">
          <div className="lbl">For</div>
          <div className="val">{forNode}</div>
        </div>
        <div className="col">
          <div className="lbl">Presented by</div>
          <div className="val">Adam Telhiwac and Peter Tu</div>
        </div>
        <div className="col">
          <div className="lbl">Next</div>
          <div className="val" style={{ color: 'var(--purple)' }}>
            Reply to confirm proposal →
          </div>
        </div>
      </div>
    </section>
  )
}
