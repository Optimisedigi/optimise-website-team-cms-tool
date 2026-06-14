'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useNav, useAuth } from '@payloadcms/ui'
import { userHasFeature, type FeatureSlug } from '../lib/access'

const MINI_WIDTH = 64
const BG = '#1a1a2e'

type MiniIcon = {
  label: string
  shortLabel: string
  href: string
  // Omit to show the entry for any logged-in user (used for nav links that
  // aren't feature-gated, e.g. Agent Approvals).
  feature?: FeatureSlug
  svg: React.ReactNode
}

const icons: MiniIcon[] = [
  {
    label: 'Dashboard',
    shortLabel: 'Home',
    href: '/admin',
    feature: 'nav:dashboard',
    svg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    label: 'Client Pulse',
    shortLabel: 'Pulse',
    href: '/admin/clients/pulse',
    feature: 'clients',
    svg: (
      // Pulse wave — mirrors the clientPulse icon in SidebarNavExtras.
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12h4l3 8 4-16 3 8h4" />
        <circle cx="12" cy="12" r="10" opacity="0.25" />
      </svg>
    ),
  },
  {
    label: 'Clients',
    shortLabel: 'Clients',
    href: '/admin/collections/clients',
    feature: 'clients',
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
    shortLabel: 'Props',
    href: '/admin/collections/client-proposals',
    feature: 'client-proposals',
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
    shortLabel: 'Content',
    href: '/admin/collections/blog-posts',
    feature: 'blog-posts',
    svg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
  },
  {
    label: 'Blog Prompter',
    shortLabel: 'Prompts',
    href: '/admin/blog/prompter',
    feature: 'blog-prompts',
    svg: (
      // Lightbulb — mirrors the #nav-blog-prompts icon in custom.scss.
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="9" y1="18" x2="15" y2="18" />
        <line x1="10" y1="22" x2="14" y2="22" />
        <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
      </svg>
    ),
  },
  {
    label: 'Google Ads',
    shortLabel: 'Google',
    href: '/admin/google-ads',
    feature: 'nav:google-ads',
    svg: (
      // Paper plane — mirrors the googleAds icon in SidebarNavExtras.
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="3 11 22 2 13 21 11 13 3 11" />
      </svg>
    ),
  },
  {
    label: 'Search Console',
    shortLabel: 'GSC',
    href: '/admin/performance/search-console',
    feature: 'nav:search-console',
    svg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    label: 'Agent Approvals',
    shortLabel: 'Agent',
    href: '/admin/agent-approvals',
    // No feature key — surfaced for any logged-in user, mirroring the
    // SidebarNavExtras pattern (the page itself does its own auth check).
    svg: (
      // Clipboard-with-check — mirrors the agentApprovals icon in SidebarNavExtras.
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3 8-8" />
        <path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" />
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
  const pathname = usePathname()
  const { navOpen, setNavOpen } = useNav()
  const { user } = useAuth()

  const toggleNav = () => setNavOpen(!navOpen)

  // Hide sidebar entirely when not logged in (login, create-first-user, etc.)
  const isLoggedIn = !!user
  // No `feature` means the item is visible to any logged-in user.
  const visibleIcons = icons.filter((item) => !item.feature || userHasFeature(user, item.feature))

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
              padding: '12px 0 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img
              src="/optimise-rocket-logo-white.webp"
              alt="Home"
              style={{ width: 30, height: 30, objectFit: 'contain' }}
            />
          </button>

          {/* Divider */}
          <div style={{ width: 30, height: 1, background: 'rgba(255,255,255,0.12)', marginBottom: 8 }} />

          {/* Nav icons */}
          <div className="mini-sidebar__rail">
            {visibleIcons.map((item) => {
              const isActive = item.href === '/admin'
                ? pathname === '/admin'
                : pathname?.startsWith(item.href)

              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); router.push(item.href) }}
                  title={item.label}
                  className={`mini-sidebar__item${isActive ? ' mini-sidebar__item--active' : ''}`}
                >
                  <span className="mini-sidebar__icon">{item.svg}</span>
                  <span className="mini-sidebar__label">{item.shortLabel}</span>
                </button>
              )
            })}
          </div>

          {/* Expand toggle — pinned to the bottom of the rail. */}
          <button
            type="button"
            title="Open sidebar"
            onClick={(e) => { e.stopPropagation(); toggleNav() }}
            className="mini-sidebar__expand"
            onMouseEnter={(e) => { e.currentTarget.style.color = '#fff' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255, 255, 255, 0.45)' }}
          >
            <CollapseIcon />
          </button>
        </div>
      )}

      {/* Collapse button inside full sidebar — visible when nav is open and logged in */}
      {isLoggedIn && navOpen && (
        <button
          type="button"
          title="Collapse sidebar"
          onClick={toggleNav}
          className="mini-sidebar-collapse-btn"
          style={{
            position: 'fixed',
            bottom: 12,
            left: 'min(calc(var(--nav-width, 275px) - 49px), calc(100vw - 49px))',
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
