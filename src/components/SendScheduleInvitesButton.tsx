'use client'

import { useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'

export default function SendScheduleInvitesButton() {
  const { id } = useDocumentInfo()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const handleSend = async () => {
    if (!id) return
    if (!confirm('Send scheduling invites to all attendees?')) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`/api/meeting-schedulers/${id}/send-invites`, {
        method: 'POST',
      })
      const data = await res.json()
      if (res.ok) {
        setResult(`Sent to ${data.sentCount} attendee(s)`)
        setTimeout(() => window.location.reload(), 1500)
      } else {
        setResult(data.error || 'Failed to send invites')
      }
    } catch {
      setResult('Network error')
    } finally {
      setLoading(false)
    }
  }

  if (!id) return null

  return (
    <div style={{ marginTop: 12, marginBottom: 12 }}>
      <button
        onClick={handleSend}
        disabled={loading}
        type="button"
        style={{
          padding: '8px 16px',
          background: '#059669',
          color: '#ffffff',
          border: 'none',
          borderRadius: 4,
          cursor: loading ? 'wait' : 'pointer',
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        {loading ? 'Sending...' : 'Send Scheduling Invites'}
      </button>
      {result && (
        <span style={{ marginLeft: 12, fontSize: 13, color: 'var(--theme-elevation-500)' }}>
          {result}
        </span>
      )}
    </div>
  )
}
