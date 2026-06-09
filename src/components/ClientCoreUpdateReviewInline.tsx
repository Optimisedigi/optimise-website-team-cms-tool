'use client'

import { useAllFormFields, useDocumentInfo } from '@payloadcms/ui'
import { useState } from 'react'

type ManualRunSummary = {
  message?: string
  updateName?: string
  status?: string
  riskScore?: number
  emailSent?: boolean
}

const readString = (value: unknown): string => (typeof value === 'string' ? value : '')

const readBoolean = (value: unknown): boolean => value === true

const readArrayLength = (value: unknown): number => (Array.isArray(value) ? value.length : 0)

const formatDateTime = (value: unknown): string => {
  const raw = readString(value)
  if (!raw) return 'Not recorded yet'
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  return date.toLocaleString()
}

const ClientCoreUpdateReviewInline = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<ManualRunSummary | null>(null)

  const websiteUrl = readString(fields?.websiteUrl?.value)
  const gscPropertyUrl = readString(fields?.gscPropertyUrl?.value)
  const gscConnected = readBoolean(fields?.gscConnected?.value)
  const enabled = readBoolean(fields?.coreUpdateReviewEnabled?.value)
  const maxPages = Number(fields?.coreUpdateReviewMaxPages?.value || 50)
  const recipientCount = readArrayLength(fields?.coreUpdateReviewRecipientEmails?.value)
  const lastCheckedAt = fields?.coreUpdateReviewLastCheckedAt?.value
  const lastEmailSentAt = fields?.coreUpdateReviewLastEmailSentAt?.value
  const lastUpdateName = readString(fields?.coreUpdateReviewLastUpdateName?.value)

  const canRun = Boolean(id && websiteUrl.trim())

  const runReview = async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    setSummary(null)

    try {
      const response = await fetch(`/api/clients/${id}/core-update-review/run`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.error || `Core Update Review failed (${response.status})`)
      }

      setSummary(data?.summary || { message: data?.message || 'Core Update Review completed.' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        border: '1px solid #d1d5db',
        borderRadius: 12,
        padding: 20,
        marginBottom: 20,
        background: '#fff',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: '0 0 6px', fontSize: 18 }}>Core Update Review</h3>
          <p style={{ margin: 0, color: '#4b5563', fontSize: 13 }}>
            Event-led reviews that apply official Google Ranking updates to this client’s existing site and GSC context.
          </p>
        </div>
        <span
          style={{
            alignSelf: 'flex-start',
            borderRadius: 999,
            padding: '4px 10px',
            fontSize: 12,
            fontWeight: 700,
            background: enabled ? '#dcfce7' : '#f3f4f6',
            color: enabled ? '#166534' : '#4b5563',
          }}
        >
          {enabled ? 'Scheduled reviews enabled' : 'Scheduled reviews disabled'}
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
          marginTop: 16,
        }}
      >
        <Info label="Source site" value={websiteUrl || 'Add Website URL on the Business tab'} />
        <Info label="GSC property" value={gscPropertyUrl || 'No GSC property connected'} />
        <Info label="GSC status" value={gscConnected ? 'Connected' : 'Not connected'} />
        <Info label="Crawl depth" value={`${Number.isFinite(maxPages) ? maxPages : 50} pages max`} />
        <Info label="Scheduled recipients" value={recipientCount ? `${recipientCount} configured` : 'None — scheduled email skipped'} />
        <Info label="Last checked" value={formatDateTime(lastCheckedAt)} />
        <Info label="Last email sent" value={formatDateTime(lastEmailSentAt)} />
        <Info label="Last update reviewed" value={lastUpdateName || 'Not recorded yet'} />
      </div>

      <button
        type="button"
        onClick={runReview}
        disabled={loading || !canRun}
        style={{
          marginTop: 18,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 18px',
          borderRadius: 8,
          border: 'none',
          color: '#fff',
          background: loading || !canRun ? '#9ca3af' : '#2563eb',
          cursor: loading || !canRun ? 'not-allowed' : 'pointer',
          fontWeight: 700,
          fontSize: 14,
        }}
      >
        {loading ? 'Running Core Update Review…' : 'Run Core Update Review Now'}
      </button>

      {!websiteUrl && (
        <p style={{ margin: '8px 0 0', color: '#b45309', fontSize: 13 }}>
          Add the inherited Website URL on the Business tab before running a review.
        </p>
      )}
      {summary && (
        <p style={{ margin: '10px 0 0', color: '#166534', fontSize: 13 }}>
          {summary.message || 'Core Update Review completed.'}
          {summary.updateName ? ` Update: ${summary.updateName}.` : ''}
          {typeof summary.riskScore === 'number' ? ` Risk score: ${summary.riskScore}.` : ''}
        </p>
      )}
      {error && <p style={{ margin: '10px 0 0', color: '#dc2626', fontSize: 13 }}>{error}</p>}
    </div>
  )
}

const Info = ({ label, value }: { label: string; value: string }) => (
  <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: '#f9fafb' }}>
    <div style={{ color: '#6b7280', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>
      {label}
    </div>
    <div style={{ color: '#111827', fontSize: 14, marginTop: 4, wordBreak: 'break-word' }}>{value}</div>
  </div>
)

export default ClientCoreUpdateReviewInline
