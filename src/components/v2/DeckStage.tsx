'use client'

import { useEffect, useRef } from 'react'

/**
 * Scales each 1920×1080 slide to fit the viewport. The artifact was
 * authored for a fixed 1920×1080 canvas; we preserve that geometry
 * pixel-for-pixel and fit the whole thing inside the user's window.
 *
 * Dispatches 'deck-ready' once after the first measurement so
 * <RocketScroll> knows when it is safe to snap to the bottom.
 */
export function DeckStage({ children }: { children: React.ReactNode }): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let activeSlot: HTMLElement | null = null

    function isSlotPreview(): boolean {
      return Boolean(el?.closest('.proposal-v2--slot-preview'))
    }

    function prepareSlotPreview(): void {
      const root = el?.closest('.proposal-v2--slot-preview')
      if (!el || !root || el.dataset.slotPreviewReady === 'true') return

      const slides = Array.from(el.querySelectorAll<HTMLElement>('.slide'))
      for (const slide of slides) {
        if (slide.parentElement?.classList.contains('proposal-slide-slot')) continue
        const slot = document.createElement('div')
        slot.className = 'proposal-slide-slot'
        slide.parentNode?.insertBefore(slot, slide)
        slot.appendChild(slide)
      }

      el.dataset.slotPreviewReady = 'true'
    }

    function getCurrentSlotAnchor(): HTMLElement | null {
      if (!el || !isSlotPreview()) return null
      const slots = Array.from(el.querySelectorAll<HTMLElement>('.proposal-slide-slot'))
      if (slots.length === 0) return null

      const viewportMidpoint = window.innerHeight / 2
      const containingSlot = slots.find((slot) => {
        const rect = slot.getBoundingClientRect()
        return rect.top <= viewportMidpoint && rect.bottom >= viewportMidpoint
      })
      if (containingSlot) return containingSlot

      return slots
        .map((slot) => {
          const rect = slot.getBoundingClientRect()
          return {
            slot,
            distance: Math.abs((rect.top + rect.bottom) / 2 - viewportMidpoint),
          }
        })
        .sort((a, b) => a.distance - b.distance)[0]
        ?.slot ?? null
    }

    function updateActiveSlot(): void {
      activeSlot = getCurrentSlotAnchor() ?? activeSlot
    }

    function restoreSlotAnchor(slot: HTMLElement): void {
      const top = slot.getBoundingClientRect().top + window.scrollY
      window.scrollTo({ top, behavior: 'instant' as ScrollBehavior })
    }

    function update(initial = false): void {
      if (!el) return
      const slotAnchor = initial ? null : activeSlot
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
      if (initial) prepareSlotPreview()
      if (slotAnchor) requestAnimationFrame(() => {
        restoreSlotAnchor(slotAnchor)
        updateActiveSlot()
      })
      if (initial) window.dispatchEvent(new CustomEvent('deck-ready'))
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => update(true))
    })

    const onResize = (): void => update(false)
    window.addEventListener('scroll', updateActiveSlot, { passive: true })
    window.addEventListener('resize', onResize)
    requestAnimationFrame(updateActiveSlot)
    return () => {
      window.removeEventListener('scroll', updateActiveSlot)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <div ref={ref} className="deck-stage-wrap">
      {children}
    </div>
  )
}
