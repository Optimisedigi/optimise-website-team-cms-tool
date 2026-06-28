/**
 * Slide 9 — Competitor analysis (Pre-flight Check). Dynamic.
 *
 * Renders competitors sorted by monthly traffic descending (automated from
 * competitor-analyses), then appends any manually-entered proposal competitors
 * that aren't already in the automated list. Plus a "you" row at the top from
 * the proposal's own profile. Google Ads / Meta Ads columns show plain Yes/No.
 */

import type { ReactElement } from 'react'
import { normaliseDomain } from './competitorAdOverrides'

type MonthlyVisitPoint = number | { visits?: number | string | null }

type TrafficData = {
  monthlyVisits?: number | string | MonthlyVisitPoint[] | null
  averageMonthlyVisits?: number | string | null
  estimatedMonthlyVisits?: number | string | null
  status?: string | null
  unavailableReason?: string | null
} | null

type CompetitorProfile = {
  domain?: string | null
  manualMonthlyVisits?: number | string | null
  avgPosition?: number | null
  averagePosition?: number | null
  keywordsFound?: number | null
  traffic?: TrafficData
  metaAds?: { isRunningAds?: boolean } | null
  googleAds?: { isRunningAds?: boolean } | null
  websiteScreenshot?: string | null
}

// Build the right URL for a screenshot blob: full URL, data URL, or raw base64.
function screenshotSrc(raw: string | null | undefined): string | null {
  if (!raw) return null
  if (raw.startsWith('http') || raw.startsWith('data:')) return raw
  return `data:image/png;base64,${raw}`
}

type CompetitorAnalysisLike = {
  yourProfile?: CompetitorProfile | null
  competitors?: CompetitorProfile[] | null
} | null

type ProposalCompetitor = {
  name?: string | null
  websiteUrl?: string | null
  manualMonthlyVisits?: number | string | null
  hasGoogleAds?: boolean | null
  hasMetaAds?: boolean | null
}

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

function normaliseTrafficVisits(traffic: TrafficData): number {
  if (!traffic || traffic.status === 'unavailable') return 0
  return normaliseVisits(
    traffic.averageMonthlyVisits ?? traffic.estimatedMonthlyVisits ?? traffic.monthlyVisits ?? null,
  )
}

function profileMonthlyVisits(profile: CompetitorProfile | null | undefined): number {
  const manual = normaliseVisits(profile?.manualMonthlyVisits ?? null)
  if (manual > 0) return manual
  return normaliseTrafficVisits(profile?.traffic ?? null)
}

function formatVisits(profile: CompetitorProfile | null | undefined): string {
  const n = profileMonthlyVisits(profile)
  if (n <= 0) return 'Traffic unavailable'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function domainFromUrl(url: string | null | undefined): string {
  if (!url) return ''
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
  }
}

export function CompetitorAnalysisSlide({
  proposalWebsiteUrl,
  competitorAnalysis,
  proposalCompetitors,
}: {
  proposalWebsiteUrl: string | null
  competitorAnalysis: CompetitorAnalysisLike
  proposalCompetitors: ProposalCompetitor[] | null
}): ReactElement {
  const yourProfile = competitorAnalysis?.yourProfile ?? null
  const competitors = competitorAnalysis?.competitors ?? []

  // Sort automated competitors by monthly visits descending.
  const sortedAutomated = [...competitors]
    .map((c) => ({ ...c, _visits: profileMonthlyVisits(c) }))
    .sort((a, b) => b._visits - a._visits)

  // Track which domains are already shown (automated) so we don't duplicate
  // when appending the manually-entered CMS competitors below.
  const seenDomains = new Set<string>()
  for (const c of sortedAutomated) {
    const d = normaliseDomain(c.domain)
    if (d) seenDomains.add(d)
  }

  // Append manual proposal competitors that aren't already in the automated
  // list. Build them as CompetitorProfile-shaped rows so they render through
  // the same table cell logic. Manual rows have no traffic/keywords data so
  // those columns render empty.
  const manualOnly = (proposalCompetitors ?? [])
    .map((m): (CompetitorProfile & { _visits: number }) | null => {
      const key = normaliseDomain(m.websiteUrl) || normaliseDomain(m.name)
      if (!key || seenDomains.has(key)) return null
      seenDomains.add(key)
      return {
        domain: key,
        avgPosition: null,
        averagePosition: null,
        keywordsFound: null,
        manualMonthlyVisits: m.manualMonthlyVisits ?? null,
        traffic: null,
        googleAds: m.hasGoogleAds ? { isRunningAds: true } : null,
        metaAds: m.hasMetaAds ? { isRunningAds: true } : null,
        websiteScreenshot: null,
        _visits: normaliseVisits(m.manualMonthlyVisits ?? null),
      }
    })
    .filter((c): c is CompetitorProfile & { _visits: number } => c !== null)

  const allCompetitors = [...sortedAutomated, ...manualOnly]

  const yourDomain = yourProfile?.domain || domainFromUrl(proposalWebsiteUrl)
  return (
    <section className="slide" data-label="09 Competitor Analysis">
      <div className="brand-tag">
        <span className="dot"></span> 03 · Pre-flight Check
      </div>
      <div className="slide-head">
        <div className="h-left">
          <div className="h-eyebrow">03 · Pre-flight Check</div>
          <h1 className="h-title">Competitor analysis</h1>
        </div>
        <div className="h-meta">Selected competitors</div>
      </div>

      <table className="t">
        <thead>
          <tr>
            <th>Domain</th>
            <th className="num" style={{ textAlign: 'right' }}>Monthly visits</th>
            <th className="num" style={{ textAlign: 'right' }}>Avg. position</th>
            <th className="num" style={{ textAlign: 'right' }}>Keywords</th>
            <th>Google ads</th>
            <th>Meta ads</th>
          </tr>
        </thead>
        <tbody>
          {yourProfile && (
            <tr className="you">
              <td>
                <span className="v2-comp-domain">
                  {yourDomain ? (
                    <a
                      href={`https://${yourDomain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'inherit', textDecoration: 'none' }}
                    >
                      {yourDomain}
                    </a>
                  ) : (
                    ''
                  )}
                  {screenshotSrc(yourProfile.websiteScreenshot) && (
                    <span className="v2-comp-thumb" aria-hidden="true">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={screenshotSrc(yourProfile.websiteScreenshot) ?? ''}
                        alt=""
                      />
                    </span>
                  )}
                </span>
                <span className="you-tag">You</span>
              </td>
              <td className="num" style={{ textAlign: 'right' }}>{formatVisits(yourProfile)}</td>
              <td className="num" style={{ textAlign: 'right' }}>
                {yourProfile.avgPosition != null
                  ? `#${yourProfile.avgPosition}`
                  : yourProfile.averagePosition != null
                    ? `#${yourProfile.averagePosition}`
                    : ''}
              </td>
              <td className="num" style={{ textAlign: 'right' }}>
                {yourProfile.keywordsFound ?? ''}
              </td>
              <td className={yourProfile.googleAds?.isRunningAds ? 'ok' : 'no'}>
                {yourProfile.googleAds?.isRunningAds ? 'Yes' : 'No'}
              </td>
              <td className={yourProfile.metaAds?.isRunningAds ? 'ok' : 'no'}>
                {yourProfile.metaAds?.isRunningAds ? 'Yes' : 'No'}
              </td>
            </tr>
          )}
          {allCompetitors.map((c, i) => {
            const pos = c.avgPosition ?? c.averagePosition ?? null
            const shotSrc = screenshotSrc(c.websiteScreenshot)
            return (
              <tr key={`${c.domain ?? ''}-${i}`}>
                <td>
                  <span className="v2-comp-domain">
                    {c.domain ? (
                      <a
                        href={`https://${c.domain.replace(/^https?:\/\//, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'inherit', textDecoration: 'none' }}
                      >
                        {c.domain}
                      </a>
                    ) : (
                      ''
                    )}
                    {shotSrc && (
                      <span className="v2-comp-thumb" aria-hidden="true">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={shotSrc} alt="" />
                      </span>
                    )}
                  </span>
                </td>
                <td className="num" style={{ textAlign: 'right' }}>
                  {formatVisits(c)}
                </td>
                <td className="num" style={{ textAlign: 'right' }}>
                  {pos != null ? `#${pos}` : ''}
                </td>
                <td className="num" style={{ textAlign: 'right' }}>
                  {c.keywordsFound ?? ''}
                </td>
                <td className={c.googleAds?.isRunningAds ? 'ok' : 'no'}>
                  {c.googleAds?.isRunningAds ? 'Yes' : 'No'}
                </td>
                <td className={c.metaAds?.isRunningAds ? 'ok' : 'no'}>
                  {c.metaAds?.isRunningAds ? 'Yes' : 'No'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <p className="small" style={{ marginTop: 32 }}>
        These are only the selected competitors. We still need to ask how
        they&apos;re driving this traffic.
      </p>

      <div className="slide-foot"></div>
    </section>
  )
}
