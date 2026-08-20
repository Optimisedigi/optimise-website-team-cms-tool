'use client'

import type { DefaultCellComponentProps } from 'payload'

import React, { useEffect, useMemo, useState } from 'react'

type AccountManager = {
  name?: string | null
  email?: string | null
}

function cleanManagers(raw: unknown): AccountManager[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((value) => {
    if (!value || typeof value !== 'object') return []
    const manager = value as Record<string, unknown>
    const name = typeof manager.name === 'string' ? manager.name.trim() : ''
    const email = typeof manager.email === 'string' ? manager.email.trim() : ''
    return name || email ? [{ name, email }] : []
  })
}

let managerOptionsPromise: Promise<AccountManager[]> | null = null

function loadManagerOptions(): Promise<AccountManager[]> {
  if (!managerOptionsPromise) {
    managerOptionsPromise = fetch('/api/users/managers')
      .then(async (response) => {
        if (!response.ok) throw new Error('Failed to load account managers')
        const data = (await response.json()) as { managers?: unknown }
        return cleanManagers(data.managers)
      })
      .catch((error) => {
        managerOptionsPromise = null
        throw error
      })
  }
  return managerOptionsPromise
}

function managerLabel(manager?: AccountManager): string {
  return (manager?.name || manager?.email || '').trim()
}

/** Inline account-manager editor for each row in the Clients list view. */
function AccountManagerCell({ cellData, rowData }: DefaultCellComponentProps) {
  const clientID = rowData?.id
  const initialManagers = cleanManagers(cellData)
  const [managers, setManagers] = useState(initialManagers)
  const [options, setOptions] = useState<AccountManager[]>([])
  const [selectedEmails, setSelectedEmails] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || options.length > 0) return
    let active = true
    loadManagerOptions()
      .then((nextOptions) => {
        if (active) setOptions(nextOptions)
      })
      .catch(() => {
        if (active) setError('Could not load managers.')
      })
    return () => {
      active = false
    }
  }, [open, options.length])

  const availableManagers = useMemo(() => {
    const byEmail = new Map<string, AccountManager>()
    for (const manager of [...options, ...managers]) {
      const email = manager.email?.trim().toLowerCase()
      if (email) byEmail.set(email, manager)
    }
    return [...byEmail.values()]
  }, [managers, options])

  const openEditor = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setSelectedEmails(
      managers.flatMap((manager) => {
        const email = manager.email?.trim().toLowerCase()
        return email ? [email] : []
      }),
    )
    setError(null)
    setOpen(true)
  }

  const toggleManager = (email: string) => {
    setSelectedEmails((current) =>
      current.includes(email)
        ? current.filter((selected) => selected !== email)
        : [...current, email],
    )
  }

  const saveManagers = async () => {
    if ((typeof clientID !== 'string' && typeof clientID !== 'number') || saving) return
    const selectedManagers = availableManagers.filter((manager) =>
      selectedEmails.includes(manager.email?.trim().toLowerCase() ?? ''),
    )
    if (selectedManagers.length === 0) {
      setError('Select at least one manager.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/clients/assign-managers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientIds: [clientID],
          managers: selectedManagers,
          mode: 'replace',
        }),
      })
      const result = (await response.json()) as {
        error?: string
        failures?: unknown[]
        updated?: number
      }
      if (!response.ok || result.updated !== 1 || result.failures?.length) {
        throw new Error(result.error || 'Could not update account managers.')
      }
      setManagers(selectedManagers)
      setOpen(false)
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : 'Could not update account managers.',
      )
    } finally {
      setSaving(false)
    }
  }

  const first = managers[0]
  const label = managerLabel(first)
  const extra = managers.length - 1

  if (typeof clientID !== 'string' && typeof clientID !== 'number') {
    const staticLabel = managerLabel(initialManagers[0])
    const staticExtra = initialManagers.length - 1
    if (!staticLabel) return <span className="od-cell-muted">—</span>
    return (
      <span className="od-cell-mgr">
        <span>{staticLabel}</span>
        {staticExtra > 0 ? <span className="od-cell-mgr__more">+{staticExtra}</span> : null}
      </span>
    )
  }

  return (
    <div className="od-cell-mgr-editor" onClick={(event) => event.stopPropagation()}>
      <button
        aria-expanded={open}
        aria-label={`Edit account managers${rowData?.name ? ` for ${rowData.name}` : ''}`}
        className="od-cell-mgr od-cell-mgr__trigger"
        onClick={openEditor}
        type="button"
      >
        <span>{label || '—'}</span>
        {extra > 0 ? <span className="od-cell-mgr__more">+{extra}</span> : null}
      </button>

      {open ? (
        <div aria-label="Account managers" className="od-cell-mgr__popover" role="dialog">
          <strong>Account managers</strong>
          {availableManagers.length === 0 && !error ? <span>Loading…</span> : null}
          {availableManagers.map((manager) => {
            const email = manager.email?.trim().toLowerCase() ?? ''
            return (
              <button
                aria-checked={selectedEmails.includes(email)}
                className="od-cell-mgr__option"
                key={email}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  toggleManager(email)
                }}
                role="checkbox"
                type="button"
              >
                <span aria-hidden="true">{selectedEmails.includes(email) ? '✓' : ''}</span>
                <span>{managerLabel(manager)}</span>
              </button>
            )
          })}
          {error ? <span className="od-cell-mgr__error">{error}</span> : null}
          <div className="od-cell-mgr__actions">
            <button
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setOpen(false)
              }}
              type="button"
            >
              Cancel
            </button>
            <button
              disabled={saving}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                void saveManagers()
              }}
              type="button"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default AccountManagerCell
