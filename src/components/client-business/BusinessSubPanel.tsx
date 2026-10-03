'use client'

/**
 * One sub-tab panel inside a Business tab section (e.g. Billing → Projects).
 * Custom `Field` for an UNNAMED group: it renders the group's children with
 * Payload's own `RenderFields` (same paths, no data change) and hides itself
 * unless it is the active panel of the enclosing `BusinessSection`.
 * Hidden panels stay mounted so their form state and validation still apply.
 */

import { RenderFields } from '@payloadcms/ui'
import type { GroupFieldClientComponent } from 'payload'
import { useContext, type ReactNode } from 'react'
import { BusinessPanelContext } from './business-panel-context'

type PanelConfig = { id: string; label: string; countPath?: string }

function panelConfigOf(field: unknown): PanelConfig | undefined {
  const admin = (field as { admin?: { custom?: Record<string, unknown> } }).admin
  const value = admin?.custom?.odPanel
  return value && typeof value === 'object' ? (value as PanelConfig) : undefined
}

const BusinessSubPanel: GroupFieldClientComponent = (props): ReactNode => {
  const { field, indexPath, parentPath, parentSchemaPath, permissions, readOnly } = props
  const panelState = useContext(BusinessPanelContext)
  const config = panelConfigOf(field)
  const id = config?.id ?? 'panel'
  const active = !panelState || panelState.activeId === id
  const prefix = panelState?.idPrefix ?? 'od-biz'

  return (
    <div
      role="tabpanel"
      id={`${prefix}-panel-${id}`}
      aria-labelledby={`${prefix}-tab-${id}`}
      className={`od-biz-subpanel od-biz-subpanel--${id}`}
      hidden={!active}
    >
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
    </div>
  )
}

export default BusinessSubPanel
