'use client'

import { useAllFormFields, useForm } from '@payloadcms/ui'
import type { ArrayFieldClientProps, ClientField, Option } from 'payload'
import { useCallback, useMemo } from 'react'
import type React from 'react'
import { normalizeOptions } from './options'

type MetricRow = { metric: string; label: string; enabled: boolean }
type FormFieldMap = Record<string, { value?: unknown; rows?: unknown[] } | undefined>

function countRows(fields: FormFieldMap, path: string): number {
  const rows = fields[path]?.rows
  if (Array.isArray(rows)) return rows.length
  let i = 0
  while (
    fields[`${path}.${i}.id`] !== undefined ||
    fields[`${path}.${i}.metric`] !== undefined ||
    fields[`${path}.${i}.label`] !== undefined ||
    fields[`${path}.${i}.enabled`] !== undefined
  ) {
    i++
  }
  return i
}

function extractRows(fields: FormFieldMap, path: string): MetricRow[] {
  const count = countRows(fields, path)
  return Array.from({ length: count }, (_, i) => ({
    metric: String(fields[`${path}.${i}.metric`]?.value ?? ''),
    label: String(fields[`${path}.${i}.label`]?.value ?? ''),
    enabled: fields[`${path}.${i}.enabled`]?.value !== false,
  }))
}

function findSubFieldOptions(subFields: readonly ClientField[] | undefined, name: string): Option[] | undefined {
  const match = subFields?.find((f) => 'name' in f && f.name === name)
  return match && 'options' in match ? (match.options as Option[]) : undefined
}

/** `clientPulse.dashboardMetrics` as an ordered, reorderable list. */
export default function DashboardMetricsField(props: ArrayFieldClientProps): React.ReactElement {
  const path = props.path || 'clientPulse.dashboardMetrics'
  const schemaPath = props.schemaPath || path
  const readOnly = Boolean(props.readOnly || props.field?.admin?.readOnly)
  const [fields, dispatchFields] = useAllFormFields()
  const { addFieldRow, removeFieldRow, moveFieldRow } = useForm()
  const rows = useMemo(() => extractRows(fields as FormFieldMap, path), [fields, path])
  const metricOptions = normalizeOptions(findSubFieldOptions(props.field?.fields, 'metric'))
  const labelId = `${path.replace(/\./g, '-')}-label`

  const update = useCallback(
    (index: number, key: keyof MetricRow, value: string | boolean): void => {
      dispatchFields({ type: 'UPDATE', path: `${path}.${index}.${key}`, value })
    },
    [dispatchFields, path],
  )

  const move = (from: number, to: number): void => {
    if (readOnly || to < 0 || to >= rows.length) return
    moveFieldRow({ moveFromIndex: from, moveToIndex: to, path })
  }

  const metricLabel = (value: string): string =>
    metricOptions.find((o) => o.value === value)?.label ?? (value || 'metric')

  return (
    <div className="od-biz-field od-biz-metrics">
      <p className="od-biz-subhead" id={labelId}>
        Card metrics <small>· first three enabled rows show on the Pulse card, in order</small>
      </p>
      <div className="od-biz-metrics__box">
        {rows.length > 0 ? (
          <ol className="od-biz-metrics__list" aria-labelledby={labelId}>
            {rows.map((row, index) => {
              const name = metricLabel(row.metric)
              return (
                <li key={index} className="od-biz-metrics__row">
                  <span className="od-biz-metrics__index od-biz-num" aria-hidden="true">
                    {index + 1}
                  </span>
                  <select
                    className="od-biz-select"
                    aria-label={`Metric ${index + 1}`}
                    value={row.metric}
                    disabled={readOnly}
                    onChange={(event) => update(index, 'metric', event.target.value)}
                  >
                    {!row.metric && <option value="">Choose metric…</option>}
                    {metricOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    className="od-biz-input"
                    placeholder="Optional label"
                    aria-label={`Label for metric ${index + 1}`}
                    value={row.label}
                    readOnly={readOnly}
                    onChange={(event) => update(index, 'label', event.target.value)}
                  />
                  <span className="od-biz-metrics__state">
                    <button
                      type="button"
                      role="switch"
                      className="od-biz-switch"
                      aria-checked={row.enabled}
                      aria-label={`Show ${name} on the Pulse card`}
                      disabled={readOnly}
                      onClick={() => update(index, 'enabled', !row.enabled)}
                    />
                    <span aria-hidden="true">{row.enabled ? 'On' : 'Off'}</span>
                  </span>
                  <span className="od-biz-metrics__actions">
                    <button
                      type="button"
                      className="od-biz-metrics__move"
                      aria-label={`Move ${name} up`}
                      disabled={readOnly || index === 0}
                      onClick={() => move(index, index - 1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="od-biz-metrics__move"
                      aria-label={`Move ${name} down`}
                      disabled={readOnly || index === rows.length - 1}
                      onClick={() => move(index, index + 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="od-biz-remove"
                      aria-label={`Remove ${name}`}
                      disabled={readOnly}
                      onClick={() => removeFieldRow({ path, rowIndex: index })}
                    >
                      ×
                    </button>
                  </span>
                </li>
              )
            })}
          </ol>
        ) : null}
        {!readOnly && (
          <button
            type="button"
            className="od-biz-link od-biz-metrics__add"
            onClick={() => addFieldRow({ path, schemaPath, rowIndex: rows.length })}
          >
            + Add metric
          </button>
        )}
      </div>
    </div>
  )
}
