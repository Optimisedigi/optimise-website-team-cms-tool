'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState, useRef, useCallback, useEffect } from 'react'

/**
 * Re-runs ONLY the Meta Ad Library fetch for a proposal's competitors and
 * merges the results back into the linked competitor-analyses record.
 *
 * Meta Ads is the slowest/flakiest audit stage, so the main pipeline no longer
 * blocks on it — if it fails the proposal still completes and this button lets
 * you backfill just that section afterwards.
 */
const RefreshMetaAdsButton = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
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

        if (startedAtRef.current && Date.now() - startedAtRef.current > 10 * 60 * 1000) {
          stopPolling()
          setLoading(false)
          setError('Meta Ads refresh has run for over 10 minutes — it is probably stuck. Refresh the page and try again.')
          return
        }

        if (data.metaAdsStatus === 'completed') {
          stopPolling()
          setLoading(false)
          setMessage('Meta Ads refreshed. Refresh the page to see the updated competitor data.')
        } else if (data.metaAdsStatus === 'failed') {
          stopPolling()
          setLoading(false)
          setError(data.metaAdsError || 'Meta Ads refresh failed. You can try again.')
        }
      } catch {
        // Network hiccup — keep polling
      }
    }, 3000)
  }, [id, stopPolling])

  useEffect(() => () => stopPolling(), [stopPolling])

  if (!id) return null

  const metaAdsStatus = fields?.metaAdsStatus?.value as string | undefined
  const isRunning = loading
  const previousFailed = metaAdsStatus === 'failed' && !loading

  const handleClick = async () => {
    setLoading(true)
    setMessage(null)
    setError(null)
    startedAtRef.current = Date.now()

    try {
      const res = await fetch(`/api/proposals/${id}/refresh-meta-ads`, {
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
        disabled={isRunning}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 20px',
          background: isRunning ? '#6b7280' : '#7c3aed',
          color: '#fff',
          borderRadius: 8,
          border: 'none',
          fontWeight: 600,
          fontSize: 14,
          cursor: isRunning ? 'not-allowed' : 'pointer',
        }}
      >
        {isRunning ? 'Refreshing Meta Ads…' : 'Refresh Meta Ads'}
      </button>

      <p style={{ marginTop: 8, fontSize: 13, color: '#9ca3af' }}>
        Re-runs only the Meta Ad Library lookup for this proposal&apos;s competitors.
      </p>

      {previousFailed && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#f59e0b' }}>
          Meta Ads did not complete on the last audit. Click to fetch just that section.
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

export default RefreshMetaAdsButton
