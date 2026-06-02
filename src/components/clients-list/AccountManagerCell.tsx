'use client'

import type { DefaultCellComponentProps } from 'payload'

type AccountManager = {
  name?: string | null
  email?: string | null
}

/**
 * "Account Mgr" column cell for the Clients list view.
 * Shows the first account manager's name (or email), with a "+N" suffix when
 * more than one is assigned. Renders "—" when none are set.
 *
 * `cellData` is the `accountManagers` array.
 */
function AccountManagerCell({ cellData }: DefaultCellComponentProps) {
  const managers: AccountManager[] = Array.isArray(cellData) ? cellData : []
  const first = managers[0]
  const label = (first?.name ?? first?.email ?? '').trim()

  if (!label) return <span className="od-cell-muted">—</span>

  const extra = managers.length - 1

  return (
    <span className="od-cell-mgr">
      <span>{label}</span>
      {extra > 0 ? <span className="od-cell-mgr__more">+{extra}</span> : null}
    </span>
  )
}

export default AccountManagerCell
