'use client'

import { useRowLabel } from '@payloadcms/ui'

type CompetitorRow = {
  name?: string | null
  websiteUrl?: string | null
  manualMonthlyVisits?: number | null
  serpAveragePosition?: number | null
  serpKeywordsFound?: number | null
  gbpRating?: number | null
  gbpReviewCount?: number | null
}

function domainOf(url?: string | null): string {
  if (!url) return ''
  return url
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/.*$/, '')
    .trim()
}

function formatVisits(v?: number | null): string | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`
  return String(v)
}

/**
 * Compact collapsed-row summary for the proposal competitors array, so the
 * list reads like a table: name · domain · visits · avg pos · keywords · GBP.
 * Expanding a row still shows the full edit form.
 */
export default function CompetitorRowLabel() {
  const { data, rowNumber } = useRowLabel<CompetitorRow>()

  const index = typeof rowNumber === 'number' ? rowNumber + 1 : undefined
  const name = data?.name?.trim() || (index ? `Competitor ${index}` : 'New competitor')
  const domain = domainOf(data?.websiteUrl)

  const stats: string[] = []
  const visits = formatVisits(data?.manualMonthlyVisits)
  if (visits) stats.push(`${visits} visits/mo`)
  if (typeof data?.serpAveragePosition === 'number' && data.serpAveragePosition > 0) {
    stats.push(`avg pos ${data.serpAveragePosition}`)
  }
  if (typeof data?.serpKeywordsFound === 'number' && data.serpKeywordsFound > 0) {
    stats.push(`${data.serpKeywordsFound} kw`)
  }
  if (typeof data?.gbpRating === 'number' && data.gbpRating > 0) {
    const reviews =
      typeof data?.gbpReviewCount === 'number' && data.gbpReviewCount > 0
        ? ` (${data.gbpReviewCount})`
        : ''
    stats.push(`★ ${data.gbpRating}${reviews}`)
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
      <strong>{name}</strong>
      {domain && <span style={{ opacity: 0.6, fontSize: '0.85em' }}>{domain}</span>}
      {stats.length > 0 && (
        <span style={{ opacity: 0.75, fontSize: '0.85em' }}>· {stats.join(' · ')}</span>
      )}
    </span>
  )
}
