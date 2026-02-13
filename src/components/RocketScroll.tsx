'use client'

import { useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'

export default function RocketScroll({ children }: { children: React.ReactNode }) {
  const hasScrolled = useRef(false)

  const scrollToNextSlide = useCallback(() => {
    const slides = Array.from(document.querySelectorAll<HTMLElement>('.slide'))
    if (slides.length === 0) return

    const currentScroll = window.scrollY
    const viewportHeight = window.innerHeight

    // Find the next slide upward — the one whose top is above the current viewport top
    // Slides are in reverse DOM order (slide-18 first), so we iterate forward
    // looking for the last slide whose top is above our current scroll position
    let target: HTMLElement | null = null
    for (const slide of slides) {
      const slideTop = slide.offsetTop
      // A slide is "above" if its top is at least 10px above the current scroll position
      if (slideTop < currentScroll - 10) {
        target = slide
      }
    }

    // If we're already near the very top of the first slide in DOM, wrap to bottom
    if (!target) {
      // Scroll to the very bottom (last slide visually)
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })
      return
    }

    // Scroll so the target slide's top aligns with the viewport top
    window.scrollTo({ top: target.offsetTop, behavior: 'smooth' })
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
      </div>
      <div className="flame-trail" aria-hidden="true" />
    </>
  )
}
