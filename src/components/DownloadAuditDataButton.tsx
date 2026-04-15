'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useState } from 'react'

const DownloadAuditDataButton = () => {
  const { id } = useDocumentInfo()
  const [loadingField, setLoadingField] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!id) return null

  const handleDownload = async (field: 'rawData' | 'scoredReport') => {
    setLoadingField(field)
    setError(null)

    try {
      const res = await fetch(
        `/api/google-ads-audits/${id}/download-data?field=${field}`,
        { credentials: 'include' },
      )

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `Failed (${res.status})` }))
        setError(data.error || `Failed (${res.status})`)
        setLoadingField(null)
        return
      }

      // Trigger browser download from the response blob
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-${id}-${field}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setLoadingField(null)
    } catch {
      setError('Network error — check your connection and try again.')
      setLoadingField(null)
    }
  }

  const buttonStyle = (field: string) => ({
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: 8,
    padding: '8px 16px',
    background: loadingField === field ? '#6b7280' : '#374151',
    color: '#fff',
    borderRadius: 8,
    border: 'none',
    fontWeight: 600,
    fontSize: 13,
    cursor: loadingField ? 'not-allowed' : 'pointer',
  })

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => handleDownload('rawData')}
          disabled={!!loadingField}
          style={buttonStyle('rawData')}
        >
          {loadingField === 'rawData' ? 'Downloading...' : '↓ Download Raw Data'}
        </button>
        <button
          type="button"
          onClick={() => handleDownload('scoredReport')}
          disabled={!!loadingField}
          style={buttonStyle('scoredReport')}
        >
          {loadingField === 'scoredReport' ? 'Downloading...' : '↓ Download Scored Report'}
        </button>
      </div>

      <p style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
        Download the full JSON data for this audit. Raw Data is the Google Ads API dump; Scored Report is the scored audit results.
      </p>

      {error && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#dc2626' }}>{error}</p>
      )}
    </div>
  )
}

export default DownloadAuditDataButton
