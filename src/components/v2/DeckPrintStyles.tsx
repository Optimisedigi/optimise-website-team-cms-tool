'use client'

import type { ReactElement } from 'react'

/**
 * Injects print-only CSS that makes the v2 deck export as one PDF page per
 * slide at the deck's native 1920×1080 aspect, rather than the browser's
 * default A4. Chrome respects the custom @page size and emits one page per
 * `.slide` element thanks to `break-after: page`.
 *
 * The deck is rendered with `flex-direction: column-reverse` for on-screen
 * vertical scroll (newest first), but Chrome's print engine walks DOM order,
 * so the printed output is in the correct narrative order (cover → closing).
 */
export function DeckPrintStyles(): ReactElement {
  return (
    <style
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: `
@media print {
  @page { size: 1920px 1080px; margin: 0; }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: var(--bg-night) !important;
  }
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  /* Disable the deck-scale transform for print so each slide prints at native 1920x1080. */
  .proposal-v2 .deck-stage-wrap {
    width: 1920px !important;
    display: block !important;
  }
  .proposal-v2 .deck-stage-wrap .slide {
    transform: none !important;
    margin: 0 !important;
    width: 1920px !important;
    height: 1080px !important;
    page-break-after: always !important;
    break-after: page !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
    box-shadow: none !important;
    overflow: hidden !important;
  }
  .proposal-v2 .deck-stage-wrap .slide:last-child {
    page-break-after: auto !important;
    break-after: auto !important;
  }
  [data-no-print="true"] { display: none !important; }
  .rocket-fixed, .rocket-hint, .flame-trail, .flame-trail-hit { display: none !important; }
  /* Transition strip between slides — not a slide itself, hide in print
     to avoid triggering an extra blank page. */
  .v2-space-transition { display: none !important; }
}
        `.trim(),
      }}
    />
  )
}
