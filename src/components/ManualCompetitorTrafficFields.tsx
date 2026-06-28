'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

type Profile = {
  key?: string | null
  source?: 'analysis' | 'input' | null
  name?: string | null
  domain?: string | null
  manualMonthlyVisits?: number | null
  traffic?: { monthlyVisits?: number | null; status?: string | null } | null
}

type Row = {
  key: string
  domain: string
  fetchedMonthlyVisits: number | null
  monthlyVisits: string
}

function fetchedVisits(profile: Profile | null | undefined): number | null {
  const visits = profile?.traffic?.monthlyVisits
  return typeof visits === 'number' ? visits : null
}

function formatFetched(value: number | null): string {
  return typeof value === 'number' ? value.toLocaleString('en-AU') : 'Unavailable'
}

const ManualCompetitorTrafficFields = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [yourProfile, setYourProfile] = useState<Row | null>(null)
  const [competitors, setCompetitors] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const competitorAnalysis = fields?.competitorAnalysis?.value
  const hasCompetitorAnalysis = Boolean(
    competitorAnalysis &&
      (typeof competitorAnalysis === 'number' || typeof competitorAnalysis === 'string' || (typeof competitorAnalysis === 'object' && 'id' in competitorAnalysis)),
  )
  const hasInputCompetitors = Array.isArray(fields?.competitors?.value) && fields.competitors.value.length > 0
  const hasTrafficRows = hasCompetitorAnalysis || hasInputCompetitors

  useEffect(() => {
    if (!id || !hasTrafficRows) return
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`/api/proposals/${id}/manual-competitor-traffic`, { credentials: 'include' })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `Failed (${res.status})`)
        if (cancelled) return
        const your = data.yourProfile as Profile | null
        setYourProfile(your ? {
          key: 'yourProfile',
          domain: your.domain || 'Your website',
          fetchedMonthlyVisits: fetchedVisits(your),
          monthlyVisits: your.manualMonthlyVisits != null ? String(your.manualMonthlyVisits) : '',
        } : null)
        setCompetitors((Array.isArray(data.competitors) ? data.competitors : []).map((profile: Profile, index: number) => ({
          key: profile?.key || String(index),
          domain: profile?.domain || profile?.name || `Competitor ${index + 1}`,
          fetchedMonthlyVisits: fetchedVisits(profile),
          monthlyVisits: profile?.manualMonthlyVisits != null ? String(profile.manualMonthlyVisits) : '',
        })))
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Could not load manual traffic fields.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id, hasTrafficRows])

  if (!id) return null

  const save = async () => {
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const res = await fetch(`/api/proposals/${id}/manual-competitor-traffic`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          yourProfileMonthlyVisits: yourProfile?.monthlyVisits || null,
          competitors: competitors.map((row) => ({ key: row.key, domain: row.domain, monthlyVisits: row.monthlyVisits || null })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`)
      setMessage('Manual monthly visits saved. Refresh the proposal report to see them.')
    } catch (err: any) {
      setError(err?.message || 'Could not save manual monthly visits.')
    } finally {
      setSaving(false)
    }
  }

  const updateRow = (key: string, monthlyVisits: string) => {
    if (key === 'yourProfile') {
      setYourProfile((row) => row ? { ...row, monthlyVisits } : row)
      return
    }
    setCompetitors((rows) => rows.map((row) => row.key === key ? { ...row, monthlyVisits } : row))
  }

  return (
    <div style={{ marginBottom: 20, padding: 16, border: '1px solid #e5e7eb', borderRadius: 8, background: '#f9fafb' }}>
      <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>Manual competitor monthly visits</h3>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: '#4b5563' }}>
        Optional override. Proposal reports use these numbers before fetched traffic.
      </p>

      {!hasTrafficRows && <p style={{ color: '#9ca3af', fontSize: 13 }}>Add competitors on Audit Inputs or run proposal audits first.</p>}
      {loading && <p style={{ fontSize: 13 }}>Loading competitors...</p>}

      {!loading && hasTrafficRows && (
        <div style={{ display: 'grid', gap: 8, maxWidth: 760 }}>
          {[...(yourProfile ? [yourProfile] : []), ...competitors].map((row) => (
            <label key={row.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) 160px 160px', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <span><strong>{row.key === 'yourProfile' ? 'You' : row.domain}</strong>{row.key === 'yourProfile' ? ` · ${row.domain}` : ''}</span>
              <span style={{ color: '#6b7280' }}>Fetched: {formatFetched(row.fetchedMonthlyVisits)}</span>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="Manual visits"
                value={row.monthlyVisits}
                onChange={(event) => updateRow(row.key, event.target.value)}
                style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6 }}
              />
            </label>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={save}
        disabled={saving || loading || !hasTrafficRows}
        style={{ marginTop: 12, padding: '9px 14px', border: 'none', borderRadius: 6, background: saving || loading || !hasTrafficRows ? '#9ca3af' : '#111827', color: 'white', fontWeight: 600 }}
      >
        {saving ? 'Saving...' : 'Save manual monthly visits'}
      </button>

      {message && <p style={{ marginTop: 8, fontSize: 13, color: '#16a34a' }}>{message}</p>}
      {error && <p style={{ marginTop: 8, fontSize: 13, color: '#dc2626' }}>{error}</p>}
    </div>
  )
}

export default ManualCompetitorTrafficFields
