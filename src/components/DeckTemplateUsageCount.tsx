'use client'

import { useFormFields } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

const DeckTemplateUsageCount = () => {
  const slug = useFormFields(([fields]) => {
    const v = fields?.templateSlug?.value
    return typeof v === 'string' ? v : ''
  })

  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    if (!slug) {
      setCount(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(
          `/api/clients?where[presentations.templateSlug][equals]=${encodeURIComponent(slug)}&limit=0&depth=0`,
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
  }, [slug])

  if (!slug) return null

  return (
    <div style={{ marginBottom: '1rem', fontSize: 13, color: '#444' }}>
      <strong>Usage:</strong>{' '}
      {count === null ? '—' : `${count} client presentation${count === 1 ? '' : 's'}`}
    </div>
  )
}

export default DeckTemplateUsageCount
