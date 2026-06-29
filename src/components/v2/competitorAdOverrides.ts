/**
 * Shared helper for the v2 Competitor Analysis (slide 9) and Paid Burn
 * (slide 17) slides. Merges per-competitor ad overrides defined on the
 * proposal (`client-proposals.competitors[]`) onto the competitor-analysis
 * audit data so the team can flip a "running ads" flag last-minute without
 * re-running the audit.
 *
 * Match key: normalised domain (protocol stripped, leading "www." removed,
 * trailing slash + path removed, lower-cased).
 *
 * Override precedence:
 *   - hasGoogleAds: when true on the proposal row, sets isRunningAds=true on
 *     the audit's googleAds. When the proposal row leaves it false we fall
 *     back to whatever the audit reported (no destructive override).
 *   - googleAdCountOverride: when set (number ≥ 0), wins over the audit count.
 *   - hasMetaAds / metaAdCountOverride: same behaviour for metaAds.
 *   - manualMonthlyVisits: when set, wins over fetched traffic in slides.
 */

export type AdsLike = {
  isRunningAds?: boolean | null
  adCount?: number | null
  activeAdCount?: number | null
} | null

export type CompetitorLike = {
  domain?: string | null
  websiteUrl?: string | null
  googleAds?: AdsLike
  metaAds?: AdsLike
  avgPosition?: number | null
  averagePosition?: number | null
  keywordsFound?: number | null
  keywordPositions?: unknown[] | null
  manualMonthlyVisits?: number | string | null
  /** Manual ad screenshot URLs, merged in from proposal-side overrides. */
  manualGoogleAdScreenshotUrls?: string[]
  manualMetaAdScreenshotUrls?: string[]
  [key: string]: unknown
}

type MediaRef = { url?: string | null } | number | null | undefined
type ScreenshotRow = { image?: MediaRef } | null | undefined

export type ProposalCompetitorOverride = {
  name?: string | null
  websiteUrl?: string | null
  hasGoogleAds?: boolean | null
  googleAdCountOverride?: number | null
  hasMetaAds?: boolean | null
  metaAdCountOverride?: number | null
  googleAdScreenshots?: ScreenshotRow[] | null
  metaAdScreenshots?: ScreenshotRow[] | null
  manualMonthlyVisits?: number | string | null
  serpAveragePosition?: number | null
  serpKeywordsFound?: number | null
  serpKeywordPositions?: unknown[] | null
}

/** Pull populated media URLs out of an array of `{ image: Media }` rows. */
function extractScreenshotUrls(rows: ScreenshotRow[] | null | undefined): string[] {
  if (!rows || rows.length === 0) return []
  const out: string[] = []
  for (const row of rows) {
    const img = row?.image
    if (img && typeof img === 'object' && typeof img.url === 'string' && img.url) {
      out.push(img.url)
    }
  }
  return out
}

/** Normalise a domain or URL to a comparable lower-cased hostname. */
export function normaliseDomain(value: string | null | undefined): string {
  if (!value) return ''
  let v = value.trim().toLowerCase()
  v = v.replace(/^https?:\/\//, '')
  v = v.replace(/^www\./, '')
  v = v.replace(/[/?#].*$/, '')
  return v
}

/**
 * Apply proposal overrides to an array of audit competitor profiles. Returns
 * a new array — input is not mutated.
 */
export function applyAdOverrides<T extends CompetitorLike>(
  auditCompetitors: T[],
  proposalCompetitors: ProposalCompetitorOverride[] | null | undefined,
): T[] {
  if (!proposalCompetitors || proposalCompetitors.length === 0) {
    return auditCompetitors
  }

  // Build a lookup keyed by normalised domain. The proposal stores the URL
  // under `websiteUrl`; competitors in the audit use `domain`.
  const overridesByDomain = new Map<string, ProposalCompetitorOverride>()
  for (const o of proposalCompetitors) {
    const key = normaliseDomain(o.websiteUrl) || normaliseDomain(o.name)
    if (!key) continue
    overridesByDomain.set(key, o)
  }

  return auditCompetitors.map((c) => {
    const key = normaliseDomain(c.domain) || normaliseDomain(c.websiteUrl)
    const override = key ? overridesByDomain.get(key) : undefined
    if (!override) return c

    const next: T = { ...c }

    // Google Ads
    if (override.hasGoogleAds || (override.googleAdCountOverride ?? null) != null) {
      const baseGoogle: NonNullable<AdsLike> = { ...(c.googleAds ?? {}) }
      if (override.hasGoogleAds) baseGoogle.isRunningAds = true
      if ((override.googleAdCountOverride ?? null) != null) {
        baseGoogle.adCount = override.googleAdCountOverride!
        // If the team set a count, treat it as "running" implicitly.
        if (baseGoogle.adCount! > 0) baseGoogle.isRunningAds = true
      }
      ;(next as CompetitorLike).googleAds = baseGoogle
    }

    // Meta Ads
    if (override.hasMetaAds || (override.metaAdCountOverride ?? null) != null) {
      const baseMeta: NonNullable<AdsLike> = { ...(c.metaAds ?? {}) }
      if (override.hasMetaAds) baseMeta.isRunningAds = true
      if ((override.metaAdCountOverride ?? null) != null) {
        baseMeta.activeAdCount = override.metaAdCountOverride!
        if (baseMeta.activeAdCount! > 0) baseMeta.isRunningAds = true
      }
      ;(next as CompetitorLike).metaAds = baseMeta
    }

    if ((override.manualMonthlyVisits ?? null) != null) {
      next.manualMonthlyVisits = override.manualMonthlyVisits
    }

    if ((override.serpAveragePosition ?? null) != null) {
      next.averagePosition = override.serpAveragePosition
      next.avgPosition = override.serpAveragePosition
    }

    if ((override.serpKeywordsFound ?? null) != null) {
      next.keywordsFound = override.serpKeywordsFound
    }

    if (Array.isArray(override.serpKeywordPositions) && override.serpKeywordPositions.length > 0) {
      next.keywordPositions = override.serpKeywordPositions
    }

    // Manual ad screenshot uploads — populated via depth:2 fetch in page.tsx.
    // Stored on each competitor row so the Paid Activation slide (slide 17)
    // can show real screenshots without re-querying the proposal.
    const googleShots = extractScreenshotUrls(override.googleAdScreenshots)
    if (googleShots.length > 0) next.manualGoogleAdScreenshotUrls = googleShots
    const metaShots = extractScreenshotUrls(override.metaAdScreenshots)
    if (metaShots.length > 0) next.manualMetaAdScreenshotUrls = metaShots

    return next
  })
}

/**
 * Convenience helper that returns the full `competitor-analysis`-shaped doc
 * with overrides applied to the `competitors` array. `yourProfile` is left
 * untouched (overrides are competitor-only).
 */
export function applyOverridesToCompetitorAnalysis<
  D extends { competitors?: CompetitorLike[] | null } | null,
>(
  doc: D,
  proposalCompetitors: ProposalCompetitorOverride[] | null | undefined,
): D {
  if (!doc) return doc
  const competitors = doc.competitors ?? []
  const merged = applyAdOverrides(competitors, proposalCompetitors)
  return { ...doc, competitors: merged } as D
}
