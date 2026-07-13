import { describe, expect, it } from 'vitest'
import {
  extractCategoryKeywords,
  findNewCategoryKeywords,
  mergeNewKeywordMetrics,
  summariseKeywordMetrics,
} from '@/lib/proposal-keyword-refresh'

describe('proposal keyword partial refresh', () => {
  it('selects only category keywords missing from the existing snapshot', () => {
    const categoryKeywords = extractCategoryKeywords([
      { keywords: 'Existing Keyword\nNew Keyword\nnew keyword' },
      { keywords: 'Another New Keyword\n existing keyword ' },
    ])

    expect(findNewCategoryKeywords(categoryKeywords, [
      { keyword: 'existing keyword', position: 8 },
    ])).toEqual(['New Keyword', 'Another New Keyword'])
  })

  it('appends returned metrics without replacing existing snapshot rows', () => {
    const existing = [{ keyword: 'existing keyword', position: 8, searchVolume: 100 }]
    const merged = mergeNewKeywordMetrics(existing, [
      { keyword: 'new keyword', position: 12, search_volume: 250 } as any,
      { keyword: 'Existing Keyword', position: 2, search_volume: 999 } as any,
    ])

    expect(merged).toEqual([
      { keyword: 'existing keyword', position: 8, searchVolume: 100 },
      { keyword: 'new keyword', position: 12, search_volume: 250, searchVolume: 250 },
    ])
  })

  it('recalculates ranking totals across old and newly merged metrics', () => {
    expect(summariseKeywordMetrics([
      { keyword: 'one', position: 5, opportunity: 'high' },
      { keyword: 'two', position: 15, opportunity: 'medium' },
      { keyword: 'three', position: 44, opportunity: 'low' },
      { keyword: 'four', position: null, opportunity: 'low' },
    ])).toEqual({
      totalKeywords: 4,
      top10: 1,
      avgPosition: 21.3,
      opportunities: 2,
      rankingDistribution: { top10: 1, top20: 2, top50: 3, notFound: 1 },
    })
  })
})
