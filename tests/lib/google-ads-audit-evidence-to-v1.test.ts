import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { buildV1PayloadFromEvidence } from '@/lib/decks/templates/google-ads-audit-15-slide/evidence-to-v1'
import { Component } from '@/lib/decks/templates/google-ads-audit-15-slide/Component'
import { googleAdsAudit15SlideSchema, type SemanticGoogleAdsAuditPayload } from '@/lib/decks/templates/google-ads-audit-15-slide/payload'

function semantic(overrides: Partial<SemanticGoogleAdsAuditPayload> = {}): SemanticGoogleAdsAuditPayload {
  const categories = [
    { id: 'website', label: 'Website and business analysis', weight: 10, score: 3.3, maximum: 10 as const, status: 'scored' as const },
    { id: 'accountStructure', label: 'Account structure overview', weight: 8, score: 10, maximum: 10 as const, status: 'scored' as const },
    { id: 'tracking', label: 'Tracking and measurement', weight: 10, score: 10, maximum: 10 as const, status: 'scored' as const },
    { id: 'competition', label: 'Competitive landscape', weight: 7, score: null, maximum: 10 as const, status: 'insufficient_evidence' as const },
  ]
  return {
    version: 2,
    templateSlug: 'google-ads-audit-15-slide',
    auditId: '1',
    snapshotId: '9',
    clientName: 'Away Digital Teams',
    provenance: {
      requestedAt: '2026-07-17T00:00:00Z', capturedAt: '2026-07-17T00:10:00Z', periodStart: '2024-11-01', periodEnd: '2026-06-30',
      accountTimeZone: 'Australia/Sydney', currencyCode: 'AUD', earliestAvailableActivityDate: '2024-11-01',
    },
    analysis: {
      scoring: { total: 86, categories },
      totals: { cost: 665258, conversions: 15216, cpa: 43.7 },
      monthlyTrend: [{ month: '2024-11', cost: 4632 }, { month: '2024-12', cost: 9000 }],
      channelPerformance: [{ name: 'SEARCH · SEARCH', cost: 635239, conversions: 3793, cpa: 167.44 }],
      searchTerms: { classified: [
        { term: 'free plumbing course', spend: 300, category: 'irrelevant' },
        { term: 'emergency plumber', spend: 30, category: 'relevant' },
        { term: 'plumber near me', spend: 120, category: 'review' },
      ] },
      landingPages: { pages: [{ name: 'https://awaydigitalteams.com/contact', cost: 22536, clicks: 769, conversions: 40, cpa: 563 }] },
      recommendations: [{ priority: 2, area: 'search_terms', title: 'Block confirmed irrelevant search intent' }],
      websiteAssessment: { websiteUrl: 'https://awaydigitalteams.com/' },
    },
    scorecards: categories,
    slides: [],
    ...overrides,
  }
}

describe('evidence → v1 payload adapter', () => {
  it('produces a payload the v1 schema accepts and maps real evidence', () => {
    const v1 = buildV1PayloadFromEvidence(semantic())
    expect(googleAdsAudit15SlideSchema.safeParse(v1).ok).toBe(true)
    expect(v1.clientName).toBe('Away Digital Teams')
    expect(v1.clientWebsite).toBe('https://awaydigitalteams.com')
    expect(v1.auditPeriodLabel).toBe('2024-11-01 – 2026-06-30')
    expect(v1.overallScore).toBe(86)
    expect(v1.overallScoreLabel).toBe('Strong')
    // Score bars ordered by step; website step 1 first.
    expect(v1.auditScoreBars[0]).toMatchObject({ step: 1, label: 'Website & business analysis', score: 3, assessed: true })
    // Real channel performance becomes the category breakdown.
    expect(v1.adGroupCategories[0]).toMatchObject({ name: 'SEARCH · SEARCH', spendTotal: '$635K' })
    // Only non-relevant search terms carry through.
    expect(v1.searchTermTopRows.map((r) => r.term)).toEqual(['free plumbing course', 'plumber near me'])
    // Landing pages become path-relative rows.
    expect(v1.landingPageRows[0]).toMatchObject({ path: '/contact', cplTone: 'emerald' })
    // Monthly trend produces chart geometry.
    expect(v1.nbTrendMonths).toHaveLength(2)
    expect(v1.nbTrendMonths[0].label).toBe('Nov')
    // Sections the evidence does not capture stay empty rather than borrowed.
    expect(v1.negativePatternRows).toEqual([])
  })

  it('marks an insufficient-evidence category as Not assessed instead of a fabricated score', () => {
    const v1 = buildV1PayloadFromEvidence(semantic())
    const competitionBar = v1.auditScoreBars.find((bar) => bar.label === 'Competitive landscape')
    expect(competitionBar).toMatchObject({ step: 13, score: 0, assessed: false, scoreColor: 'text-slate-400', barColor: 'bg-slate-300' })
    const competitionCard = v1.scoringMethodologyCards.find((card) => card.name === 'Competitive landscape')
    expect(competitionCard).toMatchObject({ n: 13, score: 0, assessed: false, scoreClass: 'text-slate-400' })
  })

  it('renders overall Not assessed when the total score is null', () => {
    const source = semantic()
    ;(source.analysis as any).scoring.total = null
    const v1 = buildV1PayloadFromEvidence(source)
    expect(v1.overallScore).toBe(0)
    expect(v1.overallScoreLabel).toBe('Not assessed')
    expect(v1.scoreRingStrokeClass).toBe('stroke-slate-400')
    expect(googleAdsAudit15SlideSchema.safeParse(v1).ok).toBe(true)
  })

  it("draws the Account-at-a-glance slide from each audit's own monthly data", () => {
    const accountGlanceSection = '<section id="account-glance"'
    const other = semantic({ clientName: 'Acme Plumbing' })
    ;(other.analysis as any).websiteAssessment = { websiteUrl: 'https://acmeplumbing.example/' }
    ;(other.analysis as any).monthlyTrend = [
      { month: '2026-01', cost: 1000, clicks: 100, conversions: 10 },
      { month: '2026-02', cost: 2000, clicks: 150, conversions: 10 },
    ]
    const v1 = buildV1PayloadFromEvidence(other)
    expect(v1.showAccountGlance).toBe(true)
    expect(v1.accountGlance?.totals).toMatchObject({ spend: 3000, clicks: 250, conversions: 20, cpl: 150 })
    expect(googleAdsAudit15SlideSchema.safeParse(v1).ok).toBe(true)
    const html = renderToStaticMarkup(createElement(Component, { payload: v1 }))
    expect(html).toContain(accountGlanceSection)
    expect(html).toContain('$3,000')
    // None of the original hand-authored Away Digital figures leak in.
    expect(html).not.toContain('573,270')
    expect(html).not.toContain('GA4 page-view tracker')
  })

  it('hides the Account-at-a-glance slide when the audit has no monthly data', () => {
    const source = semantic()
    ;(source.analysis as any).monthlyTrend = []
    const v1 = buildV1PayloadFromEvidence(source)
    expect(v1.showAccountGlance).toBe(false)
    expect(v1.accountGlance).toBeUndefined()
    expect(renderToStaticMarkup(createElement(Component, { payload: v1 }))).not.toContain('<section id="account-glance"')
  })

  it('keeps the original fixed chart for hand-authored decks without evidence data', () => {
    const v1 = buildV1PayloadFromEvidence(semantic())
    const { accountGlance: _drop, showAccountGlance: _show, ...handAuthored } = v1
    const html = renderToStaticMarkup(createElement(Component, { payload: handAuthored }))
    expect(html).toContain('573,270')
  })

  it('titles the cover with the milestone when the deck is a milestone audit', () => {
    const source = { ...semantic(), milestone: { months: 6, goLiveDate: '2026-04-13', dueDate: '2026-10-13' } }
    const v1 = buildV1PayloadFromEvidence(source as SemanticGoogleAdsAuditPayload)
    expect(v1.coverLabel).toBe('6-month Google Ads audit')
    expect(renderToStaticMarkup(createElement(Component, { payload: v1 }))).toContain('6-month Google Ads audit')
    expect(buildV1PayloadFromEvidence(semantic()).coverLabel).toBeUndefined()
  })
})
