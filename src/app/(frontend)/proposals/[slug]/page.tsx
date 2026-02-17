import { getPayload } from 'payload'
import { notFound, redirect } from 'next/navigation'
import config from '@/payload.config'
import Image from 'next/image'
import RocketScroll from '@/components/RocketScroll'
import KeywordSunburst from '@/components/KeywordSunburst'
import StarField from '@/components/StarField'
import { RichText } from '@payloadcms/richtext-lexical/react'
import type { SerializedEditorState } from 'lexical'
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
  monthlyVisits: number | any[] | any
  globalRank: number | null
  sources: TrafficSources
}

// Traffic endpoint may return monthlyVisits as an array of {month, visits} objects.
// Normalize to a single number.
function normalizeMonthlyVisits(v: unknown): number {
  if (typeof v === 'number') return v
  if (Array.isArray(v) && v.length > 0) {
    const last = v[v.length - 1]
    return typeof last === 'number' ? last : (last?.visits ?? 0)
  }
  return 0
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
  websiteScreenshot?: string | null
  metaAds?: { isRunningAds: boolean; activeAdCount: number; adScreenshots: string[] } | null
  googleAds?: { isRunningAds: boolean; adCount: number; advertiserName: string | null; adScreenshots?: string[] } | null
  googleBusinessProfile?: GoogleBusinessProfile | null
}

type ContentCluster = {
  label: string
  questions: {
    question: string
    source: string
    modifier: string
    searchVolume: number | null
  }[]
}

type ContentResearchResult = {
  keyword: string
  location: string
  totalQuestions: number
  clusters: ContentCluster[]
  externalId?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isLexicalData(data: unknown): data is SerializedEditorState {
  return data != null && typeof data === 'object' && 'root' in (data as any)
}

function LegacyTextBlock({ text, className }: { text: string; className?: string }) {
  return (
    <div className={className}>
      {text.split('\n').map((s: string) => s.trim()).filter(Boolean).map((line: string, i: number) => (
        <p key={i}>{line}</p>
      ))}
    </div>
  )
}

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

const conversionGoalLabels: Record<string, string> = {
  'lead generation': 'Lead Generation',
  'phone calls': 'Phone Calls',
  'form submissions': 'Form Submissions',
  'e-commerce': 'E-commerce Sales',
  'bookings': 'Bookings / Appointments',
  'quote requests': 'Quote Requests',
  'email sign-ups': 'Email Sign-ups',
  'free trial': 'Free Trial Sign-ups',
  'content downloads': 'Content Downloads',
  'brand awareness': 'Brand Awareness',
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

function getCroSubInterpretation(label: string, score: number): string {
  if (score >= 8) return `Your ${label.toLowerCase()} is strong — keep it up.`
  if (score >= 5) return `Your ${label.toLowerCase()} has room for improvement — small tweaks could boost conversions.`
  return `Your ${label.toLowerCase()} needs attention — this is likely costing you leads.`
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
  const monthlyVisits = normalizeMonthlyVisits(comp.traffic?.monthlyVisits)
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
              <span className="comp-card-stat-value comp-card-stat-value-visits">{monthlyVisits ? formatTraffic(monthlyVisits) : '—'}</span>
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
            {gbp ? (
              <>
                <div className="comp-card-stat comp-card-stat-gbp">
                  <span className="comp-card-stat-value">
                    <span className="comp-gbp-rating-inline">
                      <StarRating rating={gbp.rating} />
                      <span className="comp-gbp-rating-num">{gbp.rating}</span>
                    </span>
                  </span>
                  <span className="comp-card-stat-label">GBP Rating</span>
                </div>
                <div className="comp-card-stat comp-card-stat-gbp">
                  <span className="comp-card-stat-value">{gbp.reviewCount ?? '—'}</span>
                  <span className="comp-card-stat-label">Reviews</span>
                </div>
                <div className="comp-card-stat comp-card-stat-gbp">
                  <span className="comp-card-stat-value">
                    {gbp.responseRate != null ? `${Math.round(gbp.responseRate * 100)}%` : <YesNoBadge value={gbp.respondsToReviews} />}
                  </span>
                  <span className="comp-card-stat-label">Response</span>
                </div>
              </>
            ) : (
              <div className="comp-card-stat comp-card-stat-gbp">
                <span className="comp-card-stat-value comp-gbp-none-value">—</span>
                <span className="comp-card-stat-label">GBP</span>
              </div>
            )}
          </div>
          {sources && (sources.organicSearch > 0 || sources.paidSearch > 0) && (
            <TrafficBar organic={sources.organicSearch} paid={sources.paidSearch} />
          )}
        </div>
        <div className="comp-card-thumbnails">
          {comp.websiteScreenshot ? (
            <div className="screenshot-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={comp.websiteScreenshot.startsWith('data:') ? comp.websiteScreenshot : `data:image/png;base64,${comp.websiteScreenshot}`}
                alt={`${comp.domain} website fold`}
                className="screenshot-img"
              />
              <div className="screenshot-hover">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={comp.websiteScreenshot.startsWith('data:') ? comp.websiteScreenshot : `data:image/png;base64,${comp.websiteScreenshot}`}
                  alt={`${comp.domain} website fold expanded`}
                  className="screenshot-hover-img"
                />
              </div>
            </div>
          ) : (
            <div className="screenshot-placeholder">
              <span className="screenshot-initial">{domainInitial}</span>
              <span className="screenshot-domain">{comp.domain}</span>
            </div>
          )}
          {comp.metaAds?.adScreenshots && comp.metaAds.adScreenshots.length > 0 && (
            <a href={comp.metaAds.adScreenshots[0]} target="_blank" rel="noopener noreferrer" className="meta-ad-link">
              View Meta Ad
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

function deterministicHash(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0x7fffffff
  }
  return hash
}

function SerpMockup({ keyword, domain, position }: { keyword: string; domain: string; position: number | null }) {
  const displayPos = position ?? 1
  const resultCount = 100_000 + (deterministicHash(keyword) % 900_000)
  const formattedCount = resultCount.toLocaleString()

  // Build fake SERP entries — client site at its position, filler for the rest
  const fillerDomains = ['example.com', 'wikipedia.org', 'reddit.com', 'forbes.com', 'yelp.com']
  const entries: { title: string; url: string; desc: string; isYou: boolean }[] = []
  const maxSlots = Math.min(3, Math.max(displayPos, 2))
  let fillerIdx = 0

  for (let rank = 1; rank <= maxSlots; rank++) {
    if (rank === displayPos) {
      entries.push({
        title: `${keyword.charAt(0).toUpperCase() + keyword.slice(1)} — ${domain}`,
        url: `https://${domain}`,
        desc: `Discover the best ${keyword.toLowerCase()} services. Trusted by thousands of customers across Australia.`,
        isYou: true,
      })
    } else {
      const fd = fillerDomains[fillerIdx % fillerDomains.length]
      fillerIdx++
      entries.push({
        title: `${keyword.charAt(0).toUpperCase() + keyword.slice(1)} — ${fd}`,
        url: `https://www.${fd}`,
        desc: `Learn more about ${keyword.toLowerCase()}. Find information, reviews, and resources.`,
        isYou: false,
      })
    }
  }

  return (
    <div className="serp-mockup">
      <div className="serp-search-bar">
        <span className="serp-google-logo">G</span>
        <span className="serp-search-text">{keyword}</span>
      </div>
      <div className="serp-result-count">About {formattedCount} results</div>
      <div className="serp-results">
        {entries.map((entry, i) => (
          <div key={i} className={`serp-result ${entry.isYou ? 'serp-result-you' : ''}`}>
            <span className="serp-result-url">{entry.url}</span>
            <span className="serp-result-title">{entry.title}</span>
            <span className="serp-result-desc">{entry.desc}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Force dynamic rendering — CMS edits (e.g. content research keyword selection)
// must reflect immediately without needing a rebuild or cache purge.
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function findProposalBySlug(slug: string) {
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })

  const result = await payload.find({
    collection: 'client-proposals',
    where: { slug: { equals: slug } },
    depth: 2,
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

  const [seoResult, croResult, kwResult, compResult, crResult] = await Promise.all([
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
    payload.find({
      collection: 'content-researches',
      where: { proposal: { equals: proposal.id } },
      sort: '-createdAt',
      limit: 10,
      overrideAccess: true,
    }),
  ])

  const seoAudit = seoResult.docs[0] ?? null
  const croAudit = croResult.docs[0] ?? null
  const kwSnapshot = kwResult.docs[0] ?? null
  const compAnalysis = compResult.docs[0] ?? null
  const contentResearches: (ContentResearchResult & { id: number })[] = crResult.docs.map((doc: any) => ({
    id: doc.id,
    keyword: doc.keyword,
    location: doc.location,
    totalQuestions: doc.totalQuestions,
    clusters: doc.clusters as ContentCluster[],
    externalId: doc.externalId,
  }))

  if (!seoAudit && !croAudit && !kwSnapshot && !compAnalysis) {
    const mockupUrl = (proposal as any).websiteMockupUrl as string | undefined
    if (mockupUrl) {
      redirect(`/mockup/${proposal.slug}`)
    }
    notFound()
  }

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

  // CMS override fields for your profile
  const overrideMonthlyVisits = (proposal as any).overrideMonthlyVisits as number | null
  const overrideAvgPosition = (proposal as any).overrideAvgPosition as number | null
  const overrideKeywordsFound = (proposal as any).overrideKeywordsFound as number | null

  // Build yourProfileWithOverrides — merge CMS overrides into API data
  // If no API profile exists but overrides are set, create a stub profile so the card still renders
  const hasAnyOverride = overrideMonthlyVisits != null || overrideAvgPosition != null || overrideKeywordsFound != null
  const baseProfile: CompetitorProfile = yourProfile ?? {
    domain: domainFromUrl(proposal.websiteUrl),
    traffic: null,
    websiteScreenshot: null,
    metaAds: null,
    googleAds: null,
    googleBusinessProfile: null,
  }
  const yourProfileWithOverrides: CompetitorProfile | null = (yourProfile || hasAnyOverride)
    ? {
        ...baseProfile,
        ...(overrideMonthlyVisits != null
          ? { traffic: { ...(baseProfile.traffic ?? { monthlyVisits: 0, globalRank: null, sources: { direct: 0, organicSearch: 0, paidSearch: 0, social: 0, email: 0, referrals: 0 } }), monthlyVisits: overrideMonthlyVisits } }
          : {}),
        ...(overrideAvgPosition != null ? { avgPosition: overrideAvgPosition, averagePosition: overrideAvgPosition } : {}),
        ...(overrideKeywordsFound != null ? { keywordsFound: overrideKeywordsFound } : {}),
      }
    : null

  // CMS competitor entries (for domain matching and meta ads overrides)
  const cmsCompetitors = (proposal.competitors ?? []) as { name: string; websiteUrl?: string | null; googleMapsUrl?: string | null; hasMetaAds?: boolean }[]

  // Split competitors: CMS-added vs search-discovered
  const cmsCompetitorDomains = new Set(
    cmsCompetitors
      .map((c) => c.websiteUrl ? domainFromUrl(c.websiteUrl) : null)
      .filter(Boolean) as string[]
  )

  // Build meta ads override lookup: domain → true
  const metaAdsOverrides = new Map<string, boolean>()
  for (const c of cmsCompetitors) {
    if (c.hasMetaAds && c.websiteUrl) {
      metaAdsOverrides.set(domainFromUrl(c.websiteUrl), true)
    }
  }

  // Apply meta ads overrides to allCompetitors
  const allCompetitorsWithOverrides = (allCompetitors ?? []).map((comp) => {
    const cleanDomain = comp.domain?.replace(/^www\./, '') ?? ''
    if (metaAdsOverrides.has(cleanDomain)) {
      return {
        ...comp,
        metaAds: comp.metaAds
          ? { ...comp.metaAds, isRunningAds: true }
          : { isRunningAds: true, activeAdCount: 0, adScreenshots: [] },
      }
    }
    return comp
  })

  const cmsAddedCount = cmsCompetitorDomains.size
  const searchCompetitorLimit = Math.max(0, 6 - cmsAddedCount)

  const selectedCompetitors: CompetitorProfile[] = []
  const searchCompetitors: CompetitorProfile[] = []
  const matchedCmsDomains = new Set<string>()

  if (allCompetitorsWithOverrides.length > 0) {
    for (const comp of allCompetitorsWithOverrides) {
      const cleanDomain = comp.domain?.replace(/^www\./, '') ?? ''
      if (cleanDomain && cmsCompetitorDomains.has(cleanDomain)) {
        selectedCompetitors.push(comp)
        matchedCmsDomains.add(cleanDomain)
      } else {
        searchCompetitors.push(comp)
      }
    }
    searchCompetitors.sort((a, b) => normalizeMonthlyVisits(b.traffic?.monthlyVisits) - normalizeMonthlyVisits(a.traffic?.monthlyVisits))
  }

  // Create stub CompetitorProfile entries for CMS competitors not matched in API data
  // Try to find screenshot from API data using fuzzy domain matching
  const allCompsByDomain = new Map<string, CompetitorProfile>()
  for (const comp of allCompetitorsWithOverrides) {
    const key = (comp.domain || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
    if (key) allCompsByDomain.set(key, comp)
  }

  for (const c of cmsCompetitors) {
    if (!c.websiteUrl) continue
    const domain = domainFromUrl(c.websiteUrl)
    if (!matchedCmsDomains.has(domain)) {
      const hasMetaOverride = metaAdsOverrides.has(domain)
      // Look up partial match in API data (the domain might differ slightly)
      const apiMatch = allCompsByDomain.get(domain)
      // Build traffic object from estimatedTraffic if traffic is missing
      const trafficData = apiMatch?.traffic
        ?? (apiMatch?.estimatedTraffic != null
          ? { monthlyVisits: apiMatch.estimatedTraffic, globalRank: null, sources: { direct: 0, organicSearch: 0, paidSearch: 0, social: 0, email: 0, referrals: 0 } }
          : null)
      selectedCompetitors.push({
        domain,
        traffic: trafficData,
        avgPosition: apiMatch?.avgPosition ?? apiMatch?.averagePosition ?? undefined,
        keywordsFound: apiMatch?.keywordsFound ?? undefined,
        topKeywords: apiMatch?.topKeywords ?? undefined,
        estimatedTraffic: apiMatch?.estimatedTraffic ?? undefined,
        websiteScreenshot: apiMatch?.websiteScreenshot ?? null,
        metaAds: hasMetaOverride
          ? { isRunningAds: true, activeAdCount: 0, adScreenshots: [] }
          : apiMatch?.metaAds ?? null,
        googleAds: apiMatch?.googleAds ?? null,
        googleBusinessProfile: apiMatch?.googleBusinessProfile ?? null,
      })
    }
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
  const competitorTrafficValues = allCompetitorsWithOverrides
    .map(c => normalizeMonthlyVisits(c.traffic?.monthlyVisits))
    .filter((v): v is number => v != null && v > 0)
  const avgCompetitorTraffic = competitorTrafficValues.length > 0
    ? Math.round(competitorTrafficValues.reduce((a, b) => a + b, 0) / competitorTrafficValues.length)
    : null

  // Flight plan content (CMS-editable field, fallback to suggestions)
  const flightPlanRaw = (proposal as any).flightPlan as SerializedEditorState | string | null
  const flightPlanContent = flightPlanRaw || proposal.suggestions || null

  // Mission Control data (Slide 11)
  const leadConversionRate = (proposal as any).leadConversionRate as number | null
  const leadToSaleConversionRate = (proposal as any).leadToSaleConversionRate as number | null
  const averageOrderValue = (proposal as any).averageOrderValue as number | null

  // Mission Brief extras (Slide 5)
  const hasPhysicalLocations = (proposal as any).hasPhysicalLocations as boolean | null
  const numberOfLocations = (proposal as any).numberOfLocations as number | null

  // Additional business metrics
  const annualPurchaseFrequency = (proposal as any).annualPurchaseFrequency as number | null
  const newCustomersLast12Months = (proposal as any).newCustomersLast12Months as number | null

  // Flight Plan images (Slide 12)
  const flightPlanImages = (proposal as any).flightPlanImages as { image: any; caption?: string }[] | null

  // Mission Resources (Slide 13) & Launch Requirements (Slide 14)
  const missionResources = (proposal as any).missionResources as SerializedEditorState | string | null
  const launchRequirements = (proposal as any).launchRequirements as SerializedEditorState | string | null

  // Content Research keyword selection from CMS (relationship IDs or populated docs)
  const contentResearchKeywordsRaw = (proposal as any).contentResearchKeywords as (number | { id: number; keyword: string; location?: string; totalQuestions?: number; clusters?: ContentCluster[]; externalId?: string })[] | null

  // Build Mission Control rows: business + competitors
  const missionControlRows: { name: string; monthlyVisits: number; leadConvRate: number; leads: number; leadToSaleRate: number; payingClients: number; monthlyReturn: number; annualReturnValue: number | null; isYou?: boolean }[] = []
  if (leadConversionRate != null && leadToSaleConversionRate != null && averageOrderValue != null) {
    const yourVisits = normalizeMonthlyVisits(yourProfileWithOverrides?.traffic?.monthlyVisits)
    const lcr = leadConversionRate / 100
    const ltsr = leadToSaleConversionRate / 100
    const aov = averageOrderValue
    const apf = annualPurchaseFrequency

    // Business row
    const yourLeads = Math.round(yourVisits * lcr)
    const yourClients = Math.round(yourLeads * ltsr)
    const yourMonthlyReturn = yourClients * aov
    const yourAnnualReturn = apf != null ? yourClients * aov * apf : null
    missionControlRows.push({
      name: proposal.businessName,
      monthlyVisits: yourVisits,
      leadConvRate: leadConversionRate,
      leads: yourLeads,
      leadToSaleRate: leadToSaleConversionRate,
      payingClients: yourClients,
      monthlyReturn: yourMonthlyReturn,
      annualReturnValue: yourAnnualReturn,
      isYou: true,
    })

    // Competitor rows
    const allComps = [...selectedCompetitors, ...displaySearchCompetitors]
    for (const comp of allComps) {
      const visits = normalizeMonthlyVisits(comp.traffic?.monthlyVisits)
      const compLeads = Math.round(visits * lcr)
      const compClients = Math.round(compLeads * ltsr)
      const compMonthlyReturn = compClients * aov
      const compAnnualReturn = apf != null ? compClients * aov * apf : null
      missionControlRows.push({
        name: comp.domain ?? 'Unknown',
        monthlyVisits: visits,
        leadConvRate: leadConversionRate,
        leads: compLeads,
        leadToSaleRate: leadToSaleConversionRate,
        payingClients: compClients,
        monthlyReturn: compMonthlyReturn,
        annualReturnValue: compAnnualReturn,
      })
    }

    // Sort competitor rows by monthly visits (descending), keep "you" row first
    missionControlRows.sort((a, b) => {
      if (a.isYou) return -1
      if (b.isYou) return 1
      return b.monthlyVisits - a.monthlyVisits
    })
  }

  const websiteMockupUrl = (proposal as any).websiteMockupUrl as string | undefined

  // Slide visibility — selected slides are REMOVED (hidden)
  const hiddenSlides = (proposal as any).visibleSlides as string[] | null
  const showSlide = (n: number) => !hiddenSlides || hiddenSlides.length === 0 || !hiddenSlides.includes(String(n))

  return (
    <RocketScroll>
      <div className="report-presentation">

        {/* ============================================================ */}
        {/* SLIDE 18 — Launch Requirements + Space Station               */}
        {/* ============================================================ */}
        {showSlide(18) && <section className="slide slide-18 slide-expandable">
          <StarField seed={42} />
          <div className="slide-header slide-header-dark">
            <h2>10. Launch Requirements</h2>
            <span>Next Steps</span>
          </div>
          {showSlide(19) && (
            <div className="slide-18-station">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/slides/Space-station-optimise-digital.png" alt="Optimise Digital — Your Growth Partner" />
            </div>
          )}
          <div className="slide-content">
            {launchRequirements ? (
              <div className="cms-copy-block">
                {isLexicalData(launchRequirements) ? (
                  <RichText data={launchRequirements} />
                ) : (
                  <LegacyTextBlock text={launchRequirements as string} />
                )}
              </div>
            ) : (
              <div className="slide-placeholder-block">
                <span>Content will be added after your strategy session.</span>
              </div>
            )}
          </div>
        </section>}

        {/* ============================================================ */}
        {/* SLIDE 17 — Mission Resources                                */}
        {/* ============================================================ */}
        {showSlide(17) && <section className="slide slide-17 slide-expandable">
          <div className="slide-header">
            <h2>9. Mission Resources</h2>
            <span>Commercial Model &amp; Pricing</span>
          </div>
          <div className="slide-content">
            {missionResources ? (
              <div className="cms-copy-block">
                {isLexicalData(missionResources) ? (
                  <RichText data={missionResources} />
                ) : (
                  <LegacyTextBlock text={missionResources as string} />
                )}
              </div>
            ) : (
              <div className="slide-placeholder-block">
                <span>Content will be added after your strategy session.</span>
              </div>
            )}
          </div>
        </section>}

        {/* ============================================================ */}
        {/* SLIDE 16 — Flight Plan                                      */}
        {/* ============================================================ */}
        {showSlide(16) && <section className="slide slide-16 slide-expandable">
          <div className="slide-header">
            <h2>8. Flight Plan</h2>
            <span>Roadmap &amp; Timeframes</span>
          </div>
          <div className="slide-content">
            {flightPlanImages && flightPlanImages.length > 0 && (
              <div className="flight-plan-images">
                {flightPlanImages.map((item, i) => {
                  const imgUrl = typeof item.image === 'object' && item.image?.url ? item.image.url : null
                  if (!imgUrl) return null
                  return (
                    <figure key={i} className="flight-plan-image-wrap">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imgUrl} alt={item.caption || `Flight plan image ${i + 1}`} className="flight-plan-img" />
                      {item.caption && <figcaption className="flight-plan-caption">{item.caption}</figcaption>}
                    </figure>
                  )
                })}
              </div>
            )}

            {flightPlanContent && (
              isLexicalData(flightPlanContent) ? (
                <div className="cms-copy-block">
                  <RichText data={flightPlanContent} />
                </div>
              ) : (
                <div className="suggestions-list">
                  {(flightPlanContent as string)
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
              )
            )}

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/slides/slide-12.webp" alt="Flight Plan Timeline — 1 to 12 months and ongoing" className="flight-plan-timeline-img" />

            {websiteMockupUrl && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '40px' }}>
                <a
                  href={`/mockup/${proposal.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-block',
                    padding: '14px 32px',
                    background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                    color: '#fff',
                    borderRadius: '12px',
                    textDecoration: 'none',
                    fontWeight: 600,
                    fontSize: '16px',
                    boxShadow: '0 4px 20px rgba(59, 130, 246, 0.4)',
                  }}
                >
                  View Website Mockup
                </a>
              </div>
            )}
          </div>
        </section>}

        {/* ============================================================ */}
        {/* SLIDE 15 — Mission Control                                  */}
        {/* ============================================================ */}
        {showSlide(15) && <section className="slide slide-15 slide-expandable">
          <div className="slide-header">
            <h2>7. Mission Control</h2>
            <span>Data &amp; Success Metrics</span>
          </div>
          <div className="slide-content">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/slides/slide-11.webp" alt="Funnel: Web Traffic → Leads → Paying Clients → Value" className="mission-control-funnel" />

            {missionControlRows.length > 0 && (
              <>
                <div className="mc-table-wrapper">
                  <table className="mc-table">
                    <colgroup>
                      <col className="mc-col-business" />
                      <col className="mc-col-visits" />
                      <col className="mc-col-lcr" />
                      <col className="mc-col-leads" />
                      <col className="mc-col-ltsr" />
                      <col className="mc-col-clients" />
                      <col className="mc-col-return" />
                      {missionControlRows[0]?.annualReturnValue != null && <col className="mc-col-annual" />}
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Business</th>
                        <th>Monthly Visits</th>
                        <th>Lead Conv. Rate</th>
                        <th>Leads</th>
                        <th>Lead → Sale</th>
                        <th>Paying Clients</th>
                        <th>Monthly Return</th>
                        {missionControlRows[0]?.annualReturnValue != null && <th>Annual Return Value</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {missionControlRows.map((row, i) => (
                        <tr key={i} className={row.isYou ? 'mc-row-you' : ''}>
                          <td className="mc-name">{row.name}</td>
                          <td>{formatTraffic(row.monthlyVisits)}</td>
                          <td>{row.leadConvRate}%</td>
                          <td>{row.leads.toLocaleString()}</td>
                          <td>{row.leadToSaleRate}%</td>
                          <td>{row.payingClients.toLocaleString()}</td>
                          <td className="mc-return">${row.monthlyReturn.toLocaleString()}</td>
                          {row.annualReturnValue != null && <td className="mc-return">${row.annualReturnValue.toLocaleString()}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mc-notes">
                  <div className="mc-notes-data">
                    {averageOrderValue != null && (
                      <span className="mc-pill">AOV: ${averageOrderValue.toLocaleString()}</span>
                    )}
                    {annualPurchaseFrequency != null && (
                      <span className="mc-pill">Purchase Frequency: {annualPurchaseFrequency}x / year</span>
                    )}
                  </div>
                  <div className="mc-notes-formulas">
                    <p>Monthly Return = Paying Clients &times; AOV</p>
                    {missionControlRows[0]?.annualReturnValue != null && (
                      <p>Annual Return Value = Paying Clients &times; AOV &times; Annual Purchase Frequency</p>
                    )}
                  </div>
                </div>
              </>
            )}

            {missionControlRows.length === 0 && (
              <div className="slide-placeholder-block">
                <span>
                  {leadConversionRate == null && 'Missing: Lead Conversion Rate. '}
                  {leadToSaleConversionRate == null && 'Missing: Lead to Sale Rate. '}
                  {averageOrderValue == null && 'Missing: Average Order Value. '}
                  {leadConversionRate != null && leadToSaleConversionRate != null && averageOrderValue != null
                    ? 'Run competitor analysis to populate traffic data.'
                    : 'Fill in all three fields in the CMS to populate this table.'}
                </span>
              </div>
            )}
          </div>
        </section>}

        {/* ============================================================ */}
        {/* SLIDE 14 — Fueling the Ship: Competitor Ads                */}
        {/* ============================================================ */}
        {showSlide(14) && <section className="slide slide-14 slide-expandable">
          <div className="slide-header">
            <h2>6. Fueling the Ship</h2>
            <span>2nd Stage Burn</span>
          </div>
          <div className="slide-content">
            {(() => {
              const allComps = [...allCompetitorsWithOverrides]
              const googleAdsComps = allComps.filter(c => c.googleAds?.isRunningAds)
              const metaAdsComps = allComps.filter(c => c.metaAds?.isRunningAds)
              const hasAnyAds = googleAdsComps.length > 0 || metaAdsComps.length > 0

              if (!hasAnyAds) return (
                <div className="slide-placeholder-block">
                  <span>No competitor ad data found. Run audits to collect competitor advertising intelligence.</span>
                </div>
              )

              return (
                <div className="slide-10-layout">
                  <div className="slide-10-col">
                    <h3>Google Ads</h3>
                    {googleAdsComps.length > 0 ? googleAdsComps.map((comp, i) => (
                      <div key={i} className="ad-comp-card">
                        <div className="ad-comp-header">
                          <span className="ad-comp-domain">{comp.domain}</span>
                          <span className="ad-comp-count">{comp.googleAds?.adCount ?? 0} ads</span>
                        </div>
                        {comp.googleAds?.advertiserName && (
                          <span className="ad-comp-advertiser">Advertiser: {comp.googleAds.advertiserName}</span>
                        )}
                        {comp.googleAds?.adScreenshots && comp.googleAds.adScreenshots.length > 0 && (
                          <div className="ad-screenshots-grid">
                            {comp.googleAds.adScreenshots.slice(0, 5).map((url, j) => {
                              const src = url.startsWith('data:') ? url : (url.startsWith('http') ? url : `data:image/png;base64,${url}`)
                              return (
                                <div key={j} className="ad-thumbnail-wrap">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={src} alt={`${comp.domain} Google ad ${j + 1}`} className="ad-screenshot-thumb" />
                                  <div className="ad-thumbnail-hover">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={src} alt={`${comp.domain} Google ad ${j + 1}`} className="ad-thumbnail-large" />
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )) : (
                      <div className="slide-10-slot">No competitors running Google Ads</div>
                    )}
                  </div>
                  <div className="slide-10-col">
                    <h3>Meta Ads</h3>
                    {metaAdsComps.length > 0 ? metaAdsComps.map((comp, i) => (
                      <div key={i} className="ad-comp-card">
                        <div className="ad-comp-header">
                          <span className="ad-comp-domain">{comp.domain}</span>
                          <span className="ad-comp-count">{comp.metaAds?.activeAdCount ?? 0} active</span>
                        </div>
                        {comp.metaAds?.adScreenshots && comp.metaAds.adScreenshots.length > 0 && (
                          <div className="meta-ad-links">
                            {comp.metaAds.adScreenshots.slice(0, 5).map((url, j) => (
                              <a key={j} href={url} target="_blank" rel="noopener noreferrer" className="meta-ad-link">
                                View Ad {j + 1}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )) : (
                      <div className="slide-10-slot">No competitors running Meta Ads</div>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        </section>}

        {/* ============================================================ */}
        {/* SLIDE 13 — Fueling the Ship: Content Research              */}
        {/* ============================================================ */}
        {showSlide(13) && <section className="slide slide-13 slide-expandable">
          <div className="slide-header">
            <h2>6. Fueling the Ship</h2>
            <span>Propulsion</span>
          </div>
          <div className="slide-content">
            {contentResearches.length > 0 ? (
              <>
                <div className="cr-intro-copy">
                  <p className="cr-intro-bold">Is your website answering these questions?</p>
                  <p className="cr-intro-sub">These are the questions your potential customers are actively searching for. Each sunburst shows the most popular questions grouped by type — the bigger the slice, the more people are searching for it.</p>
                </div>
                {(() => {
                  // Deduplicate content researches by keyword (keep most recent — array is sorted by -createdAt)
                  const uniqueCr: (ContentResearchResult & { id: number })[] = []
                  const seenKeywords = new Set<string>()
                  for (const cr of contentResearches) {
                    const key = cr.keyword.toLowerCase()
                    if (!seenKeywords.has(key)) {
                      seenKeywords.add(key)
                      uniqueCr.push(cr)
                    }
                  }

                  // Build a lookup by numeric ID for cross-referencing
                  const crById = new Map<number, ContentResearchResult & { id: number }>()
                  for (const cr of uniqueCr) crById.set(Number(cr.id), cr)

                  let displayCr: ContentResearchResult[]

                  // If CMS has specific content researches selected, show ALL of them (no limit)
                  if (contentResearchKeywordsRaw && contentResearchKeywordsRaw.length > 0) {
                    displayCr = []
                    for (const item of contentResearchKeywordsRaw) {
                      if (typeof item === 'object' && item != null) {
                        // Populated doc — check if it has clusters directly
                        if (Array.isArray(item.clusters) && item.clusters.length > 0) {
                          displayCr.push({
                            keyword: item.keyword,
                            location: item.location || '',
                            totalQuestions: item.totalQuestions || 0,
                            clusters: item.clusters,
                            externalId: item.externalId,
                          })
                        } else {
                          // Populated doc but clusters missing/empty — look up from separate query
                          const match = crById.get(Number(item.id))
                          if (match) displayCr.push(match)
                        }
                      } else {
                        // Just an ID (number) — look up from separate query
                        const match = crById.get(Number(item))
                        if (match) displayCr.push(match)
                      }
                    }
                  } else {
                    // Auto-select top 4 unique keywords by search volume
                    const kwVolumeMap = new Map<string, number>()
                    if (keywords) {
                      for (const kw of keywords) {
                        kwVolumeMap.set(kw.keyword.toLowerCase(), kw.searchVolume ?? 0)
                      }
                    }
                    displayCr = [...uniqueCr].sort((a, b) => {
                      const volA = kwVolumeMap.get(a.keyword.toLowerCase()) ?? 0
                      const volB = kwVolumeMap.get(b.keyword.toLowerCase()) ?? 0
                      return volB - volA
                    }).slice(0, 4)
                  }

                  return (
                    <div className="cr-sunburst-grid">
                      {displayCr.map((cr, crIdx) => (
                        <div key={crIdx} className="cr-sunburst-section">
                          <div className="cr-sunburst-wrap">
                            <KeywordSunburst keyword={cr.keyword} clusters={cr.clusters} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </>
            ) : (
              <div className="slide-placeholder-block">
                <span>Run audits to collect content research data.</span>
              </div>
            )}
          </div>
        </section>}

        {/* ============================================================ */}
        {/* SLIDE 12 — Building the Ship: SEO Recommendations           */}
        {/* ============================================================ */}
        {showSlide(12) && seoAudit && seoRecommendations && Array.isArray(seoRecommendations) && seoRecommendations.length > 0 && (
          <section className="slide slide-12 slide-expandable">
            <div className="slide-header">
              <h2>5. Building the Ship</h2>
              <span>Structural Foundation</span>
            </div>
            <div className="slide-content">
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
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/* SLIDE 11 — Building the Ship: Technical + Page Results       */}
        {/* ============================================================ */}
        {showSlide(11) && seoAudit && (
          <section className="slide slide-11 slide-expandable">
            <div className="slide-header">
              <h2>5. Building the Ship</h2>
              <span>Structural Foundation</span>
            </div>
            <div className="slide-content">
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
                    {extractedData && typeof extractedData === 'object' && !Array.isArray(extractedData) && extractedData.schemaTypes && extractedData.schemaTypes.length > 0 && (
                      <div className="tech-schema-tags">
                        <span className="tech-schema-label">Schema types:</span>
                        {extractedData.schemaTypes.map((type: string, i: number) => (
                          <span key={i} className="tech-schema-tag">{type}</span>
                        ))}
                      </div>
                    )}
                  </section>
                )}
              </div>

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
                        <div key={i} className="page-card page-card-inline">
                          <span className="page-type-badge">{page.pageType}</span>
                          <span className="page-url">{page.url.replace(/^https?:\/\/[^/]+/, '') || '/'}</span>
                          <ScoreBadge score={pageAvg} />
                        </div>
                      )
                    })}
                  </div>
                </section>
                </>
              )}
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/* SLIDE 10 — Building the Ship: SEO Overview + Category Scores */}
        {/* ============================================================ */}
        {showSlide(10) && seoAudit && (
          <section className="slide slide-10 slide-expandable">
            <div className="slide-header">
              <h2>5. Building the Ship</h2>
              <span>Structural Foundation</span>
            </div>
            <div className="slide-content">
              <section className="audit-hero audit-hero-with-serp">
                <div className="audit-hero-score">
                  <ScoreGauge score={seoAudit.overallScore} />
                </div>
                <div className="audit-hero-info">
                  <h3 className="audit-hero-label">Search Engine Optimisation</h3>
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
                {keywords && keywords.length > 0 && (() => {
                  const firstKw = keywords[0]
                  const clientDomain = domainFromUrl(proposal.websiteUrl)
                  return (
                    <div className="audit-hero-serp">
                      <SerpMockup keyword={firstKw.keyword} domain={clientDomain} position={firstKw.position} />
                    </div>
                  )
                })()}
              </section>

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
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/* SLIDE 9 — Mission Priorities: CRO Recommendations           */}
        {/* ============================================================ */}
        {showSlide(9) && croAudit && ((croRecommendations && Array.isArray(croRecommendations) && croRecommendations.length > 0) || croExtracted) && (
          <section className="slide slide-9 slide-expandable">
            <div className="slide-header">
              <h2>4. Mission Priorities</h2>
              <span>Where to Focus Our Energy</span>
            </div>
            <div className="slide-content">
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
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/* SLIDE 8 — Mission Priorities: CRO Overview + Findings        */}
        {/* ============================================================ */}
        {showSlide(8) && croAudit && (
          <section className="slide slide-8 slide-expandable">
            <div className="slide-header">
              <h2>4. Mission Priorities</h2>
              <span>Where to Focus Our Energy</span>
            </div>
            <div className="slide-content">
              <section className="audit-hero">
                <div className="audit-hero-score">
                  <ScoreGauge score={(croAudit as any).overallScore ?? 0} />
                </div>
                <div className="audit-hero-info">
                  <h3 className="audit-hero-label">Conversion Rate Optimisation</h3>
                  <p className="audit-hero-summary">{getCroSummary((croAudit as any).overallScore ?? 0)}</p>
                  <dl className="audit-meta">
                    <div>
                      <dt>Website Conversion Goal</dt>
                      <dd>{conversionGoalLabels[(croAudit as any).conversionGoal] || (croAudit as any).conversionGoal}</dd>
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
                  {[
                    { label: 'Above the Fold', score: (croAudit as any).aboveFoldScore ?? 0 },
                    { label: 'Call-to-Action', score: (croAudit as any).ctaScore ?? 0 },
                    { label: 'Navigation', score: (croAudit as any).navigationScore ?? 0 },
                    { label: 'Content Structure', score: (croAudit as any).contentScore ?? 0 },
                  ].map(({ label, score }) => (
                    <div key={label} className="cro-score-with-interpretation">
                      <ScoreBar score={score} label={label} />
                      <p className="cro-interpretation">{getCroSubInterpretation(label, score)}</p>
                    </div>
                  ))}
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
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/* SLIDE 7 — Pre-flight Check: Competitor Analysis              */}
        {/* ============================================================ */}
        {showSlide(7) && (yourProfileWithOverrides || (allCompetitorsWithOverrides.length > 0)) && (
          <section className="slide slide-7 slide-expandable">
            <div className="slide-header">
              <h2>3. Pre-flight Check</h2>
              <span>Competitor Analysis</span>
            </div>
            <div className="slide-content">
              <section className="audit-section">
                <div className="comp-cards">
                  {yourProfileWithOverrides && (
                    <CompetitorCard
                      comp={{ ...yourProfileWithOverrides, domain: yourProfileWithOverrides.domain || domainFromUrl(proposal.websiteUrl) }}
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

              {yourProfileWithOverrides?.topKeywords && yourProfileWithOverrides.topKeywords.length > 0 && (
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
                        {yourProfileWithOverrides.topKeywords.map((kw, i) => (
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
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/* SLIDE 6 — Pre-flight Check: Keywords Analysis                */}
        {/* ============================================================ */}
        {showSlide(6) && kwSnapshot && keywords && (
          <section className="slide slide-6 slide-expandable">
            <div className="slide-header">
              <h2>3. Pre-flight Check</h2>
              <span>Keywords Analysis</span>
            </div>
            <div className="slide-content">
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
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/* SLIDE 5 — Mission Brief: Client Overview + Instrument Panel  */}
        {/* ============================================================ */}
        {showSlide(5) && <section className="slide slide-5 slide-expandable">
          <div className="slide-header">
            <h2>2. Mission Brief</h2>
            <span>Overview</span>
          </div>
          <div className="slide-content">
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
                    <span className="client-overview-value">{conversionGoalLabels[proposal.conversionGoal] || proposal.conversionGoal}</span>
                  </div>
                )}
              </div>
              {proposal.businessGoals && (
                <div className="client-goals">
                  <span className="client-overview-label">Business Goal</span>
                  <p className="client-goals-text">{proposal.businessGoals}</p>
                </div>
              )}
              {(averageOrderValue != null || hasPhysicalLocations || leadConversionRate != null || leadToSaleConversionRate != null || annualPurchaseFrequency != null || newCustomersLast12Months != null) && (
                <div className="mission-brief-details">
                  {averageOrderValue != null && (
                    <div className="mission-brief-detail">
                      <span className="mission-brief-detail-label">Avg Order Value</span>
                      <span className="mission-brief-detail-value">${averageOrderValue.toLocaleString()}</span>
                    </div>
                  )}
                  {hasPhysicalLocations && (
                    <div className="mission-brief-detail">
                      <span className="mission-brief-detail-label">Physical Locations</span>
                      <span className="mission-brief-detail-value">{numberOfLocations ?? 'Yes'}</span>
                    </div>
                  )}
                  {leadConversionRate != null && (
                    <div className="mission-brief-detail">
                      <span className="mission-brief-detail-label">Lead Conversion Rate</span>
                      <span className="mission-brief-detail-value">{leadConversionRate}%</span>
                    </div>
                  )}
                  {leadToSaleConversionRate != null && (
                    <div className="mission-brief-detail">
                      <span className="mission-brief-detail-label">Lead to Sale Rate</span>
                      <span className="mission-brief-detail-value">{leadToSaleConversionRate}%</span>
                    </div>
                  )}
                  {annualPurchaseFrequency != null && (
                    <div className="mission-brief-detail">
                      <span className="mission-brief-detail-label">Annual Purchase Frequency</span>
                      <span className="mission-brief-detail-value">{annualPurchaseFrequency}x</span>
                    </div>
                  )}
                  {newCustomersLast12Months != null && (
                    <div className="mission-brief-detail">
                      <span className="mission-brief-detail-label">New Customers (12 months)</span>
                      <span className="mission-brief-detail-value">{newCustomersLast12Months.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              )}
              <span className="client-overview-date">Report generated {reportDate}</span>
            </section>

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

            {(() => {
              const tamData = (proposal as any).tam
              if (!tamData) return null
              return (
                <section className="client-overview tam-section">
                  <div className="cms-copy-block tam-copy">
                    {isLexicalData(tamData) ? (
                      <RichText data={tamData} />
                    ) : (
                      <LegacyTextBlock text={tamData as string} />
                    )}
                  </div>
                </section>
              )
            })()}
          </div>
        </section>}

        {/* ============================================================ */}
        {/* SLIDE 4 — Our Flight Philosophy (chart)                     */}
        {/* ============================================================ */}
        {showSlide(4) && <section className="slide slide-4">
          <div className="slide-header">
            <h2>1. Our Flight Philosophy</h2>
            <span>Build and Fix the Spaceship Before Anything Else</span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/slides/slide-4.webp" alt="Our Flight Philosophy — chart" className="slide-static-img" />
        </section>}

        {/* ============================================================ */}
        {/* SLIDE 3 — Our Flight Philosophy (approach)                  */}
        {/* ============================================================ */}
        {showSlide(3) && <section className="slide slide-3">
          <div className="slide-header">
            <h2>1. Our Flight Philosophy</h2>
            <span>Our Approach</span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/slides/slide-3.webp" alt="Our Flight Philosophy — approach" className="slide-static-img" />
        </section>}

        {/* ============================================================ */}
        {/* SLIDE 2 — What This Covers                                  */}
        {/* ============================================================ */}
        {showSlide(2) && <section className="slide slide-2">
          <div className="slide-header">
            <h2>What This Covers</h2>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/slides/slide-2.webp" alt="What This Covers" className="slide-static-img" />
        </section>}

        {/* ============================================================ */}
        {/* SLIDE 1 — Intro (bottom of page = user starts here)         */}
        {/* ============================================================ */}
        {showSlide(1) && <section className="slide slide-1">
          <div className="slide-1-inner">
            <a href="https://www.optimisedigital.online" target="_blank" rel="noopener noreferrer">
              <Image
                alt="Optimise Digital"
                height={100}
                width={460}
                src="/optimise-digital-logo-black.webp"
                className="report-header-logo"
                priority
              />
            </a>
            <span className="slide-1-label">Pre-launch Assessment</span>
            <h1 className="slide-1-business">{proposal.businessName}</h1>
          </div>
        </section>}

      </div>
    </RocketScroll>
  )
}
