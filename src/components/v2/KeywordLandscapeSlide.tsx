/**
 * Slide 10 — Keyword landscape. Dynamic, multi-slide-capable.
 *
 * For each batch of up to 3 keyword categories (defined on the proposal in
 * the CMS as `keywordCategories`), render one slide with 3 cards. If the
 * proposal has more than 3 categories, additional slides are emitted so
 * EVERY category gets a card. Each card shows:
 *   - category name
 *   - total monthly search volume (sum of category's keyword volumes)
 *   - top 5 keywords by search volume
 *
 * Search volumes come from `keywordSnapshot.keywords[]` (matched on keyword
 * text, case-insensitively).
 */

import type { ReactElement } from 'react'

type KeywordCategory = {
  categoryName?: string | null
  // Stored as a textarea — one keyword per line.
  keywords?: string | null
}

type KeywordEntry = {
  keyword?: string | null
  searchVolume?: number | null
}

type KeywordSnapshotLike = {
  keywords?: KeywordEntry[] | null
} | null

type Bucket = {
  categoryName: string
  totalVolume: number
  topKeywords: { keyword: string; volume: number }[]
}

function parseCategoryKeywords(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw
    .split(/\r?\n/)
    .map((k) => k.trim())
    .filter((k) => k.length > 0)
}

function formatVolume(n: number): string {
  if (n <= 0) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function formatTotal(n: number): string {
  if (n <= 0) return '0'
  return n.toLocaleString()
}

// Build a lower-cased volume map from the keyword snapshot for fast lookup.
function buildVolumeMap(snapshot: KeywordSnapshotLike): Map<string, number> {
  const map = new Map<string, number>()
  for (const entry of snapshot?.keywords ?? []) {
    const kw = entry?.keyword?.toLowerCase().trim()
    if (!kw) continue
    const vol = entry?.searchVolume ?? 0
    // Keep the highest volume if the same keyword appears more than once.
    if (!map.has(kw) || (map.get(kw) ?? 0) < vol) {
      map.set(kw, vol)
    }
  }
  return map
}

function buildBuckets(
  categories: KeywordCategory[],
  volumeMap: Map<string, number>,
): Bucket[] {
  const buckets: Bucket[] = []
  for (const cat of categories) {
    const name = cat?.categoryName?.trim()
    if (!name) continue
    const kws = parseCategoryKeywords(cat.keywords)
    const enriched = kws.map((k) => ({
      keyword: k,
      volume: volumeMap.get(k.toLowerCase()) ?? 0,
    }))
    const totalVolume = enriched.reduce((sum, e) => sum + e.volume, 0)
    const topKeywords = [...enriched]
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 5)
    buckets.push({ categoryName: name, totalVolume, topKeywords })
  }
  return buckets
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export function KeywordLandscapeSlides({
  keywordCategories,
  keywordSnapshot,
  location,
}: {
  keywordCategories: KeywordCategory[] | null
  keywordSnapshot: KeywordSnapshotLike
  location?: string | null
}): ReactElement | null {
  const cats = keywordCategories ?? []
  if (cats.length === 0) return null

  const volumeMap = buildVolumeMap(keywordSnapshot)
  const buckets = buildBuckets(cats, volumeMap)
  if (buckets.length === 0) return null

  const grandTotal = buckets.reduce((s, b) => s + b.totalVolume, 0)
  const locationLabel = location?.trim() ? ` · ${location.trim()}` : ''
  const slides = chunk(buckets, 3)

  return (
    <>
      {slides.map((slideBuckets, slideIdx) => (
        <section
          key={`kw-landscape-${slideIdx}`}
          className="slide"
          data-label={
            slideIdx === 0
              ? '10 Keywords'
              : `10 Keywords (cont. ${slideIdx + 1})`
          }
        >
          <div className="brand-tag">
            <span className="dot"></span> 03 · Pre-flight Check
          </div>
          <div className="slide-head">
            <div className="h-left">
              <div className="h-eyebrow">03 · Pre-flight Check</div>
              <h1 className="h-title">
                Keyword landscape
                {slides.length > 1 ? ` (${slideIdx + 1}/${slides.length})` : ''}
              </h1>
            </div>
            <div className="h-meta">
              {formatTotal(grandTotal)} monthly relevant searches{locationLabel}
            </div>
          </div>

          <div className="kw-cluster">
            {slideBuckets.map((b, i) => {
              const overallIdx = slideIdx * 3 + i
              // Local-intent / zero-volume categories: hide the volume tile
              // and per-keyword volume cells, and surface an explanatory note
              // instead. Search volume tools don't report on hyper-local geo
              // modifiers like "accounting firm Surry Hills" — the traffic is
              // real, it just isn't measurable as a clean monthly total.
              const isLocalIntent =
                b.totalVolume === 0 && b.topKeywords.length > 0
              return (
                <div className="kw-card" key={`${b.categoryName}-${i}`}>
                  <div>
                    <div className="lbl">
                      Category {String(overallIdx + 1).padStart(2, '0')}
                    </div>
                    <div className="h">{b.categoryName}</div>
                  </div>
                  {isLocalIntent ? (
                    <div>
                      <div
                        className="lbl"
                        style={{
                          color: 'var(--ink-mute)',
                          letterSpacing: '0.04em',
                          textTransform: 'none',
                        }}
                      >
                        We will target these. Search volume is low at this
                        local level, and Google Ads doesn&apos;t expose a
                        clean monthly total. We capture the demand directly.
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="v">{formatTotal(b.totalVolume)}</div>
                      <div
                        className="lbl"
                        style={{ marginTop: 6, color: 'var(--ink-mute)' }}
                      >
                        Monthly searches
                      </div>
                    </div>
                  )}
                  <ul>
                    {b.topKeywords.length === 0 ? (
                      <li>
                        <span style={{ color: 'var(--ink-mute)' }}>
                          No search-volume data yet
                        </span>
                        <span></span>
                      </li>
                    ) : (
                      b.topKeywords.map((kw, j) => (
                        <li key={`${kw.keyword}-${j}`}>
                          <span>{kw.keyword}</span>
                          {!isLocalIntent && (
                            <span>{formatVolume(kw.volume)}</span>
                          )}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              )
            })}
          </div>

          <div className="slide-foot"></div>
        </section>
      ))}
    </>
  )
}
