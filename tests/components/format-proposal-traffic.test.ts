import { describe, expect, it } from 'vitest'
import { formatProposalTraffic } from '@/components/v2/format-proposal-traffic'

describe('formatProposalTraffic', () => {
  it('spells out millions so their magnitude is visually distinct', () => {
    expect(formatProposalTraffic(3_700_000)).toBe('3.7 million')
  })

  it('keeps thousands compact', () => {
    expect(formatProposalTraffic(4_700)).toBe('4.7K')
    expect(formatProposalTraffic(643_000)).toBe('643.0K')
  })
})
