import { describe, expect, it } from 'vitest'
import { xLabelEvery } from '@/components/SearchConsolePage'

describe('xLabelEvery', () => {
  it('keeps every label on wide plots', () => {
    expect(xLabelEvery(16, 'month', 1200)).toBe(1)
  })

  it('shows every third month label on a ~300px phone plot', () => {
    expect(xLabelEvery(16, 'month', 293)).toBe(3)
  })

  it('never shows more labels than the daily cap allows', () => {
    expect(xLabelEvery(28, 'day', 1200)).toBe(3)
    expect(xLabelEvery(28, 'day', 293)).toBe(5)
  })

  it('falls back to the base cadence before the plot is measured', () => {
    expect(xLabelEvery(16, 'month', null)).toBe(1)
    expect(xLabelEvery(0, 'day', 300)).toBe(1)
  })
})
