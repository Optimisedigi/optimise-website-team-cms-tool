'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState } from 'react'

/**
 * Re-runs only the content-research/customer-questions section used by the
 * Organic Propulsion slide. It does not regenerate SEO/CRO/competitor/traffic
 * data or the whole proposal audit.
 */
const RefreshContentQuestionsButton = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!id) return null

  const legacyKeywords = fields?.keywords?.value as string | undefined
  const hasKeywordCategories = fields
    ? Object.keys(fields).some(
        (key) =>
          /^keywordCategories\.\d+\.keywords$/.test(key) &&
          (fields[key]?.value as string | undefined)?.trim(),
      )
    : false
  const hasKeywords = hasKeywordCategories || !!legacyKeywords?.trim()

  const handleClick = async () => {
    setLoading(true)
    setMessage(null)
    setError(null)

    try {
      const res = await fetch(`/api/proposals/${id}/refresh-content-questions`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || `Failed (${res.status})`)
        return
      }

      const failedText = data.failed ? ` (${data.failed} keyword${data.failed === 1 ? '' : 's'} failed)` : ''
      setMessage(
        `Content questions refreshed: ${data.questions ?? 0} questions across ${data.refreshed ?? 0} keyword${data.refreshed === 1 ? '' : 's'}${failedText}. Refresh the report page to see page 18 update.`,
      )
    } catch {
      setError('Network error — check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading || !hasKeywords}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 20px',
          background: loading ? '#6b7280' : !hasKeywords ? '#9ca3af' : '#0891b2',
          color: '#fff',
          borderRadius: 8,
          border: 'none',
          fontWeight: 600,
          fontSize: 14,
          cursor: loading || !hasKeywords ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Refreshing Content Questions…' : 'Refresh Content Questions'}
      </button>

      <p style={{ marginTop: 8, fontSize: 13, color: '#9ca3af' }}>
        Re-runs only the page 18 customer questions/content research section. Existing questions are kept if the refresh fails.
      </p>

      {!hasKeywords && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#f59e0b' }}>
          Add keyword categories or legacy keywords before refreshing questions.
        </p>
      )}

      {message && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#16a34a' }}>{message}</p>
      )}

      {error && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#dc2626' }}>{error}</p>
      )}
    </div>
  )
}

export default RefreshContentQuestionsButton
