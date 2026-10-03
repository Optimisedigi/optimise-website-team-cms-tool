'use client'

/**
 * Checkbox field shown as a labelled switch row (design handoff Identity
 * toggle box): bold label + description on the left, 36×20 switch on the
 * right. Reads/writes the same checkbox form state as Payload's default field.
 */

import { FieldError, useField } from '@payloadcms/ui'
import type { CheckboxFieldClientComponent } from 'payload'
import { useId, type ReactNode } from 'react'

export function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onToggle,
  error,
}: {
  label: string
  description?: string
  checked: boolean
  disabled?: boolean
  onToggle: () => void
  error?: ReactNode
}): ReactNode {
  const labelId = useId()
  const descId = useId()
  return (
    <div className="od-biz-toggle-row">
      <div className="od-biz-toggle-row__text">
        <span id={labelId} className="od-biz-toggle-row__label">
          {label}
        </span>
        {description && (
          <span id={descId} className="od-biz-toggle-row__desc">
            {description}
          </span>
        )}
        {error}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={description ? descId : undefined}
        className="od-biz-switch"
        disabled={disabled}
        onClick={onToggle}
      />
    </div>
  )
}

const ToggleRowField: CheckboxFieldClientComponent = (props): ReactNode => {
  const { field, path: pathFromProps, readOnly } = props
  const { path, setValue, showError, value } = useField<boolean>({
    path: pathFromProps ?? field.name,
  })
  const label = typeof field.label === 'string' ? field.label : field.name
  const description =
    typeof field.admin?.description === 'string' ? field.admin.description : undefined

  return (
    <div className="field-type checkbox od-biz-toggle-field">
      <ToggleRow
        label={label}
        description={description}
        checked={Boolean(value)}
        disabled={Boolean(readOnly)}
        onToggle={() => setValue(!value)}
        error={<FieldError path={path} showError={showError} />}
      />
    </div>
  )
}

export default ToggleRowField
