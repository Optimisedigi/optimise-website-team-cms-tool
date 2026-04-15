'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Injects a <meta name="viewport"> tag into the document head.
 * Payload CMS v3's admin layout doesn't include one by default,
 * which causes the admin panel (including login) to render at
 * desktop width on mobile devices.
 *
 * Also resets any pinch-zoom on route changes so the page always
 * fits the mobile viewport after navigating (e.g. after login).
 */
const ViewportMeta: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname()

  useEffect(() => {
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

  return children
}

export default ViewportMeta
