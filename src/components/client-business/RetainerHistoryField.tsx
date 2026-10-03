'use client'

import { useAllFormFields } from '@payloadcms/ui'
import type { ArrayFieldClientProps } from 'payload'
import { useMemo } from 'react'
import type React from 'react'

type FormFieldMap = Record<string, { value?: unknown; rows?: unknown[] } | undefined>

export type RetainerHistoryRow = {
  amount: number | null
  previousAmount: number | null
  effectiveDate: string
  changedBy: string
}

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

export function formatMoney(value: number | null): string {
  if (value === null) return '—'
  return `$${value.toLocaleString('en-AU', { maximumFractionDigits: 2 })}`
}

/** "14 Apr 2026" (Sydney). */
export function formatHistoryDate(value: unknown): string {
  if (typeof value !== 'string' || !value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('day')} ${get('month')} ${get('year')}`
}

function extractRows(fields: FormFieldMap, path: string): RetainerHistoryRow[] {
  const rows = fields[path]?.rows
  let count = Array.isArray(rows) ? rows.length : 0
  if (!Array.isArray(rows)) {
    while (
      fields[`${path}.${count}.id`] !== undefined ||
      fields[`${path}.${count}.amount`] !== undefined ||
      fields[`${path}.${count}.effectiveDate`] !== undefined
    ) {
      count++
    }
  }
  return Array.from({ length: count }, (_, i) => ({
    amount: num(fields[`${path}.${i}.amount`]?.value),
    previousAmount: num(fields[`${path}.${i}.previousAmount`]?.value),
    effectiveDate: String(fields[`${path}.${i}.effectiveDate`]?.value ?? ''),
    changedBy: String(fields[`${path}.${i}.changedBy`]?.value ?? ''),
  }))
}

/** Read-only `retainerHistory` log. */
export default function RetainerHistoryField(props: ArrayFieldClientProps): React.ReactElement {
  const path = props.path || 'retainerHistory'
  const [fields] = useAllFormFields()
  const rows = useMemo(() => extractRows(fields as FormFieldMap, path), [fields, path])
  const headingId = `${path.replace(/\./g, '-')}-label`

  return (
    <div className="od-biz-field od-biz-retainer">
      <p className="od-biz-subhead" id={headingId}>
        Retainer history
      </p>
      {rows.length === 0 ? (
        <p className="od-biz-empty">No retainer changes recorded yet.</p>
      ) : (
        <div className="od-biz-table-wrap">
          <table className="od-biz-table od-biz-retainer__table" aria-labelledby={headingId}>
            <thead className="od-biz-sr-only">
              <tr>
                <th scope="col">Change</th>
                <th scope="col">Date</th>
                <th scope="col">Changed by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  <td className="od-biz-retainer__change od-biz-num">
                    {row.previousAmount === null
                      ? formatMoney(row.amount)
                      : `${formatMoney(row.previousAmount)} → ${formatMoney(row.amount)}`}
                  </td>
                  <td className="od-biz-retainer__date">{formatHistoryDate(row.effectiveDate)}</td>
                  <td className="od-biz-retainer__by">{row.changedBy || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
