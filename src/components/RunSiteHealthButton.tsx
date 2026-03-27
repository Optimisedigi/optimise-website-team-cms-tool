'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState, useRef, useCallback, useEffect } from 'react'

const RunSiteHealthButton = () => {
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

  const startPolling = useCallback(() => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/site-health-reports/${id}/audit-status`, {
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
          setMessage('Health audit completed. Refresh the page to see results.')
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
    }, 5000)
  }, [id, stopPolling])

  useEffect(() => () => stopPolling(), [stopPolling])

  if (!id) return null

  const siteUrl = fields?.siteUrl?.value as string | undefined
  const hasSiteUrl = !!siteUrl?.trim()
  const auditStatus = fields?.auditStatus?.value as string | undefined
  const isRunning = auditStatus === 'running' || loading

  const handleClick = async () => {
    if (!hasSiteUrl) return
    setLoading(true)
    setError(null)
    setMessage(null)
    setStage('Starting...')
    setPercent(0)

    try {
      const res = await fetch(`/api/site-health-reports/${id}/run`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || `Request failed (${res.status})`)
      }

      startPolling()
    } catch (err: any) {
      setLoading(false)
      setError(err.message || 'Something went wrong')
    }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={handleClick}
          disabled={isRunning || !hasSiteUrl}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            background: isRunning ? '#6b7280' : !hasSiteUrl ? '#9ca3af' : '#059669',
            color: '#fff',
            borderRadius: 8,
            border: 'none',
            fontWeight: 600,
            fontSize: 14,
            cursor: isRunning || !hasSiteUrl ? 'not-allowed' : 'pointer',
          }}
        >
          {isRunning ? 'Running Health Audit...' : 'Run Health Audit'}
        </button>
      </div>

      {!hasSiteUrl && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#9ca3af' }}>
          Enter a Site URL first.
        </p>
      )}

      {isRunning && (
        <div style={{ marginTop: 12 }}>
          <div style={{
            height: 6,
            background: '#e5e7eb',
            borderRadius: 3,
            overflow: 'hidden',
            maxWidth: 400,
          }}>
            <div style={{
              height: '100%',
              width: `${percent}%`,
              background: '#059669',
              borderRadius: 3,
              transition: 'width 0.5s ease',
            }} />
          </div>
          {stage && (
            <p style={{ marginTop: 6, fontSize: 13, color: '#6b7280' }}>
              {stage} ({percent}%)
            </p>
          )}
        </div>
      )}

      {error && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#dc2626' }}>{error}</p>
      )}

      {message && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#059669', fontWeight: 500 }}>{message}</p>
      )}
    </div>
  )
}

export default RunSiteHealthButton
