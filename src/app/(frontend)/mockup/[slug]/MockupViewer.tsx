'use client'

import { useState, useCallback } from 'react'

export default function MockupViewer({
  businessName,
  slug,
}: {
  businessName: string
  slug: string
}) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mockupUrl, setMockupUrl] = useState<string | null>(null)

  const verifyPin = useCallback(async (pinValue: string) => {
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/client-hub/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinValue }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Invalid PIN. Please try again.')
        setPin('')
        setLoading(false)
        return
      }

      if (data.ok && data.websiteMockupUrl) {
        // Use proxy route to serve mockup inline (avoids blob download headers)
        setMockupUrl(`/api/mockup-serve?slug=${encodeURIComponent(slug)}`)
      } else if (data.ok && data.proposalSlug && data.proposalSlug !== slug) {
        setError('This PIN does not match this mockup.')
        setPin('')
      } else if (data.ok && !data.websiteMockupUrl) {
        setError('No mockup is available for this proposal.')
      } else {
        setError('Invalid PIN. Please try again.')
        setPin('')
      }
    } catch {
      setError('Something went wrong. Please try again.')
      setPin('')
    }

    setLoading(false)
  }, [slug])

  if (mockupUrl) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
        <iframe
          src={mockupUrl}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
          }}
          title={`Website mockup for ${businessName}`}
        />
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0a1628, #1a3a5c, #0f2847)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          padding: '48px 40px',
          maxWidth: '400px',
          width: '90%',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            color: '#fff',
            fontSize: '24px',
            fontWeight: 600,
            marginBottom: '8px',
          }}
        >
          {businessName}
        </h1>
        <p
          style={{
            color: 'rgba(255, 255, 255, 0.6)',
            fontSize: '14px',
            marginBottom: '32px',
          }}
        >
          Enter your PIN to preview the website mockup
        </p>

        <div>
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            value={pin}
            disabled={loading}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '')
              setPin(val)
              setError('')
              if (val.length === 4) {
                verifyPin(val)
              }
            }}
            placeholder="0000"
            autoFocus
            style={{
              width: '100%',
              padding: '16px',
              fontSize: '32px',
              textAlign: 'center',
              letterSpacing: '12px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: error
                ? '2px solid #ef4444'
                : '2px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '12px',
              color: '#fff',
              outline: 'none',
              boxSizing: 'border-box',
              opacity: loading ? 0.5 : 1,
            }}
          />

          {loading && (
            <p
              style={{
                color: 'rgba(255, 255, 255, 0.6)',
                fontSize: '14px',
                marginTop: '12px',
              }}
            >
              Verifying...
            </p>
          )}

          {error && (
            <p
              style={{
                color: '#ef4444',
                fontSize: '14px',
                marginTop: '12px',
              }}
            >
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
