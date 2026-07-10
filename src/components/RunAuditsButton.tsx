'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState, useRef, useCallback, useEffect } from 'react'

const RunAuditsButton = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stage, setStage] = useState('')
  const [percent, setPercent] = useState(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAtRef = useRef<number | null>(null)

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
        const res = await fetch(`/api/proposals/${id}/audit-status`, {
          credentials: 'include',
        })
        if (!res.ok) return
        const data = await res.json()

        if (data.stage) setStage(data.stage)
        if (typeof data.percent === 'number') setPercent(data.percent)

        if (startedAtRef.current && Date.now() - startedAtRef.current > 20 * 60 * 1000) {
          stopPolling()
          setLoading(false)
          setError('Audit has been running for over 20 minutes. It is probably stuck — refresh, then safely re-run audits.')
          return
        }

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
          setStage(data.stage || 'Failed')
          setError(data.error || 'Audit failed. If SEO/PageSpeed failed, retry before using this proposal.')
        }
      } catch {
        // Network hiccup — keep polling
      }
    }, 3000)
  }, [id, stopPolling])

  useEffect(() => () => stopPolling(), [stopPolling])

  if (!id) return null

  const websiteUrl = fields?.websiteUrl?.value as string | undefined
  const businessType = fields?.businessType?.value as string | undefined
  const legacyKeywords = fields?.keywords?.value as string | undefined
  const auditStatus = fields?.auditStatus?.value as string | undefined

  // Check keyword categories (array field stored as dot-path keys)
  const hasKeywordCategories = fields
    ? Object.keys(fields).some(
        (key) =>
          /^keywordCategories\.\d+\.keywords$/.test(key) &&
          (fields[key]?.value as string | undefined)?.trim(),
      )
    : false
  const hasKeywords = hasKeywordCategories || !!legacyKeywords?.trim()

  // Only treat as "running" from local state (user clicked the button this session).
  // A stale 'running' auditStatus in the DB should never block re-runs.
  const isRunning = loading
  const isStuck = auditStatus === 'running' && !loading

  const missingFields: string[] = []
  if (!websiteUrl) missingFields.push('Website URL')
  if (!businessType) missingFields.push('Business Type')
  if (!hasKeywords) missingFields.push('Keywords')

  const handleClick = async () => {
    setLoading(true)
    setMessage(null)
    setError(null)
    setStage('Starting...')
    setPercent(0)
    startedAtRef.current = Date.now()

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
    <div style={{ marginBottom: 20, minHeight: 148, padding: 16, border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff' }}>
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
        {isRunning ? 'Running General Audit...' : 'Run General Audit'}
      </button>

      <p style={{ marginTop: 8, fontSize: 13, color: '#4b5563' }}>
        <strong>Full run.</strong> Starts a fresh general audit from the beginning: SEO/PageSpeed, CRO, keywords, competitors, content questions, screenshots, traffic, and best-effort Meta Ads.
      </p>

      {missingFields.length > 0 && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#9ca3af' }}>
          Fill in {missingFields.join(', ')} before running audits.
        </p>
      )}

      {isStuck && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#f59e0b' }}>
          Previous audit appears stuck. You can safely re-run audits.
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
