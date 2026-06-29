'use client'

import { useAllFormFields, useDocumentInfo } from '@payloadcms/ui'
import { useMemo, useState } from 'react'
import { classifyManualCompetitors } from '@/lib/manual-competitor-serp-metrics'

type CompetitorRow = {
  websiteUrl?: string | null
  name?: string | null
  serpAveragePosition?: number | string | null
  serpKeywordsFound?: number | string | null
}

type Summary = {
  updated?: number
  alreadyFilled?: number
  skippedNoDomain?: number
  failed?: number
  requestedFromGrowthTools?: number
}

function competitorsFromFields(fields: ReturnType<typeof useAllFormFields>[0] | undefined): CompetitorRow[] {
  const rootValue = fields?.competitors?.value
  if (Array.isArray(rootValue) && rootValue.every((row) => row && typeof row === 'object')) {
    return rootValue as CompetitorRow[]
  }

  const byIndex = new Map<number, CompetitorRow>()
  for (const [key, field] of Object.entries(fields ?? {})) {
    const match = key.match(/^competitors\.(\d+)\.(name|websiteUrl|serpAveragePosition|serpKeywordsFound)$/)
    if (!match) continue
    const index = Number(match[1])
    const prop = match[2] as keyof CompetitorRow
    const row = byIndex.get(index) ?? {}
    row[prop] = field?.value as never
    byIndex.set(index, row)
  }

  return [...byIndex.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, row]) => row)
}

function hasKeywordCategories(fields: ReturnType<typeof useAllFormFields>[0] | undefined): boolean {
  const rootValue = fields?.keywordCategories?.value
  if (Array.isArray(rootValue)) {
    return rootValue.some((category) => typeof category?.keywords === 'string' && category.keywords.trim().length > 0)
  }

  return Object.entries(fields ?? {}).some(([key, field]) => {
    if (!/^keywordCategories\.\d+\.keywords$/.test(key)) return false
    const value = field?.value
    return typeof value === 'string' && value.trim().length > 0
  })
}

const RunManualCompetitorSerpMetricsButton = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)

  const competitors = useMemo(() => competitorsFromFields(fields), [fields])

  const hasKeywords = useMemo(() => {
    const legacyKeywords = fields?.keywords?.value
    return (typeof legacyKeywords === 'string' && legacyKeywords.trim().length > 0) || hasKeywordCategories(fields)
  }, [fields])

  const counts = useMemo(() => {
    const buckets = classifyManualCompetitors(competitors)
    return {
      missing: buckets.needsFetch.length,
      filled: buckets.alreadyFilled.length,
      noDomain: buckets.skippedNoDomain.length,
      totalWithDomain: buckets.needsFetch.length + buckets.alreadyFilled.length,
    }
  }, [competitors])

  if (!id) return null

  const disabled = loading || counts.missing === 0 || counts.totalWithDomain === 0 || !hasKeywords

  const handleClick = async () => {
    setLoading(true)
    setSummary(null)
    setError(null)

    try {
      const res = await fetch(`/api/proposals/${id}/run-manual-competitor-serp-metrics`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data.error || `Failed (${res.status})`)
      }

      setSummary(data)
    } catch (err: any) {
      setError(err?.message || 'Could not fill competitor SERP metrics.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ marginBottom: 20, padding: 16, border: '1px solid #e5e7eb', borderRadius: 8, background: '#f9fafb' }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 20px',
          background: disabled ? '#9ca3af' : '#4f46e5',
          color: '#fff',
          borderRadius: 8,
          border: 'none',
          fontWeight: 600,
          fontSize: 14,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Filling missing competitor SERP metrics...' : 'Fill missing competitor SERP metrics'}
      </button>

      <p style={{ marginTop: 8, fontSize: 13, color: '#4b5563' }}>
        {counts.missing} competitors need SERP metrics · {counts.filled} already filled
        {counts.noDomain > 0 ? ` · ${counts.noDomain} missing URL/domain` : ''}
      </p>

      {!hasKeywords && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#9ca3af' }}>
          Add proposal keywords before filling SERP metrics.
        </p>
      )}

      {counts.totalWithDomain === 0 && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#9ca3af' }}>
          Add at least one manual competitor URL before filling SERP metrics.
        </p>
      )}

      {summary && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#16a34a' }}>
          Updated {summary.updated ?? 0} · skipped {summary.alreadyFilled ?? 0} already filled · failed {summary.failed ?? 0}
          {' · '}requested {summary.requestedFromGrowthTools ?? 0} from Growth Tools
        </p>
      )}

      {error && <p style={{ marginTop: 8, fontSize: 13, color: '#dc2626' }}>{error}</p>}
    </div>
  )
}

export default RunManualCompetitorSerpMetricsButton
