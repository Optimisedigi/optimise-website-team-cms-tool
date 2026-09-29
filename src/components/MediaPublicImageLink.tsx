'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

export default function MediaPublicImageLink(): React.ReactElement | null {
  const { data } = useDocumentInfo()
  const rawUrl = data?.url
  const mimeType = data?.mimeType
  const [origin, setOrigin] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  if (typeof mimeType !== 'string' || !mimeType.startsWith('image/')) return null

  const localUrl =
    typeof rawUrl === 'string' &&
    rawUrl.startsWith('/') &&
    !rawUrl.startsWith('//') &&
    !rawUrl.startsWith('/\\') &&
    origin
      ? new URL(rawUrl, origin)
      : null
  const url =
    localUrl?.origin === origin
      ? localUrl.href
      : typeof rawUrl === 'string' && /^https?:\/\//i.test(rawUrl)
        ? rawUrl
        : ''

  if (!url) {
    return <p>Save the image to get its public URL.</p>
  }

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url)
      setStatus('URL copied')
    } catch {
      setStatus('Could not copy. Select the URL above to copy it manually.')
    }
  }

  return (
    <div style={{ marginBlock: 16 }}>
      <label
        htmlFor="media-public-image-url"
        style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}
      >
        Public image URL
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input
          id="media-public-image-url"
          type="text"
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          style={{ flex: '1 1 240px', minWidth: 0, padding: 10 }}
        />
        <button
          type="button"
          className="btn btn--style-secondary btn--size-small"
          onClick={copy}
          style={{ margin: 0 }}
        >
          Copy URL
        </button>
        <a href={url} target="_blank" rel="noopener noreferrer">
          Open image
        </a>
      </div>
      <span role="status" aria-live="polite">
        {status}
      </span>
    </div>
  )
}
