'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

const DeckTemplateUsageCount = () => {
  // On a client's `presentations` array, `templateSlug` is a *relationship* to
  // deck-templates — it stores this record's numeric id, NOT the slug string.
  // So count usage by the deck-template's own document id, not by its slug.
  const { id } = useDocumentInfo()

  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    // No id yet (new, unsaved template) → nothing to count.
    if (id === undefined || id === null || id === '') {
      setCount(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(
          `/api/clients?where[presentations.templateSlug][equals]=${encodeURIComponent(String(id))}&limit=0&depth=0`,
        )
        if (!res.ok) throw new Error(`status ${res.status}`)
        const json = (await res.json()) as { totalDocs?: number }
        if (!cancelled) setCount(json.totalDocs ?? 0)
      } catch {
        if (!cancelled) setCount(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  if (id === undefined || id === null || id === '') return null

  return (
    <div style={{ marginBottom: '1rem', fontSize: 13, color: '#444' }}>
      <strong>Usage:</strong>{' '}
      {count === null ? '—' : `${count} client presentation${count === 1 ? '' : 's'}`}
    </div>
  )
}

export default DeckTemplateUsageCount
