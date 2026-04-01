'use client'

import { useState, useCallback } from 'react'

interface AdCopyData {
  businessName: string
  slug: string
  adCopy: Record<string, Record<string, { headlines: string[]; descriptions: string[] }>>
  comments: Array<{
    id: string
    campaignName: string
    adGroupName: string
    lineType?: 'headline' | 'description' | null
    lineIndex?: number | null
    author: string
    text: string
    createdAt: string
  }>
  landingPages: Record<string, Record<string, string>>
}

interface Props {
  slug: string
  children: (data: AdCopyData, pin: string) => React.ReactNode
}

export default function AdCopyPinGate({ slug, children }: Props) {
  const [pin, setPin] = useState('')
  const [data, setData] = useState<AdCopyData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [authedPin, setAuthedPin] = useState('')

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (pin.length !== 4) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/ad-copy?slug=${encodeURIComponent(slug)}&pin=${encodeURIComponent(pin)}`)

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Invalid PIN')
        setLoading(false)
        return
      }

      const result = await res.json()
      setData(result)
      setAuthedPin(pin)
    } catch {
      setError('Network error. Please try again.')
    }
    setLoading(false)
  }, [slug, pin])

  if (data) {
    return <>{children(data, authedPin)}</>
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f8fafc',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <form
        onSubmit={handleSubmit}
        style={{
          background: '#fff',
          padding: 32,
          borderRadius: 12,
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          width: '100%',
          maxWidth: 360,
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: '0 0 8px' }}>
          Ad Copy Preview
        </h1>
        <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 24px' }}>
          Enter your 4-digit PIN to view the ad copy
        </p>

        <input
          type="text"
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          placeholder="0000"
          style={{
            width: '100%',
            padding: '12px 16px',
            fontSize: 24,
            textAlign: 'center',
            letterSpacing: 12,
            border: `2px solid ${error ? '#ef4444' : '#e2e8f0'}`,
            borderRadius: 8,
            outline: 'none',
            boxSizing: 'border-box',
          }}
          autoFocus
        />

        {error && (
          <p style={{ marginTop: 8, fontSize: 13, color: '#dc2626' }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={pin.length !== 4 || loading}
          style={{
            marginTop: 16,
            width: '100%',
            padding: '12px 20px',
            fontSize: 14,
            fontWeight: 600,
            background: pin.length === 4 && !loading ? '#7c3aed' : '#9ca3af',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: pin.length === 4 && !loading ? 'pointer' : 'not-allowed',
          }}
        >
          {loading ? 'Verifying...' : 'View Ad Copy'}
        </button>
      </form>
    </div>
  )
}
