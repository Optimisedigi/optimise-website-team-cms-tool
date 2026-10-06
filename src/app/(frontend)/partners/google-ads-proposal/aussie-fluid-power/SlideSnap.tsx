'use client'

import { useEffect } from 'react'

/**
 * Keeps the AFP deck resting on a single slide when the window is resized.
 *
 * Slides live in full-viewport `.afp-slot` containers whose height tracks
 * `100vh`, so a window resize shifts every scroll-snap boundary and the
 * preserved scroll offset can end up mid-slot (showing two slides). This
 * re-aligns to the nearest slot once the resize settles, so the current
 * slide centres in the window and the next slide is never visible.
 */
export function SlideSnap(): null {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null

    const onResize = (): void => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        const slots = Array.from(document.querySelectorAll<HTMLElement>('.afp-slot'))
        if (slots.length === 0) return
        const viewportMidpoint = window.innerHeight / 2
        const nearest = slots
          .map((slot) => {
            const rect = slot.getBoundingClientRect()
            return { slot, distance: Math.abs(rect.top + rect.height / 2 - viewportMidpoint) }
          })
          .sort((a, b) => a.distance - b.distance)[0]
        if (!nearest) return
        const top = nearest.slot.getBoundingClientRect().top + window.scrollY
        window.scrollTo({ top, behavior: 'instant' as ScrollBehavior })
      }, 120)
    }

    window.addEventListener('resize', onResize)
    return () => {
      if (timer) clearTimeout(timer)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return null
}
