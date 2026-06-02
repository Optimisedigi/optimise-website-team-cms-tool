'use client'

import type { DefaultCellComponentProps } from 'payload'

/**
 * "Months Active" column cell for the Clients list view.
 * Renders the virtual `monthsActive` value (computed server-side in the Clients
 * afterRead hook from `clientStartDate`) as "N mo", right-aligned and muted.
 * Shows "— mo" when no start date is available.
 */
function MonthsActiveCell({ cellData }: DefaultCellComponentProps) {
  const months = typeof cellData === 'number' && Number.isFinite(cellData) ? cellData : null

  return (
    <span className="od-cell-months">{months == null ? '— mo' : `${months} mo`}</span>
  )
}

export default MonthsActiveCell
