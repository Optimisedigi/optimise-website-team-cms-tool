'use client'

import type { DefaultCellComponentProps } from 'payload'

/**
 * "PIN" column cell for the Clients list view — tabular-nums and letter-spaced
 * so the 4-digit codes line up vertically. Renders "—" when no PIN is set.
 */
function PinCell({ cellData }: DefaultCellComponentProps) {
  const pin = cellData == null ? '' : String(cellData).trim()

  if (!pin) return <span className="od-cell-muted">—</span>

  return <span className="od-cell-pin">{pin}</span>
}

export default PinCell
