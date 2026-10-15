'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Renders one email's HTML the way Gmail does, inside a locked-down iframe.
 *
 * Security: `sandbox` deliberately omits `allow-scripts`, so nothing in the
 * email can run, and the document carries its own CSP (see
 * src/lib/mail/email-html.ts). `allow-same-origin` is only there so this
 * component can measure the height and fix up links; without `allow-scripts`
 * the email itself still cannot execute anything. Links open in a new tab with
 * no opener or referrer.
 */
export default function EmailBody({ html, title }: { html: string; title: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const [height, setHeight] = useState(200)

  const fit = useCallback(() => {
    const doc = frameRef.current?.contentDocument
    if (!doc?.documentElement) return
    setHeight(Math.max(60, Math.ceil(doc.documentElement.scrollHeight) + 4))
  }, [])

  const onLoad = useCallback(() => {
    const doc = frameRef.current?.contentDocument
    if (!doc) return
    doc.querySelectorAll('a[href]').forEach((anchor) => {
      anchor.setAttribute('target', '_blank')
      anchor.setAttribute('rel', 'noopener noreferrer')
    })
    fit()
    // Images and fonts load after the document; refit whenever the body resizes.
    observerRef.current?.disconnect()
    if (doc.body && typeof ResizeObserver !== 'undefined') {
      observerRef.current = new ResizeObserver(fit)
      observerRef.current.observe(doc.body)
    }
  }, [fit])

  useEffect(() => () => observerRef.current?.disconnect(), [])

  return (
    <iframe
      ref={frameRef}
      title={title}
      srcDoc={html}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      onLoad={onLoad}
      style={{ width: '100%', height, border: 0, display: 'block', background: '#fff', borderRadius: 4 }}
    />
  )
}
