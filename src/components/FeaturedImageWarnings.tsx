'use client'

import { useFormFields } from '@payloadcms/ui'
import React, { useEffect, useState } from 'react'

import { formatKb, MAX_WEB_IMAGE_BYTES, type MediaInfo, oversizeImageWarning, readMediaInfo } from '../lib/web-image-warnings'
import { ImageWarningBox } from './ImageWarningBox'

type Lookup = { id: string; info: MediaInfo | null; failed: boolean }

function mediaIdOf(value: unknown): string | null {
  const raw = value && typeof value === 'object' && 'id' in value ? value.id : value
  if (typeof raw === 'number' && Number.isSafeInteger(raw) && raw > 0) return String(raw)
  if (typeof raw === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(raw)) return raw
  return null
}

/** Editor-facing warnings for the featured image; empty when there is nothing to fix. */
export function featuredImageWarnings(args: { hasImage: boolean; info: MediaInfo | null; alt: unknown }): string[] {
  if (!args.hasImage) return []
  const warnings: string[] = []
  const oversize = oversizeImageWarning('This image', args.info)
  if (oversize) warnings.push(oversize)
  if (typeof args.alt !== 'string' || !args.alt.trim()) {
    warnings.push('No alt text. Describe the image in Featured Image Alt below for accessibility and SEO.')
  }
  return warnings
}

export default function FeaturedImageWarnings(): React.ReactElement | null {
  const image = useFormFields(([fields]) => fields.featuredImage?.value)
  const alt = useFormFields(([fields]) => fields.featuredImageAlt?.value)
  const id = mediaIdOf(image)
  const inline = readMediaInfo(image)
  const [lookup, setLookup] = useState<Lookup | null>(null)

  useEffect(() => {
    if (!id || inline) return
    const controller = new AbortController()
    fetch(`/api/media/${encodeURIComponent(id)}?depth=0`, { credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Media lookup failed (${response.status})`)
        setLookup({ id, info: readMediaInfo(await response.json()), failed: false })
      })
      .catch(() => {
        if (!controller.signal.aborted) setLookup({ id, info: null, failed: true })
      })
    return () => controller.abort()
  }, [id, inline])

  const current = lookup?.id === id ? lookup : null
  const warnings = featuredImageWarnings({ hasImage: Boolean(id), info: inline ?? current?.info ?? null, alt })
  const notes = id && !inline && current?.failed ? [`Could not check this image's file size. Make sure it is under ${formatKb(MAX_WEB_IMAGE_BYTES)}.`] : []
  return <ImageWarningBox warnings={warnings} notes={notes} />
}
