import { describe, expect, it } from 'vitest'

import { classifyManualCompetitors, summarizeTrackedKeywordSerpMetrics } from '@/lib/manual-competitor-serp-metrics'

describe('manual competitor SERP metrics classification', () => {
  it('fetches only eligible rows missing either SERP metric', () => {
    const buckets = classifyManualCompetitors([
      {
        name: 'Already Filled',
        websiteUrl: 'https://filled.example.com',
        serpAveragePosition: 3.2,
        serpKeywordsFound: 4,
      },
      {
        name: 'Missing Average',
        websiteUrl: 'https://missing-average.example.com',
        serpAveragePosition: null,
        serpKeywordsFound: 2,
      },
      {
        name: 'Missing Keywords',
        websiteUrl: 'https://missing-keywords.example.com',
        serpAveragePosition: 7,
        serpKeywordsFound: null,
      },
      {
        name: 'No Domain',
        websiteUrl: '',
      },
    ])

    expect(buckets.alreadyFilled.map((row) => row.index)).toEqual([0])
    expect(buckets.needsFetch.map((row) => row.index)).toEqual([1, 2])
    expect(buckets.skippedNoDomain.map((row) => row.index)).toEqual([3])
    expect(buckets.needsFetch).toHaveLength(2)
  })

  it('summarises lightweight keyword tracking results for manual SERP metrics', () => {
    const summary = summarizeTrackedKeywordSerpMetrics([
      { keyword: 'weight loss', position: 2 },
      { keyword: 'ozempic alternative', position: null },
      { keyword: 'medical weight loss', position: '5' },
    ])

    expect(summary).toEqual({
      averagePosition: 3.5,
      keywordsFound: 2,
      keywordPositions: [
        { keyword: 'weight loss', position: 2 },
        { keyword: 'medical weight loss', position: 5 },
      ],
    })
  })
})
