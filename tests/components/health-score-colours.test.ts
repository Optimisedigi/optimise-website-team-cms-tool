import { describe, expect, it } from 'vitest'
import { gradeColour as croGradeColour } from '@/components/v2/CroHealthSlide'
import { gradeColour as seoGradeColour } from '@/components/v2/SeoHealthSlide'

describe.each([
  ['CRO', croGradeColour],
  ['SEO', seoGradeColour],
])('%s health score colour', (_label, gradeColour) => {
  it('shows scores below 50 in red', () => {
    expect(gradeColour(49)).toBe('#ef4444')
  })

  it('keeps 50 and above in the orange band', () => {
    expect(gradeColour(50)).toBe('#f0b35a')
  })
})
