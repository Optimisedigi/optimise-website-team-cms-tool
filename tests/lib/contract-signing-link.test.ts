import { describe, expect, it } from 'vitest'
import { signingLinkExpiry } from '@/lib/contract-signing-link'

const now = new Date('2026-10-20T00:00:00.000Z')

describe('signingLinkExpiry', () => {
  it('is active before the saved expiry and expired after it', () => {
    expect(signingLinkExpiry('2026-10-27T00:00:00.000Z', now).state).toBe('active')
    expect(signingLinkExpiry('2026-10-19T23:59:59.000Z', now).state).toBe('expired')
  })

  it('reports no expiry when none is saved or the value is invalid', () => {
    expect(signingLinkExpiry(null, now)).toEqual({ state: 'none' })
    expect(signingLinkExpiry('not a date', now)).toEqual({ state: 'none' })
  })
})
