'use client'

import { useFormFields } from '@payloadcms/ui'
import { useCallback } from 'react'

type Props = {
  path?: string
}

/**
 * Reads the sibling `deckUrl` field and renders an "Open Deck" button.
 * The deck slug is extracted from the URL at render time in the partner
 * page — no need to write it from here.
 */
const ClientPresentationLink = ({ path }: Props) => {
  const siblingDeckUrlPath = path
    ? path.replace(/\.linkPreview$/, '.deckUrl')
    : ''

  const deckUrl = useFormFields(([fields]) => {
    if (!siblingDeckUrlPath) return ''
    const v = fields?.[siblingDeckUrlPath]?.value
    return typeof v === 'string' ? v : ''
  })

  const handleOpen = useCallback(() => {
    if (!deckUrl) return
    const absolute =
      deckUrl.startsWith('http')
        ? deckUrl
        : `https://cms.optimisedigital.online${deckUrl.startsWith('/') ? deckUrl : `/${deckUrl}`}`
    window.open(absolute, '_blank', 'noopener,noreferrer')
  }, [deckUrl])

  if (!deckUrl) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          minHeight: 43,
          marginTop: 22,
          fontSize: 13,
          color: 'var(--theme-elevation-500, #888)',
          fontStyle: 'italic',
        }}
      >
        Paste the deck URL to enable
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', minHeight: 43, marginTop: 22 }}>
      <button
        type="button"
        onClick={handleOpen}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: '10px 16px',
          minHeight: 43,
          background: '#2563eb',
          color: '#fff',
          border: '1px solid #1d4ed8',
          borderRadius: 8,
          boxShadow: '0 1px 2px rgba(37, 99, 235, 0.22)',
          fontSize: 13,
          fontWeight: 700,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Open Deck ↗
      </button>
    </div>
  )
}

export default ClientPresentationLink
