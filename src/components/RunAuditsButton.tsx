'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState } from 'react'

const RunAuditsButton = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!id) return null

  const websiteUrl = fields?.websiteUrl?.value as string | undefined
  const businessType = fields?.businessType?.value as string | undefined
  const keywords = fields?.keywords?.value as string | undefined
  const auditStatus = fields?.auditStatus?.value as string | undefined

  const isRunning = auditStatus === 'running' || loading

  const missingFields: string[] = []
  if (!websiteUrl) missingFields.push('Website URL')
  if (!businessType) missingFields.push('Business Type')
  if (!keywords?.trim()) missingFields.push('Keywords')

  const handleClick = async () => {
    setLoading(true)
    setMessage(null)
    setError(null)

    try {
      const res = await fetch(`/api/proposals/${id}/run-audits`, {
        method: 'POST',
        credentials: 'include',
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || `Failed (${res.status})`)
        return
      }

      setMessage('Audits completed. Refresh the page to see linked results.')
    } catch (err) {
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
        disabled={isRunning || missingFields.length > 0}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 20px',
          background: isRunning ? '#6b7280' : missingFields.length > 0 ? '#9ca3af' : '#2563eb',
          color: '#fff',
          borderRadius: 8,
          border: 'none',
          fontWeight: 600,
          fontSize: 14,
          cursor: isRunning || missingFields.length > 0 ? 'not-allowed' : 'pointer',
        }}
      >
        {isRunning ? 'Running Audits...' : 'Run Audits'}
      </button>

      {missingFields.length > 0 && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#9ca3af' }}>
          Fill in {missingFields.join(', ')} before running audits.
        </p>
      )}

      {message && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#16a34a' }}>{message}</p>
      )}

      {error && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#dc2626' }}>{error}</p>
      )}

      {isRunning && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#6b7280' }}>
          This typically takes 2-3 minutes. Please wait...
        </p>
      )}
    </div>
  )
}

export default RunAuditsButton
