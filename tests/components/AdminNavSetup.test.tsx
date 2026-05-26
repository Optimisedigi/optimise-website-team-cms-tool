import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'

const mockGetPreference = vi.fn()
const mockSetPreference = vi.fn()

vi.mock('@payloadcms/ui', () => ({
  usePreferences: () => ({
    getPreference: mockGetPreference,
    setPreference: mockSetPreference,
  }),
}))

import { AdminNavSetup } from '@/components/AdminNavSetup'

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
