'use client'

/**
 * Bulk "Assign account manager" control for the Clients list view.
 *
 * Mounted via the collection's `beforeListTable` (inside Payload's
 * SelectionProvider), so it can read the rows the user has ticked. The same
 * creatable combobox of manager users (role admin/manager) as the client
 * profile field powers it, plus a manual name/email fallback. On apply it
 * POSTs the selection + chosen managers to `/api/clients/assign-managers`,
 * which PATCHes `accountManagers` on every selected client.
 */
import { useSelection } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

type ManagerOption = {
  name: string
  email: string
}

const DATALIST_ID = 'od-bulk-account-managers-options'

const inputStyle: React.CSSProperties = {
  padding: '7px 10px',
  fontSize: 13,
  border: '1px solid #d1d5db',
  borderRadius: 6,
  background: '#ffffff',
  color: '#111827',
}

function ClientsBulkAssignManager(): React.ReactElement | null {
  const router = useRouter()
  const { count, getSelectedIds } = useSelection()

  const [open, setOpen] = useState(false)
  const [managers, setManagers] = useState<ManagerOption[]>([])
  const [rows, setRows] = useState<ManagerOption[]>([{ name: '', email: '' }])
  const [mode, setMode] = useState<'replace' | 'append'>('replace')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

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

  const setRow = useCallback(
    (index: number, patch: Partial<ManagerOption>) => {
      setRows((prev) =>
        prev.map((r, i) => {
          if (i !== index) return r
          const updated = { ...r, ...patch }
          // Typing/picking a known manager name auto-fills its email.
          if (patch.name !== undefined) {
            const match = managers.find((m) => m.name && m.name === patch.name)
            if (match) updated.email = match.email
          }
          return updated
        }),
      )
    },
    [managers],
  )

  const validRows = useMemo(
    () => rows.filter((r) => r.name.trim() && r.email.trim()),
    [rows],
  )

  const handleApply = useCallback(async () => {
    const clientIds = getSelectedIds()
    if (clientIds.length === 0 || validRows.length === 0) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/clients/assign-managers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientIds, managers: validRows, mode }),
      })
      const data = (await res.json()) as {
        updated?: number
        failures?: unknown[]
        error?: string
      }
      if (!res.ok) {
        setMessage(data?.error || 'Failed to assign account managers.')
        return
      }
      const failed = Array.isArray(data?.failures) ? data.failures.length : 0
      setMessage(
        `Updated ${data?.updated ?? 0} client${(data?.updated ?? 0) === 1 ? '' : 's'}` +
          (failed > 0 ? ` — ${failed} failed.` : '.'),
      )
      setRows([{ name: '', email: '' }])
      router.refresh()
    } catch {
      setMessage('Failed to assign account managers.')
    } finally {
      setSaving(false)
    }
  }, [getSelectedIds, validRows, mode, router])

  if (count === 0) return null

  return (
    <div
      style={{
        margin: '12px 0 16px',
        padding: '12px 14px',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        background: '#f9fafb',
      }}
    >
      <datalist id={DATALIST_ID}>
        {managers.map((m) => (
          <option key={m.email} value={m.name}>
            {m.email}
          </option>
        ))}
      </datalist>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
          {count} selected
        </span>
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            style={{
              padding: '7px 14px',
              fontSize: 13,
              fontWeight: 600,
              border: '1px solid #111827',
              background: '#111827',
              color: '#ffffff',
              borderRadius: 999,
              cursor: 'pointer',
            }}
          >
            Assign account manager
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{
              padding: '7px 14px',
              fontSize: 13,
              fontWeight: 600,
              border: '1px solid #d1d5db',
              background: '#ffffff',
              color: '#374151',
              borderRadius: 999,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        )}
        {message && <span style={{ fontSize: 12, color: '#374151' }}>{message}</span>}
      </div>

      {open && (
        <div style={{ marginTop: 12 }}>
          {rows.map((row, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                gap: 8,
                marginBottom: 8,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <input
                type="text"
                list={DATALIST_ID}
                placeholder="Select or type a name…"
                value={row.name}
                onChange={(e) => setRow(index, { name: e.target.value })}
                style={{ ...inputStyle, minWidth: 200 }}
              />
              <input
                type="email"
                placeholder="email@example.com"
                value={row.email}
                onChange={(e) => setRow(index, { email: e.target.value })}
                style={{ ...inputStyle, minWidth: 200 }}
              />
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                  aria-label="Remove account manager"
                  title="Remove"
                  style={{
                    border: '1px solid #d1d5db',
                    background: '#ffffff',
                    color: '#b91c1c',
                    borderRadius: 6,
                    width: 34,
                    height: 34,
                    cursor: 'pointer',
                    fontSize: 16,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={() => setRows((prev) => [...prev, { name: '', email: '' }])}
            style={{
              marginTop: 2,
              marginBottom: 12,
              padding: '5px 10px',
              fontSize: 12,
              fontWeight: 600,
              border: '1px solid #d1d5db',
              background: '#ffffff',
              color: '#374151',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            + Add another
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, color: '#374151', display: 'flex', gap: 6 }}>
              <input
                type="radio"
                name="od-bulk-mgr-mode"
                checked={mode === 'replace'}
                onChange={() => setMode('replace')}
              />
              Replace existing
            </label>
            <label style={{ fontSize: 12, color: '#374151', display: 'flex', gap: 6 }}>
              <input
                type="radio"
                name="od-bulk-mgr-mode"
                checked={mode === 'append'}
                onChange={() => setMode('append')}
              />
              Add to existing
            </label>

            <button
              type="button"
              onClick={handleApply}
              disabled={saving || validRows.length === 0}
              style={{
                padding: '7px 16px',
                fontSize: 13,
                fontWeight: 600,
                border: '1px solid #111827',
                background: saving || validRows.length === 0 ? '#9ca3af' : '#111827',
                color: '#ffffff',
                borderRadius: 999,
                cursor: saving || validRows.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Applying…' : `Apply to ${count} client${count === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ClientsBulkAssignManager
