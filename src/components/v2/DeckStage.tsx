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
    const stage = el

    function getCurrentSlideAnchor(): { slide: HTMLElement; offsetRatio: number } | null {
      const slides = Array.from(stage.querySelectorAll<HTMLElement>('.slide'))
      if (slides.length === 0) return null

      const viewportMidpoint = window.scrollY + window.innerHeight / 2
      const positionedSlides = slides
        .map((slide) => ({
          slide,
          top: slide.getBoundingClientRect().top + window.scrollY,
        }))
        .sort((a, b) => a.top - b.top)

      for (let i = 0; i < positionedSlides.length; i++) {
        const current = positionedSlides[i]
        const next = positionedSlides[i + 1]
        const bottom = next?.top ?? current.top + window.innerHeight
        if (viewportMidpoint >= current.top && viewportMidpoint < bottom) {
          const slotHeight = Math.max(1, bottom - current.top)
          return {
            slide: current.slide,
            offsetRatio: Math.min(1, Math.max(0, (window.scrollY - current.top) / slotHeight)),
          }
        }
      }

      const fallback = positionedSlides[positionedSlides.length - 1]
      return fallback ? { slide: fallback.slide, offsetRatio: 0 } : null
    }

    function restoreSlideAnchor(anchor: { slide: HTMLElement; offsetRatio: number }): void {
      const slideTop = anchor.slide.getBoundingClientRect().top + window.scrollY
      const nextSlide = Array.from(stage.querySelectorAll<HTMLElement>('.slide'))
        .map((slide) => ({
          slide,
          top: slide.getBoundingClientRect().top + window.scrollY,
        }))
        .filter(({ top }) => top > slideTop + 1)
        .sort((a, b) => a.top - b.top)[0]
      const slotHeight = Math.max(1, (nextSlide?.top ?? slideTop + window.innerHeight) - slideTop)
      window.scrollTo({ top: slideTop + slotHeight * anchor.offsetRatio, behavior: 'instant' })
    }

    function update(initial = false): void {
      if (!el) return
      const anchor = initial ? null : getCurrentSlideAnchor()
      // Fit the whole 1920×1080 slide inside the viewport, then let CSS make
      // the slide's scroll slot at least viewport-tall. This keeps all content
      // and the slide number inside the current slide without exposing the next
      // slide on taller/narrower browser windows.
      const scaleByWidth = window.innerWidth / 1920
      const scaleByHeight = window.innerHeight / 1080
      const scale = Math.min(scaleByWidth, scaleByHeight)
      el.style.setProperty('--deck-scale', String(scale))
      if (anchor) requestAnimationFrame(() => restoreSlideAnchor(anchor))
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
