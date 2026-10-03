'use client'

import { useField } from '@payloadcms/ui'
import type { NumberFieldClientProps, NumberFieldValidation, Validate } from 'payload'
import { useCallback } from 'react'
import type React from 'react'
import { staticLabel } from './options'

const FALLBACK_LABELS: Record<string, string> = {
  neglectWarningDays: 'Neglect warning',
  neglectCriticalDays: 'Neglect critical',
}

/** `clientPulse.neglectWarningDays` / `neglectCriticalDays` with a "days" suffix. */
export default function NeglectDaysField(props: NumberFieldClientProps): React.ReactElement {
  const path = props.path || `clientPulse.${props.field?.name ?? 'neglectWarningDays'}`
  const readOnly = Boolean(props.readOnly || props.field?.admin?.readOnly)
  const fieldValidate = props.validate
  const min = typeof props.field?.min === 'number' ? props.field.min : 0
  const max = typeof props.field?.max === 'number' ? props.field.max : undefined
  // Same shape as Payload's NumberField: bind min/max/required into the validator.
  const memoizedValidate = useCallback<Validate>(
    (value, options) =>
      typeof fieldValidate === 'function'
        ? fieldValidate(value as number | number[] | null | undefined, {
            ...(options as Parameters<NumberFieldValidation>[1]),
            max,
            min: props.field?.min,
            required: props.field?.required,
          })
        : true,
    [fieldValidate, max, props.field?.min, props.field?.required],
  )
  const { value, setValue, showError, errorMessage } = useField<number | null>({
    path,
    validate: memoizedValidate,
  })
  const name = props.field?.name ?? path.split('.').pop() ?? ''
  const label = staticLabel(props.field?.label, FALLBACK_LABELS[name] ?? 'Days')
  const inputId = `field-${path.replace(/\./g, '__')}`
  const errorId = `${inputId}-error`

  return (
    <div className="od-biz-field od-biz-neglect">
      <label className="od-biz-label" htmlFor={inputId}>
        {label}
      </label>
      <div className="od-biz-affix">
        <input
          id={inputId}
          name={path}
          type="number"
          inputMode="numeric"
          className="od-biz-input od-biz-num od-biz-input--suffix"
          min={min}
          max={max}
          step={1}
          value={typeof value === 'number' && Number.isFinite(value) ? value : ''}
          readOnly={readOnly}
          aria-invalid={showError || undefined}
          aria-describedby={showError ? errorId : undefined}
          onChange={(event) => {
            const raw = event.target.value
            if (raw === '') return setValue(null)
            const parsed = Number(raw)
            if (Number.isFinite(parsed)) setValue(parsed)
          }}
        />
        <span className="od-biz-affix__text od-biz-affix__text--end" aria-hidden="true">
          days
        </span>
      </div>
      {showError && errorMessage ? (
        <p className="od-biz-error" id={errorId} role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  )
}
