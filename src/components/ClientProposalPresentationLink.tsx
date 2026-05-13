'use client'

import { useDocumentInfo, useFormFields } from '@payloadcms/ui'
import { useState } from 'react'

type Props = {
  path?: string
}

const ClientProposalPresentationLink = ({ path }: Props) => {
  // path is like "presentations.0.linkPreview" — sibling deckSlug is at "presentations.0.deckSlug"
  const siblingDeckSlugPath = path ? path.replace(/\.linkPreview$/, '.deckSlug') : ''

  const deckSlug = useFormFields(([fields]) => {
    if (!siblingDeckSlugPath) return ''
    const v = fields?.[siblingDeckSlugPath]?.value
    return typeof v === 'string' ? v : ''
  })

  const proposalSlug = useFormFields(([fields]) => {
    const v = fields?.slug?.value
    return typeof v === 'string' ? v : ''
  })

  const { id } = useDocumentInfo()
  const [copied, setCopied] = useState(false)

  if (!id || !proposalSlug || !deckSlug) {
    return (
      <div
        style={{
          marginTop: 6,
          fontSize: 12,
          color: 'var(--theme-elevation-500, #888)',
          fontStyle: 'italic',
        }}
      >
        Set proposal slug and deck slug to see the live URL.
      </div>
    )
  }

  const relativeUrl = `/partners/${proposalSlug}/${deckSlug}/`
  const PUBLIC_HOST = 'https://cms.optimisedigital.online'
  const absoluteUrl = `${PUBLIC_HOST}${relativeUrl}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(absoluteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  return (
    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
      <a
        href={absoluteUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--theme-success-500, #2e8b57)',
          textDecoration: 'none',
        }}
      >
        Open deck →
      </a>
      <span
        style={{
          fontSize: 12,
          color: 'var(--theme-elevation-500, #888)',
          fontFamily: 'var(--font-mono, monospace)',
        }}
      >
        {absoluteUrl}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        style={{
          fontSize: 12,
          padding: '3px 8px',
          borderRadius: 4,
          border: '1px solid var(--theme-elevation-250, #ccc)',
          background: 'var(--theme-elevation-50, #fff)',
          color: 'var(--theme-elevation-800, #333)',
          cursor: 'pointer',
        }}
      >
        {copied ? 'Copied!' : 'Copy URL'}
      </button>
    </div>
  )
}

export default ClientProposalPresentationLink
