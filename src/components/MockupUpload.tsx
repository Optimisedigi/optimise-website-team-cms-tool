'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState, useRef } from 'react'

const MockupUpload = () => {
  const { id } = useDocumentInfo()
  const [fields, dispatchFields] = useAllFormFields()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!id) return null

  const currentUrl = fields?.websiteMockupUrl?.value as string | undefined

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/mockup-upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || `Upload failed (${res.status})`)
        return
      }

      dispatchFields({
        type: 'UPDATE',
        path: 'websiteMockupUrl',
        value: data.url,
      })
    } catch {
      setError('Network error — check your connection and try again.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <label
        style={{
          display: 'block',
          marginBottom: 6,
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--theme-elevation-800)',
        }}
      >
        Upload HTML Mockup
      </label>

      {currentUrl && (
        <p style={{ fontSize: 13, color: 'var(--theme-elevation-600)', marginBottom: 8, wordBreak: 'break-all' }}>
          Current: {currentUrl}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          ref={fileRef}
          type="file"
          accept=".html,.htm"
          onChange={handleUpload}
          disabled={uploading}
          style={{ fontSize: 13 }}
        />
        {uploading && (
          <span style={{ fontSize: 13, color: 'var(--theme-elevation-600)' }}>
            Uploading...
          </span>
        )}
      </div>

      <p style={{ marginTop: 4, fontSize: 12, color: 'var(--theme-elevation-500)' }}>
        Upload an .html file (max 5 MB). The URL will be saved when you click Save.
      </p>

      {error && (
        <p style={{ marginTop: 6, fontSize: 13, color: '#dc2626' }}>{error}</p>
      )}
    </div>
  )
}

export default MockupUpload
