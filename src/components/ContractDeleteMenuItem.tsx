'use client'

/**
 * Custom menu item for the contract edit view's three-dot menu.
 * Replaces the inline "Move to Trash" button \u2014 deleting a contract now
 * lives alongside Payload's native "Create New" / "Duplicate" actions,
 * gated by a two-step window.confirm dialog so it can't be triggered
 * accidentally.
 *
 * Hidden on trashed contracts (they already have Restore / Delete
 * Forever buttons in the red banner) and on template contracts (those
 * are intended to live indefinitely).
 */
import { useDocumentInfo, PopupList } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

function ContractDeleteMenuItem() {
  const { id } = useDocumentInfo()
  const [deletedAt, setDeletedAt] = useState<string | null | undefined>(undefined)
  const [isTemplate, setIsTemplate] = useState<boolean>(false)
  const [contractTitle, setContractTitle] = useState<string>('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    fetch(`/api/contracts/${id}?depth=0`)
      .then((r) => r.json())
      .then((doc) => {
        if (cancelled) return
        setDeletedAt(doc?.deletedAt ?? null)
        setIsTemplate(Boolean(doc?.isTemplate))
        setContractTitle(String(doc?.contractTitle ?? `#${id}`))
      })
      .catch(() => {
        if (!cancelled) setDeletedAt(null)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  // Don't render on trashed or template docs.
  if (!id || deletedAt === undefined) return null
  if (deletedAt) return null
  if (isTemplate) return null

  const handleClick = async () => {
    const ok = window.confirm(
      `Move \u201c${contractTitle}\u201d to trash?\n\nIt will be recoverable for 30 days, then permanently deleted.`,
    )
    if (!ok) return
    setBusy(true)
    try {
      const res = await fetch(`/api/contracts/${id}/trash`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to move to trash')
      window.location.reload()
    } catch (e: any) {
      window.alert(e?.message || 'Failed to move to trash')
      setBusy(false)
    }
  }

  return (
    <PopupList.Button onClick={handleClick} disabled={busy}>
      <span style={{ color: '#dc2626' }}>{busy ? 'Moving\u2026' : 'Delete'}</span>
    </PopupList.Button>
  )
}

export default ContractDeleteMenuItem
