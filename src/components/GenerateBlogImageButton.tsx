'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState } from 'react'

const GenerateBlogImageButton = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [mediaId, setMediaId] = useState<string | null>(null)

  const title = fields?.title?.value as string | undefined
  const excerpt = fields?.excerpt?.value as string | undefined
  const imagePromptOverride = fields?.imagePromptOverride?.value as string | undefined

  const notSaved = !id
  const missingFields: string[] = []
  if (!title?.trim()) missingFields.push('Title')

  const handleClick = async () => {
    if (loading) return
    setLoading(true)
    setMessage(null)
    setError(null)
    setMediaUrl(null)
    setMediaId(null)

    try {
      const res = await fetch('/api/blog-posts/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          blogPostId: id,
          title: title?.trim(),
          excerpt: excerpt?.trim(),
          imagePromptOverride: imagePromptOverride?.trim() || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || `Failed (${res.status})`)
        return
      }

      setMediaUrl(data.url)
      setMediaId(data.mediaId)
      setMessage('Image generated! Review it below, then assign it as the featured image.')
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

      {mediaUrl && (
        <div style={{ marginTop: 12 }}>
          <a
            href={mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-block', marginBottom: 8, fontSize: 13, color: '#7c3aed', fontWeight: 600 }}
          >
            View generated image (opens in new tab)
          </a>
          {mediaId && (
            <span style={{ marginLeft: 12, fontSize: 12, color: '#6b7280' }}>
              Media ID: {mediaId} —{' '}
              <a
                href={`/admin/collections/media/${mediaId}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#7c3aed' }}
              >
                Edit in Media
              </a>
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export default GenerateBlogImageButton
