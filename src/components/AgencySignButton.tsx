'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState } from 'react'

const AgencySignButton = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const status = fields?.['status']?.value as string
  const agencySignerName = fields?.['agencySignerName']?.value as string
  const agencySignerTitle = fields?.['agencySignerTitle']?.value as string
  const agencySignedAt = fields?.['agencySignedAt']?.value as string
  const agencySignature = fields?.['agencySignature']?.value as string | undefined

  if (!id) return null

  // Already signed
  if (status !== 'draft') {
    return (
      <div style={{ padding: '12px 16px', background: '#f0fdf4', borderRadius: 6, border: '1px solid #bbf7d0', marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 14, color: '#166534' }}>
          &#10003; Signed by {agencySignerName || 'Agency'}{agencySignedAt ? ` on ${new Date(agencySignedAt).toLocaleDateString('en-AU')}` : ''}
        </p>
      </div>
    )
  }

  const handleSign = async () => {
    setLoading(true)
    setError(null)
    setMessage(null)

    const signerName = agencySignerName || ''
    const signerTitle = agencySignerTitle || ''

    if (!signerName) {
      setError('Please enter the agency signer name before signing.')
      setLoading(false)
      return
    }

    if (!agencySignature) {
      setError('Please upload a signature image in the field above first.')
      setLoading(false)
      return
    }

    try {
      const res = await fetch(`/api/contracts/${id}/agency-sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatureMediaId: agencySignature, signerName, signerTitle }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save signature')
      }

      setMessage('Signature saved. Refreshing...')
      setTimeout(() => window.location.reload(), 1000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <button
        type="button"
        onClick={handleSign}
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
        Sign as Agency
      </button>
      {loading && <p style={{ margin: '8px 0 0', fontSize: 13, color: '#6b7280' }}>Saving signature...</p>}
      {message && <p style={{ margin: '8px 0 0', fontSize: 13, color: '#059669' }}>{message}</p>}
      {error && <p style={{ margin: '8px 0 0', fontSize: 13, color: '#dc2626' }}>{error}</p>}
    </div>
  )
}

export default AgencySignButton
