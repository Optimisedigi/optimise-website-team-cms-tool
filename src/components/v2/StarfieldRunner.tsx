'use client'

import { useEffect } from 'react'

/**
 * Walks the DOM for all `.starfield` elements and populates each with the
 * same random-star markup as the artifact's inline <script>. Mirrors the
 * `makeStarfield()` function from the standalone HTML so the visual is
 * pixel-identical.
 *
 * Render once at the top of the deck — it will pick up every starfield
 * regardless of which slide it lives in.
 */
export function StarfieldRunner({ count = 70 }: { count?: number }): null {
  useEffect(() => {
    // 1920x1080 design coordinates — the deck-stage wrapper scales these
    // along with everything else.
    const w = 1920
    const h = 1080

    const fields = document.querySelectorAll<HTMLElement>('.proposal-v2 .starfield')
    fields.forEach((el) => {
      // Skip if already populated (HMR / re-render guard).
      if (el.childElementCount > 0) return
      const stars: string[] = []
      for (let i = 0; i < count; i++) {
        const x = Math.random() * w
        const y = Math.random() * h
        const isSmall = Math.random() < 0.85
        const size = isSmall ? Math.random() * 1.6 + 0.4 : Math.random() * 2.4 + 1.6
        const opacity = (Math.random() * 0.6 + 0.4).toFixed(2)
        stars.push(
          `<div class="star" style="left:${x}px;top:${y}px;width:${size}px;height:${size}px;opacity:${opacity};"></div>`,
        )
      }
      el.innerHTML = stars.join('')
    })
  }, [count])

  return null
}
