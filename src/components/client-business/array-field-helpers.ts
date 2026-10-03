'use client'

/**
 * Shared helpers for the Business-tab billing array fields (one-off projects,
 * referral commissions, historical revenue, yearly targets). Read/write
 * Payload's flat form state (`${path}.${i}.${sub}`) the same way
 * AccountManagersField does.
 */
import { useAllFormFields, useForm } from '@payloadcms/ui'
import { useCallback, useMemo } from 'react'

export type ArrayFieldProps = {
  path?: string
  schemaPath?: string
  field?: { label?: unknown; admin?: { description?: unknown } }
}

type FormFieldState = { value?: unknown; errorMessage?: string; valid?: boolean }
export type FlatFields = Record<string, FormFieldState | undefined>

export type ArrayRow = {
  index: number
  values: Record<string, unknown>
  errors: Record<string, string | undefined>
}

/** Collect rows `${base}.N.*` until a row index has no keys at all. */
export function extractArrayRows(fields: FlatFields, basePath: string, subFields: string[]): ArrayRow[] {
  const rows: ArrayRow[] = []
  for (let i = 0; ; i++) {
    const prefix = `${basePath}.${i}.`
    const present =
      fields[`${prefix}id`] !== undefined || subFields.some((s) => fields[`${prefix}${s}`] !== undefined)
    if (!present) break
    const values: Record<string, unknown> = {}
    const errors: Record<string, string | undefined> = {}
    for (const s of subFields) {
      const f = fields[`${prefix}${s}`]
      values[s] = f?.value
      errors[s] = f && f.valid === false ? f.errorMessage || 'Invalid value' : undefined
    }
    rows.push({ index: i, values, errors })
  }
  return rows
}

export type ArrayFieldApi = {
  path: string
  rows: ArrayRow[]
  fields: FlatFields
  arrayError: string | undefined
  update: (index: number, sub: string, value: unknown) => void
  add: () => void
  remove: (index: number) => void
}

export function useArrayField(props: ArrayFieldProps | undefined, defaultPath: string, subFields: string[]): ArrayFieldApi {
  const path = props?.path || defaultPath
  const schemaPath = props?.schemaPath || defaultPath
  const [rawFields, dispatchFields] = useAllFormFields()
  const fields = rawFields as unknown as FlatFields
  const { addFieldRow, removeFieldRow } = useForm()
  const key = subFields.join('|')
  const rows = useMemo(() => extractArrayRows(fields, path, key.split('|')), [fields, path, key])
  const own = fields[path]
  const arrayError = own && own.valid === false ? own.errorMessage : undefined

  const update = useCallback(
    (index: number, sub: string, value: unknown) => {
      dispatchFields({ type: 'UPDATE', path: `${path}.${index}.${sub}`, value })
    },
    [dispatchFields, path],
  )
  const add = useCallback(() => {
    addFieldRow({ path, schemaPath, rowIndex: rows.length })
  }, [addFieldRow, path, schemaPath, rows.length])
  const remove = useCallback(
    (index: number) => {
      removeFieldRow({ path, rowIndex: index })
    },
    [removeFieldRow, path],
  )
  return { path, rows, fields, arrayError, update, add, remove }
}

/** AUD, no cents when whole. */
export function formatMoney(value: number): string {
  const whole = Math.round(value * 100) % 100 === 0
  return value.toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })
}

export function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** Value for <input type=number>: '' for empty. */
export function numberInputValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  const n = Number(value)
  return Number.isFinite(n) ? String(n) : ''
}

/** Parse <input type=number> text back into form state (null when cleared). */
export function parseNumberInput(text: string): number | null {
  if (text.trim() === '') return null
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** ISO string → 'YYYY-MM-DD' (local) for <input type=date>. */
export function dateInputValue(value: unknown): string {
  const d = parseDate(value)
  if (!d) return ''
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 'YYYY-MM-DD' → ISO at 12:00 local (Payload DatePicker convention); null when cleared. */
export function dateInputToIso(text: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0).toISOString()
}

/** '14 Apr 2026' (en-AU). */
export function formatDisplayDate(value: unknown, withYear = true): string {
  const d = parseDate(value)
  if (!d) return ''
  return d.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  })
}
