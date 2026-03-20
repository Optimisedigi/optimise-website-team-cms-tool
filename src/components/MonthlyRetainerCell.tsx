'use client'

import type { DefaultCellComponentProps } from 'payload'

/**
 * Custom cell for the Monthly Retainer column in the clients list view.
 * Shows "Agency" badge when isAgency is true, otherwise shows the dollar amount.
 */
function MonthlyRetainerCell({ cellData, rowData }: DefaultCellComponentProps) {
  if (rowData?.isAgency) {
    return (
      <span style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        background: '#dbeafe',
        color: '#1d4ed8',
      }}>
        Agency
      </span>
    )
  }

  const amount = Number(cellData) || 0

  if (amount === 0) return <span style={{ color: 'var(--theme-elevation-400)' }}>--</span>

  return (
    <span style={{ fontWeight: 600 }}>
      ${amount.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
    </span>
  )
}

export default MonthlyRetainerCell
