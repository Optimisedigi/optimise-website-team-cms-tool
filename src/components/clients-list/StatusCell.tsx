'use client'

import type { DefaultCellComponentProps } from 'payload'

/**
 * "Status" column cell for the Clients list view.
 *
 * Clients only have an `isActive` boolean — prospect state lives in the
 * proposals/sales-leads flow — so this renders an honest two-state pill
 * (Active / Inactive) rather than the prototype's invented three-state.
 */
function StatusCell({ cellData, rowData }: DefaultCellComponentProps) {
  const isActive = cellData ?? rowData?.isActive
  const active = Boolean(isActive)

  return (
    <span className={`od-pill ${active ? 'od-pill--green' : 'od-pill--gray'}`}>
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

export default StatusCell
