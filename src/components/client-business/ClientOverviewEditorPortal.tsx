'use client'

/**
 * Hosts the `clientOverview` rich-text field for the header popover.
 *
 * Custom `Field` for an UNNAMED group wrapping `clientOverview`. Payload renders
 * the real Lexical field here (same path, same form state); this component
 * portals it into the header popover's editor slot while the popover is in
 * edit mode, and keeps it mounted off-screen otherwise so the value still
 * submits with the form.
 */

import { RenderFields } from '@payloadcms/ui'
import type { GroupFieldClientComponent } from 'payload'
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { OVERVIEW_EDITOR_SLOT_ID } from './ClientOverviewPill'

function useSlot(id: string): HTMLElement | null {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const sync = (): void => {
      const next = document.getElementById(id)
      setSlot((prev) => (prev === next ? prev : next))
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [id])
  return slot
}

const ClientOverviewEditorPortal: GroupFieldClientComponent = (props): ReactNode => {
  const { field, indexPath, parentPath, parentSchemaPath, permissions, readOnly } = props
  const slot = useSlot(OVERVIEW_EDITOR_SLOT_ID)

  const fields = (
    <RenderFields
      fields={field.fields}
      margins="small"
      parentIndexPath={indexPath ?? ''}
      parentPath={parentPath ?? ''}
      parentSchemaPath={parentSchemaPath ?? ''}
      // Pass through as Payload's own unnamed group does: undefined hides
      // fields, so never widen it to `true`.
      permissions={permissions as NonNullable<typeof permissions>}
      readOnly={readOnly}
    />
  )

  if (slot) return createPortal(fields, slot)
  return (
    <div className="od-overview-host" aria-hidden inert>
      {fields}
    </div>
  )
}

export default ClientOverviewEditorPortal
