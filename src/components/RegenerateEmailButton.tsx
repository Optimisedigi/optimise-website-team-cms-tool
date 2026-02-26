'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState } from 'react'

const RegenerateEmailButton = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!id) return null

  const scoredReport = fields?.scoredReport?.value
  const hasReport = !!scoredReport

  const handleClick = async () => {
    setLoading(true)
    setMessage(null)
    setError(null)

    try {
      const res = await fetch(`/api/google-ads-audits/${id}/regenerate-email`, {
        method: 'POST',
        credentials: 'include',
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || `Failed (${res.status})`)
        setLoading(false)
        return
      }

      setMessage('Email regenerated. Check the Audit Results tab for preview.')
      setLoading(false)
    } catch {
      setError('Network error — check your connection and try again.')
      setLoading(false)
    }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading || !hasReport}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 20px',
          background: loading ? '#6b7280' : !hasReport ? '#9ca3af' : '#2563eb',
          color: '#fff',
          borderRadius: 8,
          border: 'none',
          fontWeight: 600,
          fontSize: 14,
          cursor: loading || !hasReport ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Regenerating...' : 'Regenerate Email'}
      </button>

      {!hasReport && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#9ca3af' }}>
          Run an audit first before regenerating the email.
        </p>
      )}

      <p style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
        Save your curation changes first, then click to regenerate the email with your selections.
      </p>

      {message && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#16a34a' }}>{message}</p>
      )}

      {error && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#dc2626' }}>{error}</p>
      )}
    </div>
  )
}

export default RegenerateEmailButton
