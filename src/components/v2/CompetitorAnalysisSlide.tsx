/**
 * Slide 9 — Competitor analysis (Pre-flight Check). Dynamic.
 *
 * Renders the top competitors from competitor-analyses, sorted by monthly
 * traffic descending, plus the "you" row built from the proposal's own
 * profile. Google Ads / Meta Ads columns show plain Yes/No (no count).
 */

import type { ReactElement } from 'react'

type TrafficData = {
  monthlyVisits?: number | string | null
} | null

type CompetitorProfile = {
  domain?: string | null
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

function normaliseVisits(raw: number | string | null | undefined): number {
  if (raw == null) return 0
  if (typeof raw === 'number') return raw
  const s = String(raw).trim().toUpperCase().replace(/,/g, '')
  const num = parseFloat(s)
  if (!Number.isFinite(num)) return 0
  if (s.endsWith('M')) return num * 1_000_000
  if (s.endsWith('K')) return num * 1_000
  return num
}

function formatVisits(n: number): string {
  if (n <= 0) return ''
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
}: {
  proposalWebsiteUrl: string | null
  competitorAnalysis: CompetitorAnalysisLike
}): ReactElement {
  const yourProfile = competitorAnalysis?.yourProfile ?? null
  const competitors = competitorAnalysis?.competitors ?? []

  // Sort competitors by monthly visits descending and take top 5.
  const sortedCompetitors = [...competitors]
    .map((c) => ({ ...c, _visits: normaliseVisits(c?.traffic?.monthlyVisits ?? null) }))
    .sort((a, b) => b._visits - a._visits)
    .slice(0, 5)

  const yourDomain = yourProfile?.domain || domainFromUrl(proposalWebsiteUrl)
  const yourVisits = normaliseVisits(yourProfile?.traffic?.monthlyVisits ?? null)

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
              <td className="num" style={{ textAlign: 'right' }}>{formatVisits(yourVisits)}</td>
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
          {sortedCompetitors.map((c, i) => {
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
                  {formatVisits(c._visits)}
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
