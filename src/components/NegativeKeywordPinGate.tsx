'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  PinGateFrame,
  pinGateBlurredInputStyle,
  pinGateFocusedInputStyle,
  pinGateInputStyle,
} from './PinGateFrame'

export interface NegativeKeywordData {
  businessName: string
  slug: string
  status: string
  totalSearchTermsAnalyzed: number
  dateRangeStart: string
  dateRangeEnd: string
  totalWasteIdentified: number
  existingNegativeCount: number
  accountWideKeywords: Array<{
    phrase: string
    matchType: 'PHRASE' | 'EXACT'
    totalSpend?: number
    totalClicks?: number
    totalImpressions?: number
    clientRemoved?: boolean
    clientComment?: string
    sourceSection?: string
    sourceCategoryName?: string
  }>
  campaignSpecificKeywords: Array<{
    campaignName: string
    keywords: Array<{
      phrase: string
      matchType: 'PHRASE' | 'EXACT'
      reason?: string
      clientRemoved?: boolean
      clientComment?: string
    }>
  }>
  existingNegativeKeywordLists: Array<{
    name: string
    scope: 'account' | 'campaign' | 'ad_group'
    campaigns: Array<{ campaignName: string }>
    keywords: Array<{ keyword: string; matchType: string }>
    isActive: boolean
  }>
  clientNotes: string
}

interface Props {
  slug: string
  businessName?: string
  children: (data: NegativeKeywordData, pin: string) => React.ReactNode
}

export default function NegativeKeywordPinGate({ slug, businessName, children }: Props) {
  const [digits, setDigits] = useState(['', '', '', ''])
  const [data, setData] = useState<NegativeKeywordData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [authedPin, setAuthedPin] = useState('')
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const submit = useCallback(async (pin: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/negative-keyword-build?slug=${encodeURIComponent(slug)}&pin=${encodeURIComponent(pin)}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string }))
        if (res.status === 429) setError(body.error || 'Too many incorrect attempts. Please try again in 15 minutes.')
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
    <PinGateFrame
      eyebrow="Negative Keyword Review"
      title={businessName}
      subtitle="Enter your 4-digit PIN access code to view the negative keyword list"
    >
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 18 }} onPaste={handlePaste}>
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
              style={{ ...pinGateInputStyle, opacity: loading ? 0.5 : 1 }}
              onFocus={(e) => { Object.assign(e.currentTarget.style, pinGateFocusedInputStyle) }}
              onBlur={(e) => { Object.assign(e.currentTarget.style, pinGateBlurredInputStyle) }}
              aria-label={`Digit ${i + 1}`}
            />
          ))}
        </div>
        {loading && <p style={{ marginTop: 24, fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace', fontSize: 13, color: '#8b90ad', textAlign: 'center' }}>Verifying...</p>}
        {error && <p style={{ marginTop: 24, fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace', fontSize: 13, color: '#ff7a7a', textAlign: 'center' }}>{error}</p>}
      </div>
    </PinGateFrame>
  )
}
