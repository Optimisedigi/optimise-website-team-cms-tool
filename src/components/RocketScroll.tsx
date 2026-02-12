'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'

export default function RocketScroll({ children }: { children: React.ReactNode }) {
  const hasScrolled = useRef(false)

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

      {/* Rocket + flame — decorative only */}
      <div className="rocket-fixed" aria-hidden="true">
        <Image
          src="/optimise-digital-rocket.png"
          alt=""
          width={56}
          height={96}
          className="rocket-img"
          priority
        />
        <div className="rocket-flame" />
      </div>
      <div className="flame-trail" aria-hidden="true" />
    </>
  )
}
