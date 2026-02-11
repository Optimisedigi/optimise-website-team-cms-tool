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
  canonicalsUsed?: boolean
  hreflangUsed?: boolean
  canonicalMismatches?: number
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

type TrafficSources = {
  direct: number
  organicSearch: number
  paidSearch: number
  social: number
  email: number
  referrals: number
}

type TrafficData = {
  monthlyVisits: number
  globalRank: number | null
  sources: TrafficSources
}

type GoogleBusinessProfile = {
  name: string
  rating: number
  reviewCount: number
  category: string | null
  respondsToReviews: boolean
  responseRate: number | null
}

type CompetitorProfile = {
  rank?: number
  domain?: string
  avgPosition?: number
  averagePosition?: number
  keywordsFound?: number
  estimatedTraffic?: number
  topKeywords?: { keyword: string; position: number }[]
  traffic?: TrafficData | null
  socialLinks?: Record<string, string | null>
  metaAds?: { isRunningAds: boolean; activeAdCount: number; adScreenshots: string[] } | null
  googleAds?: { isRunningAds: boolean; adCount: number; advertiserName: string | null } | null
  googleBusinessProfile?: GoogleBusinessProfile | null
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

function domainFromUrl(url: string): string {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '')
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
  }
}

function formatTraffic(visits: number): string {
  if (visits >= 1_000_000) return `${(visits / 1_000_000).toFixed(1)}M`
  if (visits >= 1_000) return `${(visits / 1_000).toFixed(1)}K`
  return visits.toLocaleString()
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`
}

function competitionFromOpportunity(opportunity: string): string {
  if (opportunity === 'high') return 'Low'
  if (opportunity === 'medium') return 'Medium'
  return 'High'
}

function getCroSummary(score: number): string {
  if (score >= 9) return 'Excellent conversion optimisation in place.'
  if (score >= 7) return 'Strong conversion foundations with minor improvements needed.'
  if (score >= 5) return 'Good foundation with room for improvement.'
  if (score >= 3) return 'Several conversion opportunities need attention.'
  return 'Significant conversion optimisation needed.'
}

function getSeoSummary(score: number): string {
  if (score >= 9) return 'Excellent SEO foundations across the site.'
  if (score >= 7) return 'Strong SEO presence with some areas to refine.'
  if (score >= 5) return 'Reasonable SEO base, but key improvements will drive growth.'
  if (score >= 3) return 'Multiple SEO issues limiting visibility and rankings.'
  return 'Major SEO gaps requiring immediate attention.'
}

const businessTypeLabels: Record<string, string> = {
  trades: 'Trades & Home Services',
  services: 'Professional Services',
  ecommerce: 'E-commerce / Retail',
  healthcare: 'Healthcare',
  hospitality: 'Hospitality & Food',
  realestate: 'Real Estate',
  education: 'Education & Training',
  saas: 'SaaS / Technology',
  other: 'Other',
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
        <text x={cx} y={cy - 30} textAnchor="middle" dominantBaseline="auto"
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
  const scorePct = (score / 10) * 100
  return (
    <div className="gradient-bar-row">
      <span className="gradient-bar-label">{label}</span>
      <div className="gradient-bar-wrapper">
        <div className="gradient-bar-track" />
        <div className="gradient-bar-indicator" style={{ left: `${scorePct}%` }}>
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

function OverviewScoreCard({ label, value, subtitle, color }: { label: string; value: string; subtitle?: string; color?: string }) {
  return (
    <div className={`overview-score-card ${color ? `overview-score-${color}` : ''}`}>
      <span className="overview-score-value">{value}</span>
      <span className="overview-score-label">{label}</span>
      {subtitle && <span className="overview-score-subtitle">{subtitle}</span>}
    </div>
  )
}

function TrafficBar({ organic, paid }: { organic: number; paid: number }) {
  const orgPct = Math.round(organic * 100)
  const paidPct = Math.round(paid * 100)
  return (
    <div className="traffic-bar-container">
      <div className="traffic-bar">
        {orgPct > 0 && <div className="traffic-bar-organic" style={{ width: `${orgPct}%` }} />}
        {paidPct > 0 && <div className="traffic-bar-paid" style={{ width: `${paidPct}%` }} />}
      </div>
      <div className="traffic-bar-legend">
        <span className="traffic-legend-item traffic-legend-organic">Organic {pct(organic)}</span>
        <span className="traffic-legend-item traffic-legend-paid">Paid {pct(paid)}</span>
      </div>
    </div>
  )
}

function YesNoBadge({ value }: { value: boolean }) {
  return (
    <span className={`yesno-badge ${value ? 'yesno-yes' : 'yesno-no'}`}>
      {value ? 'Yes' : 'No'}
    </span>
  )
}

function StarRating({ rating }: { rating: number }) {
  const fullStars = Math.floor(rating)
  const hasHalf = rating - fullStars >= 0.3
  const stars: string[] = []
  for (let i = 0; i < 5; i++) {
    if (i < fullStars) stars.push('\u2605')
    else if (i === fullStars && hasHalf) stars.push('\u00BD')
    else stars.push('\u2606')
  }
  return <span className="star-rating">{stars.join('')}</span>
}

function CompetitionBadge({ level }: { level: string }) {
  const cls = level === 'Low' ? 'comp-level-low' : level === 'Medium' ? 'comp-level-medium' : 'comp-level-high'
  return <span className={`competition-badge ${cls}`}>{level}</span>
}

function CompetitorCard({
  comp,
  index,
  isYou,
  sourceLabel,
}: {
  comp: CompetitorProfile
  index: number
  isYou?: boolean
  sourceLabel?: string
}) {
  const monthlyVisits = comp.traffic?.monthlyVisits
  const sources = comp.traffic?.sources
  const avgPos = comp.averagePosition ?? comp.avgPosition
  const runsGoogleAds = comp.googleAds?.isRunningAds ?? false
  const runsMetaAds = comp.metaAds?.isRunningAds ?? false
  const googleAdCount = comp.googleAds?.adCount ?? 0
  const metaAdCount = comp.metaAds?.activeAdCount ?? 0
  const domainInitial = comp.domain ? comp.domain.charAt(0).toUpperCase() : '?'
  const firstAdScreenshot = comp.metaAds?.adScreenshots?.[0] ?? null
  const gbp = comp.googleBusinessProfile

  return (
    <div className={`comp-card ${isYou ? 'comp-card-you' : ''}`}>
      <div className="comp-card-inner">
        <div className="comp-card-content">
          <div className="comp-card-header">
            {isYou ? (
              <span className="comp-rank-badge comp-rank-you">YOU</span>
            ) : (
              <span className="comp-rank-badge">#{index}</span>
            )}
            <span className="comp-domain">{comp.domain}</span>
            {sourceLabel && <span className="comp-source-label">{sourceLabel}</span>}
          </div>
          <div className="comp-card-stats">
            <div className="comp-card-stat">
              <span className="comp-card-stat-value">{monthlyVisits ? formatTraffic(monthlyVisits) : '—'}</span>
              <span className="comp-card-stat-label">Monthly Visits</span>
            </div>
            <div className="comp-card-stat">
              <span className="comp-card-stat-value">{avgPos ? `#${Math.round(avgPos)}` : '—'}</span>
              <span className="comp-card-stat-label">Avg Position</span>
            </div>
            <div className="comp-card-stat">
              <span className="comp-card-stat-value">{comp.keywordsFound ?? '—'}</span>
              <span className="comp-card-stat-label">Keywords</span>
            </div>
            <div className="comp-card-stat">
              <span className="comp-card-stat-value">
                <YesNoBadge value={runsGoogleAds} />
              </span>
              <span className="comp-card-stat-label">Google Ads{runsGoogleAds && googleAdCount > 0 ? ` (${googleAdCount})` : ''}</span>
            </div>
            <div className="comp-card-stat">
              <span className="comp-card-stat-value">
                <YesNoBadge value={runsMetaAds} />
              </span>
              <span className="comp-card-stat-label">Meta Ads{runsMetaAds && metaAdCount > 0 ? ` (${metaAdCount})` : ''}</span>
            </div>
          </div>
          {sources && (sources.organicSearch > 0 || sources.paidSearch > 0) && (
            <TrafficBar organic={sources.organicSearch} paid={sources.paidSearch} />
          )}
          {/* Google Business Profile */}
          {gbp ? (
            <div className="comp-gbp">
              <div className="comp-gbp-header">
                <span className="comp-gbp-icon">&#x1F4CD;</span>
                <span className="comp-gbp-name">{gbp.name}</span>
                {gbp.category && <span className="comp-gbp-category">{gbp.category}</span>}
              </div>
              <div className="comp-gbp-stats">
                <div className="comp-gbp-rating">
                  <StarRating rating={gbp.rating} />
                  <span className="comp-gbp-rating-num">{gbp.rating}</span>
                  <span className="comp-gbp-reviews">({gbp.reviewCount} reviews)</span>
                </div>
                <div className="comp-gbp-response">
                  <span className="comp-gbp-response-label">Responds to reviews:</span>
                  <YesNoBadge value={gbp.respondsToReviews} />
                  {gbp.responseRate != null && (
                    <span className="comp-gbp-response-rate">{Math.round(gbp.responseRate * 100)}%</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="comp-gbp comp-gbp-none">
              <span className="comp-gbp-icon">&#x1F4CD;</span>
              <span className="comp-gbp-no-listing">No Google Business Profile found</span>
            </div>
          )}
        </div>
        <div className="comp-card-thumbnails">
          <div className="screenshot-placeholder">
            <span className="screenshot-initial">{domainInitial}</span>
            <span className="screenshot-domain">{comp.domain}</span>
          </div>
          {firstAdScreenshot && (
            <div className="ad-thumbnail-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={firstAdScreenshot}
                alt={`Ad by ${comp.domain}`}
                className="ad-thumbnail"
              />
              <div className="ad-thumbnail-hover">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={firstAdScreenshot}
                  alt={`Ad by ${comp.domain}`}
                  className="ad-thumbnail-large"
                />
              </div>
              <span className="ad-thumbnail-label">Ad</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function findProposalBySlug(slug: string) {
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })

  const result = await payload.find({
    collection: 'client-proposals',
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
  const proposal = await findProposalBySlug(slug)
  if (!proposal) return { title: 'Report Not Found' }
  return {
    title: `Pre-launch Assessment — ${proposal.businessName}`,
    description: `Pre-launch SEO, CRO, keyword, and competitor assessment for ${proposal.businessName}`,
    robots: { index: false, follow: false },
  }
}

export default async function ProposalReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const proposal = await findProposalBySlug(slug)

  if (!proposal) notFound()

  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })

  const [seoResult, croResult, kwResult, compResult] = await Promise.all([
    payload.find({
      collection: 'seo-audits',
      where: { proposal: { equals: proposal.id } },
      sort: '-createdAt',
      limit: 1,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'cro-audits',
      where: { proposal: { equals: proposal.id } },
      sort: '-createdAt',
      limit: 1,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'keyword-snapshots',
      where: { proposal: { equals: proposal.id } },
      sort: '-createdAt',
      limit: 1,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'competitor-analyses',
      where: { proposal: { equals: proposal.id } },
      sort: '-createdAt',
      limit: 1,
      overrideAccess: true,
    }),
  ])

  const seoAudit = seoResult.docs[0] ?? null
  const croAudit = croResult.docs[0] ?? null
  const kwSnapshot = kwResult.docs[0] ?? null
  const compAnalysis = compResult.docs[0] ?? null

  if (!seoAudit && !croAudit && !kwSnapshot && !compAnalysis) notFound()

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

  // Keyword data — sorted by search volume descending
  const rawKeywords = kwSnapshot?.keywords as KeywordEntry[] | null
  const keywords = rawKeywords
    ? [...rawKeywords].sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))
    : null

  // Competitor data
  const yourProfile = compAnalysis?.yourProfile as CompetitorProfile | null
  const allCompetitors = compAnalysis?.competitors as CompetitorProfile[] | null

  // Split competitors: CMS-added vs search-discovered
  const cmsCompetitorDomains = new Set(
    (proposal.competitors ?? [])
      .map((c: { name: string; websiteUrl?: string | null }) => c.websiteUrl ? domainFromUrl(c.websiteUrl) : null)
      .filter(Boolean) as string[]
  )

  const cmsAddedCount = cmsCompetitorDomains.size
  const searchCompetitorLimit = Math.max(0, 6 - cmsAddedCount)

  const selectedCompetitors: CompetitorProfile[] = []
  const searchCompetitors: CompetitorProfile[] = []

  if (allCompetitors) {
    for (const comp of allCompetitors) {
      if (comp.domain && cmsCompetitorDomains.has(comp.domain.replace(/^www\./, ''))) {
        selectedCompetitors.push(comp)
      } else {
        searchCompetitors.push(comp)
      }
    }
    searchCompetitors.sort((a, b) => (b.traffic?.monthlyVisits ?? 0) - (a.traffic?.monthlyVisits ?? 0))
  }

  const displaySearchCompetitors = searchCompetitors.slice(0, searchCompetitorLimit)

  // Overview scores
  const seoScore = seoAudit?.overallScore ?? null
  const croScore = (croAudit as any)?.overallScore ?? null

  // Total monthly search volume (sum of all keyword volumes)
  const totalMonthlySearchVolume = keywords && keywords.length > 0
    ? keywords.reduce((sum, kw) => sum + (kw.searchVolume ?? 0), 0)
    : null

  // Avg competitor monthly traffic
  const competitorTrafficValues = (allCompetitors ?? [])
    .map(c => c.traffic?.monthlyVisits)
    .filter((v): v is number => v != null && v > 0)
  const avgCompetitorTraffic = competitorTrafficValues.length > 0
    ? Math.round(competitorTrafficValues.reduce((a, b) => a + b, 0) / competitorTrafficValues.length)
    : null

  // Flight plan content (CMS-editable field, fallback to suggestions)
  const flightPlanContent = proposal.flightPlan || proposal.suggestions || null

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
        <span className="report-header-label">Pre-launch Assessment</span>
      </header>

      {/* Client Overview */}
      <section className="client-overview">
        <div className="client-overview-header">
          <h1 className="client-overview-name">{proposal.businessName}</h1>
          {proposal.websiteUrl && (
            <a
              href={proposal.websiteUrl.startsWith('http') ? proposal.websiteUrl : `https://${proposal.websiteUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="client-overview-url"
            >
              {formatDomain(proposal.websiteUrl)}
            </a>
          )}
        </div>
        <div className="client-overview-meta">
          {proposal.businessType && (
            <div className="client-overview-item">
              <span className="client-overview-label">Business Type</span>
              <span className="client-overview-value">{businessTypeLabels[proposal.businessType] || proposal.businessType}</span>
            </div>
          )}
          {proposal.conversionGoal && (
            <div className="client-overview-item">
              <span className="client-overview-label">Website Conversion Goal</span>
              <span className="client-overview-value">{proposal.conversionGoal}</span>
            </div>
          )}
        </div>
        {proposal.businessGoals && (
          <div className="client-goals">
            <span className="client-overview-label">Business Goal</span>
            <p className="client-goals-text">{proposal.businessGoals}</p>
          </div>
        )}
        <span className="client-overview-date">Report generated {reportDate}</span>
      </section>

      {/* ============================================================ */}
      {/* INSTRUMENT PANEL + OVERVIEW SCORES                           */}
      {/* ============================================================ */}
      {(seoScore != null || croScore != null || totalMonthlySearchVolume != null || avgCompetitorTraffic != null) && (
        <section className="instrument-panel">
          <div className="instrument-panel-cards">
            {totalMonthlySearchVolume != null && (
              <OverviewScoreCard
                label="Monthly Search Volume"
                value={formatTraffic(totalMonthlySearchVolume)}
                subtitle={`across ${keywords?.length ?? 0} keywords`}
              />
            )}
            {avgCompetitorTraffic != null && (
              <OverviewScoreCard
                label="Competitor Monthly Web Traffic"
                value={formatTraffic(avgCompetitorTraffic)}
                subtitle="avg across competitors"
              />
            )}
            {croScore != null && (
              <OverviewScoreCard
                label="Website Conversion Rate Optimisation Score"
                value={`${croScore}/10`}
                color={croScore >= 7 ? 'green' : croScore >= 4 ? 'amber' : 'red'}
              />
            )}
            {seoScore != null && (
              <OverviewScoreCard
                label="Current Website SEO Score"
                value={`${seoScore}/10`}
                color={seoScore >= 7 ? 'green' : seoScore >= 4 ? 'amber' : 'red'}
              />
            )}
          </div>
        </section>
      )}

      {/* ============================================================ */}
      {/* SECTION 1: "PRE-FLIGHT CHECK" — Keywords + Competitors       */}
      {/* ============================================================ */}
      {(kwSnapshot || compAnalysis) && (
        <>
          <div className="section-divider">
            <h2 className="section-divider-title">Pre-flight Check</h2>
            <span className="section-divider-subtitle">Keywords &amp; Competitor Analysis</span>
          </div>

          {/* --- Keywords --- */}
          {kwSnapshot && keywords && (
            <>
              <div className="subsection-divider">
                <h3 className="subsection-divider-title">Keyword Rankings</h3>
              </div>

              <section className="audit-section">
                <div className="kw-table-wrapper">
                  <table className="kw-table">
                    <colgroup>
                      <col className="col-keyword" />
                      <col className="col-volume" />
                      <col className="col-competition" />
                      <col className="col-rank" />
                      <col className="col-position" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Keyword</th>
                        <th>Monthly Search Volume</th>
                        <th>Competition</th>
                        <th>Do you rank for these keywords?</th>
                        <th>Avg Position</th>
                      </tr>
                    </thead>
                    <tbody>
                      {keywords.map((kw, i) => (
                        <tr key={i}>
                          <td className="kw-name">{kw.keyword}</td>
                          <td className="kw-volume">{kw.searchVolume?.toLocaleString() ?? '—'}</td>
                          <td><CompetitionBadge level={competitionFromOpportunity(kw.opportunity)} /></td>
                          <td><YesNoBadge value={kw.position != null && kw.position > 0} /></td>
                          <td className="kw-avg-pos">
                            {kw.position != null && kw.position > 0 ? (
                              <span className={`kw-position ${kw.position <= 10 ? 'kw-top10' : kw.position <= 20 ? 'kw-top20' : kw.position <= 50 ? 'kw-top50' : 'kw-low'}`}>
                                #{kw.position}
                              </span>
                            ) : (
                              <span className="kw-position kw-not-found">&mdash;</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {/* --- Competitor Analysis --- */}
          {compAnalysis && (yourProfile || (allCompetitors && allCompetitors.length > 0)) && (
            <>
              <div className="subsection-divider">
                <h3 className="subsection-divider-title">Competitor Analysis</h3>
              </div>

              <section className="audit-section">
                <div className="comp-cards">
                  {yourProfile && (
                    <CompetitorCard
                      comp={{ ...yourProfile, domain: yourProfile.domain || domainFromUrl(proposal.websiteUrl) }}
                      index={0}
                      isYou
                    />
                  )}
                  {displaySearchCompetitors.map((comp, i) => (
                    <CompetitorCard key={`search-${i}`} comp={comp} index={i + 1} sourceLabel="Search-based" />
                  ))}
                  {selectedCompetitors.map((comp, i) => (
                    <CompetitorCard key={`selected-${i}`} comp={comp} index={displaySearchCompetitors.length + i + 1} sourceLabel="Inputted" />
                  ))}
                </div>
              </section>

              {yourProfile?.topKeywords && yourProfile.topKeywords.length > 0 && (
                <>
                <div className="subsection-divider">
                  <h3 className="subsection-divider-title">Your Keyword Positions</h3>
                </div>
                <section className="audit-section">
                  <div className="kw-table-wrapper">
                    <table className="kw-table">
                      <thead>
                        <tr>
                          <th>Keyword</th>
                          <th>Position</th>
                        </tr>
                      </thead>
                      <tbody>
                        {yourProfile.topKeywords.map((kw, i) => (
                          <tr key={i}>
                            <td className="kw-name">{kw.keyword}</td>
                            <td>
                              {kw.position ? (
                                <span className={`kw-position ${kw.position <= 10 ? 'kw-top10' : kw.position <= 20 ? 'kw-top20' : kw.position <= 50 ? 'kw-top50' : 'kw-low'}`}>
                                  #{kw.position}
                                </span>
                              ) : (
                                <span className="kw-position kw-not-found">&mdash;</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
                </>
              )}
            </>
          )}
        </>
      )}

      {/* ============================================================ */}
      {/* SECTION 2: "MISSION PRIORITIES" — CRO Audit                  */}
      {/* ============================================================ */}
      {croAudit && (
        <>
          <div className="section-divider">
            <h2 className="section-divider-title">Mission Priorities</h2>
            <span className="section-divider-subtitle">Conversion Rate Optimisation</span>
          </div>

          <section className="audit-hero">
            <div className="audit-hero-score">
              <ScoreGauge score={(croAudit as any).overallScore ?? 0} />
            </div>
            <div className="audit-hero-info">
              <p className="audit-hero-summary">{getCroSummary((croAudit as any).overallScore ?? 0)}</p>
              <dl className="audit-meta">
                <div>
                  <dt>Website Conversion Goal</dt>
                  <dd>{(croAudit as any).conversionGoal}</dd>
                </div>
                <div>
                  <dt>Overall Score</dt>
                  <dd>{(croAudit as any).overallScore ?? 0}/10</dd>
                </div>
              </dl>
            </div>
          </section>

          <div className="subsection-divider">
            <h3 className="subsection-divider-title">CRO Sub-Scores</h3>
          </div>
          <section className="audit-section">
            <div className="cro-scores-grid">
              <ScoreBar score={(croAudit as any).aboveFoldScore ?? 0} label="Above the Fold" />
              <ScoreBar score={(croAudit as any).ctaScore ?? 0} label="Call-to-Action" />
              <ScoreBar score={(croAudit as any).navigationScore ?? 0} label="Navigation" />
              <ScoreBar score={(croAudit as any).contentScore ?? 0} label="Content Structure" />
            </div>
          </section>

          {croFindings && Array.isArray(croFindings) && croFindings.length > 0 && (
            <>
            <div className="subsection-divider">
              <h3 className="subsection-divider-title">CRO Findings</h3>
            </div>
            <section className="audit-section">
              <ul className="findings-list">
                {croFindings.map((finding, i) => (
                  <li key={i} className={`finding-item finding-${finding.status}`}>
                    <StatusIcon status={finding.status} />
                    <span>{finding.message}</span>
                  </li>
                ))}
              </ul>
            </section>
            </>
          )}

          {croRecommendations && Array.isArray(croRecommendations) && croRecommendations.length > 0 && (
            <>
            <div className="subsection-divider">
              <h3 className="subsection-divider-title">CRO Recommendations</h3>
            </div>
            <section className="audit-section">
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
            </>
          )}

          {croExtracted && (
            <>
            <div className="subsection-divider">
              <h3 className="subsection-divider-title">Extracted Content</h3>
            </div>
            <section className="audit-section">
              <div className="extracted-content">
                <div className="extracted-two-col">
                  {croExtracted.headline && (
                    <div className="extracted-item">
                      <span className="extracted-label">Main Headline</span>
                      <span className="extracted-value">{croExtracted.headline}</span>
                      {croExtracted.subHeadlines && croExtracted.subHeadlines.length > 0 && (
                        <div className="extracted-sub-headlines">
                          {croExtracted.subHeadlines.map((sub, i) => (
                            <span key={i} className="extracted-sub-headline">{sub}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {croExtracted.ctaTexts && croExtracted.ctaTexts.length > 0 && (
                    <div className="extracted-item">
                      <span className="extracted-label">CTA Buttons</span>
                      <div className="extracted-cta-list">
                        {croExtracted.ctaTexts.map((cta, i) => (
                          <span key={i} className="extracted-tag extracted-tag-cta">{cta}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
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
              </div>
            </section>
            </>
          )}
        </>
      )}

      {/* ============================================================ */}
      {/* SECTION 3: "BUILDING THE SHIP" — SEO Audit                   */}
      {/* ============================================================ */}
      {seoAudit && (
        <>
          <div className="section-divider">
            <h2 className="section-divider-title">Building the Ship</h2>
            <span className="section-divider-subtitle">SEO Audit</span>
          </div>

          <section className="audit-hero">
            <div className="audit-hero-score">
              <ScoreGauge score={seoAudit.overallScore} />
            </div>
            <div className="audit-hero-info">
              <p className="audit-hero-summary">{getSeoSummary(seoAudit.overallScore)}</p>
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

          {/* Category Scores — 3 columns */}
          {categoryScores && typeof categoryScores === 'object' && !Array.isArray(categoryScores) && (
            <>
            <div className="subsection-divider">
              <h3 className="subsection-divider-title">Category Scores</h3>
            </div>
            <section className="audit-section">
              <div className="score-bars score-bars-3col">
                {Object.entries(categoryScores)
                  .sort(([, a], [, b]) => (b as number) - (a as number))
                  .map(([key, score]) => (
                    <ScoreBar key={key} label={categoryLabels[key] || key} score={score as number} />
                  ))}
              </div>
            </section>
            </>
          )}

          {/* Technical Overview + Site-Wide Findings — side by side, findings gets more space */}
          <div className="subsection-divider subsection-divider-row">
            <h3 className="subsection-divider-title">Technical Overview &amp; Site-Wide Findings</h3>
          </div>
          <div className="seo-compact-row">
            {extractedData && typeof extractedData === 'object' && !Array.isArray(extractedData) && (
              <section className="audit-section seo-compact-half seo-compact-tech">
                <h4 className="seo-compact-title">Technical Overview</h4>
                <div className="tech-grid-compact">
                  <div className={`tech-item ${extractedData.sitemapFound ? 'tech-pass' : 'tech-fail'}`}>
                    <span className="tech-item-icon">{extractedData.sitemapFound ? '\u2713' : '\u2717'}</span>
                    <span>Sitemap</span>
                  </div>
                  <div className={`tech-item ${extractedData.robotsTxtFound ? 'tech-pass' : 'tech-fail'}`}>
                    <span className="tech-item-icon">{extractedData.robotsTxtFound ? '\u2713' : '\u2717'}</span>
                    <span>robots.txt</span>
                  </div>
                  <div className={`tech-item ${(extractedData.schemaTypes && extractedData.schemaTypes.length > 0) ? 'tech-pass' : 'tech-fail'}`}>
                    <span className="tech-item-icon">{(extractedData.schemaTypes && extractedData.schemaTypes.length > 0) ? '\u2713' : '\u2717'}</span>
                    <span>Structured Data{extractedData.schemaTypes && extractedData.schemaTypes.length > 0 ? ` (${extractedData.schemaTypes.length})` : ''}</span>
                  </div>
                  {extractedData.canonicalsUsed != null && (
                    <div className={`tech-item ${extractedData.canonicalsUsed ? 'tech-pass' : 'tech-fail'}`}>
                      <span className="tech-item-icon">{extractedData.canonicalsUsed ? '\u2713' : '\u2717'}</span>
                      <span>Canonicals</span>
                    </div>
                  )}
                  {extractedData.hreflangUsed != null && (
                    <div className={`tech-item ${extractedData.hreflangUsed ? 'tech-pass' : 'tech-fail'}`}>
                      <span className="tech-item-icon">{extractedData.hreflangUsed ? '\u2713' : '\u2717'}</span>
                      <span>Hreflang</span>
                    </div>
                  )}
                  {extractedData.canonicalMismatches != null && extractedData.canonicalMismatches > 0 && (
                    <div className="tech-item tech-fail">
                      <span className="tech-item-val">{extractedData.canonicalMismatches}</span>
                      <span>Canonical Mismatches</span>
                    </div>
                  )}
                  <div className="tech-item tech-neutral">
                    <span className="tech-item-val">{extractedData.totalImages ?? 0}</span>
                    <span>Images</span>
                  </div>
                  <div className={`tech-item ${extractedData.imagesWithoutAlt === 0 ? 'tech-pass' : 'tech-fail'}`}>
                    <span className="tech-item-val">{extractedData.imagesWithoutAlt ?? 0}</span>
                    <span>Missing Alt</span>
                  </div>
                  <div className="tech-item tech-neutral">
                    <span className="tech-item-val">{extractedData.totalInternalLinks ?? 0}</span>
                    <span>Int. Links</span>
                  </div>
                </div>
                {extractedData.schemaTypes && extractedData.schemaTypes.length > 0 && (
                  <div className="tech-schema-tags">
                    <span className="tech-schema-label">Schema types:</span>
                    {extractedData.schemaTypes.map((type, i) => (
                      <span key={i} className="tech-schema-tag">{type}</span>
                    ))}
                  </div>
                )}
              </section>
            )}

            {siteWideFindings && Array.isArray(siteWideFindings) && siteWideFindings.length > 0 && (
              <section className="audit-section seo-compact-half seo-compact-findings">
                <h4 className="seo-compact-title">Site-Wide Findings</h4>
                <ul className="findings-list findings-list-compact">
                  {siteWideFindings.map((finding, i) => (
                    <li key={i} className={`finding-item finding-compact finding-${finding.status}`}>
                      <StatusIcon status={finding.status} />
                      <span>{finding.message}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {/* Page-by-Page Results */}
          {pageResults && Array.isArray(pageResults) && pageResults.length > 0 && (
            <>
            <div className="subsection-divider">
              <h3 className="subsection-divider-title">Page-by-Page Results</h3>
            </div>
            <section className="audit-section">
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
            </>
          )}

          {seoRecommendations && Array.isArray(seoRecommendations) && seoRecommendations.length > 0 && (
            <>
            <div className="subsection-divider">
              <h3 className="subsection-divider-title">SEO Recommendations</h3>
            </div>
            <section className="audit-section">
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
            </>
          )}
        </>
      )}

      {/* ============================================================ */}
      {/* SECTION 4: "FLIGHT PLAN" — Editable from CMS                 */}
      {/* ============================================================ */}
      <div className="section-divider">
        <h2 className="section-divider-title">Flight Plan</h2>
        <span className="section-divider-subtitle">Ideas &amp; Opportunities</span>
      </div>

      {flightPlanContent && (
        <section className="audit-section">
          <div className="suggestions-list">
            {flightPlanContent
              .split('\n')
              .map((s: string) => s.trim())
              .filter(Boolean)
              .map((line: string, i: number) => (
                <div key={i} className="suggestion-item">
                  <span className="suggestion-bullet">&#x2192;</span>
                  <span>{line}</span>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* TODO: Google Slides embed — add <iframe> or embed component here when ready */}

      <section className="audit-section flight-plan-placeholder">
        <p className="flight-plan-note">Detailed roadmap and deliverables will be discussed in your strategy session.</p>
      </section>

      {/* Footer — no CTA */}
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
