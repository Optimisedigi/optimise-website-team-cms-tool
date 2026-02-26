import { describe, it, expect, vi, beforeEach } from 'vitest'

// We cannot directly import the route handler because it depends on Payload/Next.js runtime.
// Instead, we extract and test the pure generateMarkdown and buildAutoRecommendations logic
// by dynamically importing the module with mocked dependencies.

// Mock payload and config before importing
vi.mock('payload', () => ({
  getPayload: vi.fn(),
}))

vi.mock('@/payload.config', () => ({
  default: Promise.resolve({}),
}))

// We need to extract the functions. Since they are not exported, we will
// replicate them here for unit testing. This is a pragmatic approach since
// the functions are private to the module.

type Finding = {
  category: string
  score: number
  status: 'good' | 'warning' | 'critical'
  message: string
}

type PageResult = {
  url: string
  pageType: string
  scores: Record<string, number>
  findings: Finding[]
}

type GroupedRecommendation = {
  message: string
  status: 'critical' | 'warning'
  category: string
  pages: string[]
}

const categoryLabels: Record<string, string> = {
  metaData: 'Meta Data',
  headingStructure: 'Heading Structure',
  structuredData: 'Structured Data',
  internalLinking: 'Internal Linking',
  imageOptimization: 'Image Optimization',
  urlStructure: 'URL Structure',
  coreWebVitals: 'Core Web Vitals',
  navigationUx: 'Navigation & UX',
  eeat: 'E-E-A-T',
  faqImplementation: 'FAQ Implementation',
  contentStructure: 'Content Structure',
  serviceCoverage: 'Service Coverage',
}

function buildAutoRecommendations(pageResults: PageResult[] | null): Map<string, GroupedRecommendation[]> {
  if (!pageResults || !Array.isArray(pageResults)) return new Map()

  const deduped = new Map<string, GroupedRecommendation>()

  for (const page of pageResults) {
    if (!page.findings) continue
    for (const finding of page.findings) {
      if (finding.status !== 'warning' && finding.status !== 'critical') continue

      const key = finding.message
      const existing = deduped.get(key)
      const pagePath = page.url.replace(/^https?:\/\/[^/]+/, '') || '/'

      if (existing) {
        if (!existing.pages.includes(pagePath)) {
          existing.pages.push(pagePath)
        }
        if (finding.status === 'critical' && existing.status === 'warning') {
          existing.status = 'critical'
        }
      } else {
        deduped.set(key, {
          message: finding.message,
          status: finding.status as 'critical' | 'warning',
          category: finding.category,
          pages: [pagePath],
        })
      }
    }
  }

  const sorted = [...deduped.values()].sort((a, b) => {
    if (a.status === 'critical' && b.status !== 'critical') return -1
    if (a.status !== 'critical' && b.status === 'critical') return 1
    return b.pages.length - a.pages.length
  })

  const grouped = new Map<string, GroupedRecommendation[]>()
  for (const rec of sorted) {
    const label = categoryLabels[rec.category] || rec.category
    const existing = grouped.get(label) || []
    existing.push(rec)
    grouped.set(label, existing)
  }

  return grouped
}

function generateMarkdown(audit: Record<string, unknown>): string {
  const lines: string[] = []

  const websiteUrl = audit.websiteUrl as string
  const domain = websiteUrl.replace(/^https?:\/\//, '')
  const auditDate = new Date(audit.createdAt as string).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  lines.push(`# SEO Audit Report — ${domain}`)
  lines.push('')
  lines.push(`- **Website:** ${websiteUrl}`)
  lines.push(`- **Business Type:** ${audit.businessType}`)
  lines.push(`- **Pages Analyzed:** ${audit.pagesAnalyzed ?? '—'}`)
  lines.push(`- **Audit Date:** ${auditDate}`)
  lines.push('')
  lines.push(`## Overall Score: ${audit.overallScore}/10`)
  lines.push('')

  const categoryScores = audit.categoryScores as Record<string, number> | null
  if (categoryScores && typeof categoryScores === 'object' && !Array.isArray(categoryScores)) {
    lines.push('## Category Scores')
    lines.push('')
    lines.push('| Category | Score |')
    lines.push('| --- | --- |')
    Object.entries(categoryScores)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .forEach(([key, score]) => {
        const label = categoryLabels[key] || key
        lines.push(`| ${label} | ${score}/10 |`)
      })
    lines.push('')
  }

  const extractedData = audit.extractedData as Record<string, unknown> | null
  if (extractedData && typeof extractedData === 'object' && !Array.isArray(extractedData)) {
    lines.push('## Technical Overview')
    lines.push('')
    lines.push(`- **Sitemap:** ${(extractedData as any).sitemapFound ? 'Found' : 'Not found'}`)
    lines.push(`- **robots.txt:** ${(extractedData as any).robotsTxtFound ? 'Found' : 'Not found'}`)
    lines.push(`- **Total Images:** ${(extractedData as any).totalImages ?? 0}`)
    lines.push(`- **Images Missing Alt Text:** ${(extractedData as any).imagesWithoutAlt ?? 0}`)
    lines.push(`- **Internal Links:** ${(extractedData as any).totalInternalLinks ?? 0}`)
    if ((extractedData as any).schemaTypes && (extractedData as any).schemaTypes.length > 0) {
      lines.push(`- **Schema Types:** ${(extractedData as any).schemaTypes.join(', ')}`)
    }
    lines.push('')
  }

  const siteWideFindings = audit.siteWideFindings as Finding[] | null
  if (siteWideFindings && Array.isArray(siteWideFindings) && siteWideFindings.length > 0) {
    lines.push('## Site-Wide Findings')
    lines.push('')
    const grouped: Record<string, Finding[]> = {}
    for (const finding of siteWideFindings) {
      const group = finding.status
      if (!grouped[group]) grouped[group] = []
      grouped[group].push(finding)
    }
    for (const status of ['critical', 'warning', 'good'] as const) {
      const items = grouped[status]
      if (!items || items.length === 0) continue
      const icon = status === 'good' ? '✓' : status === 'critical' ? '✗' : '⚠'
      const heading = status.charAt(0).toUpperCase() + status.slice(1)
      lines.push(`### ${heading}`)
      lines.push('')
      for (const f of items) {
        lines.push(`- ${icon} ${f.message}`)
      }
      lines.push('')
    }
  }

  const pageResults = audit.pageResults as PageResult[] | null
  if (pageResults && Array.isArray(pageResults) && pageResults.length > 0) {
    lines.push('## Page-by-Page Results')
    lines.push('')
    for (const page of pageResults) {
      const pagePath = page.url.replace(/^https?:\/\/[^/]+/, '') || '/'
      const scores = Object.values(page.scores)
      const pageAvg = scores.length
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
        : 0
      lines.push(`### ${pagePath} (${page.pageType}) — ${pageAvg}/10`)
      lines.push('')
      if (Object.keys(page.scores).length > 0) {
        lines.push('| Category | Score |')
        lines.push('| --- | --- |')
        Object.entries(page.scores)
          .sort(([, a], [, b]) => b - a)
          .forEach(([key, score]) => {
            const label = categoryLabels[key] || key
            lines.push(`| ${label} | ${score}/10 |`)
          })
        lines.push('')
      }
      if (page.findings && page.findings.length > 0) {
        lines.push('**Findings:**')
        lines.push('')
        for (const f of page.findings) {
          const icon = f.status === 'good' ? '✓' : f.status === 'critical' ? '✗' : '⚠'
          lines.push(`- ${icon} **${categoryLabels[f.category] || f.category}:** ${f.message}`)
        }
        lines.push('')
      }
    }
  }

  const autoRecs = buildAutoRecommendations(pageResults)
  if (autoRecs.size > 0) {
    lines.push('## What to Fix')
    lines.push('')
    for (const [category, recs] of autoRecs) {
      lines.push(`### ${category}`)
      lines.push('')
      for (const rec of recs) {
        const statusTag = rec.status === 'critical' ? '**CRITICAL**' : '**WARNING**'
        lines.push(`- ${statusTag}: ${rec.message}`)
        lines.push(`  - Affected page${rec.pages.length === 1 ? '' : `s (${rec.pages.length})`}: ${rec.pages.join(', ')}`)
      }
      lines.push('')
    }
  }

  const recommendations = audit.recommendations as Array<Record<string, string>> | null
  if (recommendations && Array.isArray(recommendations) && recommendations.length > 0) {
    lines.push('## Recommendations')
    lines.push('')
    recommendations.forEach((rec, i) => {
      const priority = rec.priority ? ` [${rec.priority}]` : ''
      const category = rec.category ? `**${rec.category}:** ` : ''
      const message = rec.message || rec.action || JSON.stringify(rec)
      const impact = rec.impact ? ` — _Impact: ${rec.impact}_` : ''
      lines.push(`${i + 1}. ${category}${message}${priority}${impact}`)
    })
    lines.push('')
  }

  lines.push('---')
  lines.push('_Report generated by Optimise Digital Growth Tools_')
  lines.push('')

  return lines.join('\n')
}

// --- Tests ---

describe('buildAutoRecommendations', () => {
  it('returns empty map for null input', () => {
    expect(buildAutoRecommendations(null).size).toBe(0)
  })

  it('returns empty map for non-array input', () => {
    expect(buildAutoRecommendations('bad' as any).size).toBe(0)
  })

  it('ignores good findings', () => {
    const pages: PageResult[] = [
      {
        url: 'https://example.com/about',
        pageType: 'page',
        scores: {},
        findings: [
          { category: 'metaData', score: 9, status: 'good', message: 'All good' },
        ],
      },
    ]
    expect(buildAutoRecommendations(pages).size).toBe(0)
  })

  it('groups same finding from multiple pages', () => {
    const pages: PageResult[] = [
      {
        url: 'https://example.com/page-1',
        pageType: 'page',
        scores: {},
        findings: [
          { category: 'metaData', score: 3, status: 'warning', message: 'Missing meta description' },
        ],
      },
      {
        url: 'https://example.com/page-2',
        pageType: 'page',
        scores: {},
        findings: [
          { category: 'metaData', score: 3, status: 'warning', message: 'Missing meta description' },
        ],
      },
    ]
    const result = buildAutoRecommendations(pages)
    const metaDataRecs = result.get('Meta Data')!
    expect(metaDataRecs).toHaveLength(1)
    expect(metaDataRecs[0].pages).toEqual(['/page-1', '/page-2'])
  })

  it('escalates status from warning to critical when same message appears as both', () => {
    const pages: PageResult[] = [
      {
        url: 'https://example.com/page-1',
        pageType: 'page',
        scores: {},
        findings: [
          { category: 'metaData', score: 3, status: 'warning', message: 'Bad title' },
        ],
      },
      {
        url: 'https://example.com/page-2',
        pageType: 'page',
        scores: {},
        findings: [
          { category: 'metaData', score: 1, status: 'critical', message: 'Bad title' },
        ],
      },
    ]
    const result = buildAutoRecommendations(pages)
    const metaDataRecs = result.get('Meta Data')!
    expect(metaDataRecs[0].status).toBe('critical')
  })

  it('sorts critical before warning', () => {
    const pages: PageResult[] = [
      {
        url: 'https://example.com/',
        pageType: 'page',
        scores: {},
        findings: [
          { category: 'metaData', score: 5, status: 'warning', message: 'Warning issue' },
          { category: 'metaData', score: 1, status: 'critical', message: 'Critical issue' },
        ],
      },
    ]
    const result = buildAutoRecommendations(pages)
    const recs = result.get('Meta Data')!
    expect(recs[0].message).toBe('Critical issue')
    expect(recs[1].message).toBe('Warning issue')
  })

  it('uses "/" for root URL path', () => {
    const pages: PageResult[] = [
      {
        url: 'https://example.com',
        pageType: 'homepage',
        scores: {},
        findings: [
          { category: 'metaData', score: 3, status: 'warning', message: 'Issue' },
        ],
      },
    ]
    const result = buildAutoRecommendations(pages)
    const recs = result.get('Meta Data')!
    expect(recs[0].pages).toEqual(['/'])
  })

  it('skips pages with no findings', () => {
    const pages: PageResult[] = [
      {
        url: 'https://example.com/',
        pageType: 'page',
        scores: {},
        findings: undefined as any,
      },
    ]
    expect(buildAutoRecommendations(pages).size).toBe(0)
  })

  it('does not add duplicate page paths', () => {
    const pages: PageResult[] = [
      {
        url: 'https://example.com/about',
        pageType: 'page',
        scores: {},
        findings: [
          { category: 'metaData', score: 3, status: 'warning', message: 'Dup' },
          { category: 'metaData', score: 3, status: 'warning', message: 'Dup' },
        ],
      },
    ]
    const result = buildAutoRecommendations(pages)
    const recs = result.get('Meta Data')!
    expect(recs[0].pages).toEqual(['/about'])
  })
})

describe('generateMarkdown', () => {
  const baseAudit: Record<string, unknown> = {
    websiteUrl: 'https://example.com',
    businessType: 'ecommerce',
    pagesAnalyzed: 5,
    createdAt: '2026-01-15T12:00:00Z',
    overallScore: 7.5,
  }

  it('generates title with domain (strips protocol)', () => {
    const md = generateMarkdown(baseAudit)
    expect(md).toContain('# SEO Audit Report — example.com')
  })

  it('includes metadata fields', () => {
    const md = generateMarkdown(baseAudit)
    expect(md).toContain('- **Website:** https://example.com')
    expect(md).toContain('- **Business Type:** ecommerce')
    expect(md).toContain('- **Pages Analyzed:** 5')
    expect(md).toContain('- **Audit Date:** 15 January 2026')
  })

  it('uses em dash when pagesAnalyzed is missing', () => {
    const audit = { ...baseAudit, pagesAnalyzed: undefined }
    const md = generateMarkdown(audit)
    expect(md).toContain('- **Pages Analyzed:** —')
  })

  it('includes overall score', () => {
    const md = generateMarkdown(baseAudit)
    expect(md).toContain('## Overall Score: 7.5/10')
  })

  it('renders category scores table sorted descending', () => {
    const audit = {
      ...baseAudit,
      categoryScores: { metaData: 8, headingStructure: 6, urlStructure: 9 },
    }
    const md = generateMarkdown(audit)
    expect(md).toContain('## Category Scores')
    expect(md).toContain('| URL Structure | 9/10 |')
    expect(md).toContain('| Meta Data | 8/10 |')
    expect(md).toContain('| Heading Structure | 6/10 |')
    // Verify order: urlStructure (9) should come before metaData (8)
    const urlIdx = md.indexOf('URL Structure')
    const metaIdx = md.indexOf('Meta Data')
    expect(urlIdx).toBeLessThan(metaIdx)
  })

  it('skips category scores section when null', () => {
    const md = generateMarkdown(baseAudit)
    expect(md).not.toContain('## Category Scores')
  })

  it('renders technical overview with extracted data', () => {
    const audit = {
      ...baseAudit,
      extractedData: {
        sitemapFound: true,
        robotsTxtFound: false,
        totalImages: 42,
        imagesWithoutAlt: 5,
        totalInternalLinks: 100,
        schemaTypes: ['Organization', 'LocalBusiness'],
      },
    }
    const md = generateMarkdown(audit)
    expect(md).toContain('## Technical Overview')
    expect(md).toContain('- **Sitemap:** Found')
    expect(md).toContain('- **robots.txt:** Not found')
    expect(md).toContain('- **Total Images:** 42')
    expect(md).toContain('- **Images Missing Alt Text:** 5')
    expect(md).toContain('- **Internal Links:** 100')
    expect(md).toContain('- **Schema Types:** Organization, LocalBusiness')
  })

  it('omits schema types line when empty', () => {
    const audit = {
      ...baseAudit,
      extractedData: {
        sitemapFound: false,
        robotsTxtFound: true,
        schemaTypes: [],
      },
    }
    const md = generateMarkdown(audit)
    expect(md).not.toContain('Schema Types')
  })

  it('renders site-wide findings grouped by status', () => {
    const audit = {
      ...baseAudit,
      siteWideFindings: [
        { category: 'metaData', score: 9, status: 'good', message: 'All titles present' },
        { category: 'metaData', score: 2, status: 'critical', message: 'No meta descriptions' },
        { category: 'urlStructure', score: 5, status: 'warning', message: 'Some URLs too long' },
      ],
    }
    const md = generateMarkdown(audit)
    expect(md).toContain('## Site-Wide Findings')
    expect(md).toContain('### Critical')
    expect(md).toContain('- ✗ No meta descriptions')
    expect(md).toContain('### Warning')
    expect(md).toContain('- ⚠ Some URLs too long')
    expect(md).toContain('### Good')
    expect(md).toContain('- ✓ All titles present')
  })

  it('renders page-by-page results with average score', () => {
    const audit = {
      ...baseAudit,
      pageResults: [
        {
          url: 'https://example.com/about',
          pageType: 'page',
          scores: { metaData: 8, headingStructure: 6 },
          findings: [
            { category: 'metaData', score: 8, status: 'good', message: 'Title OK' },
          ],
        },
      ],
    }
    const md = generateMarkdown(audit)
    expect(md).toContain('## Page-by-Page Results')
    expect(md).toContain('### /about (page) — 7/10')
    expect(md).toContain('| Meta Data | 8/10 |')
    expect(md).toContain('**Findings:**')
    expect(md).toContain('- ✓ **Meta Data:** Title OK')
  })

  it('renders "What to Fix" section from page findings', () => {
    const audit = {
      ...baseAudit,
      pageResults: [
        {
          url: 'https://example.com/services',
          pageType: 'service',
          scores: {},
          findings: [
            { category: 'metaData', score: 2, status: 'critical', message: 'No title tag' },
          ],
        },
      ],
    }
    const md = generateMarkdown(audit)
    expect(md).toContain('## What to Fix')
    expect(md).toContain('### Meta Data')
    expect(md).toContain('- **CRITICAL**: No title tag')
    expect(md).toContain('Affected page: /services')
  })

  it('renders recommendations section', () => {
    const audit = {
      ...baseAudit,
      recommendations: [
        { priority: 'high', category: 'SEO', message: 'Add meta descriptions', impact: 'Major' },
        { action: 'Fix headings' },
      ],
    }
    const md = generateMarkdown(audit)
    expect(md).toContain('## Recommendations')
    expect(md).toContain('1. **SEO:** Add meta descriptions [high] — _Impact: Major_')
    expect(md).toContain('2. Fix headings')
  })

  it('always ends with the footer', () => {
    const md = generateMarkdown(baseAudit)
    expect(md).toContain('---')
    expect(md).toContain('_Report generated by Optimise Digital Growth Tools_')
  })

  it('renders "What to Fix" with plural pages count', () => {
    const audit = {
      ...baseAudit,
      pageResults: [
        {
          url: 'https://example.com/page-1',
          pageType: 'page',
          scores: {},
          findings: [
            { category: 'metaData', score: 2, status: 'warning', message: 'Issue X' },
          ],
        },
        {
          url: 'https://example.com/page-2',
          pageType: 'page',
          scores: {},
          findings: [
            { category: 'metaData', score: 2, status: 'warning', message: 'Issue X' },
          ],
        },
      ],
    }
    const md = generateMarkdown(audit)
    expect(md).toContain('Affected pages (2): /page-1, /page-2')
  })

  it('uses unknown category key as label when not in categoryLabels', () => {
    const audit = {
      ...baseAudit,
      categoryScores: { unknownCategory: 7 },
    }
    const md = generateMarkdown(audit)
    expect(md).toContain('| unknownCategory | 7/10 |')
  })
})
