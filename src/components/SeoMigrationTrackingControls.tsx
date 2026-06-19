'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useState } from 'react'

const boxStyle = {
  border: '1px solid #dbe4ee',
  borderRadius: 12,
  padding: 14,
  margin: '12px 0 16px',
  background: '#f8fafc',
} as const

export default function SeoMigrationTrackingControls() {
  const { id, initialData } = useDocumentInfo()
  const data = (initialData ?? {}) as Record<string, unknown>
  const [loading, setLoading] = useState<'refresh' | 'send' | null>(null)
  const [message, setMessage] = useState<string>('')

  const reviewId = id || data.id
  const canRun = !!reviewId && data.status === 'completed'

  async function run(sendEmails: boolean) {
    if (!reviewId) return
    setLoading(sendEmails ? 'send' : 'refresh')
    setMessage('')
    try {
      const res = await fetch('/api/gsc/migration-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId, sendEmails }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Request failed')
      const result = Array.isArray(json.results) ? json.results[0] : null
      setMessage(sendEmails
        ? `Refreshed and attempted due milestone send${result?.dueMilestone ? ` (day ${result.dueMilestone})` : ''}. Reload to see latest fields.`
        : `Refreshed tracking data${result?.snapshots != null ? ` (${result.snapshots} daily points)` : ''}. Reload to see latest chart.`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to run migration tracking')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div style={boxStyle}>
      <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Migration 30-day review controls</div>
      <div style={{ color: '#64748b', fontSize: 12, marginBottom: 10 }}>
        Enable the toggle below, add recipient emails and notes, save the document, then refresh tracking. The send button sends only the highest due unsent milestone.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" disabled={!canRun || loading !== null} onClick={() => run(false)} style={buttonStyle}>
          {loading === 'refresh' ? 'Refreshing…' : 'Refresh tracking now'}
        </button>
        <button type="button" disabled={!canRun || loading !== null} onClick={() => run(true)} style={{ ...buttonStyle, background: '#2563eb', color: '#fff' }}>
          {loading === 'send' ? 'Sending…' : 'Refresh + send due email'}
        </button>
      </div>
      {!canRun && <div style={{ color: '#b45309', fontSize: 12, marginTop: 8 }}>Run/complete the migration review first, then these controls become available.</div>}
      {message && <div style={{ color: message.includes('Failed') || message.includes('failed') ? '#b91c1c' : '#166534', fontSize: 12, marginTop: 8 }}>{message}</div>}
    </div>
  )
}

const buttonStyle = {
  border: '1px solid #cbd5e1',
  background: '#fff',
  color: '#0f172a',
  borderRadius: 8,
  padding: '8px 12px',
  fontWeight: 700,
  cursor: 'pointer',
} as const
