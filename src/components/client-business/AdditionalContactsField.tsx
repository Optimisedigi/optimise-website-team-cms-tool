'use client'

/**
 * Custom Field for the `additionalContacts` array on the Clients collection.
 * Card grid with inline edit, driven through Payload form state the same way
 * AccountManagersField does (useAllFormFields + addFieldRow/removeFieldRow).
 */
import { useAllFormFields, useForm } from '@payloadcms/ui'
import { useCallback, useId, useMemo, useState } from 'react'

type FieldState = { value?: unknown; errorMessage?: string; valid?: boolean }

export type ContactRow = {
  name: string
  jobTitle: string
  email: string
  phone: string
  responsibilities: string
}

const SUBS = ['name', 'jobTitle', 'email', 'phone', 'responsibilities'] as const
type Sub = (typeof SUBS)[number]

function extractRows(fields: Record<string, FieldState>, basePath: string): ContactRow[] {
  const rows: ContactRow[] = []
  let i = 0
  while (
    fields[`${basePath}.${i}.id`] !== undefined ||
    SUBS.some((s) => fields[`${basePath}.${i}.${s}`] !== undefined)
  ) {
    const get = (s: Sub): string => String(fields[`${basePath}.${i}.${s}`]?.value ?? '')
    rows.push({
      name: get('name'),
      jobTitle: get('jobTitle'),
      email: get('email'),
      phone: get('phone'),
      responsibilities: get('responsibilities'),
    })
    i++
  }
  return rows
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}

function AdditionalContactsField(props: {
  path?: string
  schemaPath?: string
  field?: { label?: unknown; admin?: { description?: string } }
}): React.ReactElement {
  const path = props?.path || 'additionalContacts'
  const schemaPath = props?.schemaPath || 'additionalContacts'
  const [fields, dispatchFields] = useAllFormFields()
  const { addFieldRow, removeFieldRow } = useForm()
  const [editing, setEditing] = useState<number | null>(null)
  const uid = useId()

  const typedFields = fields as Record<string, FieldState>
  const rows = useMemo(() => extractRows(typedFields, path), [typedFields, path])

  const update = useCallback(
    (index: number, sub: Sub, value: string) => {
      dispatchFields({ type: 'UPDATE', path: `${path}.${index}.${sub}`, value })
    },
    [dispatchFields, path],
  )

  const handleAdd = useCallback(() => {
    addFieldRow({ path, schemaPath, rowIndex: rows.length })
    setEditing(rows.length)
  }, [addFieldRow, path, schemaPath, rows.length])

  const handleRemove = useCallback(
    (index: number, name: string) => {
      if (!window.confirm(`Remove ${name || 'this contact'}?`)) return
      removeFieldRow({ path, rowIndex: index })
      setEditing(null)
    },
    [removeFieldRow, path],
  )

  const errorFor = (index: number, sub: Sub): string | undefined => {
    const f = typedFields[`${path}.${index}.${sub}`]
    return f && f.valid === false && f.errorMessage ? f.errorMessage : undefined
  }

  return (
    <div className="field-type od-biz-contacts">
      <h3 className="od-biz-eyebrow">Additional contacts</h3>
      <div className="od-biz-contacts__grid">
        {rows.map((row, index) => {
          const displayName = row.name || 'Unnamed contact'
          const isEditing = editing === index
          const idBase = `${uid}-c${index}`
          const emailError = errorFor(index, 'email')
          const nameError = errorFor(index, 'name')
          return (
            <div className="od-biz-contact" key={index} data-testid="contact-card">
              <div className="od-biz-contact__head">
                <span className="od-biz-contact__avatar" aria-hidden="true">
                  {initials(row.name)}
                </span>
                <div className="od-biz-contact__who">
                  <div className="od-biz-contact__name">{displayName}</div>
                  {row.jobTitle && <div className="od-biz-contact__title">{row.jobTitle}</div>}
                </div>
                {!isEditing && (
                  <button
                    type="button"
                    className="od-biz-link"
                    aria-label={`Edit ${displayName}`}
                    onClick={() => setEditing(index)}
                  >
                    Edit
                  </button>
                )}
              </div>

              {isEditing ? (
                <div className="od-biz-contact__form">
                  <div className="od-biz-contact__inputs">
                    {(
                      [
                        ['name', 'Name', 'text'],
                        ['jobTitle', 'Job title', 'text'],
                        ['email', 'Email', 'email'],
                        ['phone', 'Phone', 'tel'],
                      ] as const
                    ).map(([sub, label, type]) => {
                      const err = sub === 'email' ? emailError : sub === 'name' ? nameError : undefined
                      const id = `${idBase}-${sub}`
                      return (
                        <div key={sub}>
                          <label className="od-biz-label" htmlFor={id}>
                            {label}
                          </label>
                          <input
                            id={id}
                            type={type}
                            className="od-biz-input"
                            value={row[sub]}
                            aria-invalid={err ? true : undefined}
                            aria-describedby={err ? `${id}-err` : undefined}
                            onChange={(e) => update(index, sub, e.target.value)}
                          />
                          {err && (
                            <p className="od-biz-error" id={`${id}-err`} role="alert">
                              {err}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <div>
                    <label className="od-biz-label" htmlFor={`${idBase}-resp`}>
                      Responsibilities
                    </label>
                    <textarea
                      id={`${idBase}-resp`}
                      className="od-biz-textarea"
                      value={row.responsibilities}
                      onChange={(e) => update(index, 'responsibilities', e.target.value)}
                    />
                  </div>
                  <div className="od-biz-contact__actions">
                    <button
                      type="button"
                      className="od-biz-btn od-biz-btn--sm od-biz-btn--danger"
                      onClick={() => handleRemove(index, row.name)}
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      className="od-biz-btn od-biz-btn--sm od-biz-btn--primary"
                      onClick={() => setEditing(null)}
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {(row.email || row.phone) && (
                    <div className="od-biz-contact__meta">
                      {row.email && <a href={`mailto:${row.email}`}>{row.email}</a>}
                      {row.email && row.phone && <span aria-hidden="true"> · </span>}
                      {row.phone && <span>{row.phone}</span>}
                    </div>
                  )}
                  {emailError && <p className="od-biz-error">{emailError}</p>}
                  {row.responsibilities && (
                    <div className="od-biz-contact__resp">{row.responsibilities}</div>
                  )}
                </>
              )}
            </div>
          )
        })}
        <button type="button" className="od-biz-add-dashed od-biz-contacts__add" onClick={handleAdd}>
          + Add contact
        </button>
      </div>
    </div>
  )
}

export default AdditionalContactsField
