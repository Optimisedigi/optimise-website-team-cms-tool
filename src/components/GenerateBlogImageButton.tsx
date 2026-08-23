'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState } from 'react'

const GenerateBlogImageButton = () => {
  const { id } = useDocumentInfo()
  const [fields, dispatchFields] = useAllFormFields()
  const [generatingPrompt, setGeneratingPrompt] = useState(false)
  const [generatingImage, setGeneratingImage] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [mediaId, setMediaId] = useState<string | null>(null)
  // Set when the OAuth path failed and the API-key fallback is available;
  // holds the message the user must confirm before we spend billed credits.
  const [apiKeyPrompt, setApiKeyPrompt] = useState<string | null>(null)

  const title = fields?.title?.value as string | undefined
  const excerpt = fields?.excerpt?.value as string | undefined
  const imagePromptOverride = fields?.imagePromptOverride?.value as string | undefined

  const notSaved = !id
  const missingTitle = !title?.trim()
  const hasPrompt = !!imagePromptOverride?.trim()
  const busy = generatingPrompt || generatingImage

  const handleGeneratePrompt = async () => {
    if (busy) return
    setGeneratingPrompt(true)
    setMessage(null)
    setError(null)

    try {
      const res = await fetch('/api/blog-posts/generate-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: title?.trim(),
          excerpt: excerpt?.trim(),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || `Failed (${res.status})`)
        return
      }

      dispatchFields({
        type: 'UPDATE',
        path: 'imagePromptOverride',
        value: data.prompt,
      })

      setMessage('Prompt generated! Review it in the field above, edit if needed, then click "Generate Image".')
    } catch {
      setError('Network error — check your connection and try again.')
    } finally {
      setGeneratingPrompt(false)
    }
  }

  // useApiKey=false tries ChatGPT OAuth (free on the plan); the server only
  // touches the billed API key when the user confirms the fallback.
  const handleGenerateImage = async (useApiKey = false) => {
    if (busy) return
    setGeneratingImage(true)
    setMessage(null)
    setError(null)
    setApiKeyPrompt(null)
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
          imagePromptOverride: imagePromptOverride?.trim(),
          useApiKey,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 409 && data.canRetryWithApiKey) {
          setApiKeyPrompt(data.error)
        } else {
          setError(data.error || `Failed (${res.status})`)
        }
        return
      }

      setMediaUrl(data.url)
      setMediaId(data.mediaId)
      setMessage(
        data.source === 'api-key'
          ? 'Image generated via the API key. Review it below, then assign it as the featured image.'
          : 'Image generated with ChatGPT (no API key used). Review it below, then assign it as the featured image.',
      )
    } catch {
      setError('Network error — check your connection and try again.')
    } finally {
      setGeneratingImage(false)
    }
  }

  const buttonBase = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 20px',
    color: '#fff',
    borderRadius: 8,
    border: 'none',
    fontWeight: 600,
    fontSize: 14,
  } as const

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {/* Step 1: Generate Prompt */}
        <button
          type="button"
          onClick={handleGeneratePrompt}
          disabled={busy || missingTitle}
          style={{
            ...buttonBase,
            background: busy || missingTitle ? '#9ca3af' : '#2563eb',
            cursor: busy || missingTitle ? 'not-allowed' : 'pointer',
          }}
        >
          {generatingPrompt ? 'Generating Prompt...' : '1. Generate Prompt'}
        </button>

        {/* Step 2: Generate Image */}
        <button
          type="button"
          onClick={() => handleGenerateImage(false)}
          disabled={busy || notSaved || missingTitle || !hasPrompt}
          style={{
            ...buttonBase,
            background: busy || notSaved || missingTitle || !hasPrompt ? '#9ca3af' : '#7c3aed',
            cursor: busy || notSaved || missingTitle || !hasPrompt ? 'not-allowed' : 'pointer',
          }}
        >
          {generatingImage ? 'Generating Image...' : '2. Generate Image'}
        </button>
      </div>

      {missingTitle && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#9ca3af' }}>
          Fill in a Title before generating.
        </p>
      )}

      {!missingTitle && notSaved && !hasPrompt && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#9ca3af' }}>
          Generate a prompt first, then save the post before generating an image.
        </p>
      )}

      {!missingTitle && !notSaved && !hasPrompt && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#9ca3af' }}>
          Click "Generate Prompt" first to create an image prompt, review it, then click "Generate Image".
        </p>
      )}

      {message && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#16a34a' }}>{message}</p>
      )}

      {error && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#dc2626' }}>{error}</p>
      )}

      {apiKeyPrompt && (
        <div
          style={{
            marginTop: 10,
            padding: '10px 12px',
            border: '1px solid #f59e0b',
            borderRadius: 8,
            background: 'rgba(245, 158, 11, 0.08)',
          }}
        >
          <p style={{ margin: 0, fontSize: 13, color: '#b45309' }}>{apiKeyPrompt}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              type="button"
              onClick={() => handleGenerateImage(true)}
              disabled={busy}
              style={{
                ...buttonBase,
                padding: '8px 16px',
                background: busy ? '#9ca3af' : '#d97706',
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              Yes, use the API key
            </button>
            <button
              type="button"
              onClick={() => setApiKeyPrompt(null)}
              disabled={busy}
              style={{
                ...buttonBase,
                padding: '8px 16px',
                background: 'transparent',
                color: '#6b7280',
                border: '1px solid #d1d5db',
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {generatingPrompt && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#6b7280' }}>
          Generating a tailored image prompt with Gemini...
        </p>
      )}

      {generatingImage && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#6b7280' }}>
          Generating image and optimizing to WebP. This may take a few seconds...
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
