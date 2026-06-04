import { describe, expect, it } from 'vitest'
import { parseNegativeKeywordInput, parseNegativeKeywords } from '../../src/lib/parse-negative-keywords'

describe('parseNegativeKeywords', () => {
  it('uses exact match for bare keywords and phrase match for quoted keywords', () => {
    expect(parseNegativeKeywords("free\n'cheap deals'\n\"seo services\"")).toEqual([
      { keyword: 'free', matchType: 'exact' },
      { keyword: 'cheap deals', matchType: 'phrase' },
      { keyword: 'seo services', matchType: 'phrase' },
    ])
  })

  it('trims whitespace, skips blanks, and deduplicates by keyword and match type', () => {
    expect(parseNegativeKeywords(" free \n\nFREE\n'free'\n 'free' ")).toEqual([
      { keyword: 'free', matchType: 'exact' },
      { keyword: 'free', matchType: 'phrase' },
    ])
  })

  it('parses a single inline input for month-on-month keyword review', () => {
    expect(parseNegativeKeywordInput("'competitor brand'")).toEqual({
      keyword: 'competitor brand',
      matchType: 'phrase',
    })
    expect(parseNegativeKeywordInput('')).toBeNull()
  })
})
