'use client'

import { useDocumentInfo, useField } from '@payloadcms/ui'
import { useState, useEffect } from 'react'

type CompetitorProfile = {
  domain?: string
}

const CompetitorExcluder = () => {
  const { id } = useDocumentInfo()
  const { value, setValue } = useField<string[] | string | null>({ path: 'excludedCompetitorDomains' })
  const [domains, setDomains] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  // Normalize value — could be an array, a JSON string, or null
  const excluded: string[] = Array.isArray(value)
    ? value
    : typeof value === 'string' && value.startsWith('[')
      ? (() => { try { return JSON.parse(value) } catch { return [] } })()
      : []

  useEffect(() => {
    if (!id) return
    let cancelled = false

    const fetchCompetitors = async () => {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/competitor-analyses?where[proposal][equals]=${id}&limit=1&sort=-createdAt`,
          { credentials: 'include' },
        )
        if (!res.ok) return
        const data = await res.json()
        const analysis = data.docs?.[0]
        if (!analysis?.competitors) return

        const competitorDomains = (analysis.competitors as CompetitorProfile[])
          .map((c) => c.domain?.replace(/^www\./, '') ?? '')
          .filter(Boolean)

        if (!cancelled) setDomains(competitorDomains)
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchCompetitors()
    return () => { cancelled = true }
  }, [id])

  if (!id) return null

  if (loading) {
    return (
      <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--theme-elevation-600)' }}>
        Loading competitor domains...
      </div>
    )
  }

  if (domains.length === 0) {
    return (
      <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--theme-elevation-500)' }}>
        No competitor analysis found. Run audits first to populate this selector.
      </div>
    )
  }

  const toggle = (domain: string) => {
    const next = excluded.includes(domain)
      ? excluded.filter((d) => d !== domain)
      : [...excluded, domain]
    setValue(next)
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <label
        style={{
          display: 'block',
          marginBottom: 8,
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--theme-elevation-800)',
        }}
      >
        Exclude Competitors from Report
      </label>
      <p style={{ marginBottom: 8, fontSize: 12, color: 'var(--theme-elevation-500)' }}>
        Checked competitors will be hidden from the proposal report.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {domains.map((domain) => (
          <label
            key={domain}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              cursor: 'pointer',
              padding: '4px 0',
            }}
          >
            <input
              type="checkbox"
              checked={excluded.includes(domain)}
              onChange={() => toggle(domain)}
            />
            <span>{domain}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

export default CompetitorExcluder
