'use client'

import { useAllFormFields, useDocumentInfo } from '@payloadcms/ui'
import { useState } from 'react'

const dateLabel = (value: unknown) => typeof value === 'string' && value ? value.slice(0, 10) : null

const RunGoogleAdsAuditButton = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!id) return null

  const customerId = String(fields?.customerId?.value ?? '').trim()
  const hasSnapshot = Boolean(fields?.snapshot?.value)
  const state = String(fields?.snapshotState?.value || (hasSnapshot ? fields?.auditStatus?.value : '') || '')
  const periodStart = dateLabel(fields?.snapshotPeriodStart?.value)
  const periodEnd = dateLabel(fields?.snapshotPeriodEnd?.value)
  const active = loading || state === 'pending' || state === 'running'
  const completed = state === 'completed'
  const label = loading ? 'Starting snapshot…' : state === 'failed' ? 'Retry frozen snapshot' : completed ? 'Create newer snapshot' : 'Capture Google Ads snapshot'

  const handleClick = async () => {
    const confirmNew = completed
    if (confirmNew && !window.confirm('Create a new point-in-time snapshot? This changes the evidence baseline and keeps the completed snapshot unchanged.')) return
    setLoading(true)
    setMessage(null)
    setError(null)
    try {
      const response = await fetch(`/api/google-ads-audits/${id}/snapshot`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmNew }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || `Failed (${response.status})`)
      setMessage(`Snapshot ${data.status}. Frozen window: ${String(data.periodStart).slice(0, 10)} to ${String(data.periodEnd).slice(0, 10)}.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Snapshot request failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section style={{ marginBottom: 20 }} aria-labelledby="snapshot-control-title">
      <h3 id="snapshot-control-title" style={{ margin: '0 0 8px', fontSize: 15 }}>Immutable audit snapshot</h3>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--theme-elevation-600)' }}>
        {periodStart && periodEnd ? `Frozen window: ${periodStart} to ${periodEnd}.` : 'The first capture ends on the final day of the previous month in the Google Ads account timezone.'} State: {state || 'not created'}.
      </p>
      <button type="button" className="btn btn--style-primary" onClick={handleClick} disabled={active || !customerId} style={{ minHeight: 44 }}>
        {label}
      </button>
      {!customerId && <p style={{ marginTop: 8, fontSize: 13 }}>Enter a Customer ID before capturing.</p>}
      {active && !loading && <p role="status" style={{ marginTop: 8, fontSize: 13 }}>Capture is active. Duplicate dispatch is blocked.</p>}
      <div aria-live="polite">
        {message && <p style={{ marginTop: 8, fontSize: 13, color: 'var(--theme-success-600)' }}>{message}</p>}
        {error && <p role="alert" style={{ marginTop: 8, fontSize: 13, color: 'var(--theme-error-600)' }}>{error}</p>}
      </div>
    </section>
  )
}

export default RunGoogleAdsAuditButton
