'use client'

import { useEffect, useRef } from 'react'

/**
 * Scales each 1920×1080 slide to fit the viewport width. The artifact was
 * authored for a fixed 1920×1080 canvas; we preserve that geometry
 * pixel-for-pixel and just scale the whole thing down to fit the user's
 * window width.
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
      // Fit each 1920×1080 slide to BOTH the viewport's width and height —
      // whichever dimension is the tighter constraint wins. We intentionally
      // do NOT cap the scale at 1 because on viewports larger than 1920×1080
      // (most modern monitors when the browser is maximised) the slide would
      // otherwise stay at native size and leave a white/dark band above and
      // below — the rocket-button would then skip a chunk of empty space
      // before reaching the next slide. The artwork is built from large
      // typography + SVG primitives so it scales up cleanly.
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
