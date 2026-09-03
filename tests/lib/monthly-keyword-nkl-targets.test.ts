import { describe, expect, it } from 'vitest'
import { parseAppliedNklIds, toggleAppliedNklId } from '@/lib/monthly-keyword-nkl-targets'

describe('monthly-keyword-nkl-targets', () => {
  it('merges the primary NKL with extra ids and caps at 3', () => {
    expect(parseAppliedNklIds('4,5', 3)).toEqual(['3', '4', '5'])
    expect(parseAppliedNklIds('4,5,6,7', 3)).toEqual(['3', '4', '5'])
  })

  it('refuses a fourth NKL when toggling on', () => {
    expect(toggleAppliedNklId(['3', '4', '5'], 6, true)).toEqual(['3', '4', '5'])
    expect(toggleAppliedNklId(['3', '4', '5'], 4, false)).toEqual(['3', '5'])
  })
})
