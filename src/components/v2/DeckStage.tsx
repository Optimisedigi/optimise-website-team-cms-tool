'use client'

import { useEffect, useRef } from 'react'

/**
 * Scales each 1920×1080 slide to fit the viewport. The artifact was
 * authored for a fixed 1920×1080 canvas; we preserve that geometry
 * pixel-for-pixel and let CSS keep each slide's scroll slot at least one
 * viewport tall so alternate window sizes don't reveal the next slide.
 *
 * Dispatches 'deck-ready' once after the first measurement so
 * <RocketScroll> knows when it is safe to snap to the bottom.
 */
export function DeckStage({ children }: { children: React.ReactNode }): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    function update(initial = false): void {
      if (!el) return
      // Fit the whole 1920×1080 slide inside the viewport, then let CSS make
      // the slide's scroll slot at least viewport-tall. This keeps all content
      // and the slide number inside the current slide without exposing the next
      // slide on taller/narrower browser windows.
      const scaleByWidth = window.innerWidth / 1920
      const scaleByHeight = window.innerHeight / 1080
      const scale = Math.min(scaleByWidth, scaleByHeight)
      el.style.setProperty('--deck-scale', String(scale))
      if (initial) window.dispatchEvent(new CustomEvent('deck-ready'))
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => update(true))
    })

    const onResize = (): void => update(false)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <div ref={ref} className="deck-stage-wrap">
      {children}
    </div>
  )
}
