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
  const color = score >= 8 ? 'green' : score >= 5 ? 'amber' : 'red'
  return (
    <div className="score-bar-row">
      <span className="score-bar-label">{label}</span>
      <div className="score-bar-track">
        <div
          className={`score-bar-fill score-bar-${color}`}
          style={{ width: `${score * 10}%` }}
        />
      </div>
      <span className={`score-bar-value score-text-${color}`}>{score}/10</span>
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

  const overallColor =
    audit.overallScore >= 8 ? 'green' : audit.overallScore >= 5 ? 'amber' : 'red'

  const hasPassword = !!(audit as any).reportPassword

  const reportContent = (
    <>
      {/* Hero */}
      <section className="audit-hero">
        <div className="audit-hero-score">
          <div className={`overall-score score-ring-${overallColor}`}>
            <span className="overall-score-number">{audit.overallScore}</span>
            <span className="overall-score-label">/10</span>
          </div>
          <p className="overall-score-text">Overall SEO Score</p>
        </div>
        <div className="audit-hero-info">
          <h1>{audit.websiteUrl.replace(/^https?:\/\//, '')}</h1>
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
            {extractedData.schemaTypes && extractedData.schemaTypes.length > 0 && (
              <div className="tech-card tech-neutral tech-card-wide">
                <span className="tech-card-label">Schema Types</span>
                <div className="schema-tags">
                  {extractedData.schemaTypes.map((type) => (
                    <span key={type} className="schema-tag">{type}</span>
                  ))}
                </div>
              </div>
            )}
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
          {pageResults.map((page, i) => {
            const pageAvg = Object.values(page.scores).length
              ? Math.round(
                  (Object.values(page.scores).reduce((a, b) => a + b, 0) /
                    Object.values(page.scores).length) *
                    10
                ) / 10
              : 0
            return (
              <details key={i} className="page-result">
                <summary>
                  <div className="page-result-header">
                    <div className="page-result-title">
                      <span className="page-type-badge">{page.pageType}</span>
                      <span className="page-url">{page.url.replace(/^https?:\/\/[^/]+/, '')  || '/'}</span>
                    </div>
                    <ScoreBadge score={pageAvg} />
                  </div>
                </summary>
                <div className="page-result-body">
                  {/* Page scores */}
                  <div className="page-scores-grid">
                    {Object.entries(page.scores)
                      .sort(([, a], [, b]) => b - a)
                      .map(([key, score]) => (
                        <div key={key} className="page-score-item">
                          <span className="page-score-label">{categoryLabels[key] || key}</span>
                          <ScoreBadge score={score} />
                        </div>
                      ))}
                  </div>

                  {/* Page findings */}
                  {page.findings && page.findings.length > 0 && (
                    <ul className="findings-list">
                      {page.findings.map((finding, j) => (
                        <li key={j} className={`finding-item finding-${finding.status}`}>
                          <StatusIcon status={finding.status} />
                          <div>
                            <strong>{finding.category}</strong>
                            <span className="finding-message">{finding.message}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </details>
            )
          })}
        </section>
      )}

      {/* Recommendations */}
      {recommendations && Array.isArray(recommendations) && recommendations.length > 0 && (
        <section className="audit-section">
          <h2>Recommendations</h2>
          <ol className="recommendations-list">
            {recommendations.map((rec, i) => (
              <li key={i} className="recommendation-item">
                {rec.priority && <span className="rec-priority">{rec.priority}</span>}
                <div>
                  {rec.category && <strong>{rec.category}: </strong>}
                  {rec.message || rec.action || JSON.stringify(rec)}
                  {rec.impact && <span className="rec-impact">Impact: {rec.impact}</span>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Auto-generated Recommendations from Findings */}
      {(() => {
        const autoRecs = buildAutoRecommendations(pageResults)
        if (autoRecs.size === 0) return null
        return (
          <section className="audit-section">
            <h2>What to Fix</h2>
            <div className="auto-recommendations">
              {[...autoRecs.entries()].map(([category, recs]) => (
                <div key={category} className="rec-category-group">
                  <h3>{category}</h3>
                  <div className="rec-cards">
                    {recs.map((rec, i) => (
                      <div key={i} className={`rec-card rec-card-${rec.status}`}>
                        <span className="rec-card-status">{rec.status}</span>
                        <p className="rec-card-message">{rec.message}</p>
                        <p className="rec-card-pages">
                          <strong>Affected {rec.pages.length === 1 ? 'page' : `pages (${rec.pages.length})`}:</strong>{' '}
                          {rec.pages.join(', ')}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )
      })()}

      <footer className="audit-footer">
        <Image
          alt="Optimise Digital"
          height={30}
          width={140}
          src="/optimise-rocket-logo-black.webp"
        />
        <p>Report generated by Optimise Digital Growth Tools</p>
      </footer>
    </>
  )

  return (
    <div className="audit-page">
      <header className="audit-header">
        <Image
          alt="Optimise Digital"
          height={40}
          width={185}
          src="/optimise-rocket-logo-black.webp"
        />
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
