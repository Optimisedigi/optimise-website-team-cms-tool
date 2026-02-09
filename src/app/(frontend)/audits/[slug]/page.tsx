import { getPayload } from 'payload'
import { notFound } from 'next/navigation'
import config from '@/payload.config'
import Image from 'next/image'
import AuditPasswordGate from '@/components/AuditPasswordGate'
import './audit.css'

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
  priority?: number | string
  title?: string
  description?: string
  category?: string
  message?: string
  action?: string
  impact?: string
  estimatedLift?: string
}

function formatDomain(url: string): string {
  try {
    const hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname
    return hostname.startsWith('www.') ? hostname : `www.${hostname}`
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  }
}

function ScoreGauge({ score }: { score: number }) {
  const cx = 100, cy = 110, r = 80
  const toRad = (d: number) => (d * Math.PI) / 180

  const segments = [
    { color: '#ef4444', start: 180, end: 146 },
    { color: '#f97316', start: 144, end: 110 },
    { color: '#eab308', start: 108, end: 74 },
    { color: '#84cc16', start: 72, end: 38 },
    { color: '#22c55e', start: 36, end: 0 },
  ]

  const arc = (start: number, end: number) => {
    const x1 = cx + r * Math.cos(toRad(start))
    const y1 = cy - r * Math.sin(toRad(start))
    const x2 = cx + r * Math.cos(toRad(end))
    const y2 = cy - r * Math.sin(toRad(end))
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`
  }

  const needleDeg = 180 - (score / 10) * 180
  const needleRad = toRad(needleDeg)
  const needleLen = r - 16
  const nx = cx + needleLen * Math.cos(needleRad)
  const ny = cy - needleLen * Math.sin(needleRad)
  const bw = 6
  const perpX = Math.sin(needleRad) * bw
  const perpY = Math.cos(needleRad) * bw

  const bgPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`

  return (
    <div className="gauge-wrapper">
      <svg viewBox="0 0 200 140" className="gauge-svg">
        <path d={bgPath} fill="none" stroke="#e5e7eb" strokeWidth={20} strokeLinecap="round" />
        {segments.map((seg, i) => (
          <path key={i} d={arc(seg.start, seg.end)} fill="none"
            stroke={seg.color} strokeWidth={18} strokeLinecap="round" />
        ))}
        <text x={cx} y={cy - 24} textAnchor="middle" dominantBaseline="auto"
          className="gauge-number">{score}</text>
        <circle cx={cx} cy={cy} r={10} fill="#374151" />
        <polygon
          points={`${cx + perpX},${cy + perpY} ${cx - perpX},${cy - perpY} ${nx},${ny}`}
          fill="#374151"
        />
        <text x={28} y={cy + 20} textAnchor="middle" className="gauge-end-label">POOR</text>
        <text x={172} y={cy + 20} textAnchor="middle" className="gauge-end-label">GOOD</text>
      </svg>
    </div>
  )
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

function ScoreBadge({ score, size = 'sm' }: { score: number; size?: 'sm' | 'lg' }) {
  const color = score >= 8 ? 'green' : score >= 5 ? 'amber' : 'red'
  return (
    <span className={`score-badge score-${color} score-${size}`}>
      {score}/10
    </span>
  )
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'good') return <span className="status-icon status-good">&#10003;</span>
  if (status === 'critical') return <span className="status-icon status-critical">&#10007;</span>
  return <span className="status-icon status-warning">&#9888;</span>
}

function ScoreBar({ score, label }: { score: number; label: string }) {
  const pct = (score / 10) * 100
  return (
    <div className="gradient-bar-row">
      <span className="gradient-bar-label">{label}</span>
      <div className="gradient-bar-wrapper">
        <div className="gradient-bar-track" />
        <div className="gradient-bar-indicator" style={{ left: `${pct}%` }}>
          <span className="gradient-bar-arrow">&#9650;</span>
          <span className="gradient-bar-value">{score}/10</span>
        </div>
      </div>
    </div>
  )
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

async function findAuditBySlug(slug: string) {
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })

  // Try by reportSlug first
  const result = await payload.find({
    collection: 'seo-audits',
    where: { reportSlug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
  })

  if (result.docs[0]) return result.docs[0]

  // Fallback: try by document ID (for audits without a slug)
  try {
    return await payload.findByID({
      collection: 'seo-audits',
      id: slug,
      overrideAccess: true,
    })
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const audit = await findAuditBySlug(slug)

  if (!audit) return { title: 'Audit Not Found' }

  return {
    title: `SEO Audit — ${audit.websiteUrl}`,
    description: `SEO audit report for ${audit.websiteUrl}. Overall score: ${audit.overallScore}/10.`,
  }
}

export default async function AuditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const audit = await findAuditBySlug(slug)

  if (!audit) notFound()

  const categoryScores = audit.categoryScores as CategoryScores | null
  const pageResults = audit.pageResults as PageResult[] | null
  const siteWideFindings = audit.siteWideFindings as Finding[] | null
  const recommendations = audit.recommendations as Recommendation[] | null
  const extractedData = audit.extractedData as ExtractedData | null
  const auditDate = new Date(audit.createdAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const hasPassword = !!(audit as any).reportPassword

  const reportContent = (
    <>
      {/* Hero */}
      <section className="audit-hero">
        <div className="audit-hero-score">
          <ScoreGauge score={audit.overallScore} />
        </div>
        <div className="audit-hero-info">
          <h1>
            <a href={audit.websiteUrl.startsWith('http') ? audit.websiteUrl : `https://${audit.websiteUrl}`} target="_blank" rel="noopener noreferrer" className="audit-website-link">
              {formatDomain(audit.websiteUrl)}
            </a>
          </h1>
          <dl className="audit-meta">
            <div>
              <dt>Business Type</dt>
              <dd>{audit.businessType}</dd>
            </div>
            <div>
              <dt>Pages Analyzed</dt>
              <dd>{audit.pagesAnalyzed ?? '—'}</dd>
            </div>
            <div>
              <dt>Audit Date</dt>
              <dd>{auditDate}</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Category Scores */}
      {categoryScores && typeof categoryScores === 'object' && !Array.isArray(categoryScores) && (
        <section className="audit-section">
          <h2>Category Scores</h2>
          <div className="score-bars">
            {Object.entries(categoryScores)
              .sort(([, a], [, b]) => (b as number) - (a as number))
              .map(([key, score]) => (
                <ScoreBar
                  key={key}
                  label={categoryLabels[key] || key}
                  score={score as number}
                />
              ))}
          </div>
        </section>
      )}

      {/* Technical Overview */}
      {extractedData && typeof extractedData === 'object' && !Array.isArray(extractedData) && (
        <section className="audit-section">
          <h2>Technical Overview</h2>
          <div className="tech-grid">
            <div className={`tech-card ${extractedData.sitemapFound ? 'tech-pass' : 'tech-fail'}`}>
              <span className="tech-card-icon">{extractedData.sitemapFound ? '✓' : '✗'}</span>
              <span>Sitemap</span>
            </div>
            <div className={`tech-card ${extractedData.robotsTxtFound ? 'tech-pass' : 'tech-fail'}`}>
              <span className="tech-card-icon">{extractedData.robotsTxtFound ? '✓' : '✗'}</span>
              <span>robots.txt</span>
            </div>
            <div className="tech-card tech-neutral">
              <span className="tech-card-value">{extractedData.totalImages ?? 0}</span>
              <span>Total Images</span>
            </div>
            <div className={`tech-card ${extractedData.imagesWithoutAlt === 0 ? 'tech-pass' : 'tech-fail'}`}>
              <span className="tech-card-value">{extractedData.imagesWithoutAlt ?? 0}</span>
              <span>Missing Alt Text</span>
            </div>
            <div className="tech-card tech-neutral">
              <span className="tech-card-value">{extractedData.totalInternalLinks ?? 0}</span>
              <span>Internal Links</span>
            </div>
            {(() => {
              const commonSchemas = ['LocalBusiness', 'Organization', 'WebSite', 'WebPage', 'BreadcrumbList', 'FAQPage', 'Article', 'Product', 'Service', 'Review']
              const present = extractedData.schemaTypes ?? []
              const missing = commonSchemas.filter((s) => !present.includes(s))
              return (
                <div className="tech-card tech-neutral tech-card-wide">
                  <span className="tech-card-label">Schema Markup</span>
                  {present.length > 0 && (
                    <div className="schema-list">
                      {present.map((type) => (
                        <span key={type} className="schema-item schema-present">&#10003; {type}</span>
                      ))}
                    </div>
                  )}
                  {missing.length > 0 && (
                    <div className="schema-list">
                      {missing.map((type) => (
                        <span key={type} className="schema-item schema-missing">&#10007; {type}</span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </section>
      )}

      {/* Site-Wide Findings */}
      {siteWideFindings && Array.isArray(siteWideFindings) && siteWideFindings.length > 0 && (
        <section className="audit-section">
          <h2>Site-Wide Findings</h2>
          <ul className="findings-list">
            {siteWideFindings.map((finding, i) => (
              <li key={i} className={`finding-item finding-${finding.status}`}>
                <StatusIcon status={finding.status} />
                <span>{finding.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Page-by-Page Results */}
      {pageResults && Array.isArray(pageResults) && pageResults.length > 0 && (
        <section className="audit-section">
          <h2>Page-by-Page Results</h2>
          <div className="page-results-grid">
            {pageResults.map((page, i) => {
              const pageAvg = Object.values(page.scores).length
                ? Math.round(
                    (Object.values(page.scores).reduce((a, b) => a + b, 0) /
                      Object.values(page.scores).length) *
                      10
                  ) / 10
                : 0
              return (
                <div key={i} className="page-card">
                  <div className="page-card-header">
                    <span className="page-type-badge">{page.pageType}</span>
                    <ScoreBadge score={pageAvg} />
                  </div>
                  <span className="page-url">{page.url.replace(/^https?:\/\/[^/]+/, '') || '/'}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Recommendations */}
      {recommendations && Array.isArray(recommendations) && recommendations.length > 0 && (
        <section className="audit-section">
          <h2>Top Recommendations</h2>
          <div className="recommendations-list">
            {recommendations.slice(0, 5).map((rec, i) => (
              <div key={i} className="recommendation-card">
                <div className="rec-header">
                  {rec.priority != null && <span className="rec-priority-pill">Priority {rec.priority}</span>}
                  {(rec.title || rec.category) && <span className="rec-category-name">{rec.title || rec.category}</span>}
                </div>
                <p className="rec-description">{rec.description || rec.message || rec.action}</p>
                <div className="rec-pills">
                  {rec.impact && <span className="rec-pill rec-pill-impact">{rec.impact}</span>}
                  {rec.estimatedLift && <span className="rec-pill rec-pill-lift">{rec.estimatedLift}</span>}
                </div>
              </div>
            ))}
          </div>
          <p className="rec-comprehensive-note">
            A more detailed report on specific recommendations and fixes will be sent in the comprehensive report by Optimise Digital.
          </p>
          <div className="audit-cta">
            <p className="audit-cta-text">Need help improving your SEO and driving more organic traffic?</p>
            <a href="https://www.optimisedigital.online/contact" target="_blank" rel="noopener noreferrer" className="audit-cta-button">Get in Touch with Optimise Digital</a>
          </div>
        </section>
      )}

      {/* Auto-generated Recommendations from Findings */}
      {(() => {
        const autoRecs = buildAutoRecommendations(pageResults)
        if (autoRecs.size === 0) return null
        return (
          <section className="audit-section">
            <h2>What to Fix</h2>
            <div className="fix-list">
              {[...autoRecs.entries()].map(([category, recs]) =>
                recs.map((rec, i) => (
                  <div key={`${category}-${i}`} className="fix-row">
                    <span className={`fix-status fix-status-${rec.status}`}>{rec.status}</span>
                    <div className="fix-content">
                      <span className="fix-message">{rec.message}</span>
                      <span className="fix-pages">{rec.pages.length === 1 ? '1 page' : `${rec.pages.length} pages`}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )
      })()}

      <div className="audit-cta">
        <p className="audit-cta-text">Ready to grow your organic traffic? Let our team help you turn these insights into results.</p>
        <a href="https://www.optimisedigital.online/contact" target="_blank" rel="noopener noreferrer" className="audit-cta-button">Contact Optimise Digital</a>
      </div>

      <footer className="audit-footer">
        <Image
          alt="Optimise Digital"
          height={30}
          width={140}
          src="/optimise-digital-logo-black.webp"
        />
        <p>Report generated by Optimise Digital</p>
      </footer>
    </>
  )

  return (
    <div className="audit-page">
      <header className="audit-header">
        <a href="https://www.optimisedigital.online" target="_blank" rel="noopener noreferrer">
          <Image
            alt="Optimise Digital"
            height={100}
            width={460}
            src="/optimise-digital-logo-black.webp"
            className="audit-header-logo"
          />
        </a>
        <span className="audit-header-label">SEO Audit Report</span>
      </header>

      {hasPassword ? (
        <AuditPasswordGate auditSlug={(audit as any).reportSlug}>
          {reportContent}
        </AuditPasswordGate>
      ) : (
        reportContent
      )}
    </div>
  )
}
