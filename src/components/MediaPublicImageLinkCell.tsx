'use client'

import type { DefaultCellComponentProps } from 'payload'
import { useEffect, useState } from 'react'

export default function MediaPublicImageLinkCell({
  rowData,
}: DefaultCellComponentProps): React.ReactElement | null {
  const [origin, setOrigin] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const mimeType: unknown = rowData?.mimeType
  const rawUrl: unknown = rowData?.url
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

  if (!url) return <span>URL unavailable</span>

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url)
      setStatus('Copied')
    } catch {
      setStatus('Copy failed')
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={url}
        style={{
          display: 'inline-block',
          maxWidth: 200,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {url}
      </a>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy public URL for ${rowData?.filename || 'image'}`}
      >
        Copy
      </button>
      <span role="status" aria-live="polite">
        {status}
      </span>
    </div>
  )
}
