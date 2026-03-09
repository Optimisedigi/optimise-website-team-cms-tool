'use client'

import type { DefaultCellComponentProps } from 'payload'

/**
 * Custom cell for the Billing Summary column in the clients list view.
 * The value is computed server-side via the afterRead hook on the Clients collection.
 * It represents total revenue to date: retainer revenue + historical revenue + one-off projects.
 */
function BillingSummaryCell({ cellData, rowData }: DefaultCellComponentProps) {
  if (rowData?.isAgency) {
    return (
      <span style={{ fontWeight: 600, color: 'var(--theme-elevation-500)', fontStyle: 'italic' }}>
        Agency
      </span>
    )
  }

  const total = Number(cellData) || 0

  if (total === 0) return <span style={{ color: 'var(--theme-elevation-400)' }}>--</span>

  return (
    <span style={{ fontWeight: 600, color: '#6366f1' }}>
      ${total.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
    </span>
  )
}

export default BillingSummaryCell
