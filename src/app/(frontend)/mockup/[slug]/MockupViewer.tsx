'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  PinGateFrame,
  pinGateBlurredInputStyle,
  pinGateFocusedInputStyle,
  pinGateInputStyle,
} from '@/components/PinGateFrame'

export default function MockupViewer({
  businessName,
  slug,
}: {
  businessName: string
  slug: string
}) {
  const [digits, setDigits] = useState(['', '', '', ''])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mockupUrl, setMockupUrl] = useState<string | null>(null)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

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
        setDigits(['', '', '', ''])
        setLoading(false)
        return
      }

      if (data.ok && data.websiteMockupUrl) {
        // Use proxy route to serve mockup inline (avoids blob download headers)
        setMockupUrl(`/api/mockup-serve?slug=${encodeURIComponent(slug)}`)
      } else if (data.ok && data.proposalSlug && data.proposalSlug !== slug) {
        setError('This PIN does not match this mockup.')
        setDigits(['', '', '', ''])
      } else if (data.ok && !data.websiteMockupUrl) {
        setError('No mockup is available for this proposal.')
      } else {
        setError('Invalid PIN. Please try again.')
        setDigits(['', '', '', ''])
      }
    } catch {
      setError('Something went wrong. Please try again.')
      setDigits(['', '', '', ''])
    }

    setLoading(false)
  }, [slug])

  const handleDigitChange = useCallback((index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[index] = digit
    setDigits(next)
    setError('')
    if (digit && index < 3) inputRefs.current[index + 1]?.focus()
    if (digit && index === 3 && next.every((d) => d !== '')) {
      verifyPin(next.join(''))
    }
  }, [digits, verifyPin])

  const handleKeyDown = useCallback((index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }, [digits])

  const handlePaste = useCallback((event: React.ClipboardEvent) => {
    event.preventDefault()
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4)
    if (!pasted) return
    const next = ['', '', '', '']
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i]
    setDigits(next)
    setError('')
    if (pasted.length === 4) verifyPin(pasted)
    else inputRefs.current[pasted.length]?.focus()
  }, [verifyPin])

  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

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
    <PinGateFrame
      eyebrow="Website Mockup"
      title={businessName}
      subtitle="Enter your 4-digit PIN access code to preview the website mockup"
    >
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 18 }} onPaste={handlePaste}>
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(element) => { inputRefs.current[index] = element }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              disabled={loading}
              onChange={(event) => handleDigitChange(index, event.target.value)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              style={{ ...pinGateInputStyle, opacity: loading ? 0.5 : 1 }}
              onFocus={(event) => { Object.assign(event.currentTarget.style, pinGateFocusedInputStyle) }}
              onBlur={(event) => { Object.assign(event.currentTarget.style, pinGateBlurredInputStyle) }}
              aria-label={`Digit ${index + 1}`}
            />
          ))}
        </div>
        {loading && <p style={{ marginTop: 24, fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace', fontSize: 13, color: '#8b90ad', textAlign: 'center' }}>Verifying...</p>}
        {error && <p style={{ marginTop: 24, fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace', fontSize: 13, color: '#ff7a7a', textAlign: 'center' }}>{error}</p>}
      </div>
    </PinGateFrame>
  )
}
