'use client'

import { useEffect } from 'react'

/**
 * Owns the rocket scroll-follower state on the Away Digital deck.
 *
 * The deck is column-reverse: slide 1 (cover) sits at the BOTTOM of the
 * document, the closing slide sits at the TOP. The user scrolls UP through
 * the deck. CSS reads two custom properties on <html>:
 *
 *   --scroll-progress: 0 at the bottom (cover), 1 at the top (end)
 *   --scroll-from-end: pixel distance to the TOP of the document
 *
 * It also:
 *   - Updates the progress-bar width
 *   - Hides the rocket hint once the user moves off the cover
 *   - On mount, jumps the user to the bottom so the cover is in view first
 *   - Wires up rocket / flame-trail / rocket-hint click → next slide
 *
 * Lifted from the inline scripts in
 * website-growth-tools/output/away-digital-audit-may-2026.html.
 */
export default function DeckScrollEffects() {
  useEffect(() => {
    const SCROLL_OFFSET = 16
    const doc = document.documentElement
    const previousScrollBehavior = doc.style.scrollBehavior
    const previousScrollSnapType = doc.style.scrollSnapType
    const previousScrollRestoration = 'scrollRestoration' in history ? history.scrollRestoration : undefined

    // Document-level scroll behavior belongs to the standalone deck only. It
    // must not live in template.css, because that stylesheet is bundled by Next
    // and otherwise turns every CMS admin section into a scroll-snap target.
    doc.style.scrollBehavior = 'smooth'
    doc.style.scrollSnapType = 'y proximity'

    const measureLastSlideHeight = (): number => {
      // Deck is column-reverse, user scrolls UP. The slides at the TOP of the
      // document are the last ones the user reaches. We want the rocket to
      // fade to 0 opacity by the time the 3rd-last slide (closing, "Ready to
      // discuss") enters view, so sum the heights of the three slides at the
      // top: appendix (detail), appendix-cover, closing — plus the
      // space-transition divider between closing and the rest of the deck.
      const ids = ['appendix', 'appendix-cover', 'closing']
      let total = 0
      for (const id of ids) {
        const el = document.getElementById(id)
        if (el) total += el.getBoundingClientRect().height
      }
      const transition = document.getElementById('space-transition')
      if (transition) total += transition.getBoundingClientRect().height
      return total || 900
    }

    const updateRocketScroll = () => {
      const scrollTop = window.scrollY || doc.scrollTop
      const scrollHeight = document.body.scrollHeight - window.innerHeight || 1
      const progress = 1 - Math.min(1, Math.max(0, scrollTop / scrollHeight))
      doc.style.setProperty('--scroll-progress', String(progress))
      doc.style.setProperty('--scroll-from-end', String(Math.max(0, scrollTop)))
      const pb = document.getElementById('progress-bar')
      if (pb) pb.style.width = progress * 100 + '%'
      const hint = document.getElementById('rocket-hint')
      if (hint) (hint as HTMLElement).hidden = progress > 0.02
    }

    const setLastSlideHeightVar = () => {
      document.documentElement.style.setProperty(
        '--last-slide-height',
        String(measureLastSlideHeight()),
      )
    }

    const onResize = () => {
      setLastSlideHeightVar()
      updateRocketScroll()
    }

    const scrollToNextSlide = () => {
      // Deck is column-reverse: "next slide" means scroll UPWARD because the
      // cover sits at the bottom of the document.
      const slides = Array.from(document.querySelectorAll('main > section'))
      if (!slides.length) return
      const currentScroll = window.scrollY
      const targets = slides
        .map((s) => Math.round(s.getBoundingClientRect().top + window.scrollY))
        .sort((a, b) => a - b)
      let nextScrollTo: number | null = null
      for (const t of targets) {
        if (t < currentScroll - 50) nextScrollTo = t
        else break
      }
      if (nextScrollTo === null) {
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: 'smooth',
        })
        return
      }
      window.scrollTo({
        top: Math.max(0, nextScrollTo - SCROLL_OFFSET),
        behavior: 'smooth',
      })
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        scrollToNextSlide()
      }
    }

    // Disable the browser's automatic scroll restoration so refresh always
    // lands on the cover (visual bottom), not wherever the user was before.
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual'
    }

    setLastSlideHeightVar()
    // Jump to the bottom so the cover is in view on first load. 'instant' so
    // the user never sees the closing slide flash by.
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: 'instant',
    })
    updateRocketScroll()

    window.addEventListener('scroll', updateRocketScroll, { passive: true })
    window.addEventListener('resize', onResize, { passive: true })

    const clickIds = ['rocket-fixed', 'flame-trail-hit', 'rocket-hint']
    const cleanups: Array<() => void> = []
    for (const id of clickIds) {
      const el = document.getElementById(id)
      if (!el) continue
      el.addEventListener('click', scrollToNextSlide)
      el.addEventListener('keydown', onKeyDown as EventListener)
      cleanups.push(() => {
        el.removeEventListener('click', scrollToNextSlide)
        el.removeEventListener('keydown', onKeyDown as EventListener)
      })
    }

    return () => {
      window.removeEventListener('scroll', updateRocketScroll)
      window.removeEventListener('resize', onResize)
      for (const c of cleanups) c()
      doc.style.scrollBehavior = previousScrollBehavior
      doc.style.scrollSnapType = previousScrollSnapType
      if (previousScrollRestoration !== undefined) history.scrollRestoration = previousScrollRestoration
    }
  }, [])

  return null
}
