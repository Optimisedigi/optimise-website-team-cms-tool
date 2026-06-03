'use client'

import { useFormFields } from '@payloadcms/ui'
import { useCallback } from 'react'

const ClientSignedContractButton = () => {
  const signedContractUrl = useFormFields(([fields]) => {
    const value = fields?.signedContractUrl?.value
    return typeof value === 'string' ? value.trim() : ''
  })

  const handleOpen = useCallback(() => {
    if (!signedContractUrl) return
    window.open(signedContractUrl, '_blank', 'noopener,noreferrer')
  }, [signedContractUrl])

  if (!signedContractUrl) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          minHeight: 38,
          fontSize: 13,
          color: 'var(--theme-elevation-500, #888)',
          fontStyle: 'italic',
        }}
      >
        No signed contract URL yet
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', minHeight: 52, paddingTop: 6, paddingBottom: 6 }}>
      <button
        type="button"
        onClick={handleOpen}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 18px',
          background: '#2563eb',
          color: 'white',
          border: '1px solid rgba(37, 99, 235, 0.35)',
          borderRadius: 10,
          boxShadow: '0 10px 22px rgba(37, 99, 235, 0.26)',
          fontSize: 13.5,
          fontWeight: 800,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          lineHeight: 1.2,
        }}
      >
        Open Signed Contract ↗
      </button>
    </div>
  )
}

export default ClientSignedContractButton
