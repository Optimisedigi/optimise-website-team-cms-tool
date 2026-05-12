/**
 * Slide 17 — Paid burn (Fueling the Ship · Stage 2). Dynamic.
 *
 * Lists competitors currently running Google Ads / Meta Ads, pulled from
 * the proposal's linked competitor-analysis doc. Each card shows the
 * advertiser's domain and the live ad count detected by the scrapling
 * service. When no competitors are running ads we collapse the card with
 * an explanatory state rather than rendering an empty list.
 */

import type { ReactElement } from 'react'

type AdsInfo = {
  isRunningAds?: boolean | null
  adCount?: number | null
  activeAdCount?: number | null
} | null

type CompetitorProfile = {
  domain?: string | null
  googleAds?: AdsInfo
  metaAds?: AdsInfo
}

type CompetitorAnalysisLike = {
  competitors?: CompetitorProfile[] | null
} | null

type AdRow = { domain: string; count: number }

function adCount(ads: AdsInfo, key: 'google' | 'meta'): number {
  if (!ads || !ads.isRunningAds) return 0
  const raw = key === 'google' ? ads.adCount : ads.activeAdCount
  return typeof raw === 'number' && raw > 0 ? raw : 0
}

function collectAdRows(
  competitors: CompetitorProfile[],
  key: 'google' | 'meta',
): AdRow[] {
  const rows: AdRow[] = []
  for (const c of competitors) {
    const ads = key === 'google' ? c.googleAds : c.metaAds
    if (!ads?.isRunningAds) continue
    const domain = (c.domain ?? '').replace(/^https?:\/\//, '').replace(/^www\./, '').trim()
    if (!domain) continue
    rows.push({ domain, count: adCount(ads, key) })
  }
  // Sort: highest count first, then alpha by domain for stability.
  rows.sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain))
  return rows
}

function formatCount(n: number, kind: 'google' | 'meta'): string {
  if (n <= 0) return kind === 'google' ? 'Running ads' : 'Active'
  if (kind === 'google') return `${n} ad${n === 1 ? '' : 's'} live`
  return `${n} active`
}

function AdCard({
  label,
  rows,
  kind,
}: {
  label: string
  rows: AdRow[]
  kind: 'google' | 'meta'
}): ReactElement {
  return (
    <div className="card">
      <div className="num-tag">{label}</div>
      <div className="h">Active right now</div>
      {rows.length === 0 ? (
        <p
          className="b"
          style={{
            marginTop: 12,
            color: 'var(--ink-mute)',
            fontStyle: 'italic',
          }}
        >
          No competitors detected running {kind === 'google' ? 'Google' : 'Meta'} ads.
        </p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: '8px 0 0',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {rows.map((row, i) => (
            <li
              key={`${row.domain}-${i}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 24,
                padding: '14px 0',
                borderBottom: '1px solid var(--line)',
              }}
            >
              <span>{row.domain}</span>
              <span className="green" style={{ fontWeight: 600 }}>
                {formatCount(row.count, kind)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function PaidBurnSlide({
  competitorAnalysis,
}: {
  competitorAnalysis: CompetitorAnalysisLike
}): ReactElement {
  const competitors = competitorAnalysis?.competitors ?? []
  const googleRows = collectAdRows(competitors, 'google')
  const metaRows = collectAdRows(competitors, 'meta')
  const totalRunning = googleRows.length + metaRows.length

  return (
    <section className="slide" data-label="18 Paid Burn">
      <div className="brand-tag">
        <span className="dot"></span> 06 · Fueling the Ship
      </div>
      <div className="slide-head">
        <div className="h-left">
          <div className="h-eyebrow">06 · Fueling the Ship · Stage 2</div>
          <h1 className="h-title">Paid burn</h1>
        </div>
        <div className="h-meta">Once fundamentals are solid</div>
      </div>

      <p
        className="pull"
        style={{
          fontSize: 36,
          lineHeight: 1.2,
          maxWidth: 1700,
          marginBottom: 48,
        }}
      >
        {totalRunning > 0 ? (
          <>
            Your competitors are paying for traffic. <em>You can too</em>, but
            only once the site converts well enough that paid spend earns its
            return.
          </>
        ) : (
          <>
            No competitors are actively running paid ads right now. That&apos;s
            a window, but only worth stepping through once the site converts
            well enough that paid spend earns its return.
          </>
        )}
      </p>

      <div className="two-col">
        <AdCard label="COMPETITOR · GOOGLE ADS" rows={googleRows} kind="google" />
        <AdCard label="COMPETITOR · META ADS" rows={metaRows} kind="meta" />
      </div>

      <p className="small" style={{ marginTop: 36 }}>
        Our position: paid acquisition is unlocked at the end of phase one,
        once SEO foundations and CRO hit benchmark.
      </p>

      <div className="slide-foot"></div>
    </section>
  )
}
