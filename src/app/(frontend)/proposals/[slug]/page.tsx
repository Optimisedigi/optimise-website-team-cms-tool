import { getPayload } from 'payload'
import { notFound, redirect } from 'next/navigation'
import config from '@/payload.config'
import Image from 'next/image'
import RocketScroll from '@/components/RocketScroll'
import KeywordSunburst from '@/components/KeywordSunburst'
import StarField from '@/components/StarField'
import { RichText, defaultJSXConverters, TextJSXConverter } from '@payloadcms/richtext-lexical/react'
import type { SerializedEditorState } from 'lexical'
import './report.css'

// Font size map matching proposalEditor TextStateFeature config
const FONT_SIZE_MAP: Record<string, string> = {
  'size-sm': '14px',
  'size-base': '16px',
  'size-lg': '20px',
  'size-xl': '24px',
  'size-2xl': '32px',
}

// Custom JSX converters that apply TextStateFeature font sizes as inline styles
const defaultTextConverter = TextJSXConverter.text as (args: { node: any }) => React.ReactNode
const richTextConverters = {
  ...defaultJSXConverters,
  text: ({ node }: { node: any }) => {
    let text = defaultTextConverter({ node })

    // Apply font size from TextStateFeature state (Lexical serializes node state under '$')
    const fontSize = node.$?.fontSize
    if (fontSize && FONT_SIZE_MAP[fontSize]) {
      text = <span style={{ fontSize: FONT_SIZE_MAP[fontSize] }}>{text}</span>
    }

    return text
  },
}

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

function domainToBusinessName(domain: string): string {
  // Strip www. prefix, then take only the first segment (before any dot) as the business name
  const withoutWww = domain.replace(/^www\./, '')
  const name = withoutWww.split('.')[0]
  // Split on hyphens/underscores and title-case each word
  return name
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
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
  'sitemap/Robots': 'Sitemap / Robots',
  sitemapRobots: 'Sitemap / Robots',
  siteHealth: 'Site Health',
  securityPerformance: 'Security & Performance',
  indexability: 'Indexability',
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

function RingGauge({ score }: { score: number }) {
  // score is 0-100
  const r = 54
  const cx = 60
  const cy = 60
  const circumference = 2 * Math.PI * r
  const dashOffset = circumference * (1 - score / 100)
  const color = score >= 80 ? '#22c55e' : score >= 65 ? '#84cc16' : score >= 50 ? '#eab308' : score >= 30 ? '#f97316' : '#ef4444'
  const statusLabel = score >= 80 ? 'Excellent' : score >= 65 ? 'Good' : score >= 50 ? 'Fair' : score >= 30 ? 'Needs Work' : 'Critical'

  return (
    <div className="ring-gauge">
      <svg viewBox="0 0 120 120" className="ring-gauge-svg">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </svg>
      <div className="ring-gauge-center">
        <span className="ring-gauge-number">{score}</span>
        <span className="ring-gauge-of">/ 100</span>
      </div>
      <span className="ring-gauge-status" style={{ color }}>{statusLabel}</span>
    </div>
  )
}

function HealthScorePanel({ title, subtitle, overallScore, categories, children }: {
  title: string
  subtitle: string
  overallScore: number
  categories: { label: string; score: number; index: number }[]
  children?: React.ReactNode
}) {
  const score100 = Math.round(overallScore * 10)
  const sorted = [...categories].sort((a, b) => a.score - b.score)

  const barColor = (s: number) => s <= 3 ? '#ef4444' : s <= 5 ? '#f97316' : '#eab308'
  const scoreColor = (s: number) => s <= 3 ? '#ef4444' : s <= 5 ? '#f97316' : '#eab308'

  return (
    <div className="health-panel">
      <h2 className="health-panel-title">{title}</h2>
      <p className="health-panel-subtitle">{subtitle}</p>
      <div className="health-panel-body">
        <div className="health-panel-gauge">
          <RingGauge score={score100} />
          {children}
        </div>
        <div className="health-panel-bars">
          {sorted.map(({ label, score, index }) => (
            <div key={label} className="health-bar-row">
              <span className="health-bar-index">{index}</span>
              <div className="health-bar-content">
                <span className="health-bar-label">{label}</span>
                <div className="health-bar-track">
                  <div
                    className="health-bar-fill"
                    style={{ width: `${(score / 10) * 100}%`, background: barColor(score) }}
                  />
                </div>
              </div>
              <span className="health-bar-score" style={{ color: scoreColor(score) }}>{score}/10</span>
            </div>
          ))}
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

function PageSpeedGauge({ score, label }: { score: number; label: string }) {
  const color = score > 80 ? '#0cce6b' : score >= 55 ? '#ffa400' : '#ff4e42'
  const bgColor = score > 80 ? 'rgba(12,206,107,0.1)' : score >= 55 ? 'rgba(255,164,0,0.1)' : 'rgba(255,78,66,0.1)'
  const r = 44
  const cx = 50
  const cy = 50
  const circumference = 2 * Math.PI * r
  const dashOffset = circumference * (1 - score / 100)

  return (
    <div className="psi-gauge">
      <div className="psi-gauge-ring">
        <svg viewBox="0 0 100 100" className="psi-gauge-svg">
          <circle cx={cx} cy={cy} r={r} fill={bgColor} stroke="#e8e8e8" strokeWidth="4" />
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        </svg>
        <span className="psi-gauge-number" style={{ color }}>{score}</span>
      </div>
      <span className="psi-gauge-label">{label}</span>
    </div>
  )
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
            <a className="comp-domain" href={`https://${comp.domain?.replace(/^www\./, '')}`} target="_blank" rel="noopener noreferrer">{comp.domain}</a>
            {sourceLabel && <span className="comp-source-label">{sourceLabel}</span>}
          </div>
          {!monthlyVisits && !avgPos && !comp.keywordsFound ? (
            <div className="comp-card-low-traffic">Monthly traffic too low</div>
          ) : (
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
              <span className="comp-card-stat-label">Google Ads{runsGoogleAds && googleAdCount > 0 ? <span className="comp-stat-count"> ({googleAdCount})</span> : ''}</span>
            </div>
            <div className="comp-card-stat">
              <span className="comp-card-stat-value">
                <YesNoBadge value={runsMetaAds} />
              </span>
              <span className="comp-card-stat-label">Meta Ads{runsMetaAds && metaAdCount > 0 ? <span className="comp-stat-count"> ({metaAdCount})</span> : ''}</span>
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
          )}
          {sources && (sources.organicSearch > 0 || sources.paidSearch > 0) && (
            <TrafficBar organic={sources.organicSearch} paid={sources.paidSearch} />
          )}
        </div>
        <div className="comp-card-thumbnails">
          {comp.websiteScreenshot ? (
            <div className="screenshot-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={comp.websiteScreenshot.startsWith('http') ? comp.websiteScreenshot : comp.websiteScreenshot.startsWith('data:') ? comp.websiteScreenshot : `data:image/png;base64,${comp.websiteScreenshot}`}
                alt={`${comp.domain} website fold`}
                className="screenshot-img"
              />
              <div className="screenshot-hover">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={comp.websiteScreenshot.startsWith('http') ? comp.websiteScreenshot : comp.websiteScreenshot.startsWith('data:') ? comp.websiteScreenshot : `data:image/png;base64,${comp.websiteScreenshot}`}
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
  const lighthouseScores = (seoAudit as any)?.lighthouseScores as { performance?: number; accessibility?: number; bestPractices?: number; seo?: number } | null

  // CRO data
  const croFindings = croAudit?.findings as CroFinding[] | null
  const croRecommendations = croAudit?.recommendations as Recommendation[] | null
  const croExtracted = croAudit?.extractedContent as CroExtractedContent | null

  // Keyword data — sorted by search volume descending
  // Normalize: Growth Tools may have stored volume as search_volume, volume, monthlySearches etc.
  const rawKeywordsRaw = kwSnapshot?.keywords as (KeywordEntry & Record<string, any>)[] | null
  const rawKeywords = rawKeywordsRaw?.map(k => ({
    ...k,
    searchVolume: k.searchVolume ?? k.search_volume ?? k.volume ?? k.monthlySearches ?? k.monthly_searches ?? 0,
  })) ?? null
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
  const cmsCompetitors = (proposal.competitors ?? []) as { name: string; websiteUrl?: string | null; googleMapsUrl?: string | null; gbpRating?: number | null; gbpReviewCount?: number | null; gbpRespondsToReviews?: boolean; hasMetaAds?: boolean; googleAdScreenshots?: { image: any }[]; metaAdScreenshots?: { image: any }[] }[]

  // Split competitors: CMS-added vs search-discovered
  const cmsCompetitorDomains = new Set(
    cmsCompetitors
      .map((c) => c.websiteUrl ? domainFromUrl(c.websiteUrl) : null)
      .filter(Boolean) as string[]
  )

  // Build meta ads override lookup: domain → true
  const metaAdsOverrides = new Map<string, boolean>()
  // Build manual ad screenshot overrides: domain → image URLs
  const manualGoogleAdScreenshots = new Map<string, string[]>()
  const manualMetaAdScreenshots = new Map<string, string[]>()
  // Build GBP override lookup: domain → GoogleBusinessProfile
  const gbpOverrides = new Map<string, GoogleBusinessProfile>()
  for (const c of cmsCompetitors) {
    if (!c.websiteUrl) continue
    const domain = domainFromUrl(c.websiteUrl)
    if (c.hasMetaAds) {
      metaAdsOverrides.set(domain, true)
    }
    if (c.googleAdScreenshots && c.googleAdScreenshots.length > 0) {
      const urls = c.googleAdScreenshots
        .map((s) => (typeof s.image === 'object' && s.image?.url ? s.image.url as string : null))
        .filter(Boolean) as string[]
      if (urls.length > 0) manualGoogleAdScreenshots.set(domain, urls)
    }
    if (c.metaAdScreenshots && c.metaAdScreenshots.length > 0) {
      const urls = c.metaAdScreenshots
        .map((s) => (typeof s.image === 'object' && s.image?.url ? s.image.url as string : null))
        .filter(Boolean) as string[]
      if (urls.length > 0) manualMetaAdScreenshots.set(domain, urls)
    }
    if (c.gbpRating != null || c.gbpReviewCount != null) {
      gbpOverrides.set(domain, {
        name: c.name,
        rating: c.gbpRating ?? 0,
        reviewCount: c.gbpReviewCount ?? 0,
        category: null,
        respondsToReviews: c.gbpRespondsToReviews ?? false,
        responseRate: null,
      })
    }
  }

  // Apply meta ads overrides, manual screenshot overrides, and GBP overrides to allCompetitors
  const allCompetitorsWithOverrides = (allCompetitors ?? []).map((comp) => {
    const cleanDomain = comp.domain?.replace(/^www\./, '') ?? ''
    let result = { ...comp }
    if (metaAdsOverrides.has(cleanDomain)) {
      result.metaAds = result.metaAds
        ? { ...result.metaAds, isRunningAds: true }
        : { isRunningAds: true, activeAdCount: 0, adScreenshots: [] }
    }
    const manualGoogle = manualGoogleAdScreenshots.get(cleanDomain)
    if (manualGoogle) {
      result.googleAds = {
        isRunningAds: true,
        adCount: manualGoogle.length,
        advertiserName: result.googleAds?.advertiserName ?? null,
        adScreenshots: manualGoogle,
      }
    }
    const manualMeta = manualMetaAdScreenshots.get(cleanDomain)
    if (manualMeta) {
      result.metaAds = {
        isRunningAds: true,
        activeAdCount: manualMeta.length,
        adScreenshots: manualMeta,
      }
    }
    // Apply GBP override only when API didn't return GBP data
    if (!result.googleBusinessProfile) {
      const gbpOverride = gbpOverrides.get(cleanDomain)
      if (gbpOverride) {
        result.googleBusinessProfile = gbpOverride
      }
    }
    return result
  })

  // Exclude competitor domains marked for exclusion in the CMS
  const excludedCompetitorDomains = Array.isArray((proposal as any).excludedCompetitorDomains)
    ? new Set(((proposal as any).excludedCompetitorDomains as string[]).map(d => d.replace(/^www\./, '')))
    : new Set<string>()

  const cmsAddedCount = cmsCompetitorDomains.size
  const searchCompetitorLimit = Math.max(0, 6 - cmsAddedCount)

  const selectedCompetitors: CompetitorProfile[] = []
  const searchCompetitors: CompetitorProfile[] = []
  const matchedCmsDomains = new Set<string>()

  if (allCompetitorsWithOverrides.length > 0) {
    for (const comp of allCompetitorsWithOverrides) {
      const cleanDomain = comp.domain?.replace(/^www\./, '') ?? ''
      if (cleanDomain && excludedCompetitorDomains.has(cleanDomain)) continue
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
    if (excludedCompetitorDomains.has(domain)) continue
    if (!matchedCmsDomains.has(domain)) {
      const hasMetaOverride = metaAdsOverrides.has(domain)
      const manualGoogle = manualGoogleAdScreenshots.get(domain)
      const manualMeta = manualMetaAdScreenshots.get(domain)
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
        metaAds: manualMeta
          ? { isRunningAds: true, activeAdCount: manualMeta.length, adScreenshots: manualMeta }
          : hasMetaOverride
            ? { isRunningAds: true, activeAdCount: 0, adScreenshots: [] }
            : apiMatch?.metaAds ?? null,
        googleAds: manualGoogle
          ? { isRunningAds: true, adCount: manualGoogle.length, advertiserName: apiMatch?.googleAds?.advertiserName ?? null, adScreenshots: manualGoogle }
          : apiMatch?.googleAds ?? null,
        googleBusinessProfile: apiMatch?.googleBusinessProfile ?? gbpOverrides.get(domain) ?? null,
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
    .filter(c => {
      const d = c.domain?.replace(/^www\./, '') ?? ''
      return !excludedCompetitorDomains.has(d)
    })
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

  // Keyword categories for grouped display on pre-flight check
  const keywordCategories = (proposal as any).keywordCategories as { categoryName: string; keywords: string }[] | null

  // Exclusion sets for edit view curation
  const excludedKeywords = new Set(
    Array.isArray((proposal as any).excludedKeywords) ? ((proposal as any).excludedKeywords as string[]).map(k => k.toLowerCase()) : []
  )
  const excludedContentQuestions = new Set(
    Array.isArray((proposal as any).excludedContentQuestions) ? (proposal as any).excludedContentQuestions as string[] : []
  )
  const hiddenKeywordCategories = new Set(
    Array.isArray((proposal as any).hiddenKeywordCategories) ? (proposal as any).hiddenKeywordCategories as string[] : []
  )

  // Target location label for keyword slide note
  const targetLocationValue = (proposal as any).targetLocation as string | null
  const locationLabels: Record<string, string> = {
    au: 'Australia', 'au:sydney': 'Sydney, NSW', 'au:melbourne': 'Melbourne, VIC', 'au:brisbane': 'Brisbane, QLD',
    'au:perth': 'Perth, WA', 'au:adelaide': 'Adelaide, SA', 'au:canberra': 'Canberra, ACT', 'au:hobart': 'Hobart, TAS', 'au:darwin': 'Darwin, NT',
    nz: 'New Zealand', 'nz:auckland': 'Auckland, NZ', 'nz:wellington': 'Wellington, NZ',
    us: 'United States', 'us:new-york': 'New York, NY', 'us:los-angeles': 'Los Angeles, CA', 'us:chicago': 'Chicago, IL',
    'us:houston': 'Houston, TX', 'us:miami': 'Miami, FL', 'us:atlanta': 'Atlanta, GA', 'us:seattle': 'Seattle, WA', 'us:denver': 'Denver, CO',
    ca: 'Canada', 'ca:toronto': 'Toronto, ON', 'ca:vancouver': 'Vancouver, BC', 'ca:montreal': 'Montreal, QC',
    gb: 'United Kingdom', 'gb:london': 'London, UK', 'gb:manchester': 'Manchester, UK', 'gb:birmingham': 'Birmingham, UK',
    sg: 'Singapore',
  }
  const targetLocationLabel = targetLocationValue ? (locationLabels[targetLocationValue] || targetLocationValue) : null

  // Flight Plan images (Slide 12)
  const flightPlanImages = (proposal as any).flightPlanImages as { image: any; caption?: string }[] | null

  // Flight Plan recommendations
  const flightPlanRecommendations = (proposal as any).flightPlanRecommendations as { enabled?: boolean; title: string; description?: string; benefit?: string }[] | null
  const enabledRecommendations = flightPlanRecommendations?.filter(r => r.enabled) ?? []

  // Mission Resources (Slide 13) & Launch Requirements (Slide 14)
  const missionResourcesImages = (proposal as any).missionResourcesImages as { image: any; caption?: string }[] | null
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
        name: domainToBusinessName(comp.domain ?? 'Unknown'),
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
            {launchRequirements && (
              <div className="cms-copy-block">
                {isLexicalData(launchRequirements) ? (
                  <RichText data={launchRequirements} converters={richTextConverters} />
                ) : (
                  <LegacyTextBlock text={launchRequirements as string} />
                )}
              </div>
            )}
          </div>
        </section>}

        {/* ============================================================ */}
        {/* SLIDE 17 — Mission Resources                                */}
        {/* ============================================================ */}
        {showSlide(17) && <section className="slide slide-17 slide-expandable">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/slides/merge-between-space-presentation.png" alt="" className="slide-space-transition" />
          <div className="slide-header">
            <h2>9. Mission Resources</h2>
            <span>Commercial Model &amp; Pricing</span>
          </div>
          <div className="slide-content">
            {missionResourcesImages && missionResourcesImages.length > 0 && (() => {
              const firstItem = missionResourcesImages[0]
              const firstUrl = typeof firstItem.image === 'object' && firstItem.image?.url ? firstItem.image.url : null
              return firstUrl ? (
                <div className="flight-plan-images">
                  <figure className="flight-plan-image-wrap">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={firstUrl} alt={firstItem.caption || 'Mission resources image 1'} className="flight-plan-img" />
                    {firstItem.caption && <figcaption className="flight-plan-caption">{firstItem.caption}</figcaption>}
                  </figure>
                </div>
              ) : null
            })()}

            {missionResources && (
              <div className="cms-copy-block">
                {isLexicalData(missionResources) ? (
                  <RichText data={missionResources} converters={richTextConverters} />
                ) : (
                  <LegacyTextBlock text={missionResources as string} />
                )}
              </div>
            )}
          </div>
        </section>}

        {/* Additional Mission Resources slides — one per extra image */}
        {showSlide(17) && missionResourcesImages && missionResourcesImages.length > 1 && missionResourcesImages.slice(1).map((item, i) => {
          const imgUrl = typeof item.image === 'object' && item.image?.url ? item.image.url : null
          if (!imgUrl) return null
          return (
            <section key={`mission-resources-extra-${i}`} className="slide slide-17 slide-expandable">
              <div className="slide-header">
                <h2>9. Mission Resources</h2>
                <span>Commercial Model &amp; Pricing</span>
              </div>
              <div className="slide-content">
                <div className="flight-plan-images">
                  <figure className="flight-plan-image-wrap">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imgUrl} alt={item.caption || `Mission resources image ${i + 2}`} className="flight-plan-img" />
                    {item.caption && <figcaption className="flight-plan-caption">{item.caption}</figcaption>}
                  </figure>
                </div>
              </div>
            </section>
          )
        })}

        {/* Additional Flight Plan slides — one per extra image (rendered BEFORE main slide so image 2+ appear above when scrolling up) */}
        {showSlide(16) && flightPlanImages && flightPlanImages.length > 1 && flightPlanImages.slice(1).map((item, i) => {
          const imgUrl = typeof item.image === 'object' && item.image?.url ? item.image.url : null
          if (!imgUrl) return null
          return (
            <section key={`flight-plan-extra-${i}`} className="slide slide-16 slide-expandable">
              <div className="slide-header">
                <h2>8. Flight Plan</h2>
                <span>Roadmap &amp; Timeframes</span>
              </div>
              <div className="slide-content">
                <div className="flight-plan-images">
                  <figure className="flight-plan-image-wrap">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imgUrl} alt={item.caption || `Flight plan image ${i + 2}`} className="flight-plan-img" />
                    {item.caption && <figcaption className="flight-plan-caption">{item.caption}</figcaption>}
                  </figure>
                </div>
              </div>
            </section>
          )
        })}

        {/* ============================================================ */}
        {/* SLIDE 16 — Flight Plan                                      */}
        {/* ============================================================ */}
        {showSlide(16) && (() => {
          // Categorise recommendations into launch stack tiers
          const allRecs = flightPlanRecommendations ?? []
          const enabledTitles = new Set(allRecs.filter(r => r.enabled).map(r => r.title.toLowerCase()))

          // Launch stack tier definitions (bottom to top)
          const foundationKeywords = ['website', 'cro', 'conversion rate']
          const visibilityKeywords = ['seo', 'local seo', 'on-page']
          const growthKeywords = ['google ads', 'meta ads', 'content strategy', 'blog', 'social content', 'link building', 'digital pr']
          const measurementKeywords = ['analytics', 'tracking', 'email marketing', 'crm', 'lead management']

          const matchesTier = (title: string, keywords: string[]) =>
            keywords.some(kw => title.toLowerCase().includes(kw))

          const foundationStages = allRecs.filter(r => r.enabled && matchesTier(r.title, foundationKeywords))
          const visibilityStages = allRecs.filter(r => r.enabled && matchesTier(r.title, visibilityKeywords))
          const growthStages = allRecs.filter(r => r.enabled && matchesTier(r.title, growthKeywords))
          const measurementStages = allRecs.filter(r => r.enabled && matchesTier(r.title, measurementKeywords))

          // Auto-narrative flags
          const hasSystemBuilds = enabledTitles.has('new website build') || enabledTitles.has('conversion rate optimisation (cro)') || enabledTitles.has('technical seo foundation')
          const hasPerformanceMarketing = [...enabledTitles].some(t => t.includes('google ads') || t.includes('meta ads'))
          const hasContentSocial = [...enabledTitles].some(t => t.includes('content') || t.includes('blog') || t.includes('social'))
          const hasCrmRetention = [...enabledTitles].some(t => t.includes('email') || t.includes('crm') || t.includes('lead management'))

          const totalStages = foundationStages.length + visibilityStages.length + growthStages.length + measurementStages.length

          // Tier color mapping
          const tierColors: Record<string, { bg: string; border: string; label: string }> = {
            measurement: { bg: 'rgba(168, 85, 247, 0.12)', border: 'rgba(168, 85, 247, 0.3)', label: '#a855f7' },
            growth: { bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.3)', label: '#3b82f6' },
            visibility: { bg: 'rgba(34, 197, 94, 0.12)', border: 'rgba(34, 197, 94, 0.3)', label: '#22c55e' },
            foundation: { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)', label: '#f59e0b' },
          }

          return (
            <section className="slide slide-16 slide-expandable">
              <div className="slide-header">
                <h2>8. Flight Plan</h2>
                <span>Roadmap &amp; Timeframes</span>
              </div>
              <div className="slide-content">
                {/* Two-column layout: checklist left, launch stack right */}
                <div className="flight-plan-layout">
                  {/* LEFT COLUMN — Full checklist of all recommendations */}
                  <div className="flight-plan-checklist">
                    {allRecs.map((rec, i) => (
                      <div key={i} className={`flight-plan-check-item ${rec.enabled ? 'flight-plan-check-enabled' : 'flight-plan-check-disabled'}`}>
                        <span className="flight-plan-check-icon">{rec.enabled ? '✓' : '✗'}</span>
                        <div className="flight-plan-check-body">
                          <div className="flight-plan-check-title">{rec.title}</div>
                          {rec.description && <p className="flight-plan-check-desc">{rec.description}</p>}
                        </div>
                        {rec.benefit && <span className={`flight-plan-check-benefit ${rec.enabled ? '' : 'flight-plan-check-benefit-disabled'}`}>{rec.benefit}</span>}
                      </div>
                    ))}
                  </div>

                  {/* RIGHT COLUMN — Launch Stack visual + auto-narrative */}
                  <div className="launch-stack-column">
                    {totalStages > 0 && (
                      <div className="launch-stack">
                        {/* Rocket icon at top */}
                        <div className="launch-stack-rocket">🚀</div>

                        {/* Measurement tier (top) */}
                        {measurementStages.length > 0 && (
                          <div className="launch-stack-tier">
                            <span className="launch-stack-tier-label" style={{ color: tierColors.measurement.label }}>Measurement</span>
                            {measurementStages.map((s, i) => (
                              <div key={i} className="launch-stage" style={{ background: tierColors.measurement.bg, borderColor: tierColors.measurement.border }}>
                                <span className="launch-stage-name">{s.title}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Growth tier (middle-upper) */}
                        {growthStages.length > 0 && (
                          <div className="launch-stack-tier">
                            <span className="launch-stack-tier-label" style={{ color: tierColors.growth.label }}>Growth Engines</span>
                            {growthStages.map((s, i) => (
                              <div key={i} className="launch-stage" style={{ background: tierColors.growth.bg, borderColor: tierColors.growth.border }}>
                                <span className="launch-stage-name">{s.title}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Visibility tier (middle-lower) */}
                        {visibilityStages.length > 0 && (
                          <div className="launch-stack-tier">
                            <span className="launch-stack-tier-label" style={{ color: tierColors.visibility.label }}>Visibility</span>
                            {visibilityStages.map((s, i) => (
                              <div key={i} className="launch-stage" style={{ background: tierColors.visibility.bg, borderColor: tierColors.visibility.border }}>
                                <span className="launch-stage-name">{s.title}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Foundation tier (bottom) */}
                        {foundationStages.length > 0 && (
                          <div className="launch-stack-tier">
                            <span className="launch-stack-tier-label" style={{ color: tierColors.foundation.label }}>Foundation</span>
                            {foundationStages.map((s, i) => (
                              <div key={i} className="launch-stage" style={{ background: tierColors.foundation.bg, borderColor: tierColors.foundation.border }}>
                                <span className="launch-stage-name">{s.title}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Auto-narrative copy */}
                    <div className="launch-narrative">
                      <p className="launch-narrative-intro">Your growth strategy is built as an integrated system — each layer compounds the results of the one below it.</p>

                      {hasSystemBuilds && (
                        <p className="launch-narrative-paragraph">We start with the <strong>foundation</strong> — building a high-converting website with technical SEO best practices baked in. This ensures every visitor has the best chance of becoming a lead, and search engines can properly discover and rank your pages.</p>
                      )}

                      {hasPerformanceMarketing && (
                        <p className="launch-narrative-paragraph"><strong>Performance marketing</strong> through paid ads will drive immediate, qualified traffic while your organic presence builds. This gives you measurable results from day one and provides data to refine targeting over time.</p>
                      )}

                      {hasContentSocial && (
                        <p className="launch-narrative-paragraph">A <strong>content and social strategy</strong> builds long-term authority and keeps your brand visible across channels. Every piece of content works to attract organic traffic, nurture prospects, and reinforce your expertise.</p>
                      )}

                      {hasCrmRetention && (
                        <p className="launch-narrative-paragraph"><strong>CRM and retention systems</strong> ensure no lead falls through the cracks. Automated follow-ups, email sequences, and pipeline tracking turn more enquiries into paying clients and keep existing customers coming back.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Existing content below the two-column section */}
                {flightPlanImages && flightPlanImages.length > 0 && (() => {
                  const firstItem = flightPlanImages[0]
                  const firstUrl = typeof firstItem.image === 'object' && firstItem.image?.url ? firstItem.image.url : null
                  return firstUrl ? (
                    <div className="flight-plan-images">
                      <figure className="flight-plan-image-wrap">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={firstUrl} alt={firstItem.caption || 'Flight plan image 1'} className="flight-plan-img" />
                        {firstItem.caption && <figcaption className="flight-plan-caption">{firstItem.caption}</figcaption>}
                      </figure>
                    </div>
                  ) : null
                })()}

                {flightPlanContent && (
                  isLexicalData(flightPlanContent) ? (
                    <div className="cms-copy-block">
                      <RichText data={flightPlanContent} converters={richTextConverters} />
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

                {websiteMockupUrl && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginTop: '40px', gap: '6px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                      <a
                        href={`/mockup/${proposal.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flight-plan-mockup-btn"
                        style={{
                          display: 'inline-block',
                          padding: '10px 28px',
                          background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                          color: '#fff',
                          borderRadius: '10px',
                          textDecoration: 'none',
                          fontWeight: 600,
                          fontSize: '14px',
                          boxShadow: '0 4px 20px rgba(59, 130, 246, 0.4)',
                        }}
                      >
                        View Website Mockup
                      </a>
                      <span className="flight-plan-mockup-note" style={{ fontSize: '10px', color: '#9ca3af', textAlign: 'center', lineHeight: '1.4' }}>Mock-up is one-page; live site will have individual pages for better SEO and will be a mobile-first build.</span>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )
        })()}

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
                        <th>Conv. Rate</th>
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
                    {leadConversionRate != null && (
                      <span className="mc-pill">Conversion Rate: {leadConversionRate}%</span>
                    )}
                    {leadToSaleConversionRate != null && (
                      <span className="mc-pill">Lead → Sale Rate: {leadToSaleConversionRate}%</span>
                    )}
                    {annualPurchaseFrequency != null && (
                      <span className="mc-pill">Purchase Frequency: {annualPurchaseFrequency}x / year</span>
                    )}
                    {newCustomersLast12Months != null && (
                      <span className="mc-pill">New Customers (12mo): {newCustomersLast12Months.toLocaleString()}</span>
                    )}
                    {missionControlRows.length > 0 && missionControlRows[0].isYou && (
                      <span className="mc-pill">Current Monthly Visits: {formatTraffic(missionControlRows[0].monthlyVisits)}</span>
                    )}
                  </div>
                  <div className="mc-notes-formulas">
                    <p>Monthly Return = Paying Clients &times; AOV</p>
                    {missionControlRows[0]?.annualReturnValue != null && (
                      <p>Annual Return Value = Paying Clients &times; AOV &times; Annual Purchase Frequency</p>
                    )}
                    {missionControlRows.length > 0 && missionControlRows[0].isYou && (
                      <p>{proposal.businessName} currently receives ~{formatTraffic(missionControlRows[0].monthlyVisits)} monthly visits. The aim is to reach competitor-level traffic.</p>
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
              const allComps = [...allCompetitorsWithOverrides].filter(c => {
                const d = c.domain?.replace(/^www\./, '') ?? ''
                return !excludedCompetitorDomains.has(d)
              })
              const googleAdsComps = allComps.filter(c => c.googleAds?.isRunningAds)
              const metaAdsComps = allComps.filter(c => c.metaAds?.isRunningAds)
              const hasAnyAds = googleAdsComps.length > 0 || metaAdsComps.length > 0

              if (!hasAnyAds) return (
                <div className="slide-placeholder-block">
                  <span>No competitor ad data found. Run audits to collect competitor advertising intelligence.</span>
                </div>
              )

              return (
                <>
                <p className="slide-ads-copy">Your competitors are paying for ads to drive them more traffic. This is a path you can go down IF the fundamentals are solid to ensure a feasible return on investment.</p>
                <p className="slide-ads-intro">These are some of the ads that your competitors have live right now:</p>
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
                              const src = url.startsWith('/') || url.startsWith('http') || url.startsWith('data:') ? url : `data:image/png;base64,${url}`
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
                        {comp.metaAds?.adScreenshots && comp.metaAds.adScreenshots.length > 0 && (() => {
                          const urls = comp.metaAds!.adScreenshots.slice(0, 5)
                          const hasImageUrls = urls.some(u => u.startsWith('/') || u.startsWith('http') || u.startsWith('data:'))
                          if (hasImageUrls) {
                            return (
                              <div className="ad-screenshots-grid">
                                {urls.map((url, j) => (
                                  <div key={j} className="ad-thumbnail-wrap">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={url} alt={`${comp.domain} Meta ad ${j + 1}`} className="ad-screenshot-thumb" />
                                    <div className="ad-thumbnail-hover">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={url} alt={`${comp.domain} Meta ad ${j + 1}`} className="ad-thumbnail-large" />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )
                          }
                          return (
                            <div className="meta-ad-links">
                              {urls.map((url, j) => (
                                <a key={j} href={url} target="_blank" rel="noopener noreferrer" className="meta-ad-link">
                                  View Ad {j + 1}
                                </a>
                              ))}
                            </div>
                          )
                        })()}
                      </div>
                    )) : (
                      <div className="slide-10-slot">No competitors running Meta Ads</div>
                    )}
                  </div>
                </div>
                </>
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
                  <p className="cr-intro-sub">These are the exact questions your potential customers are actively searching for—and where your site can establish authority. Each sunburst shows the most popular questions grouped by type<span className="cr-hide-mobile"> — the bigger the slice, the more people are searching for it</span>.</p>
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
                    // Auto-select sunbursts based on keyword categories
                    const kwVolumeMap = new Map<string, number>()
                    if (keywords) {
                      for (const kw of keywords) {
                        kwVolumeMap.set(kw.keyword.toLowerCase(), kw.searchVolume ?? 0)
                      }
                    }

                    // Sort all content researches by search volume
                    const sortedCr = [...uniqueCr].sort((a, b) => {
                      const volA = kwVolumeMap.get(a.keyword.toLowerCase()) ?? 0
                      const volB = kwVolumeMap.get(b.keyword.toLowerCase()) ?? 0
                      return volB - volA
                    })

                    if (keywordCategories && keywordCategories.length > 1) {
                      // Multiple categories: pick top 1 from each category by search volume
                      displayCr = []
                      for (const cat of keywordCategories) {
                        const catKeywords = new Set(
                          (cat.keywords || '').split('\n').map(k => k.trim().toLowerCase()).filter(Boolean)
                        )
                        const match = sortedCr.find(cr => catKeywords.has(cr.keyword.toLowerCase()) && !displayCr.includes(cr))
                        if (match) displayCr.push(match)
                      }
                    } else {
                      // 0-1 categories: pick top 2 overall
                      displayCr = sortedCr.slice(0, 2)
                    }
                  }

                  // Filter out excluded content questions from clusters
                  const filteredDisplayCr = excludedContentQuestions.size > 0
                    ? displayCr.map(cr => ({
                        ...cr,
                        clusters: cr.clusters.map(cluster => ({
                          ...cluster,
                          questions: cluster.questions.filter(q => !excludedContentQuestions.has(q.question)),
                        })).filter(cluster => cluster.questions.length > 0),
                      })).filter(cr => cr.clusters.length > 0)
                    : displayCr

                  return (
                    <div className="cr-sunburst-grid">
                      {filteredDisplayCr.map((cr, crIdx) => (
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
              {categoryScores && typeof categoryScores === 'object' && !Array.isArray(categoryScores) && (() => {
                const entries = Object.entries(categoryScores)
                const cats = entries.map(([key, score], i) => ({
                  label: categoryLabels[key] || key,
                  score: score as number,
                  index: i + 1,
                }))
                return (
                  <HealthScorePanel
                    title="SEO Health Score"
                    subtitle={`Assessed across ${cats.length} areas. Well-optimised websites typically score 65–80.`}
                    overallScore={seoAudit.overallScore}
                    categories={cats}
                  >
                    {keywords && keywords.length > 0 && (() => {
                      const firstKw = keywords[0]
                      const clientDomain = domainFromUrl(proposal.websiteUrl)
                      return (
                        <SerpMockup keyword={firstKw.keyword} domain={clientDomain} position={firstKw.position} />
                      )
                    })()}
                  </HealthScorePanel>
                )
              })()}
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
              <HealthScorePanel
                title="Conversion Rate Optimisation Health Score"
                subtitle="Assessed across 6 areas. Well-optimised websites typically score 65–80."
                overallScore={(croAudit as any).overallScore ?? 0}
                categories={[
                  { label: 'First Impression', score: (croAudit as any).firstImpressionScore ?? (croAudit as any).aboveFoldScore ?? 0, index: 1 },
                  { label: 'Trust & Social Proof', score: (croAudit as any).trustScore ?? 0, index: 2 },
                  { label: 'Call-to-Action', score: (croAudit as any).ctaScore ?? 0, index: 3 },
                  { label: 'Lead Capture', score: (croAudit as any).leadCaptureScore ?? 0, index: 4 },
                  { label: 'Content & Readability', score: (croAudit as any).contentReadabilityScore ?? (croAudit as any).contentScore ?? 0, index: 5 },
                  { label: 'Navigation', score: (croAudit as any).navigationScore ?? 0, index: 6 },
                ]}
              />

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
                    <CompetitorCard key={`search-${i}`} comp={comp} index={i + 1} />
                  ))}
                  {selectedCompetitors.map((comp, i) => (
                    <CompetitorCard key={`selected-${i}`} comp={comp} index={displaySearchCompetitors.length + i + 1} />
                  ))}
                </div>
                {keywordCategories && keywordCategories.length > 0 && (
                  <p className="kw-location-note">Competitors shown are based on Google rankings for {keywordCategories[0].categoryName} focused keywords. Monthly visits and organic/paid traffic split are sourced from SimilarWeb and are estimates.</p>
                )}
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
        {showSlide(6) && kwSnapshot && keywords && (() => {
          // Build category groups: match keywords to their category by keyword text
          const categoryGroups: { name: string; keywords: typeof keywords; totalVolume: number }[] = []

          if (keywordCategories && keywordCategories.length > 0) {
            // Build a lookup from keyword text → audit data for fast matching
            const kwLookup = new Map<string, (typeof keywords)[number]>()
            for (const kw of keywords) {
              kwLookup.set(kw.keyword.toLowerCase(), kw)
            }

            for (const cat of keywordCategories) {
              const catKeywordNames = (cat.keywords || '')
                .split('\n')
                .map(k => k.trim())
                .filter(Boolean)

              // Match each CMS keyword to audit data, or create a stub entry
              const catKeywords: typeof keywords = catKeywordNames
                .filter(name => !excludedKeywords.has(name.toLowerCase()))
                .map(name => {
                  const auditMatch = kwLookup.get(name.toLowerCase())
                  if (auditMatch) return auditMatch
                  // Stub for keywords without audit data
                  return { keyword: name, position: null, searchVolume: 0, opportunity: 'low' }
                })

              if (catKeywords.length > 0) {
                const totalVolume = catKeywords.reduce((sum, kw) => sum + (kw.searchVolume ?? 0), 0)
                categoryGroups.push({ name: cat.categoryName, keywords: catKeywords, totalVolume })
              }
            }
          }

          // Fallback: if no categories or no matches, show all keywords as one group
          if (categoryGroups.length === 0) {
            const filtered = keywords.filter(kw => !excludedKeywords.has(kw.keyword.toLowerCase()))
            const totalVolume = filtered.reduce((sum, kw) => sum + (kw.searchVolume ?? 0), 0)
            categoryGroups.push({ name: 'Keywords', keywords: filtered, totalVolume })
          }

          // Sort each category by search volume (descending) and cap at 20 rows per category
          const maxRowsPerCategory = 20
          const sortedGroups = categoryGroups.map(group => ({
            ...group,
            keywords: [...group.keywords]
              .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))
              .slice(0, maxRowsPerCategory),
          }))

          // Dynamic column count: up to 3 for many categories, 2 for a few, 1 for single
          const colCount = sortedGroups.length >= 3 ? 3 : sortedGroups.length >= 2 ? 2 : 1

          return (
            <section className="slide slide-6 slide-expandable">
              <div className="slide-header">
                <h2>3. Pre-flight Check</h2>
                <span>Keywords Analysis</span>
              </div>
              {targetLocationLabel && (
                <p className="slide-intro-copy">These are all the relevant search terms and their monthly search volume in {targetLocationLabel}.</p>
              )}
              <div className="slide-content">
                <div className="kw-category-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${colCount}, 1fr)`, gap: '28px' }}>
                  {sortedGroups.map((group, gIdx) => (
                    <section key={gIdx} className="audit-section" style={{ marginBottom: '0' }}>
                      <div className="kw-category-header">
                        <h3 className="kw-category-heading">{group.name}</h3>
                        <span className="kw-category-total">{group.totalVolume.toLocaleString()} monthly searches</span>
                      </div>
                      <div className="kw-table-wrapper">
                        <table className="kw-table kw-table-compact">
                          <colgroup>
                            <col className="col-keyword" />
                            <col className="col-volume" />
                            <col className="col-competition" />
                            <col className="col-rank" />
                          </colgroup>
                          <thead>
                            <tr>
                              <th>Keyword</th>
                              <th>Searches</th>
                              <th>Competition</th>
                              <th>Ranking?</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.keywords.map((kw, i) => (
                              <tr key={i}>
                                <td className="kw-name">{kw.keyword}</td>
                                <td className="kw-volume">{kw.searchVolume?.toLocaleString() ?? '—'}</td>
                                <td><CompetitionBadge level={competitionFromOpportunity(kw.opportunity)} /></td>
                                <td><YesNoBadge value={kw.position != null && kw.position > 0} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  ))}
                </div>
                {targetLocationLabel && (
                  <p className="kw-location-note">Search volume is based on location: {targetLocationLabel}</p>
                )}
              </div>
            </section>
          )
        })()}

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
                {proposal.businessGoals && (
                  <div className="client-overview-item">
                    <span className="client-overview-label">Business Goal</span>
                    <span className="client-overview-value">{proposal.businessGoals}</span>
                  </div>
                )}
              </div>
              {/* GBP Rating & Reviews + Physical Locations */}
              {(yourProfileWithOverrides?.googleBusinessProfile || hasPhysicalLocations) && (
                <div className="client-overview-meta client-overview-meta--gbp">
                  {yourProfileWithOverrides?.googleBusinessProfile && (() => {
                    const gbp = yourProfileWithOverrides.googleBusinessProfile!
                    return (
                      <div className="client-overview-item">
                        <span className="client-overview-label">Google Reviews</span>
                        <span className="client-overview-value">
                          <span className="mission-brief-gbp">
                            <StarRating rating={gbp.rating} />
                            <span>{gbp.rating}</span>
                            <span className="mission-brief-gbp-count">({gbp.reviewCount} reviews)</span>
                          </span>
                        </span>
                      </div>
                    )
                  })()}
                  {hasPhysicalLocations && (
                    <div className="client-overview-item">
                      <span className="client-overview-label">Physical Locations</span>
                      <span className="client-overview-value">{numberOfLocations ?? 'Yes'}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Keyword Categories (filtered by hiddenKeywordCategories) */}
              {keywordCategories && keywordCategories.length > 0 && (() => {
                const visibleCategories = keywordCategories.filter(cat => !hiddenKeywordCategories.has(cat.categoryName))
                if (visibleCategories.length === 0) return null
                return (
                  <div className="client-overview-services">
                    <span className="client-overview-label">Keyword Categories</span>
                    <div className="client-services-tags">
                      {visibleCategories.map((cat, i) => (
                        <span key={i} className="client-service-tag">{cat.categoryName}</span>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* PageSpeed Insights — compact gauges */}
              {lighthouseScores && (lighthouseScores.performance != null || lighthouseScores.accessibility != null || lighthouseScores.bestPractices != null || seoScore != null || croScore != null) && (
                <section className="scores-row">
                  <div className="scores-row-left">
                    <h3 className="psi-section-title">PageSpeed Insights</h3>
                    <div className="psi-gauges psi-gauges--small">
                      {lighthouseScores.performance != null && <PageSpeedGauge score={lighthouseScores.performance} label="Performance" />}
                      {lighthouseScores.accessibility != null && <PageSpeedGauge score={lighthouseScores.accessibility} label="Accessibility" />}
                      {lighthouseScores.bestPractices != null && <PageSpeedGauge score={lighthouseScores.bestPractices} label="Best Practices" />}
                    </div>
                  </div>
                  {(seoScore != null || croScore != null) && (
                    <div className="scores-row-right">
                      <h3 className="psi-section-title">Website Audit Scores</h3>
                      <div className="psi-gauges psi-gauges--small audit-score-gauges">
                        {croScore != null && <PageSpeedGauge score={Math.round(croScore * 10)} label="Conversion Rate Optimisation Score" />}
                        {seoScore != null && <PageSpeedGauge score={Math.round(seoScore * 10)} label="SEO Score" />}
                      </div>
                    </div>
                  )}
                </section>
              )}


            </section>

            {(totalMonthlySearchVolume != null || avgCompetitorTraffic != null) && (
              <section className="instrument-panel">
                <div className="stat-highlight-boxes">
                  {totalMonthlySearchVolume != null && (
                    <div className="stat-highlight-box">
                      <span className="stat-highlight-value">{formatTraffic(totalMonthlySearchVolume)}</span>
                      <span className="stat-highlight-label">Monthly Search Volume</span>
                      <p className="stat-highlight-copy">
                        For relevant search terms{targetLocationLabel ? ` in ${targetLocationLabel}` : ''}, there are <strong>{totalMonthlySearchVolume.toLocaleString()}</strong> monthly searches from potential customers
                      </p>
                    </div>
                  )}
                  {avgCompetitorTraffic != null && (
                    <div className="stat-highlight-box">
                      <span className="stat-highlight-value">{formatTraffic(avgCompetitorTraffic)}</span>
                      <span className="stat-highlight-label">Competitor Monthly Web Traffic</span>
                      <p className="stat-highlight-copy">
                        Across <strong>{keywords?.length ?? 0}</strong> keywords, competitors drive <strong>{formatTraffic(avgCompetitorTraffic)}</strong> monthly visits to their websites
                      </p>
                    </div>
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
                      <RichText data={tamData} converters={richTextConverters} />
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
