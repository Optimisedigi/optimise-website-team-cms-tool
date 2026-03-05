'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState } from 'react'

const SendContractEmailButton = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const status = fields?.['status']?.value as string
  const clientEmail = fields?.['clientEmail']?.value as string

  if (!id) return null
  if (status !== 'sent') return null
  if (!clientEmail) return null

  const handleSend = async () => {
    setLoading(true)
    setError(null)
    setMessage(null)
    setConfirming(false)
    try {
      const res = await fetch(`/api/contracts/${id}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send email')
      setMessage(`Email sent to ${data.sentTo}`)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            fontSize: 14,
            fontWeight: 600,
            border: 'none',
            borderRadius: 6,
            background: '#2563eb',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          Send Email to Client
        </button>
      ) : (
        <div style={{
          padding: '12px 16px',
          background: '#fef3c7',
          border: '1px solid #f59e0b',
          borderRadius: 6,
        }}>
          <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: '#92400e' }}>
            Send signing link to {clientEmail}?
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={handleSend}
              disabled={loading}
              style={{
                padding: '8px 20px',
                fontSize: 13,
                fontWeight: 600,
                border: 'none',
                borderRadius: 4,
                background: loading ? '#6b7280' : '#059669',
                color: '#fff',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Sending...' : 'Confirm Send'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={loading}
              style={{
                padding: '8px 20px',
                fontSize: 13,
                fontWeight: 600,
                border: '1px solid #d1d5db',
                borderRadius: 4,
                background: '#fff',
                color: '#334155',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {message && <p style={{ margin: '8px 0 0', fontSize: 13, color: '#059669' }}>{message}</p>}
      {error && <p style={{ margin: '8px 0 0', fontSize: 13, color: '#dc2626' }}>{error}</p>}
    </div>
  )
}

export default SendContractEmailButton
