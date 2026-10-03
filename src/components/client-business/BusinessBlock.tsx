'use client'

/**
 * Layout block inside a Business tab section (e.g. Billing → Retainer's
 * "Contract" and "Amounts" columns, the Identity toggle box). Custom `Field`
 * for an UNNAMED group: renders an optional subhead from the group label, then
 * the children through Payload's `RenderFields` with unchanged paths.
 * Variant comes from `admin.custom.odBlock` (used as a CSS modifier).
 */

import { RenderFields } from '@payloadcms/ui'
import type { GroupFieldClientComponent } from 'payload'
import type { ReactNode } from 'react'

function blockVariant(field: unknown): string {
  const admin = (field as { admin?: { custom?: Record<string, unknown> } }).admin
  const value = admin?.custom?.odBlock
  return typeof value === 'string' ? value : 'default'
}

const BusinessBlock: GroupFieldClientComponent = (props): ReactNode => {
  const { field, indexPath, parentPath, parentSchemaPath, permissions, readOnly } = props
  const label = typeof field.label === 'string' ? field.label : ''
  const variant = blockVariant(field)

  return (
    <div className={`od-biz-block od-biz-block--${variant}`}>
      {label && <h3 className="od-biz-subhead">{label}</h3>}
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

export default BusinessBlock
