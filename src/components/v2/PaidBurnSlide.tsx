/**
 * Slide 17 — Paid activation (Fueling the Ship · Stage 2). Dynamic.
 *
 * Lists competitors currently running Google Ads / Meta Ads, pulled from
 * the proposal's linked competitor-analysis doc. Each row shows the
 * advertiser's domain and a hover thumbnail — mirroring the Competitor
 * Analysis slide (slide 9) interaction. Screenshot source order:
 *
 *   1. Manual uploads on the proposal's `competitors[].googleAdScreenshots`
 *      (carried through by `applyOverridesToCompetitorAnalysis`).
 *   2. Curated fallback images in `/public/v2/paid-activation/` — picked
 *      deterministically per-domain so the same competitor always gets the
 *      same fallback.
 *
 * (Renamed from "Paid burn" — the file path stays for git history continuity
 * and to avoid touching every importer.)
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
  manualGoogleAdScreenshotUrls?: string[]
  manualMetaAdScreenshotUrls?: string[]
}

type CompetitorAnalysisLike = {
  competitors?: CompetitorProfile[] | null
} | null

type AdRow = {
  domain: string
  count: number
  screenshotUrls: string[]
}

// Cap the hover preview at four creatives — a small 2x2 stack, no more.
const MAX_PREVIEWS = 4

// Curated category fallback screenshots living in /public/v2/paid-activation/.
// File names are stable so the team can swap the source images without code
// changes. Add more files and add their filenames here to expand the rotation.
const FALLBACK_GOOGLE = [
  '/v2/paid-activation/google-1.png',
  '/v2/paid-activation/google-2.png',
  '/v2/paid-activation/google-3.png',
]
const FALLBACK_META = [
  '/v2/paid-activation/meta-1.png',
  '/v2/paid-activation/meta-2.png',
  '/v2/paid-activation/meta-3.png',
]

/** Stable hash so the same domain always picks the same fallback image. */
function hashIndex(input: string, modulo: number): number {
  if (modulo <= 0) return 0
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0
  }
  return Math.abs(h) % modulo
}

function adCount(ads: AdsInfo, key: 'google' | 'meta'): number {
  if (!ads || !ads.isRunningAds) return 0
  const raw = key === 'google' ? ads.adCount : ads.activeAdCount
  return typeof raw === 'number' && raw > 0 ? raw : 0
}

function pickScreenshots(
  c: CompetitorProfile,
  domain: string,
  kind: 'google' | 'meta',
): string[] {
  // 1. Manual uploads / scraped creatives win — show up to MAX_PREVIEWS in a
  //    small stack. If there's only one, only one is shown.
  const manual =
    kind === 'google'
      ? c.manualGoogleAdScreenshotUrls
      : c.manualMetaAdScreenshotUrls
  if (manual && manual.length > 0) return manual.slice(0, MAX_PREVIEWS)

  // 2. Single curated fallback, deterministic per-domain.
  const pool = kind === 'google' ? FALLBACK_GOOGLE : FALLBACK_META
  if (pool.length === 0) return []
  return [pool[hashIndex(`${kind}:${domain}`, pool.length)]]
}

function collectAdRows(
  competitors: CompetitorProfile[],
  kind: 'google' | 'meta',
): AdRow[] {
  const rows: AdRow[] = []
  for (const c of competitors) {
    const ads = kind === 'google' ? c.googleAds : c.metaAds
    if (!ads?.isRunningAds) continue
    const domain = (c.domain ?? '')
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .trim()
    if (!domain) continue
    rows.push({
      domain,
      count: adCount(ads, kind),
      screenshotUrls: pickScreenshots(c, domain, kind),
    })
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
              className="v2-comp-adrow"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 24,
                padding: '14px 0',
                borderBottom: '1px solid var(--line)',
              }}
            >
              <span className="v2-comp-domain">
                {row.domain}
                {row.screenshotUrls.length > 0 && (
                  <span
                    className={`v2-comp-thumb${
                      row.screenshotUrls.length > 1 ? ' v2-comp-thumb--grid' : ''
                    }`}
                    aria-hidden="true"
                  >
                    {row.screenshotUrls.map((url, j) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={`${url}-${j}`} src={url} alt="" />
                    ))}
                  </span>
                )}
              </span>
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

  return (
    <section className="slide" data-label="18 Paid Activation">
      <div className="brand-tag">
        <span className="dot"></span> 06 · Fueling the Ship
      </div>
      <div className="slide-head">
        <div className="h-left">
          <div className="h-eyebrow">06 · Fueling the Ship · Stage 2</div>
          <h1 className="h-title">Paid activation</h1>
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
        Paid activity exists in the category, but there is still an opportunity
        to compete with <em>sharper positioning</em>, better landing pages and
        stronger conversion foundations.
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
