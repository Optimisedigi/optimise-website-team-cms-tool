'use client'

import { useRouter } from 'next/navigation'
import { useNav, useAuth } from '@payloadcms/ui'

const MINI_WIDTH = 48
const BG = '#1a1a2e'

const icons = [
  {
    label: 'Dashboard',
    href: '/admin',
    svg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    label: 'Clients',
    href: '/admin/collections/clients',
    svg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    label: 'Proposals',
    href: '/admin/collections/client-proposals',
    svg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    label: 'Blog Posts',
    href: '/admin/collections/blog-posts',
    svg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
  },
  {
    label: 'Search Console',
    href: '/admin/performance/search-console',
    svg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
]

const CollapseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <line x1="9" y1="3" x2="9" y2="21" />
  </svg>
)

const MiniSidebar = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter()
  const { navOpen, setNavOpen } = useNav()
  const { user } = useAuth()

  const toggleNav = () => setNavOpen(!navOpen)

  // Hide sidebar entirely when not logged in (login, create-first-user, etc.)
  const isLoggedIn = !!user

  return (
    <>
      {/* Mini sidebar strip — visible when full nav is collapsed and user is logged in */}
      {isLoggedIn && !navOpen && (
        <div
          className="mini-sidebar"
          onClick={toggleNav}
          title="Open sidebar"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: MINI_WIDTH,
            height: '100vh',
            background: BG,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            zIndex: 100,
            borderRight: '1px solid rgba(255, 255, 255, 0.08)',
            cursor: 'pointer',
          }}
        >
          {/* Rocket logo */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); router.push('/admin') }}
            title="Dashboard"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '12px 0 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img
              src="/optimise-digital-rocket.png"
              alt="Home"
              style={{ width: 28, height: 28, objectFit: 'contain' }}
            />
          </button>

          {/* Divider */}
          <div style={{ width: 24, height: 1, background: 'rgba(255,255,255,0.12)', marginBottom: 8 }} />

          {/* Nav icons */}
          {icons.map((item) => (
            <button
              key={item.href}
              type="button"
              onClick={(e) => { e.stopPropagation(); router.push(item.href) }}
              title={item.label}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'rgba(255, 255, 255, 0.55)',
                padding: '10px 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color 150ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#fff' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255, 255, 255, 0.55)' }}
            >
              {item.svg}
            </button>
          ))}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Expand toggle */}
          <button
            type="button"
            title="Open sidebar"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'rgba(255, 255, 255, 0.45)',
              padding: '14px 0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#fff' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255, 255, 255, 0.45)' }}
          >
            <CollapseIcon />
          </button>
        </div>
      )}

      {/* Collapse button at bottom-right of full sidebar — visible when nav is open and logged in */}
      {isLoggedIn && navOpen && (
        <button
          type="button"
          title="Collapse sidebar"
          onClick={toggleNav}
          className="mini-sidebar-collapse-btn"
          style={{
            position: 'fixed',
            bottom: 16,
            left: 'calc(var(--nav-width, 275px) - 48px)',
            zIndex: 10000,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'rgba(255, 255, 255, 0.45)',
            padding: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 150ms',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#fff' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255, 255, 255, 0.45)' }}
        >
          <CollapseIcon />
        </button>
      )}

      {children}
    </>
  )
}

export default MiniSidebar
