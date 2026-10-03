'use client'

import { useField } from '@payloadcms/ui'
import type { SelectFieldClientProps } from 'payload'
import type React from 'react'
import { normalizeOptions, staticLabel } from './options'

/** `clientPulse.servicesTracked` (hasMany select) as toggle chips. */
export default function ServicesTrackedField(props: SelectFieldClientProps): React.ReactElement {
  const path = props.path || 'clientPulse.servicesTracked'
  const readOnly = Boolean(props.readOnly || props.field?.admin?.readOnly)
  const { value, setValue } = useField<string[] | string | null>({ path })
  const options = normalizeOptions(props.field?.options)
  const label = staticLabel(props.field?.label, 'Services tracked')
  const labelId = `${path.replace(/\./g, '-')}-label`
  const selected = Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : []

  const toggle = (optionValue: string): void => {
    if (readOnly) return
    const next = selected.includes(optionValue)
      ? selected.filter((v) => v !== optionValue)
      : // keep config order so saved values are stable
        options.map((o) => o.value).filter((v) => v === optionValue || selected.includes(v))
    setValue(next)
  }

  return (
    <div className="od-biz-field od-biz-services">
      <span className="od-biz-label" id={labelId}>
        {label}
      </span>
      <div className="od-biz-chips" role="group" aria-labelledby={labelId}>
        {options.map((option) => {
          const on = selected.includes(option.value)
          return (
            <button
              key={option.value}
              type="button"
              className={`od-biz-chip${on ? ' is-on' : ''}`}
              aria-pressed={on}
              disabled={readOnly}
              onClick={() => toggle(option.value)}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
