import { describe, it, expect } from 'vitest'
import { buildSeoProposalEmail, type SeoProposalEmailReport } from '@/lib/seo-proposal-email'

const report: SeoProposalEmailReport = {
  meta: { websiteUrl: 'https://berendsen.com.au/' },
  searchPerformance: {
    brandClicks: 7348,
    nonBrandClicks: 7936,
    brandDependencyPct: 48,
    brandImpressions: 120000,
    nonBrandImpressions: 859703,
    nonBrandImpressionSharePct: 88,
    strikingDistanceQueries: [
      { query: 'double acting cylinder', clicks: 120, impressions: 31523, ctr: 0.004, position: 5.6 },
      { query: 'laser cladding', clicks: 30, impressions: 1576, ctr: 0.02, position: 4 },
    ],
    buriedQueries: [
      { query: 'hard chrome', clicks: 0, impressions: 232, ctr: 0, position: 35 },
      { query: 'hydraulic cylinder repair', clicks: 0, impressions: 441, ctr: 0, position: 41 },
    ],
  },
  liveRankings: {
    rankings: [
      { keyword: 'submerged arc welding', position: 3, searchVolume: 480, opportunity: 'high' },
      { keyword: 'hard chrome', position: null, searchVolume: 480, opportunity: 'high' },
    ],
  },
  demandLandscape: { categories: [{ name: 'Hydraulic Cylinders', totalVolume: 34000 }] },
  seoAudit: { overallScore: 7.3, categoryScores: { siteHealth: 8, faqImplementation: 4, structuredData: 5, eeat: 6 } },
  croAudit: { overallScore: 5.6, categoryScores: { trustSocialProof: 5, cta: 5, firstImpression: 6 } },
  topicAuthority: {
    strongClusters: [{ name: 'Laser Cladding', reason: '3 well-linked pages with strong internal authority' }],
    clusters: [{ name: 'Laser Cladding', isBlogCluster: true, memberCount: 3 }],
  },
  synthesis: { verdict: 'Significant room to grow.' },
}

describe('buildSeoProposalEmail', () => {
  it('builds subject + plain + html with the brand name', () => {
    const email = buildSeoProposalEmail(report, { businessName: 'Berendsen', contactName: 'Sam' })
    expect(email.subject).toContain('Berendsen')
    expect(email.plainBody.startsWith('Hi Sam,')).toBe(true)
    expect(email.htmlBody).toContain('<table')
  })

  it('produces a self-contained, styled HTML email for Gmail paste', () => {
    const email = buildSeoProposalEmail(report, { businessName: 'Berendsen' })
    // Wrapped in a styled container with inline styles (survives Gmail paste).
    expect(email.htmlBody.startsWith('<div style=')).toBe(true)
    expect(email.htmlBody).toContain('font-family:Arial')
    // Brand table carries the "Share of clicks" column from the old email.
    expect(email.htmlBody).toContain('Share of clicks')
    // Styled table cells (inline styles, not bare <td>).
    expect(email.htmlBody).toContain('border-collapse:collapse')
  })

  it('leads with the brand vs non-brand impression/click framing', () => {
    const email = buildSeoProposalEmail(report, { businessName: 'Berendsen' })
    // 88% impressions non-brand, but only 52% of clicks (100 - 48).
    expect(email.plainBody).toContain('88%')
    expect(email.plainBody).toContain('52%')
    expect(email.plainBody).toContain('Non-brand')
  })

  it('includes a rank table blending live rank + impressions', () => {
    const email = buildSeoProposalEmail(report, { businessName: 'Berendsen' })
    expect(email.plainBody).toContain('submerged arc welding')
    expect(email.plainBody.toLowerCase()).toContain('not ranking') // hard chrome live position null
  })

  it('flags high-volume buried terms as wide open', () => {
    const email = buildSeoProposalEmail(report, { businessName: 'Berendsen' })
    expect(email.plainBody).toContain('wide open')
    expect(email.plainBody).toContain('hard chrome')
  })

  it('surfaces the ownership opportunity from a strong cluster', () => {
    const email = buildSeoProposalEmail(report, { businessName: 'Berendsen' })
    expect(email.plainBody).toContain('Laser Cladding is a real ownership opportunity')
  })

  it('reports SEO + CRO scores with weakest categories', () => {
    const email = buildSeoProposalEmail(report, { businessName: 'Berendsen' })
    expect(email.plainBody).toContain('7.3/10')
    expect(email.plainBody).toContain('5.6/10')
    expect(email.plainBody.toLowerCase()).toContain('faq') // weakest SEO category surfaced
  })

  it('ends with the lead-value ask', () => {
    const email = buildSeoProposalEmail(report, { businessName: 'Berendsen' })
    expect(email.plainBody.toLowerCase()).toContain('average value of a qualified lead')
  })

  it('degrades gracefully with a near-empty report', () => {
    const email = buildSeoProposalEmail(
      { searchPerformance: null, synthesis: { verdict: 'x' } },
      { businessName: 'Acme' },
    )
    expect(email.subject).toContain('Acme')
    expect(email.plainBody).toContain('Bottom line')
  })
})
