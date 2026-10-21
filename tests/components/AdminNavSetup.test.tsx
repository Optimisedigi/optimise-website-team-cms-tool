import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'

const mockGetPreference = vi.fn()
const mockSetPreference = vi.fn()

vi.mock('@payloadcms/ui', () => ({
  usePreferences: () => ({
    getPreference: mockGetPreference,
    setPreference: mockSetPreference,
  }),
  useNav: () => ({ navOpen: false }),
}))
vi.mock('next/navigation', () => ({ usePathname: () => '/admin/collections/clients' }))

import { AdminNavSetup, collapseOtherNavGroups, PHONE_COLLAPSED_ATTR } from '@/components/AdminNavSetup'

describe('AdminNavSetup', () => {
  beforeEach(() => {
    mockGetPreference.mockReset()
    mockSetPreference.mockReset()
  })

  it('opens the Clients nav group when a stored preference collapsed it', async () => {
    mockGetPreference.mockResolvedValue({ groups: { Clients: { open: false } } })

    render(<AdminNavSetup />)

    await waitFor(() => {
      expect(mockSetPreference).toHaveBeenCalledWith(
        'nav',
        { groups: { Clients: { open: true } } },
        true,
      )
    })
  })

  it('does not rewrite preferences when Clients is already open', async () => {
    mockGetPreference.mockResolvedValue({ groups: { Clients: { open: true } } })

    render(<AdminNavSetup />)

    await waitFor(() => expect(mockGetPreference).toHaveBeenCalledWith('nav'))
    expect(mockSetPreference).not.toHaveBeenCalled()
  })
})

describe('collapseOtherNavGroups (phone drawer)', () => {
  it('keeps only the group holding the current page open', () => {
    document.body.innerHTML = `
      <nav class="nav">
        <div class="nav-group" id="g-perf"><button class="nav-group__toggle">Performance</button>
          <div class="nav-group__content"><a href="/admin/performance/analytics">GA</a></div></div>
        <div class="nav-group" id="g-clients"><button class="nav-group__toggle">Clients</button>
          <div class="nav-group__content"><a href="/admin/collections/clients">Clients</a></div></div>
        <div class="nav-group" id="g-mail"><div class="nav-group__content"><a href="/admin/mail">Mail</a></div></div>
      </nav>`
    collapseOtherNavGroups(document, '/admin/collections/clients/3')
    expect(document.getElementById('g-perf')?.hasAttribute(PHONE_COLLAPSED_ATTR)).toBe(true)
    expect(document.getElementById('g-clients')?.hasAttribute(PHONE_COLLAPSED_ATTR)).toBe(false)
    // Untitled groups (Mail) have no header to reopen them, so they never collapse.
    expect(document.getElementById('g-mail')?.hasAttribute(PHONE_COLLAPSED_ATTR)).toBe(false)
  })
})
