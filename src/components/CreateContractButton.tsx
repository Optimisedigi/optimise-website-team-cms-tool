'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState } from 'react'

const CreateContractButton = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!id) return null

  const businessName = fields?.['businessName']?.value as string
  const contactName = fields?.['contactName']?.value as string
  const contactEmail = fields?.['contactEmail']?.value as string
  const websiteUrl = fields?.['websiteUrl']?.value as string

  const handleCreate = async () => {
    if (!contactEmail) {
      setError('Please add a contact email to the proposal before creating a contract.')
      return
    }

    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractTitle: `Service Agreement - ${businessName || 'New Client'}`,
          proposal: id,
          clientName: businessName || '',
          clientContactName: contactName || '',
          clientEmail: contactEmail,
          clientWebsite: websiteUrl || '',
          contractDate: new Date().toISOString(),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.errors?.[0]?.message || data.error || 'Failed to create contract')
      }

      const data = await res.json()
      const contractId = data.doc?.id
      setMessage('Contract created!')
      if (contractId) {
        setTimeout(() => {
          window.location.href = `/admin/collections/contracts/${contractId}`
        }, 500)
      }
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
        onClick={handleCreate}
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
          background: loading ? '#6b7280' : '#2563eb',
          color: '#fff',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Creating...' : 'Create Contract'}
      </button>
      {message && <p style={{ margin: '8px 0 0', fontSize: 13, color: '#059669' }}>{message}</p>}
      {error && <p style={{ margin: '8px 0 0', fontSize: 13, color: '#dc2626' }}>{error}</p>}
    </div>
  )
}

export default CreateContractButton
