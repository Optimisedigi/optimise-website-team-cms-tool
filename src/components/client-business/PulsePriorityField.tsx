'use client'

import { useField } from '@payloadcms/ui'
import type { SelectFieldClientProps } from 'payload'
import { useRef } from 'react'
import type React from 'react'
import { normalizeOptions, staticLabel } from './options'

const FALLBACK_OPTIONS = [
  { label: 'Watch', value: 'watch' },
  { label: 'Normal', value: 'normal' },
  { label: 'High', value: 'high' },
  { label: 'Critical', value: 'critical' },
]

/** `clientPulse.priority` as a 4-way segmented control (radiogroup). */
export default function PulsePriorityField(props: SelectFieldClientProps): React.ReactElement {
  const path = props.path || 'clientPulse.priority'
  const readOnly = Boolean(props.readOnly || props.field?.admin?.readOnly)
  const { value, setValue } = useField<string>({ path })
  const options = normalizeOptions(props.field?.options)
  const items = options.length ? options : FALLBACK_OPTIONS
  const label = staticLabel(props.field?.label, 'Priority')
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const labelId = `${path.replace(/\./g, '-')}-label`

  const selectedIndex = items.findIndex((item) => item.value === value)
  const focusIndex = selectedIndex >= 0 ? selectedIndex : 0

  const select = (index: number): void => {
    const item = items[index]
    if (!item || readOnly) return
    if (item.value !== value) setValue(item.value)
    refs.current[index]?.focus()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number): void => {
    let next: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % items.length
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = items.length - 1
    if (next === null) return
    event.preventDefault()
    select(next)
  }

  return (
    <div className="od-biz-field od-biz-priority">
      <span className="od-biz-label" id={labelId}>
        {label}
      </span>
      <div
        className="od-biz-segmented"
        role="radiogroup"
        aria-labelledby={labelId}
        aria-readonly={readOnly || undefined}
      >
        {items.map((item, index) => {
          const checked = item.value === value
          return (
            <button
              key={item.value}
              ref={(node) => {
                refs.current[index] = node
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={index === focusIndex ? 0 : -1}
              className={`od-biz-segmented__item${checked ? ' is-active' : ''}`}
              disabled={readOnly && !checked}
              onClick={() => select(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {item.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
