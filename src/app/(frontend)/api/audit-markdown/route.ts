import { NextRequest } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'

type CategoryScores = Record<string, number>

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

type ExtractedData = {
  sitemapFound?: boolean
  robotsTxtFound?: boolean
  schemaTypes?: string[]
  totalInternalLinks?: number
  totalImages?: number
  imagesWithoutAlt?: number
}

type Recommendation = {
  priority?: string
  category?: string
  message?: string
  action?: string
  impact?: string
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

type GroupedRecommendation = {
  message: string
  status: 'critical' | 'warning'
  category: string
  pages: string[]
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

  // Title & metadata
  lines.push(`# SEO Audit Report — ${domain}`)
  lines.push('')
  lines.push(`- **Website:** ${websiteUrl}`)
  lines.push(`- **Business Type:** ${audit.businessType}`)
  lines.push(`- **Pages Analyzed:** ${audit.pagesAnalyzed ?? '—'}`)
  lines.push(`- **Audit Date:** ${auditDate}`)
  lines.push('')

  // Overall score
  lines.push(`## Overall Score: ${audit.overallScore}/10`)
  lines.push('')

  // Category scores
  const categoryScores = audit.categoryScores as CategoryScores | null
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

  // Technical overview
  const extractedData = audit.extractedData as ExtractedData | null
  if (extractedData && typeof extractedData === 'object' && !Array.isArray(extractedData)) {
    lines.push('## Technical Overview')
    lines.push('')
    lines.push(`- **Sitemap:** ${extractedData.sitemapFound ? 'Found' : 'Not found'}`)
    lines.push(`- **robots.txt:** ${extractedData.robotsTxtFound ? 'Found' : 'Not found'}`)
    lines.push(`- **Total Images:** ${extractedData.totalImages ?? 0}`)
    lines.push(`- **Images Missing Alt Text:** ${extractedData.imagesWithoutAlt ?? 0}`)
    lines.push(`- **Internal Links:** ${extractedData.totalInternalLinks ?? 0}`)
    if (extractedData.schemaTypes && extractedData.schemaTypes.length > 0) {
      lines.push(`- **Schema Types:** ${extractedData.schemaTypes.join(', ')}`)
    }
    lines.push('')
  }

  // Site-wide findings
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

  // Page-by-page results
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

      // Per-page scores
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

      // Per-page findings
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

  // Auto-generated recommendations (What to Fix)
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

  // Raw recommendations
  const recommendations = audit.recommendations as Recommendation[] | null
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

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return new Response('Missing id parameter', { status: 400 })
  }

  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })

  let audit: Record<string, unknown>
  try {
    audit = await payload.findByID({
      collection: 'seo-audits',
      id,
      overrideAccess: true,
    }) as unknown as Record<string, unknown>
  } catch {
    return new Response('Audit not found', { status: 404 })
  }

  const markdown = generateMarkdown(audit)

  const slug = (audit.reportSlug as string) || id
  const filename = `${slug}.md`

  return new Response(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
