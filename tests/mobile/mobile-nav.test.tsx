import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

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

import MiniSidebar from '@/components/MiniSidebar'

describe('MiniSidebar on phones', () => {
  beforeEach(() => {
    push.mockReset()
    setNavOpen.mockReset()
    pathname = '/admin/mail'
  })
  it('renders no bottom tab bar (navigation lives in the header menu)', () => {
    const { container } = render(<MiniSidebar><div /></MiniSidebar>)
    expect(screen.queryByTestId('mobile-tabbar')).toBeNull()
    expect(container.querySelector('.mobile-tabbar')).toBeNull()
  })
})
