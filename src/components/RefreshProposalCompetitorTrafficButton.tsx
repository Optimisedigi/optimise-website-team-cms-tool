'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useCallback, useEffect, useRef, useState } from 'react'

const RefreshProposalCompetitorTrafficButton = () => {
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
          setError('Monthly visits refresh has been running for over 20 minutes. Refresh, then retry.')
          return
        }

        if (data.status === 'completed') {
          stopPolling()
          setLoading(false)
          setPercent(100)
          setStage('Complete')
          setMessage('Monthly visits refreshed. Refresh the page, then view the proposal report.')
        } else if (data.status === 'failed') {
          stopPolling()
          setLoading(false)
          setPercent(100)
          setStage(data.stage || 'Failed')
          setError(data.error || 'Monthly visits refresh failed.')
        }
      } catch {
        // Keep polling through temporary network hiccups.
      }
    }, 3000)
  }, [id, stopPolling])

  useEffect(() => () => stopPolling(), [stopPolling])

  if (!id) return null

  const competitorAnalysis = fields?.competitorAnalysis?.value
  const hasCompetitorAnalysis = Boolean(
    competitorAnalysis &&
      (typeof competitorAnalysis === 'number' || typeof competitorAnalysis === 'string' || (typeof competitorAnalysis === 'object' && 'id' in competitorAnalysis)),
  )

  const handleClick = async () => {
    setLoading(true)
    setMessage(null)
    setError(null)
    setStage('Starting...')
    setPercent(0)
    startedAtRef.current = Date.now()

    try {
      const res = await fetch(`/api/proposals/${id}/refresh-competitor-traffic`, {
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
    <div style={{ marginBottom: 20 }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading || !hasCompetitorAnalysis}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 20px',
          background: loading ? '#6b7280' : !hasCompetitorAnalysis ? '#9ca3af' : '#0ea5e9',
          color: '#fff',
          borderRadius: 8,
          border: 'none',
          fontWeight: 600,
          fontSize: 14,
          cursor: loading || !hasCompetitorAnalysis ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Fetching monthly visits...' : 'Fetch competitor monthly visits'}
      </button>

      <p style={{ marginTop: 8, fontSize: 13, color: '#6b7280' }}>
        Updates monthly visits for the linked competitor analysis used by this proposal report. SEO, CRO, keywords, and content results are preserved.
      </p>

      {!hasCompetitorAnalysis && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#9ca3af' }}>
          Run the proposal audits first so this proposal has a linked competitor analysis.
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
                background: 'linear-gradient(90deg, #0ea5e9, #38bdf8)',
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

export default RefreshProposalCompetitorTrafficButton
