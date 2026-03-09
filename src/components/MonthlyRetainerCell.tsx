'use client'

import type { DefaultCellComponentProps } from 'payload'

/**
 * Custom cell for the Monthly Retainer column in the clients list view.
 * Shows "Agency" for the agency row, formatted $ amount for clients, or "--" if not set.
 */
function MonthlyRetainerCell({ cellData, rowData }: DefaultCellComponentProps) {
  if (rowData?.isAgency) {
    return (
      <span style={{ fontWeight: 600, color: 'var(--theme-elevation-500)', fontStyle: 'italic' }}>
        Agency
      </span>
    )
  }

  const amount = Number(cellData) || 0

  if (amount === 0) return <span style={{ color: 'var(--theme-elevation-400)' }}>--</span>

  return (
    <span>
      ${amount.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
    </span>
  )
}

export default MonthlyRetainerCell
