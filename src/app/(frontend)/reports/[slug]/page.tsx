import { getPayload } from 'payload'
import { notFound } from 'next/navigation'
import config from '@/payload.config'
import Image from 'next/image'
import './report.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

type CroFinding = {
  category: string
  score: number
  status: 'good' | 'warning' | 'critical'
  message: string
  details?: string
}

type CroExtractedContent = {
  headline?: string
  subHeadlines?: string[]
  navigationItems?: string[]
  ctaTexts?: string[]
}

type KeywordEntry = {
  keyword: string
  position: number | null
  previousPosition?: number | null
  searchVolume: number
  opportunity: string
  location?: string
  lastUpdated?: string
}

type RankingDistribution = {
  top10: number
  top20: number
  top50: number
  notFound: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDomain(url: string): string {
  try {
    const hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname
    return hostname.startsWith('www.') ? hostname : `www.${hostname}`
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  }
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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 8 ? 'green' : score >= 5 ? 'amber' : 'red'
  return <span className={`score-badge score-${color}`}>{score}/10</span>
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'good') return <span className="status-icon status-good">&#10003;</span>
  if (status === 'critical') return <span className="status-icon status-critical">&#10007;</span>
  return <span className="status-icon status-warning">&#9888;</span>
}

function PositionBadge({ position }: { position: number | null }) {
  if (!position) return <span className="kw-position kw-not-found">—</span>
  const cls = position <= 10 ? 'kw-top10' : position <= 20 ? 'kw-top20' : position <= 50 ? 'kw-top50' : 'kw-low'
  return <span className={`kw-position ${cls}`}>#{position}</span>
}

function OpportunityBadge({ opportunity }: { opportunity: string }) {
  const cls = opportunity === 'high' ? 'opp-high' : opportunity === 'medium' ? 'opp-medium' : 'opp-low'
  return <span className={`opp-badge ${cls}`}>{opportunity}</span>
}

function ChangeArrow({ current, previous }: { current: number | null; previous?: number | null }) {
  if (!current || !previous) return null
  const diff = previous - current // positive = improved (moved up)
  if (diff === 0) return <span className="kw-change kw-change-same">—</span>
  if (diff > 0) return <span className="kw-change kw-change-up">&#9650; {diff}</span>
  return <span className="kw-change kw-change-down">&#9660; {Math.abs(diff)}</span>
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function findClientBySlug(slug: string) {
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })

  const result = await payload.find({
    collection: 'clients',
    where: { slug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
  })

  return result.docs[0] ?? null
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const client = await findClientBySlug(slug)
  if (!client) return { title: 'Report Not Found' }
  return {
    title: `Client Report — ${client.name}`,
    description: `Combined SEO, CRO, and keyword report for ${client.name}`,
    robots: { index: false, follow: false },
  }
}

export default async function ReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const client = await findClientBySlug(slug)

  if (!client) notFound()

  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })

  // Fetch latest of each type in parallel
  const [seoResult, croResult, kwResult] = await Promise.all([
    payload.find({
      collection: 'seo-audits',
      where: { client: { equals: client.id } },
      sort: '-createdAt',
      limit: 1,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'cro-audits',
      where: { client: { equals: client.id } },
      sort: '-createdAt',
      limit: 1,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'keyword-snapshots',
      where: { client: { equals: client.id } },
      sort: '-createdAt',
      limit: 1,
      overrideAccess: true,
    }),
  ])

  const seoAudit = seoResult.docs[0] ?? null
  const croAudit = croResult.docs[0] ?? null
  const kwSnapshot = kwResult.docs[0] ?? null

  if (!seoAudit && !croAudit && !kwSnapshot) notFound()

  const reportDate = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  // SEO data
  const categoryScores = seoAudit?.categoryScores as CategoryScores | null
  const pageResults = seoAudit?.pageResults as PageResult[] | null
  const siteWideFindings = seoAudit?.siteWideFindings as Finding[] | null
  const seoRecommendations = seoAudit?.recommendations as Recommendation[] | null
  const extractedData = seoAudit?.extractedData as ExtractedData | null

  // CRO data
  const croFindings = croAudit?.findings as CroFinding[] | null
  const croRecommendations = croAudit?.recommendations as Recommendation[] | null
  const croExtracted = croAudit?.extractedContent as CroExtractedContent | null

  // Keyword data
  const keywords = kwSnapshot?.keywords as KeywordEntry[] | null
  const rankDist = kwSnapshot?.rankingDistribution as RankingDistribution | null

  return (
    <div className="report-page">
      {/* Header */}
      <header className="report-header">
        <a href="https://www.optimisedigital.online" target="_blank" rel="noopener noreferrer">
          <Image
            alt="Optimise Digital"
            height={100}
            width={460}
            src="/optimise-digital-logo-black.webp"
            className="report-header-logo"
          />
        </a>
        <span className="report-header-label">Client Report</span>
      </header>

      {/* Title */}
      <section className="report-title-section">
        <h1>{client.name}</h1>
        {(client as any).websiteUrl && (
          <a
            href={String((client as any).websiteUrl).startsWith('http') ? String((client as any).websiteUrl) : `https://${(client as any).websiteUrl}`}
            target="_blank"
            rel="noopener noreferrer"
            className="report-website-link"
          >
            {formatDomain(String((client as any).websiteUrl))}
          </a>
        )}
        <p className="report-date">Report generated {reportDate}</p>
      </section>

      {/* ============================================================ */}
      {/* SEO SECTION */}
      {/* ============================================================ */}
      {seoAudit && (
        <>
          <div className="section-divider">
            <h2 className="section-divider-title">SEO Audit</h2>
            <span className="section-divider-date">
              {new Date(seoAudit.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>

          <section className="audit-hero">
            <div className="audit-hero-score">
              <ScoreGauge score={seoAudit.overallScore} />
            </div>
            <div className="audit-hero-info">
              <dl className="audit-meta">
                <div>
                  <dt>Business Type</dt>
                  <dd>{seoAudit.businessType}</dd>
                </div>
                <div>
                  <dt>Pages Analyzed</dt>
                  <dd>{seoAudit.pagesAnalyzed ?? '—'}</dd>
                </div>
                <div>
                  <dt>Overall Score</dt>
                  <dd>{seoAudit.overallScore}/10</dd>
                </div>
              </dl>
            </div>
          </section>

          {/* Category Scores */}
          {categoryScores && typeof categoryScores === 'object' && !Array.isArray(categoryScores) && (
            <section className="audit-section">
              <h3>Category Scores</h3>
              <div className="score-bars">
                {Object.entries(categoryScores)
                  .sort(([, a], [, b]) => (b as number) - (a as number))
                  .map(([key, score]) => (
                    <ScoreBar key={key} label={categoryLabels[key] || key} score={score as number} />
                  ))}
              </div>
            </section>
          )}

          {/* Technical Overview */}
          {extractedData && typeof extractedData === 'object' && !Array.isArray(extractedData) && (
            <section className="audit-section">
              <h3>Technical Overview</h3>
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
              </div>
            </section>
          )}

          {/* Site-Wide Findings */}
          {siteWideFindings && Array.isArray(siteWideFindings) && siteWideFindings.length > 0 && (
            <section className="audit-section">
              <h3>Site-Wide Findings</h3>
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
              <h3>Page-by-Page Results</h3>
              <div className="page-results-grid">
                {pageResults.map((page, i) => {
                  const pageAvg = Object.values(page.scores).length
                    ? Math.round(
                        (Object.values(page.scores).reduce((a, b) => a + b, 0) /
                          Object.values(page.scores).length) * 10
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

          {/* SEO Recommendations */}
          {seoRecommendations && Array.isArray(seoRecommendations) && seoRecommendations.length > 0 && (
            <section className="audit-section">
              <h3>SEO Recommendations</h3>
              <div className="recommendations-list">
                {seoRecommendations.slice(0, 5).map((rec, i) => (
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
            </section>
          )}
        </>
      )}

      {/* ============================================================ */}
      {/* CRO SECTION */}
      {/* ============================================================ */}
      {croAudit && (
        <>
          <div className="section-divider">
            <h2 className="section-divider-title">CRO Audit</h2>
            <span className="section-divider-date">
              {new Date(croAudit.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>

          <section className="audit-hero">
            <div className="audit-hero-score">
              <ScoreGauge score={(croAudit as any).overallScore ?? 0} />
            </div>
            <div className="audit-hero-info">
              <dl className="audit-meta">
                <div>
                  <dt>Conversion Goal</dt>
                  <dd>{(croAudit as any).conversionGoal}</dd>
                </div>
                <div>
                  <dt>Overall Score</dt>
                  <dd>{(croAudit as any).overallScore ?? 0}/10</dd>
                </div>
              </dl>
            </div>
          </section>

          {/* CRO Sub-Scores */}
          <section className="audit-section">
            <h3>CRO Sub-Scores</h3>
            <div className="cro-scores-grid">
              <ScoreBar score={(croAudit as any).aboveFoldScore ?? 0} label="Above the Fold" />
              <ScoreBar score={(croAudit as any).ctaScore ?? 0} label="Call-to-Action" />
              <ScoreBar score={(croAudit as any).navigationScore ?? 0} label="Navigation" />
              <ScoreBar score={(croAudit as any).contentScore ?? 0} label="Content Structure" />
            </div>
          </section>

          {/* CRO Findings */}
          {croFindings && Array.isArray(croFindings) && croFindings.length > 0 && (
            <section className="audit-section">
              <h3>CRO Findings</h3>
              <ul className="findings-list">
                {croFindings.map((finding, i) => (
                  <li key={i} className={`finding-item finding-${finding.status}`}>
                    <StatusIcon status={finding.status} />
                    <span>{finding.message}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* CRO Recommendations */}
          {croRecommendations && Array.isArray(croRecommendations) && croRecommendations.length > 0 && (
            <section className="audit-section">
              <h3>CRO Recommendations</h3>
              <div className="recommendations-list">
                {croRecommendations.slice(0, 5).map((rec, i) => (
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
            </section>
          )}

          {/* Extracted Content Preview */}
          {croExtracted && (
            <section className="audit-section">
              <h3>Extracted Content</h3>
              <div className="extracted-content">
                {croExtracted.headline && (
                  <div className="extracted-item">
                    <span className="extracted-label">Main Headline</span>
                    <span className="extracted-value">{croExtracted.headline}</span>
                  </div>
                )}
                {croExtracted.navigationItems && croExtracted.navigationItems.length > 0 && (
                  <div className="extracted-item">
                    <span className="extracted-label">Navigation Items</span>
                    <div className="extracted-tags">
                      {croExtracted.navigationItems.map((item, i) => (
                        <span key={i} className="extracted-tag">{item}</span>
                      ))}
                    </div>
                  </div>
                )}
                {croExtracted.ctaTexts && croExtracted.ctaTexts.length > 0 && (
                  <div className="extracted-item">
                    <span className="extracted-label">CTA Buttons</span>
                    <div className="extracted-tags">
                      {croExtracted.ctaTexts.map((cta, i) => (
                        <span key={i} className="extracted-tag extracted-tag-cta">{cta}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
        </>
      )}

      {/* ============================================================ */}
      {/* KEYWORDS SECTION */}
      {/* ============================================================ */}
      {kwSnapshot && keywords && (
        <>
          <div className="section-divider">
            <h2 className="section-divider-title">Keyword Rankings</h2>
            <span className="section-divider-date">
              {new Date(kwSnapshot.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>

          {/* Metric Cards */}
          <section className="kw-metrics">
            <div className="metric-card">
              <span className="metric-value">{(kwSnapshot as any).totalKeywords ?? keywords.length}</span>
              <span className="metric-label">Total Keywords</span>
            </div>
            <div className="metric-card metric-card-green">
              <span className="metric-value">{(kwSnapshot as any).top10 ?? 0}</span>
              <span className="metric-label">Top 10</span>
            </div>
            <div className="metric-card">
              <span className="metric-value">{(kwSnapshot as any).avgPosition ? `#${Math.round((kwSnapshot as any).avgPosition)}` : '—'}</span>
              <span className="metric-label">Avg Position</span>
            </div>
            <div className="metric-card metric-card-amber">
              <span className="metric-value">{(kwSnapshot as any).opportunities ?? 0}</span>
              <span className="metric-label">Opportunities</span>
            </div>
          </section>

          {/* Ranking Distribution */}
          {rankDist && (
            <section className="audit-section">
              <h3>Ranking Distribution</h3>
              <div className="rank-dist-bar">
                {rankDist.top10 > 0 && (
                  <div className="rank-segment rank-seg-top10" style={{ flex: rankDist.top10 }}>
                    <span>Top 10</span><span>{rankDist.top10}</span>
                  </div>
                )}
                {(rankDist.top20 - rankDist.top10) > 0 && (
                  <div className="rank-segment rank-seg-top20" style={{ flex: rankDist.top20 - rankDist.top10 }}>
                    <span>11-20</span><span>{rankDist.top20 - rankDist.top10}</span>
                  </div>
                )}
                {(rankDist.top50 - rankDist.top20) > 0 && (
                  <div className="rank-segment rank-seg-top50" style={{ flex: rankDist.top50 - rankDist.top20 }}>
                    <span>21-50</span><span>{rankDist.top50 - rankDist.top20}</span>
                  </div>
                )}
                {rankDist.notFound > 0 && (
                  <div className="rank-segment rank-seg-none" style={{ flex: rankDist.notFound }}>
                    <span>Not Found</span><span>{rankDist.notFound}</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Keyword Table */}
          <section className="audit-section">
            <h3>Keyword Rankings</h3>
            <div className="kw-table-wrapper">
              <table className="kw-table">
                <thead>
                  <tr>
                    <th>Keyword</th>
                    <th>Position</th>
                    <th>Change</th>
                    <th>Volume</th>
                    <th>Opportunity</th>
                  </tr>
                </thead>
                <tbody>
                  {keywords.map((kw, i) => (
                    <tr key={i}>
                      <td className="kw-name">{kw.keyword}</td>
                      <td><PositionBadge position={kw.position} /></td>
                      <td><ChangeArrow current={kw.position} previous={kw.previousPosition} /></td>
                      <td className="kw-volume">{kw.searchVolume?.toLocaleString() ?? '—'}</td>
                      <td><OpportunityBadge opportunity={kw.opportunity} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* ============================================================ */}
      {/* FOOTER */}
      {/* ============================================================ */}
      <div className="audit-cta">
        <p className="audit-cta-text">Ready to grow your business online? Let our team turn these insights into results.</p>
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
    </div>
  )
}
