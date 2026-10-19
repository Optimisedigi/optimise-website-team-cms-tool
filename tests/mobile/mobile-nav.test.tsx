import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

const push = vi.fn()
const setNavOpen = vi.fn()
let pathname = '/admin/mail'

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}))
vi.mock('@payloadcms/ui', () => ({
  useNav: () => ({ navOpen: false, setNavOpen }),
  useAuth: () => ({ user: { id: 1, role: 'admin' } }),
}))
vi.mock('@/lib/access', () => ({ userHasFeature: () => true }))

import MiniSidebar, { isTabActive, pickMobileTabs, MOBILE_TAB_HREFS } from '@/components/MiniSidebar'

describe('mobile tab helpers', () => {
  it('keeps the configured order and skips missing entries', () => {
    const items = [{ href: '/admin/mail' }, { href: '/admin' }, { href: '/admin/other' }]
    expect(pickMobileTabs(items).map((i) => i.href)).toEqual(['/admin', '/admin/mail'])
    expect(MOBILE_TAB_HREFS.length).toBeLessThanOrEqual(4)
  })
  it('marks only the exact dashboard route active for /admin', () => {
    expect(isTabActive('/admin', '/admin')).toBe(true)
    expect(isTabActive('/admin', '/admin/mail')).toBe(false)
    expect(isTabActive('/admin/mail', '/admin/mail/x')).toBe(true)
  })
})

describe('MiniSidebar bottom tab bar', () => {
  beforeEach(() => {
    push.mockReset()
    setNavOpen.mockReset()
    pathname = '/admin/mail'
  })
  it('renders tabs, highlights the current one and navigates on tap', () => {
    render(<MiniSidebar><div /></MiniSidebar>)
    const bar = screen.getByTestId('mobile-tabbar')
    expect(bar).toBeInTheDocument()
    expect(within(bar).getByRole('button', { name: 'Mail' }).getAttribute('aria-current')).toBe('page')
    fireEvent.click(within(bar).getByRole('button', { name: 'Dashboard' }))
    expect(push).toHaveBeenCalledWith('/admin')
  })
  it('opens the full drawer from the Menu tab', () => {
    render(<MiniSidebar><div /></MiniSidebar>)
    fireEvent.click(within(screen.getByTestId('mobile-tabbar')).getByRole('button', { name: 'Menu' }))
    expect(setNavOpen).toHaveBeenCalledWith(true)
  })
})
