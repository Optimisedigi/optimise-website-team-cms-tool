/**
 * Slide 7 — Mission Brief (Business & market). Dynamic.
 *
 * Pulls live data from the proposal + linked SEO/CRO/keyword/competitor audits.
 * Renders a server-side React tree (no client interactivity needed) — the
 * page.tsx server component imports and renders this directly.
 */

import type { ReactElement } from 'react'
import { stripDashes } from './_text'

// Looser types because the linked audits come back as Payload relationships
// which can be either an ID string or a fully-populated object depending on
// depth. We treat anything we don't have as null/0 and let the layout cope.
type Lighthouse = {
  performance?: number
  accessibility?: number
  bestPractices?: number
  seo?: number
}

type AuditLike = {
  overallScore?: number | null
  lighthouseScores?: Lighthouse | null
} | null

type KeywordLike = { searchVolume?: number | null } | null
type MonthlyVisitPoint = number | { visits?: number | string | null }

type CompetitorLike = {
  manualMonthlyVisits?: number | string | null
  traffic?: {
    monthlyVisits?: number | string | MonthlyVisitPoint[] | null
    averageMonthlyVisits?: number | string | null
    estimatedMonthlyVisits?: number | string | null
    status?: string | null
    unavailableReason?: string | null
  } | null
} | null

type KeywordSnapshotLike = { keywords?: KeywordLike[] | null } | null
type CompetitorAnalysisLike = {
  yourProfile?: { domain?: string | null } | null
  competitors?: CompetitorLike[] | null
} | null

type KeywordCategoryLike = {
  categoryName?: string | null
} | null

// Map conversionGoal select-value to a human label.
const CONVERSION_LABEL: Record<string, string> = {
  'lead generation': 'Lead Generation',
  'phone calls': 'Phone Calls',
  'form submissions': 'Form Submissions',
  'e-commerce': 'E-commerce Sales',
  bookings: 'Bookings / Appointments',
  'quote requests': 'Quote Requests',
  'email sign-ups': 'Email Sign-ups',
  'free trial': 'Free Trial Sign-ups',
  'content downloads': 'Content Downloads',
  'brand awareness': 'Brand Awareness',
}

function formatBigNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toLocaleString()
}

// Normalise a competitor's monthlyVisits — can be number or string like "500K".
function normaliseVisits(raw: number | string | MonthlyVisitPoint[] | null | undefined): number {
  if (raw == null) return 0
  if (typeof raw === 'number') return raw
  if (Array.isArray(raw)) {
    const last = raw[raw.length - 1]
    if (typeof last === 'number') return last
    return normaliseVisits(last?.visits ?? null)
  }
  const s = String(raw).trim().toUpperCase().replace(/,/g, '')
  const num = parseFloat(s)
  if (!Number.isFinite(num)) return 0
  if (s.endsWith('M')) return num * 1_000_000
  if (s.endsWith('K')) return num * 1_000
  return num
}

function normaliseTrafficVisits(traffic: NonNullable<CompetitorLike>['traffic']): number {
  if (!traffic || traffic.status === 'unavailable') return 0
  return normaliseVisits(
    traffic.averageMonthlyVisits ?? traffic.estimatedMonthlyVisits ?? traffic.monthlyVisits ?? null,
  )
}

function competitorMonthlyVisits(competitor: CompetitorLike): number {
  const manual = normaliseVisits(competitor?.manualMonthlyVisits ?? null)
  if (manual > 0) return manual
  return normaliseTrafficVisits(competitor?.traffic ?? null)
}

// Convert a 0-10 score to a 0-100 score for display in the gauges.
function to100(score: number | null | undefined): number {
  if (score == null) return 0
  return score <= 10 ? Math.round(score * 10) : Math.round(score)
}

function scoreColor(score: number): string {
  if (score >= 80) return '#22c55e' // green
  if (score >= 60) return '#f0b35a' // gold
  return '#ef4444' // red
}

type Gauge = {
  label: string
  value: number
}

function renderGauge(g: Gauge, i: number): ReactElement {
  const colour = scoreColor(g.value)
  const dashoffset = 314 - (314 * g.value) / 100
  return (
    <div
      key={`${g.label}-${i}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <div style={{ position: 'relative', width: 88, height: 88 }}>
        <svg
          viewBox="0 0 120 120"
          style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}
        >
          <circle cx="60" cy="60" r="50" stroke="var(--line)" strokeWidth="9" fill="none" />
          <circle
            cx="60"
            cy="60"
            r="50"
            stroke={colour}
            strokeWidth="9"
            fill="none"
            strokeLinecap="round"
            strokeDasharray="314"
            strokeDashoffset={String(dashoffset)}
          />
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: "'Space Grotesk',sans-serif",
            /* +15 % from 32 → 37, then +20 % → 44 for more presence. */
            fontSize: 44,
            fontWeight: 600,
            color: colour,
            letterSpacing: '-0.02em',
          }}
        >
          {g.value || ''}
        </div>
      </div>
      <div
        style={{
          fontFamily: "'Space Grotesk',sans-serif",
          fontSize: 24,
          fontWeight: 500,
          color: 'var(--ink)',
          textAlign: 'center',
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
        }}
      >
        {g.label}
      </div>
    </div>
  )
}

export function MissionBriefSlide({
  businessName,
  websiteUrl,
  businessType: _businessType,
  conversionGoal,
  businessGoals,
  seoAudit,
  croAudit,
  keywordSnapshot,
  competitorAnalysis,
  keywordCategories,
}: {
  businessName: string
  websiteUrl: string | null
  /** Accepted for caller compatibility; no longer rendered now that the
   *  TYPE card has been removed from the slide. */
  businessType: string | null
  conversionGoal: string | null
  businessGoals: string | null
  seoAudit: AuditLike
  croAudit: AuditLike
  keywordSnapshot: KeywordSnapshotLike
  competitorAnalysis: CompetitorAnalysisLike
  keywordCategories: KeywordCategoryLike[] | null
}): ReactElement {
  // -- Category names ---------------------------------------------------------
  const categoryNames = (keywordCategories ?? [])
    .map((c) => c?.categoryName?.trim())
    .filter((n): n is string => Boolean(n && n.length > 0))
  // -- Categories / Conversion -----------------------------------------------
  // (Type card removed by request — see grid below.)
  const conversionLabel = conversionGoal ? CONVERSION_LABEL[conversionGoal] ?? conversionGoal : ''

  // -- Audit score gauges -----------------------------------------------------
  // CRO from croAudit.overallScore (0-10), SEO + Performance/Accessibility/Best Practices
  // from seoAudit.lighthouseScores (each 0-100), SEO score from seoAudit.overallScore.
  const lh = seoAudit?.lighthouseScores ?? null
  const gauges: Gauge[] = [
    { label: 'CRO', value: to100(croAudit?.overallScore) },
    { label: 'SEO', value: to100(seoAudit?.overallScore) },
    { label: 'Performance', value: to100(lh?.performance) },
    { label: 'Accessibility', value: to100(lh?.accessibility) },
    { label: 'Best Practices', value: to100(lh?.bestPractices) },
  ]

  // -- Market opportunity stats ----------------------------------------------
  const totalSearchVolume = (keywordSnapshot?.keywords ?? []).reduce(
    (sum, k) => sum + (k?.searchVolume ?? 0),
    0,
  )
  const competitors = competitorAnalysis?.competitors ?? []
  const competitorTraffic = competitors.reduce(
    (sum, c) => sum + competitorMonthlyVisits(c),
    0,
  )
  const hasUnavailableCompetitorTraffic = competitors.some((c) => c?.traffic?.status === 'unavailable')

  // Strip protocol for nicer display of the website URL.
  const cleanUrl = websiteUrl
    ? websiteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
    : ''

  return (
    <section className="slide" data-label="06 Mission Brief">
      <div className="brand-tag">
        <span className="dot"></span> 02 · Mission Brief
      </div>
      <div className="slide-head">
        <div className="h-left">
          <div className="h-eyebrow">02 · Mission Brief</div>
          <h1 className="h-title">Business &amp; market</h1>
        </div>
        <div className="h-meta">{cleanUrl}</div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '0.82fr 1.18fr',
          gap: 48,
          alignItems: 'start',
        }}
      >
        {/* LEFT: business goal + 3 tiles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="eyebrow" style={{ color: 'var(--purple-deep)' }}>
            The business
          </div>
          <p
            className="pull"
            style={{ fontSize: 36, lineHeight: 1.18, margin: 0 }}
          >
            {stripDashes(businessGoals) || `Grow ${businessName} sustainably.`}
          </p>

          {/* TYPE card removed by request — the businessName + business-type
              label duplicated info already shown elsewhere on the deck. The
              remaining two cards (CATEGORIES, CONVERSION) split 50/50. */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
              marginTop: 46,
              alignItems: 'stretch',
            }}
          >
            <div
              className="card"
              style={{
                padding: '18px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                height: '100%',
              }}
            >
              <div className="num-tag" style={{ fontSize: 24 }}>
                CATEGORIES
              </div>
              {categoryNames.length > 0 ? (
                <ul
                  style={{
                    listStyle: 'none',
                    margin: 0,
                    padding: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  {categoryNames.map((name, i) => (
                    <li
                      key={`${name}-${i}`}
                      className="h"
                      style={{ fontSize: 22, lineHeight: 1.25 }}
                    >
                      {name}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="b" style={{ fontSize: 22, lineHeight: 1.35 }}>
                  See keyword snapshot for the full category list.
                </div>
              )}
            </div>

            <div
              className="card"
              style={{
                padding: '18px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                height: '100%',
              }}
            >
              <div className="num-tag" style={{ fontSize: 24 }}>
                CONVERSION
              </div>
              <div className="h" style={{ fontSize: 24, lineHeight: 1.2 }}>
                {conversionLabel}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: market opportunity + audit gauges */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="eyebrow" style={{ color: 'var(--purple-deep)' }}>
            The market opportunity
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 14,
            }}
          >
            <div className="stat-tile" style={{ padding: '24px 28px', gap: 10 }}>
              <div className="lbl" style={{ fontSize: 24 }}>
                Monthly searches
              </div>
              <div className="val purple" style={{ fontSize: 64, lineHeight: 1 }}>
                {totalSearchVolume > 0 ? formatBigNumber(totalSearchVolume) : ''}
              </div>
              <div className="desc" style={{ fontSize: 24 }}>
                Based on the selected keywords
              </div>
            </div>
            <div className="stat-tile" style={{ padding: '24px 28px', gap: 10 }}>
              <div className="lbl" style={{ fontSize: 24 }}>
                Competitor traffic
              </div>
              <div className="val purple" style={{ fontSize: 64 }}>
                {competitorTraffic > 0
                  ? formatBigNumber(competitorTraffic)
                  : hasUnavailableCompetitorTraffic
                    ? 'Traffic unavailable'
                    : ''}
                {competitorTraffic > 0 && (
                  <span
                    style={{
                      fontSize: 24,
                      color: 'var(--ink-mute)',
                      fontWeight: 500,
                    }}
                  >
                    {' '}
                    /mo
                  </span>
                )}
              </div>
              <div className="desc" style={{ fontSize: 24 }}>
                Potential traffic from competitors
              </div>
            </div>
          </div>

          {competitorTraffic > 0 && (
            <div
              className="desc"
              style={{
                fontSize: 18,
                color: 'var(--ink-mute)',
                lineHeight: 1.45,
                marginTop: 4,
              }}
            >
              Broader market context, not a direct traffic forecast. The
              selected national and local competitors making up this number are
              shown on the following page.
            </div>
          )}

          <div
            className="eyebrow"
            style={{ color: 'var(--purple-deep)', marginTop: 48 }}
          >
            Your website audit score
          </div>
          <div
            style={{
              background: 'var(--bg-paper-2, #f6f4ef)',
              border: '1px solid var(--line)',
              borderRadius: 16,
              padding: '40px 28px',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5,1fr)',
                gap: 10,
                alignItems: 'start',
              }}
            >
              {gauges.map((g, i) => renderGauge(g, i))}
            </div>
          </div>
        </div>
      </div>

      <div className="slide-foot"></div>
    </section>
  )
}
