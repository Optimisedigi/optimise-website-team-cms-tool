import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import NegativeKeywordListDeleteConfirm from '@/components/NegativeKeywordListDeleteConfirm'

describe('NegativeKeywordListDeleteConfirm', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('installs a fetch wrapper that requires a browser confirm for NKL deletes', async () => {
    const originalFetch = vi.fn()
    const confirm = vi.fn().mockReturnValue(false)
    vi.stubGlobal('fetch', originalFetch)
    vi.stubGlobal('confirm', confirm)

    const { unmount } = render(<NegativeKeywordListDeleteConfirm />)
    const res = await window.fetch('/api/negative-keyword-lists/13', { method: 'DELETE' })

    expect(confirm).toHaveBeenCalledTimes(1)
    expect(originalFetch).not.toHaveBeenCalled()
    expect(res.status).toBe(499)

    unmount()
    await window.fetch('/api/negative-keyword-lists/13', { method: 'DELETE' })
    expect(originalFetch).toHaveBeenCalledTimes(1)
  })
})
