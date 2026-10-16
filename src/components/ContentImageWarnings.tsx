'use client'

import { useFormFields } from '@payloadcms/ui'
import React, { useEffect, useMemo, useState } from 'react'

import { formatKb, MAX_WEB_IMAGE_BYTES, markdownImages, type MarkdownImage, type MediaInfo, oversizeImageWarning, readMediaInfo } from '../lib/web-image-warnings'
import { ImageWarningBox } from './ImageWarningBox'

const MAX_LOOKUPS = 50

type Lookup = { key: string; sizes: Map<string, MediaInfo>; failed: boolean }

/** Warnings and notes for every image written into the Markdown content. */
export function contentImageWarnings(images: MarkdownImage[], sizes: Map<string, MediaInfo>): { warnings: string[]; notes: string[] } {
  const warnings: string[] = []
  const notes: string[] = []
  for (const image of images) {
    const where = `Image on line ${image.line}${image.filename ? ` (${image.filename})` : ''}`
    const oversize = image.filename ? oversizeImageWarning(where, sizes.get(image.filename) ?? null) : null
    if (oversize) warnings.push(oversize)
    if (!image.alt.trim()) warnings.push(`${where} has no alt text. Describe it between the brackets: ![description](…).`)
    if (!image.filename) notes.push(`Image on line ${image.line} is not a CMS upload, so its file size can't be checked.`)
  }
  return { warnings, notes }
}

export default function ContentImageWarnings(): React.ReactElement | null {
  const markdown = useFormFields(([fields]) => fields.markdownContent?.value)
  const images = useMemo(() => (typeof markdown === 'string' ? markdownImages(markdown) : []), [markdown])
  // Refetch only when the set of uploaded images changes, not on every keystroke.
  const filenames = useMemo(
    () => [...new Set(images.flatMap((image) => (image.filename ? [image.filename] : [])))].sort().slice(0, MAX_LOOKUPS),
    [images],
  )
  const key = filenames.join('\n')
  const [lookup, setLookup] = useState<Lookup | null>(null)

  useEffect(() => {
    if (!key) return
    const names = key.split('\n')
    const params = new URLSearchParams({ depth: '0', limit: String(MAX_LOOKUPS), pagination: 'false' })
    names.forEach((name, index) => params.append(`where[filename][in][${index}]`, name))
    const controller = new AbortController()
    fetch(`/api/media?${params.toString()}`, { credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Media lookup failed (${response.status})`)
        const body = (await response.json()) as { docs?: unknown }
        const sizes = new Map<string, MediaInfo>()
        for (const doc of Array.isArray(body.docs) ? body.docs : []) {
          const info = readMediaInfo(doc)
          const filename = doc && typeof doc === 'object' && 'filename' in doc ? doc.filename : null
          if (info && typeof filename === 'string') sizes.set(filename, info)
        }
        setLookup({ key, sizes, failed: false })
      })
      .catch(() => {
        if (!controller.signal.aborted) setLookup({ key, sizes: new Map(), failed: true })
      })
    return () => controller.abort()
  }, [key])

  const current = lookup?.key === key ? lookup : null
  const { warnings, notes } = contentImageWarnings(images, current?.sizes ?? new Map())
  if (current?.failed) notes.push(`Could not check the content images' file sizes. Make sure each is under ${formatKb(MAX_WEB_IMAGE_BYTES)}.`)
  return <ImageWarningBox warnings={warnings} notes={notes} />
}
