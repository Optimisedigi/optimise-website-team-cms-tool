import { describe, expect, it } from 'vitest'
import {
  gradeColour as croGradeColour,
  gradeLabel as croGradeLabel,
} from '@/components/v2/CroHealthSlide'
import {
  gradeColour as seoGradeColour,
  gradeLabel as seoGradeLabel,
} from '@/components/v2/SeoHealthSlide'

describe.each([
  ['CRO', croGradeColour, croGradeLabel],
  ['SEO', seoGradeColour, seoGradeLabel],
])('%s health score grade', (_label, gradeColour, gradeLabel) => {
  it('aligns the red and needs-work bands below 50', () => {
    expect(gradeColour(49)).toBe('#ef4444')
    expect(gradeLabel(49)).toBe('Needs work')
    expect(gradeLabel(40)).toBe('Needs work')
    expect(gradeLabel(30)).toBe('Needs work')
  })

  it('aligns each higher label with its colour band', () => {
    expect(gradeColour(50)).toBe('#f0b35a')
    expect(gradeLabel(50)).toBe('Fair')
    expect(gradeLabel(73)).toBe('Fair')
    expect(gradeColour(74)).toBe('#84cc16')
    expect(gradeLabel(74)).toBe('Good')
    expect(gradeLabel(85)).toBe('Good')
    expect(gradeColour(86)).toBe('#22c55e')
    expect(gradeLabel(86)).toBe('Strong')
  })
})
