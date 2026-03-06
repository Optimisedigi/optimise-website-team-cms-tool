'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState } from 'react'

interface SweepCandidate {
  searchTerm: string
  campaign: string
  adGroup: string
  spend: number
  clicks: number
  conversions: number
}

interface SweepResult {
  candidates: SweepCandidate[]
  totalWaste: number
  applied?: number
  mode: string
}

const RunNegativeSweepButton = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SweepResult | null>(null)

  if (!id) return null

  const negativeSweepEnabled = fields?.['gadsAuto.negativeSweepEnabled']?.value as boolean | undefined
  if (!negativeSweepEnabled) return null

  const googleAdsCustomerId = fields?.googleAdsCustomerId?.value as string | undefined
  const hasCid = !!googleAdsCustomerId?.trim()

  const handleClick = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch(`/api/clients/${id}/negative-sweep`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || `Request failed (${res.status})`)
      }

      const data = await res.json()
      setResult(data)
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const candidates = result?.candidates ?? []

  return (
    <div style={{ marginBottom: 20 }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading || !hasCid}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 20px',
          background: loading ? '#6b7280' : !hasCid ? '#9ca3af' : '#7c3aed',
          color: '#fff',
          borderRadius: 8,
          border: 'none',
          fontWeight: 600,
          fontSize: 14,
          cursor: loading || !hasCid ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Running Negative Sweep...' : 'Run Negative Sweep'}
      </button>

      {!hasCid && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#9ca3af' }}>
          Enter a Google Ads Customer ID first (Business tab).
        </p>
      )}

      {error && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#dc2626' }}>{error}</p>
      )}

      {result && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            {candidates.length} candidate{candidates.length !== 1 ? 's' : ''} found
            {result.totalWaste != null && `, $${result.totalWaste.toFixed(2)} waste identified`}
          </p>

          {result.mode === 'auto_apply' && result.applied != null && (
            <p style={{ fontSize: 13, color: '#16a34a', marginBottom: 8 }}>
              {result.applied} negative{result.applied !== 1 ? 's' : ''} applied automatically.
            </p>
          )}

          {candidates.length > 0 && (
            <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', position: 'sticky', top: 0 }}>
                    <th style={thStyle}>Search Term</th>
                    <th style={thStyle}>Campaign</th>
                    <th style={thStyle}>Ad Group</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Spend</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Clicks</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Conv.</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #f3f4f6' }}>
                      <td style={tdStyle}>{c.searchTerm}</td>
                      <td style={tdStyle}>{c.campaign}</td>
                      <td style={tdStyle}>{c.adGroup}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>${c.spend?.toFixed(2)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{c.clicks}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{c.conversions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '8px 12px',
  textAlign: 'left',
  fontWeight: 600,
  borderBottom: '1px solid #e5e7eb',
}

const tdStyle: React.CSSProperties = {
  padding: '6px 12px',
}

export default RunNegativeSweepButton
