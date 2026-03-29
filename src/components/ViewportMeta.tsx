'use client'

import { useEffect } from 'react'

/**
 * Injects a <meta name="viewport"> tag into the document head.
 * Payload CMS v3's admin layout doesn't include one by default,
 * which causes the admin panel (including login) to render at
 * desktop width on mobile devices.
 */
const ViewportMeta: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    if (document.querySelector('meta[name="viewport"]')) return

    const meta = document.createElement('meta')
    meta.name = 'viewport'
    meta.content = 'width=device-width, initial-scale=1'
    document.head.appendChild(meta)

    return () => {
      meta.remove()
    }
  }, [])

  return children
}

export default ViewportMeta
