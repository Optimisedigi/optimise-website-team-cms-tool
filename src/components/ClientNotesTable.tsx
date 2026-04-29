'use client'

/**
 * ClientNotesTable
 *
 * Spreadsheet-style notes editor for the Clients > Notes tab.
 *
 * One row per note. Two columns:
 *  - Note    (textarea, free-form, supports point form)
 *  - Author  (auto-filled from logged-in user on row creation, read-only)
 *
 * No category, no date column. Date is still set automatically in the schema
 * (defaultValue) for legacy compatibility, but never displayed here.
 */

import { useAllFormFields, useForm, useAuth } from '@payloadcms/ui'
import { useCallback, useMemo } from 'react'

type NoteEntry = {
  content: string
  author: string
}

function extractEntries(fields: Record<string, any>, basePath: string): NoteEntry[] {
  const entries: NoteEntry[] = []
  let i = 0
  while (true) {
    const hasRow =
      fields[`${basePath}.${i}.content`] !== undefined ||
      fields[`${basePath}.${i}.id`] !== undefined ||
      fields[`${basePath}.${i}.author`] !== undefined
    if (!hasRow) break
    entries.push({
      content: fields[`${basePath}.${i}.content`]?.value ?? '',
      author: fields[`${basePath}.${i}.author`]?.value ?? '',
    })
    i++
  }
  return entries
}

const cellStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderBottom: '1px solid var(--theme-elevation-100, #e5e7eb)',
  verticalAlign: 'top',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid var(--theme-elevation-150, #d1d5db)',
  borderRadius: 4,
  fontSize: 13,
  background: 'var(--theme-input-bg, #fff)',
  color: 'var(--theme-text, inherit)',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: 'none',
  lineHeight: 1.5,
  overflow: 'hidden',
}

const headerStyle: React.CSSProperties = {
  padding: '8px',
  fontWeight: 600,
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: 'var(--theme-elevation-500, #6b7280)',
  borderBottom: '2px solid var(--theme-elevation-150, #e5e7eb)',
  whiteSpace: 'nowrap',
  textAlign: 'left',
}

function ClientNotesTable(props: any) {
  const path = props?.path || 'clientNotes'
  const schemaPath = props?.schemaPath || 'clientNotes'
  const [fields, dispatchFields] = useAllFormFields()
  const { addFieldRow, removeFieldRow } = useForm()
  const { user } = useAuth()

  const entries = useMemo(() => extractEntries(fields, path), [fields, path])

  const currentUserName: string =
    (user && ((user as any).name || (user as any).email)) || 'Unknown'

  const updateValue = useCallback(
    (fieldPath: string, value: any) => {
      dispatchFields({ type: 'UPDATE', path: fieldPath, value })
    },
    [dispatchFields],
  )

  const handleAdd = useCallback(() => {
    const newIndex = entries.length
    addFieldRow({ path, schemaPath, rowIndex: newIndex })
    // Set sensible defaults for the new row after Payload registers it.
    setTimeout(() => {
      dispatchFields({
        type: 'UPDATE',
        path: `${path}.${newIndex}.author`,
        value: currentUserName,
      })
      // Date is required in schema — auto-fill to now (hidden from this UI).
      dispatchFields({
        type: 'UPDATE',
        path: `${path}.${newIndex}.date`,
        value: new Date().toISOString(),
      })
      // Category has a default ('general') in schema; nothing to set here.
    }, 50)
  }, [addFieldRow, path, schemaPath, entries.length, dispatchFields, currentUserName])

  const handleRemove = useCallback(
    (index: number) => {
      removeFieldRow({ path, rowIndex: index })
    },
    [removeFieldRow, path],
  )

  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <div>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--theme-text)' }}>
            Notes
          </span>
          <span
            style={{
              fontSize: 13,
              color: 'var(--theme-elevation-500, #6b7280)',
              marginLeft: 8,
            }}
          >
            {entries.length} {entries.length === 1 ? 'note' : 'notes'}
          </span>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          style={{
            padding: '6px 14px',
            background: '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          + Add Note
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table
          style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}
        >
          <thead>
            <tr>
              <th style={headerStyle}>Note</th>
              <th style={{ ...headerStyle, width: 200 }}>Author</th>
              <th style={{ ...headerStyle, width: 44, textAlign: 'center' }}></th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  style={{
                    ...cellStyle,
                    textAlign: 'center',
                    color: 'var(--theme-elevation-400, #9ca3af)',
                    padding: '20px 8px',
                    fontStyle: 'italic',
                  }}
                >
                  No notes yet — click &quot;+ Add Note&quot; to add one
                </td>
              </tr>
            )}
            {entries.map((entry, i) => (
              <tr key={i}>
                <td style={cellStyle}>
                  <textarea
                    value={entry.content}
                    onChange={(e) => updateValue(`${path}.${i}.content`, e.target.value)}
                    onInput={(e) => {
                      const el = e.currentTarget
                      el.style.height = 'auto'
                      el.style.height = el.scrollHeight + 'px'
                    }}
                    ref={(el) => {
                      if (el) {
                        el.style.height = 'auto'
                        el.style.height = el.scrollHeight + 'px'
                      }
                    }}
                    placeholder="Type your note... use new lines for point form"
                    rows={1}
                    style={textareaStyle}
                  />
                </td>
                <td style={cellStyle}>
                  <input
                    type="text"
                    value={entry.author}
                    onChange={(e) => updateValue(`${path}.${i}.author`, e.target.value)}
                    style={{
                      ...inputStyle,
                      background: 'var(--theme-elevation-50, #f9fafb)',
                      color: 'var(--theme-elevation-600, #4b5563)',
                    }}
                    readOnly
                    title="Auto-filled from the user who added the note"
                  />
                </td>
                <td style={{ ...cellStyle, textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() => handleRemove(i)}
                    title="Remove note"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--theme-elevation-400, #9ca3af)',
                      fontSize: 16,
                      padding: '2px 6px',
                      borderRadius: 4,
                      lineHeight: 1,
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.color = '#ef4444')}
                    onMouseOut={(e) => (e.currentTarget.style.color = 'var(--theme-elevation-400, #9ca3af)')}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default ClientNotesTable
