'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState } from 'react'

const DuplicateContractButton = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isTemplate = fields?.['isTemplate']?.value as boolean

  if (!id || !isTemplate) return null

  const handleDuplicate = async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/contracts/${id}/duplicate`, {
        method: 'POST',
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create from template')
      }

      const newId = data.id
      window.location.href = `/admin/collections/contracts/${newId}`
    } catch (e: any) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <button
        type="button"
        onClick={handleDuplicate}
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
          background: '#7c3aed',
          color: '#fff',
          cursor: 'pointer',
        }}
      >
        {loading ? 'Creating...' : 'Create from Template'}
      </button>
      {error && <p style={{ margin: '8px 0 0', fontSize: 13, color: '#dc2626' }}>{error}</p>}
    </div>
  )
}

export default DuplicateContractButton
