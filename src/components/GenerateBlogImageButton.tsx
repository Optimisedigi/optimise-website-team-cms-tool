'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState } from 'react'

const GenerateBlogImageButton = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const title = fields?.title?.value as string | undefined
  const excerpt = fields?.excerpt?.value as string | undefined

  const notSaved = !id
  const missingFields: string[] = []
  if (!title?.trim()) missingFields.push('Title')

  const handleClick = async () => {
    setLoading(true)
    setMessage(null)
    setError(null)

    try {
      const res = await fetch('/api/blog-posts/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          blogPostId: id,
          title: title?.trim(),
          excerpt: excerpt?.trim(),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || `Failed (${res.status})`)
        return
      }

      setMessage('Image generated and attached. Refresh the page to see it.')
    } catch {
      setError('Network error — check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading || notSaved || missingFields.length > 0}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 20px',
          background: loading
            ? '#6b7280'
            : (notSaved || missingFields.length > 0)
              ? '#9ca3af'
              : '#7c3aed',
          color: '#fff',
          borderRadius: 8,
          border: 'none',
          fontWeight: 600,
          fontSize: 14,
          cursor: loading || notSaved || missingFields.length > 0 ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Generating Image...' : 'Generate Featured Image'}
      </button>

      {notSaved && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#9ca3af' }}>
          Save the post first, then generate an image.
        </p>
      )}

      {!notSaved && missingFields.length > 0 && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#9ca3af' }}>
          Fill in {missingFields.join(', ')} before generating an image.
        </p>
      )}

      {message && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#16a34a' }}>{message}</p>
      )}

      {error && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#dc2626' }}>{error}</p>
      )}

      {loading && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#6b7280' }}>
          Generating with Gemini Imagen and optimizing to WebP. This may take a few seconds...
        </p>
      )}
    </div>
  )
}

export default GenerateBlogImageButton
