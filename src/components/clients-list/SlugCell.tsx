'use client'

import type { DefaultCellComponentProps } from 'payload'

/**
 * "Slug" column cell for the Clients list view — monospace, muted, matching
 * the prototype's URL-identifier styling.
 */
function SlugCell({ cellData }: DefaultCellComponentProps) {
  const slug = typeof cellData === 'string' ? cellData.trim() : ''

  if (!slug) return <span className="od-cell-muted">—</span>

  return <span className="od-cell-slug">{slug}</span>
}

export default SlugCell
