'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState } from 'react'

const ContractPreviewButton = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [loading, setLoading] = useState(false)

  const signedPdfUrl = fields?.['signedPdfUrl']?.value as string
  const status = fields?.['status']?.value as string

  if (!id) return null

  const handlePreview = async () => {
    setLoading(true)
    try {
      // Cache-buster query so the browser/CDN never serves a stale PDF after
      // edits (Cache-Control on the route is the primary defence; this is belt).
      window.open(`/api/contracts/${id}/preview-pdf?t=${Date.now()}`, '_blank')
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadDocx = () => {
    window.open(`/api/contracts/${id}/download-docx?t=${Date.now()}`, '_blank')
  }

  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
      <button
        type="button"
        onClick={handlePreview}
        disabled={loading}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 20px',
          fontSize: 14,
          fontWeight: 600,
          border: '1px solid #cbd5e1',
          borderRadius: 6,
          background: '#fff',
          color: '#334155',
          cursor: 'pointer',
        }}
      >
        Preview PDF
      </button>
      {status === 'draft' && (
        <button
          type="button"
          onClick={handleDownloadDocx}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            fontSize: 14,
            fontWeight: 600,
            border: '1px solid #cbd5e1',
            borderRadius: 6,
            background: '#fff',
            color: '#334155',
            cursor: 'pointer',
          }}
        >
          Download Word
        </button>
      )}
      {signedPdfUrl && (
        <a
          href={signedPdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            fontSize: 14,
            fontWeight: 600,
            border: 'none',
            borderRadius: 6,
            background: '#059669',
            color: '#fff',
            textDecoration: 'none',
          }}
        >
          Download Signed PDF
        </a>
      )}
    </div>
  )
}

export default ContractPreviewButton
