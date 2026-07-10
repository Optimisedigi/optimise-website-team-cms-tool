'use client'

import { useAllFormFields, useDocumentInfo } from '@payloadcms/ui'
import { useMemo, useState } from 'react'

type CompetitorRow = {
  websiteUrl?: string | null
  name?: string | null
  hasGoogleAds?: boolean | null
}

type Summary = {
  checked?: number
  runningAds?: number
  notRunningAds?: number
  skippedNoDomain?: number
  failed?: number
}

function normaliseDomain(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
    return url.hostname.replace(/^www\./i, '')
  } catch {
    return trimmed.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/[/?#].*$/, '')
  }
}

function competitorsFromFields(fields: ReturnType<typeof useAllFormFields>[0] | undefined): CompetitorRow[] {
  const rootValue = fields?.competitors?.value
  if (Array.isArray(rootValue) && rootValue.every((row) => row && typeof row === 'object')) {
    return rootValue as CompetitorRow[]
  }

  const byIndex = new Map<number, CompetitorRow>()
  for (const [key, field] of Object.entries(fields ?? {})) {
    const match = key.match(/^competitors\.(\d+)\.(name|websiteUrl|hasGoogleAds)$/)
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

function hasUsableDomain(competitor: CompetitorRow): boolean {
  const websiteUrl = normaliseDomain(competitor.websiteUrl)
  if (websiteUrl) return true
  const name = normaliseDomain(competitor.name)
  return name.includes('.')
}

const RefreshManualCompetitorGoogleAdsButton = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)

  const competitors = useMemo(() => competitorsFromFields(fields), [fields])
  const counts = useMemo(() => {
    const withDomain = competitors.filter(hasUsableDomain)
    return {
      withDomain: withDomain.length,
      alreadyMarkedRunning: withDomain.filter((competitor) => competitor.hasGoogleAds).length,
      noDomain: competitors.length - withDomain.length,
    }
  }, [competitors])

  if (!id) return null

  const disabled = loading || counts.withDomain === 0

  const handleClick = async () => {
    setLoading(true)
    setSummary(null)
    setError(null)

    try {
      const res = await fetch(`/api/proposals/${id}/refresh-manual-google-ads`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data.error || `Failed (${res.status})`)
      }

      setSummary(data)
    } catch (err: any) {
      setError(err?.message || 'Could not fetch manual competitor Google Ads.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ marginBottom: 20, minHeight: 148, padding: 16, border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff' }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 20px',
          background: disabled ? '#9ca3af' : '#2563eb',
          color: '#fff',
          borderRadius: 8,
          border: 'none',
          fontWeight: 600,
          fontSize: 14,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Fetching manual Google Ads…' : 'Fetch manual Google Ads'}
      </button>

      <p style={{ marginTop: 8, fontSize: 13, color: '#4b5563' }}>
        <strong>Partial refresh.</strong> Checks Google Ads Transparency for manual competitors only and updates slide 9/Paid Burn flags.
      </p>

      <p style={{ marginTop: 8, fontSize: 13, color: '#6b7280' }}>
        {counts.withDomain} competitors with domains · {counts.alreadyMarkedRunning} already marked running
        {counts.noDomain > 0 ? ` · ${counts.noDomain} missing URL/domain` : ''}
      </p>

      {summary && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#16a34a' }}>
          Checked {summary.checked ?? 0} · running {summary.runningAds ?? 0} · not running {summary.notRunningAds ?? 0} · failed {summary.failed ?? 0}
        </p>
      )}

      {error && <p style={{ marginTop: 8, fontSize: 13, color: '#dc2626' }}>{error}</p>}
    </div>
  )
}

export default RefreshManualCompetitorGoogleAdsButton
