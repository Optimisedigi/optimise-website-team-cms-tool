import { describe, expect, it } from 'vitest'
import { normaliseSlideId } from '@/lib/proposal-slide-ids'

describe('ProposalSlideRemovalPicker slide IDs', () => {
  it('keeps current page 17, 18, and 26 selections independent', () => {
    const ids = [
      normaliseSlideId('17 Organic Propulsion'),
      normaliseSlideId('18 Paid Activation'),
      normaliseSlideId('24 Commercial'),
    ]

    expect(ids).toEqual(['17', '18', '24'])
    expect(new Set(ids).size).toBe(3)
  })

  it('still migrates legacy numeric-only selections', () => {
    expect(normaliseSlideId('17')).toBe('24')
    expect(normaliseSlideId('18')).toBe('24')
  })
})
