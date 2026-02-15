'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState } from 'react'

const GscConnectButton = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const gscConnected = fields?.gscConnected?.value as boolean | undefined
  const gscPropertyUrl = fields?.gscPropertyUrl?.value as string | undefined
  const gscLastSync = fields?.gscLastSync?.value as string | undefined

  const notSaved = !id

  const handleConnect = () => {
    if (!id) return
    window.location.href = `/api/gsc/connect?clientId=${id}`
  }

  const handleDisconnect = async () => {
    if (!id) return
    setLoading(true)
    setMessage(null)
    setError(null)

    try {
      const res = await fetch('/api/gsc/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ clientId: id }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || `Failed (${res.status})`)
        return
      }

      setMessage('Disconnected. Refresh the page to see updated status.')
    } catch {
      setError('Network error — check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSync = async () => {
    if (!id) return
    setLoading(true)
    setMessage(null)
    setError(null)

    try {
      const res = await fetch('/api/gsc/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ clientId: id }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || `Failed (${res.status})`)
        return
      }

      const result = data.results?.[0]
      const alertCount = result?.alerts?.length || 0
      setMessage(
        `Sync complete. ${alertCount} alert(s) generated. Refresh the page to see the snapshot.`
      )
    } catch {
      setError('Network error — check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  if (notSaved) {
    return (
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: '#9ca3af' }}>
          Save the client first, then connect Google Search Console.
        </p>
      </div>
    )
  }

  if (gscConnected) {
    return (
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              background: '#dcfce7',
              color: '#166534',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Connected
          </span>
          {gscPropertyUrl && (
            <span style={{ fontSize: 13, color: '#6b7280' }}>
              {gscPropertyUrl}
            </span>
          )}
        </div>

        {gscLastSync && (
          <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>
            Last synced: {new Date(gscLastSync).toLocaleDateString('en-AU', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={handleSync}
            disabled={loading}
            style={{
              padding: '8px 16px',
              background: loading ? '#6b7280' : '#2563eb',
              color: '#fff',
              borderRadius: 6,
              border: 'none',
              fontWeight: 600,
              fontSize: 13,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Syncing...' : 'Sync Now'}
          </button>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={loading}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              color: '#dc2626',
              borderRadius: 6,
              border: '1px solid #dc2626',
              fontWeight: 600,
              fontSize: 13,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            Disconnect
          </button>
        </div>

        {message && (
          <p style={{ marginTop: 8, fontSize: 13, color: '#16a34a' }}>
            {message}
          </p>
        )}
        {error && (
          <p style={{ marginTop: 8, fontSize: 13, color: '#dc2626' }}>
            {error}
          </p>
        )}
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <button
        type="button"
        onClick={handleConnect}
        disabled={loading}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 20px',
          background: '#2563eb',
          color: '#fff',
          borderRadius: 8,
          border: 'none',
          fontWeight: 600,
          fontSize: 14,
          cursor: 'pointer',
        }}
      >
        Connect Google Search Console
      </button>
      <p style={{ marginTop: 8, fontSize: 13, color: '#9ca3af' }}>
        Connect to pull search performance, indexing, and Core Web Vitals data.
      </p>
    </div>
  )
}

export default GscConnectButton
