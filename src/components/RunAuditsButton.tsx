'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState, useEffect, useRef, useCallback } from 'react'

const RunAuditsButton = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stage, setStage] = useState('')
  const [percent, setPercent] = useState(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  // Clean up on unmount
  useEffect(() => () => stopPolling(), [stopPolling])

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

  const startPolling = () => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/proposals/${id}/audit-status`, {
          credentials: 'include',
        })
        if (!res.ok) return
        const data = await res.json()

        if (data.stage) setStage(data.stage)
        if (typeof data.percent === 'number') setPercent(data.percent)

        if (data.status === 'completed') {
          stopPolling()
          setLoading(false)
          setPercent(100)
          setStage('Complete')
          setMessage('Audits completed. Refresh the page to see linked results.')
        } else if (data.status === 'failed') {
          stopPolling()
          setLoading(false)
          setPercent(100)
          setStage('Failed')
          setError(data.error || 'Audit failed')
        }
      } catch {
        // Network hiccup — keep polling
      }
    }, 3000)
  }

  const handleClick = async () => {
    setLoading(true)
    setMessage(null)
    setError(null)
    setStage('Starting...')
    setPercent(0)

    try {
      const res = await fetch(`/api/proposals/${id}/run-audits`, {
        method: 'POST',
        credentials: 'include',
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || `Failed (${res.status})`)
        setLoading(false)
        return
      }

      // POST returned immediately — start polling for progress
      startPolling()
    } catch (err) {
      setError('Network error — check your connection and try again.')
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

      {isRunning && (
        <div style={{ marginTop: 12 }}>
          {/* Progress bar */}
          <div
            style={{
              width: '100%',
              maxWidth: 400,
              height: 8,
              background: '#e5e7eb',
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${percent}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #2563eb, #3b82f6)',
                borderRadius: 4,
                transition: 'width 0.5s ease',
              }}
            />
          </div>
          <p style={{ marginTop: 6, fontSize: 13, color: '#6b7280' }}>
            {stage || 'Starting...'} {percent > 0 && `— ${percent}%`}
          </p>
        </div>
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

export default RunAuditsButton
