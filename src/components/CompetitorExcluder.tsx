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
        // Fetch both competitor analysis data and CMS-added competitors in parallel
        const [analysisRes, proposalRes] = await Promise.all([
          fetch(
            `/api/competitor-analyses?where[proposal][equals]=${id}&limit=1&sort=-createdAt`,
            { credentials: 'include' },
          ),
          fetch(`/api/client-proposals/${id}?depth=0`, { credentials: 'include' }),
        ])

        const allDomains = new Set<string>()

        // API competitor domains
        if (analysisRes.ok) {
          const data = await analysisRes.json()
          const analysis = data.docs?.[0]
          if (analysis?.competitors) {
            for (const c of analysis.competitors as CompetitorProfile[]) {
              const d = c.domain?.replace(/^www\./, '') ?? ''
              if (d) allDomains.add(d)
            }
          }
        }

        // CMS-added competitor domains
        if (proposalRes.ok) {
          const proposal = await proposalRes.json()
          const cmsCompetitors = proposal.competitors as { websiteUrl?: string }[] | undefined
          if (cmsCompetitors) {
            for (const c of cmsCompetitors) {
              if (!c.websiteUrl) continue
              try {
                const hostname = new URL(c.websiteUrl.startsWith('http') ? c.websiteUrl : `https://${c.websiteUrl}`).hostname.replace(/^www\./, '')
                if (hostname) allDomains.add(hostname)
              } catch {
                // skip invalid URLs
              }
            }
          }
        }

        if (!cancelled) setDomains(Array.from(allDomains))
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
        Checked competitors will be hidden from every slide they appear on: Competitor Analysis, Paid Burn, and Return Modelling.
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
