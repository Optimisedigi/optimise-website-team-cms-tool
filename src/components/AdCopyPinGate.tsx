'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

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
  const [digits, setDigits] = useState(['', '', '', ''])
  const [data, setData] = useState<AdCopyData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [authedPin, setAuthedPin] = useState('')
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const submit = useCallback(async (pin: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/ad-copy?slug=${encodeURIComponent(slug)}&pin=${encodeURIComponent(pin)}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        if (res.status === 429) setError('Too many attempts. Please try again in a few minutes.')
        else setError(body.error || 'Invalid access code.')
        return
      }
      const result = await res.json()
      setData(result)
      setAuthedPin(pin)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
      setDigits(['', '', '', ''])
      inputRefs.current[0]?.focus()
    }
  }, [slug])

  const handleChange = useCallback((index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[index] = digit
    setDigits(next)
    setError(null)
    if (digit && index < 3) inputRefs.current[index + 1]?.focus()
    if (digit && index === 3 && next.every(d => d !== '')) submit(next.join(''))
  }, [digits, submit])

  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) inputRefs.current[index - 1]?.focus()
  }, [digits])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4)
    if (!pasted.length) return
    const next = ['', '', '', '']
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i]
    setDigits(next)
    setError(null)
    if (pasted.length === 4) submit(pasted)
    else inputRefs.current[pasted.length]?.focus()
  }, [submit])

  useEffect(() => { inputRefs.current[0]?.focus() }, [])

  if (data) return <>{children(data, authedPin)}</>

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>Ad Copy Preview</h1>
        <p style={{ fontSize: 14, color: '#94a3b8', margin: 0 }}>Enter your 4-digit PIN access code to view the ad copy</p>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }} onPaste={handlePaste}>
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            disabled={loading}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            style={{ width: 64, height: 80, textAlign: 'center', fontSize: 24, fontWeight: 600, border: '2px solid #475569', borderRadius: 12, background: '#1e293b', color: '#fff', outline: 'none', opacity: loading ? 0.5 : 1, transition: 'border-color 0.2s' }}
            onFocus={(e) => { e.target.style.borderColor = '#60a5fa' }}
            onBlur={(e) => { e.target.style.borderColor = '#475569' }}
          />
        ))}
      </div>
      {loading && <p style={{ marginTop: 24, fontSize: 14, color: '#94a3b8', textAlign: 'center' }}>Verifying...</p>}
      {error && <p style={{ marginTop: 24, fontSize: 14, color: '#f87171', textAlign: 'center' }}>{error}</p>}
    </div>
  )
}
