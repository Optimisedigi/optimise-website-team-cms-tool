'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState } from 'react'

const SendContractButton = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [signingUrl, setSigningUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // Inline email-send state. We send via the same /send-email route the
  // sibling SendContractEmailButton uses, but inline so the user sees the
  // freshly generated link AND the "email it" action without a page reload.
  const [emailing, setEmailing] = useState(false)
  const [emailedTo, setEmailedTo] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)

  const status = fields?.['status']?.value as string
  const sentAt = fields?.['sentAt']?.value as string
  const clientEmail = fields?.['clientEmail']?.value as string
  const agencySignature = fields?.['agencySignature']?.value

  if (!id) return null

  // Show for draft (after agency signature uploaded) and sent (regenerate link)
  if (status === 'completed') return null
  if (status === 'draft' && !agencySignature) return null

  const handleGenerateLink = async () => {
    setLoading(true)
    setError(null)
    setMessage(null)
    setSigningUrl(null)
    setCopied(false)
    try {
      const res = await fetch(`/api/contracts/${id}/send-to-client`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate link')

      setSigningUrl(data.signingUrl)
      setMessage('Signing link generated. You can email it to the client (button below) or copy and share it manually.')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleEmail = async () => {
    if (!clientEmail || emailing) return
    setEmailing(true)
    setEmailError(null)
    setEmailedTo(null)
    try {
      const res = await fetch(`/api/contracts/${id}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send email')
      const ccLabel = Array.isArray(data.cc) && data.cc.length > 0
        ? ` (cc: ${data.cc.join(', ')})`
        : ''
      setEmailedTo(`${data.sentTo}${ccLabel}`)
    } catch (e: any) {
      setEmailError(e.message)
    } finally {
      setEmailing(false)
    }
  }

  const handleCopy = async () => {
    if (!signingUrl) return
    try {
      await navigator.clipboard.writeText(signingUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const input = document.createElement('input')
      input.value = signingUrl
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      {sentAt && status === 'sent' && !signingUrl && (
        <p style={{ margin: '0 0 8px', fontSize: 13, color: '#64748b' }}>
          Link generated for {clientEmail} on {new Date(sentAt).toLocaleDateString('en-AU')}
        </p>
      )}

      <button
        type="button"
        onClick={handleGenerateLink}
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
          background: loading ? '#6b7280' : '#059669',
          color: '#fff',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {status === 'sent' ? 'Regenerate Signing Link' : 'Generate Signing Link'}
      </button>

      {loading && <p style={{ margin: '8px 0 0', fontSize: 13, color: '#6b7280' }}>Processing...</p>}
      {message && <p style={{ margin: '8px 0 0', fontSize: 13, color: '#059669' }}>{message}</p>}
      {error && <p style={{ margin: '8px 0 0', fontSize: 13, color: '#dc2626' }}>{error}</p>}

      {signingUrl && (
        <div style={{
          marginTop: 12,
          padding: '12px 16px',
          background: '#f0f9ff',
          border: '1px solid #bae6fd',
          borderRadius: 6,
        }}>
          <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: '#0369a1' }}>
            Signing Link
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              readOnly
              value={signingUrl}
              style={{
                flex: 1,
                padding: '8px 10px',
                fontSize: 13,
                border: '1px solid #d1d5db',
                borderRadius: 4,
                background: '#fff',
                color: '#111',
                outline: 'none',
              }}
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              onClick={handleCopy}
              style={{
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 600,
                border: '1px solid #d1d5db',
                borderRadius: 4,
                background: copied ? '#059669' : '#fff',
                color: copied ? '#fff' : '#334155',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 11, color: '#64748b' }}>
            This link expires in 7 days. The client can view, verify details, and sign.
          </p>

          {/* Inline email-send. Lets the operator email the link to the
              client without leaving this panel — no page reload required
              for the sibling button to appear. */}
          {clientEmail && !emailedTo && (
            <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleEmail}
                disabled={emailing}
                style={{
                  padding: '8px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: 4,
                  background: emailing ? '#6b7280' : '#2563eb',
                  color: '#fff',
                  cursor: emailing ? 'not-allowed' : 'pointer',
                }}
              >
                {emailing ? 'Sending…' : (() => {
                  const emails = (clientEmail || '').split(',').map((e) => e.trim()).filter(Boolean)
                  if (emails.length <= 1) return `Email link to ${clientEmail}`
                  return `Email link to ${emails[0]} + ${emails.length - 1} cc`
                })()}
              </button>
              {emailError && (
                <span style={{ fontSize: 12, color: '#dc2626' }}>{emailError}</span>
              )}
            </div>
          )}
          {emailedTo && (
            <p style={{ margin: '10px 0 0', fontSize: 13, color: '#059669', fontWeight: 600 }}>
              ✓ Email sent to {emailedTo}
            </p>
          )}
          {!clientEmail && (
            <p style={{ margin: '10px 0 0', fontSize: 12, color: '#b45309' }}>
              No client email saved on this contract — add one in the Client tab to enable one-click sending.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default SendContractButton
