'use client'

/**
 * Custom Field for the `accountManagers` array on the Clients collection.
 *
 * Replaces the default name/email row entry with a creatable combobox of
 * eligible manager users (role admin/manager, fetched from
 * `/api/users/managers`). Picking a manager fills both `name` and `email`;
 * users can also type a name/email that is not in the list (manual fallback).
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

const DATALIST_ID = 'od-account-managers-options'

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

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 13,
  border: '1px solid var(--theme-elevation-150, #ccc)',
  borderRadius: 4,
  background: 'var(--theme-input-bg, #fff)',
  color: 'var(--theme-text, #333)',
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

  const handleAdd = useCallback(() => {
    addFieldRow({ path, schemaPath, rowIndex: rows.length })
  }, [addFieldRow, path, schemaPath, rows.length])

  const handleRemove = useCallback(
    (index: number) => {
      removeFieldRow({ path, rowIndex: index })
    },
    [removeFieldRow, path],
  )

  const label =
    typeof props?.field?.label === 'string' ? props.field.label : 'Account Managers'
  const description =
    props?.field?.admin?.description ||
    'Team members managing this client. They receive notifications for ad copy approvals, audits, etc.'

  return (
    <div className="field-type" style={{ marginBottom: 20 }}>
      <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>{label}</label>
      <p style={{ color: '#888', fontSize: 12, marginTop: 0, marginBottom: 10 }}>{description}</p>

      <datalist id={DATALIST_ID}>
        {managers.map((m) => (
          <option key={m.email} value={m.name}>
            {m.email}
          </option>
        ))}
      </datalist>

      {rows.length === 0 && (
        <p style={{ color: '#888', fontSize: 13, marginBottom: 10 }}>
          No account managers assigned yet.
        </p>
      )}

      {rows.map((row, index) => (
        <div
          key={index}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 36px',
            gap: 8,
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          <input
            type="text"
            list={DATALIST_ID}
            placeholder="Select or type a name…"
            value={row.name}
            onChange={(e) => handleNameChange(index, e.target.value)}
            style={inputStyle}
          />
          <input
            type="email"
            placeholder="email@example.com"
            value={row.email}
            onChange={(e) => handleEmailChange(index, e.target.value)}
            style={inputStyle}
          />
          <button
            type="button"
            onClick={() => handleRemove(index)}
            aria-label="Remove account manager"
            title="Remove"
            style={{
              border: '1px solid var(--theme-elevation-150, #ccc)',
              background: 'var(--theme-input-bg, #fff)',
              color: '#b91c1c',
              borderRadius: 4,
              height: 34,
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={handleAdd}
        style={{
          marginTop: 4,
          padding: '7px 14px',
          fontSize: 13,
          fontWeight: 600,
          border: '1px solid var(--theme-elevation-150, #ccc)',
          background: 'var(--theme-elevation-50, #f3f4f6)',
          color: 'var(--theme-text, #333)',
          borderRadius: 4,
          cursor: 'pointer',
        }}
      >
        + Add account manager
      </button>
    </div>
  )
}

export default AccountManagersField
