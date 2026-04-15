'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Injects viewport meta, PWA manifest, apple-touch-icon, and theme-color
 * into the document head. Payload CMS v3's admin layout doesn't include
 * these by default.
 */
const ViewportMeta: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname()

  useEffect(() => {
    // Viewport
    let meta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'viewport'
      document.head.appendChild(meta)
    }
    // Keep maximum-scale=1 permanently to prevent iOS auto-zoom on input
    // focus (inputs < 16px font-size). Pinch-zoom is not needed in the admin.
    meta.content = 'width=device-width, initial-scale=1, maximum-scale=1'
  }, [pathname])

  // PWA manifest, apple-touch-icon, theme-color — inject once
  useEffect(() => {
    // Manifest
    if (!document.querySelector('link[rel="manifest"]')) {
      const link = document.createElement('link')
      link.rel = 'manifest'
      link.href = '/manifest.json'
      document.head.appendChild(link)
    }

    // Apple touch icon
    if (!document.querySelector('link[rel="apple-touch-icon"]')) {
      const link = document.createElement('link')
      link.rel = 'apple-touch-icon'
      link.setAttribute('sizes', '180x180')
      link.href = '/apple-touch-icon.png'
      document.head.appendChild(link)
    }

    // Theme color
    if (!document.querySelector('meta[name="theme-color"]')) {
      const meta = document.createElement('meta')
      meta.name = 'theme-color'
      meta.content = '#1a1a2e'
      document.head.appendChild(meta)
    }

    // Mobile web app capable (iOS)
    if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
      const meta = document.createElement('meta')
      meta.name = 'apple-mobile-web-app-capable'
      meta.content = 'yes'
      document.head.appendChild(meta)
    }

    if (!document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')) {
      const meta = document.createElement('meta')
      meta.name = 'apple-mobile-web-app-status-bar-style'
      meta.content = 'black-translucent'
      document.head.appendChild(meta)
    }
  }, [])

  return children
}

export default ViewportMeta
