'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const GscDashboardNavLink = () => {
  const pathname = usePathname()
  const isActive = pathname === '/admin/gsc-dashboard'

  return (
    <div
      style={{
        padding: '0 16px',
        marginTop: 4,
      }}
    >
      <Link
        href="/admin/gsc-dashboard"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderRadius: 6,
          textDecoration: 'none',
          fontSize: 13,
          fontWeight: 500,
          color: isActive ? '#fff' : 'rgba(255, 255, 255, 0.7)',
          background: isActive ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
          transition: 'color 150ms, background 150ms',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18" />
          <path d="M18 17V9" />
          <path d="M13 17V5" />
          <path d="M8 17v-3" />
        </svg>
        GSC Dashboard
      </Link>
    </div>
  )
}

export default GscDashboardNavLink
