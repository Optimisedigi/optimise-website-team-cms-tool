'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import Image from 'next/image'

export default function RocketScroll({ children }: { children: React.ReactNode }) {
  const hasScrolled = useRef(false)
  const [showHint, setShowHint] = useState(false)

  const scrollToNextSlide = useCallback(() => {
    const slides = Array.from(document.querySelectorAll<HTMLElement>('.slide'))
    if (slides.length === 0) return

    const currentScroll = window.scrollY
    const isV2 = document.querySelector('.proposal-v2') !== null

    // Build a list of scroll targets by VISUAL position. Each target is the
    // exact pixel offset where, after window.scrollTo(top), the slide's top
    // sits at the very top of the viewport.
    const targets: number[] = []
    for (const slide of slides) {
      let el: HTMLElement = slide
      if (!isV2) {
        // OLD deck: target the slide header so the chapter eyebrow sits at the top.
        const header =
          slide.querySelector<HTMLElement>('.slide-header') ??
          slide.querySelector<HTMLElement>('.slide-head')
        if (header) el = header
      }
      // getBoundingClientRect().top is the visual top relative to the viewport.
      // Add current scroll position to get the absolute document offset —
      // scrolling to this value puts the slide's top edge at scrollY=0 in view.
      targets.push(Math.round(el.getBoundingClientRect().top + window.scrollY))
    }

    // Sort ascending so we can pick the largest target still above current.
    targets.sort((a, b) => a - b)

    // Find the closest target that is meaningfully above where we are now.
    // 50px tolerance so a click while "close enough" to a top still advances.
    let nextScrollTo: number | null = null
    for (const pos of targets) {
      if (pos < currentScroll - 50) {
        nextScrollTo = pos
      } else {
        break
      }
    }

    // Nothing above — wrap back to the very bottom (Slide 01) so the user
    // can restart the deck.
    if (nextScrollTo === null) {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: 'smooth',
      })
      return
    }

    window.scrollTo({ top: nextScrollTo, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    const isV2InitOnly = document.querySelector('.proposal-v2') !== null

    function scrollToBottom(): void {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' as ScrollBehavior })
      hasScrolled.current = true
      document.documentElement.classList.add('scroll-ready')
    }

    if (isV2InitOnly) {
      // Wait for DeckStage to set --slide-height before scrolling to bottom,
      // otherwise we land at the wrong position (before slides settle).
      window.addEventListener('deck-ready', scrollToBottom, { once: true })
    } else {
      requestAnimationFrame(scrollToBottom)
    }

    // For the v2 deck: stamp an inverted slide number into each slide's
    // existing .slide-foot. DOM order is reversed (column-reverse), so the
    // LAST .slide in DOM order is visual slide 1 (cover). We want numbering
    // 1, 2, 3... from cover upwards, but hide it on the cover itself.
    const isV2 = document.querySelector('.proposal-v2') !== null
    if (isV2) {
      const v2Slides = Array.from(document.querySelectorAll<HTMLElement>('.proposal-v2 .slide'))
      const total = v2Slides.length
      // DOM order is reversed (flex column-reverse). The cover is DOM index 0
      // but visually appears at the BOTTOM — we want that to be slide 1, and
      // numbering counts upward as you scroll up. So visual number = i + 1.
      for (let i = 0; i < total; i++) {
        const visualNumber = i + 1
        let foot = v2Slides[i].querySelector<HTMLElement>('.slide-foot')
        if (!foot) {
          // Section dividers and other slides without a footer get one
          // injected so every slide gets its page number.
          foot = document.createElement('div')
          foot.className = 'slide-foot'
          v2Slides[i].appendChild(foot)
        }
        if (visualNumber <= 1) {
          // Hide on the cover (visual slide 1).
          foot.textContent = ''
        } else {
          foot.textContent = `${visualNumber}/${total}`
        }
      }
    }

    // Measure the rendered (post-scale) height of the last slide so the
    // flame-trail fade threshold is exact regardless of viewport or scale.
    // The deck is column-reverse, so the last slide in DOM order is the
    // COVER (visual bottom). The FIRST slide in DOM order is the CLOSING
    // slide (visual top) — that's the one we want.
    function measureLastSlideHeight(): number {
      const firstSlide = document.querySelector<HTMLElement>('.proposal-v2 .slide')
      if (!firstSlide) return 900 // safe fallback
      return firstSlide.getBoundingClientRect().height
    }
    let lastSlideHeight = measureLastSlideHeight()
    document.documentElement.style.setProperty('--last-slide-height', String(lastSlideHeight))

    function onScroll() {
      const doc = document.documentElement
      const scrollTop = doc.scrollTop
      const scrollHeight = doc.scrollHeight - doc.clientHeight
      if (scrollHeight <= 0) {
        doc.style.setProperty('--scroll-progress', '0')
        doc.style.setProperty('--scroll-from-end', '0')
        return
      }
      // 0 = bottom (start), 1 = top (end)
      const progress = 1 - scrollTop / scrollHeight
      doc.style.setProperty('--scroll-progress', String(Math.min(1, Math.max(0, progress))))
      // Raw pixel distance from the end of the deck (the visual top). At
      // scrollTop = 0 the user is at the very end (closing slide top); the
      // closer to 0, the closer to "deck finished". Used by the rocket
      // shrink/fade rules so they trigger over a fixed pixel range rather
      // than a fractional percentage that varies with deck length.
      doc.style.setProperty('--scroll-from-end', String(scrollTop))

      // Hide the hint after the user scrolls away from the first slide
      if (progress > 0.02) {
        setShowHint(false)
      } else {
        setShowHint(true)
      }
    }

    // Re-measure on resize since DeckStage rescales the slides.
    const onResize = (): void => {
      lastSlideHeight = measureLastSlideHeight()
      document.documentElement.style.setProperty('--last-slide-height', String(lastSlideHeight))
    }
    window.addEventListener('resize', onResize, { passive: true })

    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      document.documentElement.classList.remove('scroll-ready')
      document.documentElement.style.removeProperty('--scroll-progress')
      document.documentElement.style.removeProperty('--scroll-from-end')
      document.documentElement.style.removeProperty('--last-slide-height')
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
      {/* Invisible click-zone along the flame trail column — same behaviour as
          clicking the rocket itself. Wider than the visible 4px trail so it's
          actually clickable. Sits behind the rocket (lower z-index) so the
          rocket's own click handler still wins inside the rocket's bounds. */}
      <div
        className="flame-trail-hit"
        onClick={scrollToNextSlide}
        role="button"
        tabIndex={0}
        aria-label="Go to next slide"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') scrollToNextSlide() }}
      />

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
