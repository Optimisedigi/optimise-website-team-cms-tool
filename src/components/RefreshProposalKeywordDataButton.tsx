'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useState } from 'react'

const RefreshProposalKeywordDataButton = () => {
  const { id } = useDocumentInfo()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!id) return null

  const refresh = async () => {
    setLoading(true)
    setMessage(null)
    setError(null)

    try {
      const response = await fetch(`/api/proposals/${id}/refresh-keyword-data`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.error || `Failed (${response.status})`)
        return
      }

      setMessage(data.requested === 0
        ? 'Keyword data is already current; no new category keywords were found.'
        : `Added metrics for ${data.added} of ${data.requested} new keyword${data.requested === 1 ? '' : 's'}. Snapshot total: ${data.totalKeywords}.`)
    } catch {
      setError('Network error — check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ marginBottom: 20, minHeight: 148, padding: 16, border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff' }}>
      <button
        type="button"
        onClick={refresh}
        disabled={loading}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '10px 20px',
          background: loading ? '#6b7280' : '#2563eb',
          color: '#fff',
          borderRadius: 8,
          border: 'none',
          fontWeight: 600,
          fontSize: 14,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Refreshing New Keywords…' : 'Refresh New Keyword Data'}
      </button>

      <p style={{ marginTop: 8, fontSize: 13, color: '#4b5563' }}>
        <strong>Partial refresh.</strong> Save the proposal first. Only category keywords missing from the linked snapshot are processed; other audit sections are untouched.
      </p>

      {message && <p style={{ marginTop: 8, fontSize: 13, color: '#16a34a' }}>{message}</p>}
      {error && <p style={{ marginTop: 8, fontSize: 13, color: '#dc2626' }}>{error}</p>}
    </div>
  )
}

export default RefreshProposalKeywordDataButton
