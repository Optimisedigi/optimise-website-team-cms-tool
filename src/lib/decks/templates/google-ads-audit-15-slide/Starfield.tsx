'use client'

import { useEffect, useRef } from 'react'

/**
 * Paints a fixed starfield of ~90 randomly placed stars inside the parent's
 * <div className="starfield">. Re-paints on resize (debounced). Lifted from
 * the source HTML's inline scripts for #cover-starfield and #closing-starfield.
 */
export default function Starfield({ id }: { id: string }) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let timer: ReturnType<typeof setTimeout> | null = null

    const paint = () => {
      const rect = el.getBoundingClientRect()
      const w = rect.width || window.innerWidth
      const h = rect.height || window.innerHeight
      const count = 90
      const out: string[] = []
      for (let i = 0; i < count; i++) {
        const x = Math.random() * w
        const y = Math.random() * h
        const isSmall = Math.random() < 0.85
        const size = isSmall ? Math.random() * 1.6 + 0.4 : Math.random() * 2.4 + 1.6
        const opacity = (Math.random() * 0.6 + 0.4).toFixed(2)
        out.push(
          `<div class="star" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;width:${size.toFixed(2)}px;height:${size.toFixed(2)}px;opacity:${opacity};"></div>`,
        )
      }
      el.innerHTML = out.join('')
    }

    paint()

    const onResize = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(paint, 250)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (timer) clearTimeout(timer)
    }
  }, [])

  return <div id={id} ref={ref} className="starfield" aria-hidden="true" />
}
