'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState, useRef, useCallback, useEffect } from 'react'

const BackfillProposalReportDataButton = () => {
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
        const res = await fetch(`/api/proposals/${id}/audit-status`, { credentials: 'include' })
        if (!res.ok) return
        const data = await res.json()

        if (data.stage) setStage(data.stage)
        if (typeof data.percent === 'number') setPercent(data.percent)

        if (startedAtRef.current && Date.now() - startedAtRef.current > 20 * 60 * 1000) {
          stopPolling()
          setLoading(false)
          setError('Backfill has been running for over 20 minutes. Refresh, then retry SEO/PageSpeed + Traffic.')
          return
        }

        if (data.status === 'completed') {
          stopPolling()
          setLoading(false)
          setPercent(100)
          setStage('Complete')
          setMessage('Backfill completed. Refresh the page to see the new SEO audit and traffic data.')
        } else if (data.status === 'failed') {
          stopPolling()
          setLoading(false)
          setPercent(100)
          setStage(data.stage || 'Failed')
          setError(data.error || 'Backfill failed. Retry SEO/PageSpeed + Traffic before using this proposal.')
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

  const missingFields: string[] = []
  if (!websiteUrl) missingFields.push('Website URL')
  if (!businessType) missingFields.push('Business Type')

  const handleClick = async () => {
    setLoading(true)
    setMessage(null)
    setError(null)
    setStage('Starting...')
    setPercent(0)
    startedAtRef.current = Date.now()

    try {
      const res = await fetch(`/api/proposals/${id}/backfill-report-data`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || `Failed (${res.status})`)
        setLoading(false)
        return
      }

      startPolling()
    } catch {
      setError('Network error — check your connection and try again.')
      setLoading(false)
    }
  }

  return (
    <div style={{ marginBottom: 20, minHeight: 148, padding: 16, border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff' }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading || missingFields.length > 0}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 20px',
          background: loading ? '#6b7280' : missingFields.length > 0 ? '#9ca3af' : '#7c3aed',
          color: '#fff',
          borderRadius: 8,
          border: 'none',
          fontWeight: 600,
          fontSize: 14,
          cursor: loading || missingFields.length > 0 ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Retrying SEO/PageSpeed + Traffic...' : 'Retry SEO/PageSpeed + Traffic'}
      </button>

      <p style={{ marginTop: 8, fontSize: 13, color: '#4b5563' }}>
        <strong>Partial rerun.</strong> Only reruns SEO/PageSpeed and missing competitor traffic. CRO, keyword, competitor, Meta Ads, and content question results are preserved.
      </p>

      {missingFields.length > 0 && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#9ca3af' }}>
          Fill in {missingFields.join(', ')} before retrying report data.
        </p>
      )}

      {loading && (
        <div style={{ marginTop: 12 }}>
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
                background: 'linear-gradient(90deg, #7c3aed, #a78bfa)',
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

      {message && <p style={{ marginTop: 8, fontSize: 13, color: '#16a34a' }}>{message}</p>}
      {error && <p style={{ marginTop: 8, fontSize: 13, color: '#dc2626' }}>{error}</p>}
    </div>
  )
}

export default BackfillProposalReportDataButton
