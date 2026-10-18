import { describe, expect, it } from 'vitest'
import { channelForUnassigned, reclassifyUnassignedSessions } from '@/lib/ga4-channel-reclassify'

describe('channelForUnassigned', () => {
  it('maps OpenAI ads to Paid AI, Perplexity to AI Search and untagged sessions to Direct', () => {
    expect(channelForUnassigned('openai', 'gpt_ads', 'google_ad_photo')).toBe('Paid AI')
    expect(channelForUnassigned('OpenAI', 'gpt-ads', 'google_ad-illus')).toBe('Paid AI')
    expect(channelForUnassigned('perplexity', '(not set)', '(not set)')).toBe('AI Search')
    expect(channelForUnassigned('(not set)', '(not set)', '(not set)')).toBe('Direct')
    expect(channelForUnassigned('', '', '')).toBe('Direct')
  })

  it('leaves other unmatched traffic Unassigned', () => {
    expect(channelForUnassigned('newsletter', 'paid', 'spring')).toBeNull()
    expect(channelForUnassigned('(not set)', '(not set)', 'spring')).toBeNull()
  })
})

describe('reclassifyUnassignedSessions', () => {
  it('moves sessions per month and drops emptied Unassigned rows', () => {
    const rows = [
      { month: '2026-09', channel: 'Direct', sessions: 100 },
      { month: '2026-09', channel: 'Paid AI', sessions: 10 },
      { month: '2026-09', channel: 'Unassigned', sessions: 216 },
      { month: '2026-10', channel: 'Unassigned', sessions: 12 },
    ]
    const unassigned = [
      { month: '2026-09', source: 'openai', medium: 'gpt_ads', campaign: 'google_ad_photo', sessions: 78 },
      { month: '2026-09', source: 'openai', medium: 'gpt-ads', campaign: 'google_ad-illus', sessions: 75 },
      { month: '2026-09', source: '(not set)', medium: '(not set)', campaign: '(not set)', sessions: 60 },
      { month: '2026-09', source: 'perplexity', medium: '(not set)', campaign: '(not set)', sessions: 3 },
      { month: '2026-10', source: 'newsletter', medium: 'paid', campaign: 'x', sessions: 12 },
    ]

    expect(reclassifyUnassignedSessions(rows, unassigned)).toEqual([
      { month: '2026-09', channel: 'AI Search', sessions: 3 },
      { month: '2026-09', channel: 'Direct', sessions: 160 },
      { month: '2026-09', channel: 'Paid AI', sessions: 163 },
      { month: '2026-10', channel: 'Unassigned', sessions: 12 },
    ])
  })

  it('never moves more than the month actually had in Unassigned', () => {
    const rows = [{ month: '2026-09', channel: 'Unassigned', sessions: 5 }]
    const unassigned = [{ month: '2026-09', source: 'openai', medium: 'gpt_ads', campaign: 'x', sessions: 9 }]

    expect(reclassifyUnassignedSessions(rows, unassigned)).toEqual([
      { month: '2026-09', channel: 'Paid AI', sessions: 5 },
    ])
  })
})
