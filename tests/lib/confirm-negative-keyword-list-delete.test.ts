import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  confirmNegativeKeywordListDelete,
  isNegativeKeywordListDeleteRequest,
  wrapFetchWithNegativeKeywordListDeleteConfirm,
} from '@/lib/confirm-negative-keyword-list-delete'

describe('confirmNegativeKeywordListDelete', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('detects Payload REST deletes for negative keyword lists', () => {
    expect(isNegativeKeywordListDeleteRequest('/api/negative-keyword-lists/13', { method: 'DELETE' })).toBe(true)
    expect(isNegativeKeywordListDeleteRequest('/api/negative-keyword-lists?where[id][in][0]=13', { method: 'delete' })).toBe(true)
    expect(isNegativeKeywordListDeleteRequest('/api/negative-keyword-lists/13', { method: 'GET' })).toBe(false)
    expect(isNegativeKeywordListDeleteRequest('/api/contracts/13', { method: 'DELETE' })).toBe(false)
  })

  it('asks for a browser confirm before deleting', () => {
    const confirm = vi.fn().mockReturnValue(false)
    vi.stubGlobal('confirm', confirm)
    expect(confirmNegativeKeywordListDelete()).toBe(false)
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Delete this negative keyword list'))
  })

  it('does not call fetch when the user cancels the popup', async () => {
    const confirm = vi.fn().mockReturnValue(false)
    const originalFetch = vi.fn()
    vi.stubGlobal('confirm', confirm)
    const wrapped = wrapFetchWithNegativeKeywordListDeleteConfirm(originalFetch as unknown as typeof fetch)

    const res = await wrapped('/api/negative-keyword-lists/13', { method: 'DELETE' })
    expect(originalFetch).not.toHaveBeenCalled()
    expect(res.status).toBe(499)
  })

  it('calls fetch when the user confirms the popup', async () => {
    const confirm = vi.fn().mockReturnValue(true)
    const originalFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('confirm', confirm)
    const wrapped = wrapFetchWithNegativeKeywordListDeleteConfirm(originalFetch as unknown as typeof fetch)

    const res = await wrapped('/api/negative-keyword-lists/13', { method: 'DELETE' })
    expect(originalFetch).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(200)
  })
})
