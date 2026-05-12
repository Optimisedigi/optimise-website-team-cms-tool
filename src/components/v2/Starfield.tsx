'use client'

import { useEffect, useRef } from 'react'

/**
 * Generates a random starfield (positioned absolutely) inside the wrapper.
 * Mirrors the inline `makeStarfield()` JS from the Claude design template,
 * but as a React client component so it works in our Next.js setup.
 *
 * Render this inside any dark slide that should have stars.
 */
export function Starfield({ count = 70 }: { count?: number }): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // 1920x1080 fixed deck stage — coordinates are in design pixels.
    const w = 1920
    const h = 1080

    const stars: string[] = []
    for (let i = 0; i < count; i++) {
      const x = Math.random() * w
      const y = Math.random() * h
      // 85% small stars (0.4–2.0px), 15% larger (1.6–4.0px) for variety.
      const isSmall = Math.random() < 0.85
      const size = isSmall ? Math.random() * 1.6 + 0.4 : Math.random() * 2.4 + 1.6
      const opacity = (Math.random() * 0.6 + 0.4).toFixed(2)
      stars.push(
        `<div class="star" style="left:${x}px;top:${y}px;width:${size}px;height:${size}px;opacity:${opacity};"></div>`,
      )
    }
    el.innerHTML = stars.join('')
  }, [count])

  return <div ref={ref} className="starfield" aria-hidden="true" />
}
