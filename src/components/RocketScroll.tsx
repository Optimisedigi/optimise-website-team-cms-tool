'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import Image from 'next/image'

export default function RocketScroll({ children }: { children: React.ReactNode }) {
  const hasScrolled = useRef(false)
  const [showHint, setShowHint] = useState(true)

  const scrollToNextSlide = useCallback(() => {
    const slides = Array.from(document.querySelectorAll<HTMLElement>('.slide'))
    if (slides.length === 0) return

    const currentScroll = window.scrollY

    // Slides are in reverse DOM order (highest slide number first at top of page).
    // "Next slide" means scrolling UP (decreasing scrollY) = going forward in DOM order.
    // We need the first slide whose scroll target (header or top) is meaningfully
    // above (< currentScroll - threshold) the current position.
    // Iterate forward (top-of-page to bottom) and find the LAST one that qualifies —
    // that's the one immediately above the current viewport.

    // Build a list of scroll targets (header position for each slide)
    const targets: { slide: HTMLElement; scrollTo: number }[] = []
    for (const slide of slides) {
      const header = slide.querySelector<HTMLElement>('.slide-header')
      const el = header ?? slide
      const pos = el.getBoundingClientRect().top + window.scrollY
      targets.push({ slide, scrollTo: pos })
    }

    // Find the last target that is at least 30px above the current scroll position
    let nextTarget: { slide: HTMLElement; scrollTo: number } | null = null
    for (const t of targets) {
      if (t.scrollTo < currentScroll - 30) {
        nextTarget = t
      }
    }

    // If nothing is above, wrap to the very bottom (first slide visually)
    if (!nextTarget) {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })
      return
    }

    window.scrollTo({ top: nextTarget.scrollTo, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    // Wait one frame for layout to settle, then scroll to bottom
    requestAnimationFrame(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' as ScrollBehavior })
      hasScrolled.current = true
      document.documentElement.classList.add('scroll-ready')
    })

    function onScroll() {
      const doc = document.documentElement
      const scrollTop = doc.scrollTop
      const scrollHeight = doc.scrollHeight - doc.clientHeight
      if (scrollHeight <= 0) {
        doc.style.setProperty('--scroll-progress', '0')
        return
      }
      // 0 = bottom (start), 1 = top (end)
      const progress = 1 - scrollTop / scrollHeight
      doc.style.setProperty('--scroll-progress', String(Math.min(1, Math.max(0, progress))))

      // Hide the hint after the user scrolls away from the first slide
      if (progress > 0.02) {
        setShowHint(false)
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()

    return () => {
      window.removeEventListener('scroll', onScroll)
      document.documentElement.classList.remove('scroll-ready')
      document.documentElement.style.removeProperty('--scroll-progress')
    }
  }, [])

  return (
    <>
      {children}

      {/* Rocket — click to jump to next slide */}
      <div
        className="rocket-fixed"
        onClick={scrollToNextSlide}
        role="button"
        tabIndex={0}
        aria-label="Go to next slide"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') scrollToNextSlide() }}
      >
        <Image
          src="/slides/optimise-digital-rocket.png"
          alt=""
          width={56}
          height={96}
          className="rocket-img"
          priority
        />
        <div className="rocket-flame" aria-hidden="true" />
      </div>
      <div className="flame-trail" aria-hidden="true" />

      {/* Scroll hint — to the left of the rocket, first slide only */}
      {showHint && (
        <div className="rocket-hint" aria-hidden="true" onClick={scrollToNextSlide}>
          <span className="rocket-hint-text">Click here to start</span>
          <span className="rocket-hint-arrow">→</span>
        </div>
      )}
    </>
  )
}
