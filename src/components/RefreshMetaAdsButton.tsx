'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState, useRef, useCallback, useEffect } from 'react'

/**
 * Starts / retries ONLY the Meta Ad Library fetch for a proposal's competitors.
 *
 * The refresh now runs as a durable, resumable server job that processes two
 * competitors per invocation and persists progress. This button shows real
 * completed/total progress, keeps polling across page reloads while a job is
 * running, and offers a Retry action on terminal failure. The backend lease /
 * recovery / terminal state is authoritative — there is no client-side stuck
 * timer.
 */

type MetaProgress = {
  completed: number
  failed: number
  processed: number
  total: number
  percent: number
}

const EMPTY_PROGRESS: MetaProgress = { completed: 0, failed: 0, processed: 0, total: 0, percent: 0 }

function readProgress(job: unknown): MetaProgress {
  if (!job || typeof job !== 'object') return EMPTY_PROGRESS
  const j = job as Record<string, unknown>
  const total = typeof j.total === 'number' ? j.total : 0
  const completed = typeof j.completed === 'number' ? j.completed : 0
  const failed = typeof j.failed === 'number' ? j.failed : 0
  const processed =
    typeof j.processed === 'number' ? j.processed : completed + failed
  const percent =
    typeof j.percent === 'number'
      ? j.percent
      : total > 0
        ? Math.round((processed / total) * 100)
        : 0
  return { completed, failed, processed, total, percent }
}

const RefreshMetaAdsButton = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()

  const savedStatus = fields?.metaAdsStatus?.value as string | undefined
  const savedJobState = fields?.metaAdsJobState?.value

  const [status, setStatus] = useState<string>(savedStatus || 'idle')
  const [progress, setProgress] = useState<MetaProgress>(() => readProgress(savedJobState))
  const [loading, setLoading] = useState<boolean>(savedStatus === 'running')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
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
        const res = await fetch(`/api/proposals/${id}/audit-status`, {
          credentials: 'include',
        })
        if (!res.ok) return
        const data = await res.json()

        if (data.metaAds) setProgress(readProgress(data.metaAds))
        setStatus(data.metaAdsStatus || 'idle')

        if (data.metaAdsStatus === 'completed') {
          stopPolling()
          setLoading(false)
          setMessage('Meta Ads refreshed. Refresh the document to see the updated competitor data.')
        } else if (data.metaAdsStatus === 'failed') {
          stopPolling()
          setLoading(false)
          setError(data.metaAdsError || 'Meta Ads refresh failed. You can retry.')
        }
      } catch {
        // Network hiccup — keep polling; backend recovery is authoritative.
      }
    }, 3000)
  }, [id, stopPolling])

  // Resume polling automatically if the saved job is still running after a
  // reload, so progress visibility is never lost.
  useEffect(() => {
    if (savedStatus === 'running') {
      setLoading(true)
      startPolling()
    }
    return () => stopPolling()
    // Only re-run when the document id changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (!id) return null

  const isRunning = loading || status === 'running'
  const previousFailed = status === 'failed' && !loading

  const handleClick = async () => {
    setLoading(true)
    setMessage(null)
    setError(null)
    setStatus('running')

    try {
      const res = await fetch(`/api/proposals/${id}/refresh-meta-ads`, {
        method: 'POST',
        credentials: 'include',
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || `Failed (${res.status})`)
        setLoading(false)
        setStatus(savedStatus || 'idle')
        return
      }

      if (data && (typeof data.total === 'number' || typeof data.processed === 'number')) {
        setProgress(readProgress(data))
      }
      if (data.status === 'completed') {
        setLoading(false)
        setStatus('completed')
        setMessage('Meta Ads refreshed. Refresh the document to see the updated competitor data.')
        return
      }

      startPolling()
    } catch {
      setError('Network error — check your connection and try again.')
      setLoading(false)
      setStatus(savedStatus || 'idle')
    }
  }

  const showProgress = isRunning || (progress.total > 0 && (status === 'completed' || status === 'failed'))
  const progressLabel = `${progress.processed} of ${progress.total || '…'} processed${
    progress.failed > 0 ? ` · ${progress.failed} failed` : ''
  }`
  const buttonLabel = isRunning
    ? 'Refreshing Meta Ads…'
    : previousFailed
      ? 'Retry Meta Ads'
      : 'Refresh Meta Ads'

  return (
    <div style={{ marginBottom: 20, minHeight: 168, padding: 16, border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff' }}>
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
        {buttonLabel}
      </button>

      <p style={{ marginTop: 8, fontSize: 13, color: '#4b5563' }}>
        <strong>Partial refresh.</strong> Re-runs only the Meta Ad Library lookup for this proposal&apos;s competitors, two at a time. Everything else is preserved and progress survives reloads.
      </p>

      {showProgress && (
        <div role="status" aria-live="polite" style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>{progressLabel}</div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
            aria-label="Meta Ads refresh progress"
            style={{
              marginTop: 6,
              height: 8,
              width: '100%',
              maxWidth: 320,
              background: '#e5e7eb',
              borderRadius: 999,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, Math.max(0, progress.percent))}%`,
                background: status === 'failed' ? '#dc2626' : '#7c3aed',
                transition: 'width 300ms ease',
              }}
            />
          </div>
        </div>
      )}

      {previousFailed && !error && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#f59e0b' }}>
          {progress.total > 0
            ? `Meta Ads finished with ${progress.completed} completed and ${progress.failed} failed. Click Retry to run it again.`
            : 'Meta Ads did not complete. Click Retry to run it again.'}
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
