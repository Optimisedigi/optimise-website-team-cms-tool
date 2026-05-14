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
          height: '100%',
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
    <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
      <button
        type="button"
        onClick={handleOpen}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '6px 12px',
          background: 'var(--theme-elevation-100, #2563eb)',
          color: 'white',
          border: 'none',
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 600,
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
