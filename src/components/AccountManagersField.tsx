'use client'

/**
 * Custom Field for the `accountManagers` array on the Clients collection.
 *
 * Replaces the default name/email row entry with a CMS-user dropdown backed by
 * `/api/users/managers`. Picking a user fills both `name` and `email`; users can
 * also type a name/email that is not in the list (manual fallback).
 * `name` and `email` stay populated per row so downstream notifications keep
 * working.
 *
 * Built on Payload's form helpers (useAllFormFields / useForm) the same way
 * ProcessTemplateWorksheet drives an array field, so add/remove/save all flow
 * through normal form state.
 */
import { useAllFormFields, useForm } from '@payloadcms/ui'
import { useCallback, useEffect, useMemo, useState } from 'react'

export type ManagerOption = {
  name: string
  email: string
}

type RowData = {
  name: string
  email: string
}

/** Pull the flat `accountManagers.N.{name,email}` form state into rows. */
function extractRows(fields: Record<string, { value?: unknown }>, basePath: string): RowData[] {
  const rows: RowData[] = []
  let i = 0
  while (true) {
    const hasRow =
      fields[`${basePath}.${i}.name`] !== undefined ||
      fields[`${basePath}.${i}.email`] !== undefined ||
      fields[`${basePath}.${i}.id`] !== undefined
    if (!hasRow) break
    rows.push({
      name: String(fields[`${basePath}.${i}.name`]?.value ?? ''),
      email: String(fields[`${basePath}.${i}.email`]?.value ?? ''),
    })
    i++
  }
  return rows
}

export function managerInitials(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return (email[0] ?? '?').toUpperCase()
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}

function AccountManagersField(props: {
  path?: string
  schemaPath?: string
  field?: { label?: unknown; admin?: { description?: string } }
}): React.ReactElement {
  const path = props?.path || 'accountManagers'
  const schemaPath = props?.schemaPath || 'accountManagers'
  const [fields, dispatchFields] = useAllFormFields()
  const { addFieldRow, removeFieldRow } = useForm()

  const [managers, setManagers] = useState<ManagerOption[]>([])
  // Row currently open in the picker (freshly added rows open automatically).
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/users/managers')
      .then((res) => res.json())
      .then((data: { managers?: ManagerOption[] }) => {
        if (active && Array.isArray(data?.managers)) setManagers(data.managers)
      })
      .catch(() => {
        if (active) setManagers([])
      })
    return () => {
      active = false
    }
  }, [])

  const rows = useMemo(() => extractRows(fields, path), [fields, path])

  const updateField = useCallback(
    (subPath: string, value: string) => {
      dispatchFields({ type: 'UPDATE', path: subPath, value })
    },
    [dispatchFields],
  )

  const handleNameChange = useCallback(
    (index: number, name: string) => {
      updateField(`${path}.${index}.name`, name)
      // Picking (or typing) a name that matches a known manager auto-fills the
      // email — that is the "select one fills both" behaviour.
      const match = managers.find((m) => m.name && m.name === name)
      if (match) updateField(`${path}.${index}.email`, match.email)
    },
    [managers, path, updateField],
  )

  const handleEmailChange = useCallback(
    (index: number, email: string) => {
      updateField(`${path}.${index}.email`, email)
    },
    [path, updateField],
  )

  const handleUserSelect = useCallback(
    (index: number, email: string) => {
      if (!email) return
      const match = managers.find((m) => m.email === email)
      if (!match) return
      updateField(`${path}.${index}.name`, match.name)
      updateField(`${path}.${index}.email`, match.email)
    },
    [managers, path, updateField],
  )

  const handleAdd = useCallback(() => {
    addFieldRow({ path, schemaPath, rowIndex: rows.length })
    setEditingIndex(rows.length)
  }, [addFieldRow, path, schemaPath, rows.length])

  const handleRemove = useCallback(
    (index: number) => {
      removeFieldRow({ path, rowIndex: index })
      setEditingIndex(null)
    },
    [removeFieldRow, path],
  )

  const label =
    typeof props?.field?.label === 'string' ? props.field.label : 'Account Managers'
  // Optional hint from the schema; the Business tab design shows none.
  const description = props?.field?.admin?.description

  return (
    <div className="field-type od-biz-managers">
      <h3 className="od-biz-eyebrow">Account managers</h3>
      {/* Field label kept for screen readers. */}
      <span className="od-biz-sr-only">{label}</span>

      <div className="od-biz-managers__list">
        {rows.map((row, index) => {
          const displayName = row.name || row.email || 'New manager'
          const isEditing = editingIndex === index || (!row.name && !row.email)
          if (isEditing) {
            return (
              <div className="od-biz-panel od-biz-managers__picker" key={index}>
                <select
                  aria-label="Select CMS user as account manager"
                  className="od-biz-select"
                  value={managers.some((m) => m.email === row.email) ? row.email : ''}
                  onChange={(e) => handleUserSelect(index, e.target.value)}
                >
                  <option value="">Choose CMS user…</option>
                  {managers.map((m) => (
                    <option key={m.email} value={m.email}>
                      {m.name} ({m.email})
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  className="od-biz-input"
                  aria-label="Account manager name"
                  placeholder="Or type a name…"
                  value={row.name}
                  onChange={(e) => handleNameChange(index, e.target.value)}
                />
                <input
                  type="email"
                  className="od-biz-input"
                  aria-label="Account manager email"
                  placeholder="email@example.com"
                  value={row.email}
                  onChange={(e) => handleEmailChange(index, e.target.value)}
                />
                <button
                  type="button"
                  className="od-biz-btn od-biz-btn--sm od-biz-btn--primary"
                  onClick={() => setEditingIndex(null)}
                >
                  Done
                </button>
                <button
                  type="button"
                  className="od-biz-remove"
                  onClick={() => handleRemove(index)}
                  aria-label={`Remove ${row.name || 'account manager'}`}
                  title="Remove"
                >
                  ×
                </button>
              </div>
            )
          }
          return (
            <span className="od-biz-manager-chip" key={index} data-testid="manager-chip">
              <button
                type="button"
                className="od-biz-manager-chip__main"
                aria-label={`Edit ${displayName}`}
                onClick={() => setEditingIndex(index)}
              >
                <span className="od-biz-manager-chip__avatar" aria-hidden="true">
                  {managerInitials(row.name, row.email)}
                </span>
                <span className="od-biz-manager-chip__name">{displayName}</span>
                {row.email && <span className="od-biz-manager-chip__email">{row.email}</span>}
              </button>
              <button
                type="button"
                className="od-biz-remove"
                onClick={() => handleRemove(index)}
                aria-label={`Remove ${displayName}`}
                title="Remove"
              >
                ×
              </button>
            </span>
          )
        })}

        <button
          type="button"
          className="od-biz-add-dashed od-biz-managers__add"
          onClick={handleAdd}
        >
          + Add manager
        </button>
      </div>
      {description && <p className="od-biz-hint">{description}</p>}
    </div>
  )
}

export default AccountManagersField
