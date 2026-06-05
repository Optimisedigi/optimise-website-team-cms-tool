'use client'

import { useDocumentInfo, useAllFormFields, useForm } from '@payloadcms/ui'
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type AttendeeData = {
  name: string
  email: string
  token: string
  internalConfirmed: boolean
  responded: boolean
  response: 'accepted' | 'maybe' | 'declined' | null
  respondedAt: string | null
  emailSentAt: string | null
}

/* ------------------------------------------------------------------ */
/* Extract attendees from flat form field map                          */
/* ------------------------------------------------------------------ */

function extractAttendees(fields: Record<string, any>, basePath: string): AttendeeData[] {
  const attendees: AttendeeData[] = []
  let i = 0

  while (true) {
    const hasRow =
      fields[`${basePath}.${i}.name`] !== undefined ||
      fields[`${basePath}.${i}.email`] !== undefined ||
      fields[`${basePath}.${i}.internalConfirmed`] !== undefined ||
      fields[`${basePath}.${i}.id`] !== undefined
    if (!hasRow) break

    attendees.push({
      name: fields[`${basePath}.${i}.name`]?.value ?? '',
      email: fields[`${basePath}.${i}.email`]?.value ?? '',
      token: fields[`${basePath}.${i}.token`]?.value ?? '',
      internalConfirmed: !!fields[`${basePath}.${i}.internalConfirmed`]?.value,
      responded: !!fields[`${basePath}.${i}.responded`]?.value,
      response: (fields[`${basePath}.${i}.response`]?.value as AttendeeData['response']) ?? null,
      respondedAt: fields[`${basePath}.${i}.respondedAt`]?.value ?? null,
      emailSentAt: fields[`${basePath}.${i}.emailSentAt`]?.value ?? null,
    })
    i++
  }

  return attendees
}

/* ------------------------------------------------------------------ */
/* Editable Cell                                                       */
/* ------------------------------------------------------------------ */

function EditableCell({
  value,
  onSave,
  placeholder,
  inputRef,
  onKeyDown,
  type = 'text',
}: {
  value: string
  onSave: (val: string) => void
  placeholder?: string
  inputRef?: React.Ref<HTMLInputElement>
  onKeyDown?: (e: React.KeyboardEvent) => void
  type?: string
}) {
  const [local, setLocal] = useState(value)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setLocal(value)
  }, [value, focused])

  return (
    <input
      ref={inputRef}
      type={type}
      value={local}
      placeholder={placeholder}
      onChange={(e) => setLocal(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false)
        if (local !== value) onSave(local)
      }}
      onKeyDown={onKeyDown}
      style={{
        width: '100%',
        padding: '6px 8px',
        border: '1px solid transparent',
        borderRadius: 3,
        fontSize: 13,
        fontFamily: 'inherit',
        background: 'transparent',
        color: 'inherit',
        outline: 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        boxSizing: 'border-box',
      }}
      onMouseEnter={(e) => { (e.target as HTMLInputElement).style.borderColor = 'var(--theme-elevation-200)' }}
      onMouseLeave={(e) => {
        if (document.activeElement !== e.target) {
          (e.target as HTMLInputElement).style.borderColor = 'transparent'
        }
      }}
      onFocusCapture={(e) => {
        (e.target as HTMLInputElement).style.borderColor = '#3B82F6';
        (e.target as HTMLInputElement).style.boxShadow = '0 0 0 1px rgba(59,130,246,0.3)';
        (e.target as HTMLInputElement).style.background = 'var(--theme-elevation-0)'
      }}
      onBlurCapture={(e) => {
        (e.target as HTMLInputElement).style.borderColor = 'transparent';
        (e.target as HTMLInputElement).style.boxShadow = 'none';
        (e.target as HTMLInputElement).style.background = 'transparent'
      }}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Main Component                                                      */
/* ------------------------------------------------------------------ */

export default function MeetingSchedulerAttendeesTable(_props: any) {
  // Hardcoded — this custom component always manages the `attendees`
  // array field, not the `attendeesTable` UI field it's mounted on.
  const path = 'attendees'
  const schemaPath = 'attendees'
  const [fields, dispatchFields] = useAllFormFields()
  const { addFieldRow, removeFieldRow } = useForm()

  const attendees = useMemo(() => extractAttendees(fields, path), [fields, path])

  // Refs for focusing the new row
  const newNameRef = useRef<HTMLInputElement>(null)

  const updateValue = useCallback(
    (fieldPath: string, value: any) => {
      dispatchFields({ type: 'UPDATE', path: fieldPath, value })
    },
    [dispatchFields],
  )

  const handleAddRow = useCallback(() => {
    addFieldRow({
      path,
      schemaPath,
      rowIndex: attendees.length,
    })
    // Focus the name input of the new row after React re-renders
    setTimeout(() => newNameRef.current?.focus(), 100)
  }, [addFieldRow, path, schemaPath, attendees.length])

  const handleRemoveRow = useCallback(
    (index: number) => {
      removeFieldRow({ path, rowIndex: index })
    },
    [removeFieldRow, path],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, rowIndex: number, field: 'name' | 'email') => {
      if (e.key === 'Tab' && field === 'email' && !e.shiftKey && rowIndex === attendees.length - 1) {
        // Tab from last email field → add a new row
        e.preventDefault()
        handleAddRow()
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (field === 'name') {
          // Focus the email input in the same row
          const emailInput = (e.target as HTMLElement)
            ?.closest('tr')
            ?.querySelectorAll('input')[1]
          if (emailInput) (emailInput as HTMLInputElement).focus()
        } else if (field === 'email') {
          // If last row, add new row. Otherwise focus next row's name.
          if (rowIndex === attendees.length - 1) {
            handleAddRow()
          } else {
            const nextRow = (e.target as HTMLElement)
              ?.closest('tbody')
              ?.querySelectorAll('tr')[rowIndex + 1]
            const nextName = nextRow?.querySelector('input')
            if (nextName) (nextName as HTMLInputElement).focus()
          }
        }
      }
    },
    [attendees.length, handleAddRow],
  )

  const statusBadge = (attendee: AttendeeData) => {
    if (attendee.internalConfirmed) {
      return (
        <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: '#ede9fe', color: '#5b21b6', fontWeight: 600 }}>
          Internal
        </span>
      )
    }
    if (attendee.responded) {
      if (attendee.response === 'declined') {
        return (
          <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: '#fee2e2', color: '#991b1b', fontWeight: 600 }}>
            Declined
          </span>
        )
      }
      if (attendee.response === 'maybe') {
        return (
          <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>
            Maybe
          </span>
        )
      }
      return (
        <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: '#dcfce7', color: '#166534', fontWeight: 600 }}>
          Accepted
        </span>
      )
    }
    if (attendee.emailSentAt) {
      return (
        <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: '#dbeafe', color: '#1e40af', fontWeight: 600 }}>
          Invite Sent
        </span>
      )
    }
    return (
      <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'var(--theme-elevation-100)', color: 'var(--theme-elevation-500)' }}>
        Pending
      </span>
    )
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--theme-elevation-800)' }}>
          Attendees ({attendees.length})
        </label>
        <button
          type="button"
          onClick={handleAddRow}
          style={{
            padding: '5px 14px',
            fontSize: 12,
            fontWeight: 600,
            background: 'var(--theme-elevation-100)',
            border: '1px solid var(--theme-elevation-200)',
            borderRadius: 6,
            cursor: 'pointer',
            color: 'var(--theme-elevation-700)',
          }}
        >
          + Add Attendee
        </button>
      </div>

      <div
        style={{
          border: '1px solid var(--theme-elevation-200)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr
              style={{
                background: 'var(--theme-elevation-50)',
                borderBottom: '2px solid var(--theme-elevation-200)',
              }}
            >
              {['#', 'Name', 'Email', 'Internal', 'Status', ''].map((col, idx) => (
                <th
                  key={idx}
                  style={{
                    padding: '8px 8px',
                    textAlign: 'left',
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--theme-elevation-500)',
                    borderRight: idx < 5 ? '1px solid var(--theme-elevation-150)' : 'none',
                    width: idx === 0 ? 40 : idx === 3 ? 80 : idx === 4 ? 100 : idx === 5 ? 50 : undefined,
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {attendees.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    padding: '24px 16px',
                    textAlign: 'center',
                    color: 'var(--theme-elevation-400)',
                    fontSize: 13,
                  }}
                >
                  No attendees yet. Click "+ Add Attendee" or start typing below.
                </td>
              </tr>
            ) : (
              attendees.map((att, i) => (
                <tr
                  key={i}
                  style={{
                    borderBottom: '1px solid var(--theme-elevation-100)',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--theme-elevation-50)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '' }}
                >
                  <td
                    style={{
                      padding: '4px 8px',
                      color: 'var(--theme-elevation-400)',
                      fontSize: 12,
                      textAlign: 'center',
                      borderRight: '1px solid var(--theme-elevation-100)',
                      width: 40,
                    }}
                  >
                    {i + 1}
                  </td>
                  <td style={{ padding: '2px 4px', borderRight: '1px solid var(--theme-elevation-100)' }}>
                    <EditableCell
                      value={att.name}
                      onSave={(v) => updateValue(`${path}.${i}.name`, v)}
                      placeholder="Name..."
                      inputRef={i === attendees.length - 1 ? newNameRef : undefined}
                      onKeyDown={(e) => handleKeyDown(e, i, 'name')}
                    />
                  </td>
                  <td style={{ padding: '2px 4px', borderRight: '1px solid var(--theme-elevation-100)' }}>
                    <EditableCell
                      value={att.email}
                      onSave={(v) => updateValue(`${path}.${i}.email`, v)}
                      placeholder="email@example.com"
                      type="email"
                      onKeyDown={(e) => handleKeyDown(e, i, 'email')}
                    />
                  </td>
                  <td
                    style={{
                      padding: '4px 8px',
                      borderRight: '1px solid var(--theme-elevation-100)',
                      textAlign: 'center',
                      width: 80,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={att.internalConfirmed}
                      onChange={(e) => updateValue(`${path}.${i}.internalConfirmed`, e.target.checked)}
                      title="Internal team member — already available for generated slots"
                    />
                  </td>
                  <td
                    style={{
                      padding: '4px 8px',
                      borderRight: '1px solid var(--theme-elevation-100)',
                      textAlign: 'center',
                      width: 100,
                    }}
                  >
                    {statusBadge(att)}
                  </td>
                  <td style={{ padding: '4px 4px', textAlign: 'center', width: 50 }}>
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(i)}
                      title="Remove attendee"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--theme-elevation-400)',
                        fontSize: 13,
                        padding: '2px 6px',
                        borderRadius: 4,
                        transition: 'background 0.15s, color 0.15s',
                      }}
                      onMouseEnter={(e) => { (e.target as HTMLElement).style.color = '#dc2626'; (e.target as HTMLElement).style.background = '#fef2f2' }}
                      onMouseLeave={(e) => { (e.target as HTMLElement).style.color = 'var(--theme-elevation-400)'; (e.target as HTMLElement).style.background = 'none' }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 11, color: 'var(--theme-elevation-400)', marginTop: 6 }}>
        Press <strong>Tab</strong> or <strong>Enter</strong> from the email field to add another row.
      </div>
    </div>
  )
}
