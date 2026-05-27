'use client'

import { useDocumentInfo, useField } from '@payloadcms/ui'
import { useEffect, useMemo, useState } from 'react'

/**
 * Admin field component for `client.dashboardConversionActions`.
 *
 * Replaces the textarea with a checkbox list populated from the actual
 * conversion actions Google Ads returns for this client's customerId.
 *
 * Storage format remains newline-separated names (back-compat with existing
 * dashboard read paths in src/app/(frontend)/google-dashboard/[slug]/page.tsx).
 *
 * Used in: Clients collection > Google Ads tab.
 */
type ConversionActionCategory = {
  label?: string | null
  color?: string | null
  actions?: string | null
}

const COLOR_OPTIONS = [
  { label: 'Sky', value: 'sky' },
  { label: 'Violet', value: 'violet' },
  { label: 'Emerald', value: 'emerald' },
  { label: 'Amber', value: 'amber' },
  { label: 'Rose', value: 'rose' },
  { label: 'Slate', value: 'slate' },
]

const GoogleAdsConversionActionPicker = () => {
  const { id } = useDocumentInfo()
  const { value, setValue } = useField<string | null>({
    path: 'dashboardConversionActions',
  })
  const { value: categoryValue, setValue: setCategoryValue } = useField<
    ConversionActionCategory[] | null
  >({
    path: 'conversionActionCategories',
  })

  const [available, setAvailable] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  const categoryByAction = useMemo(() => {
    const map = new Map<string, { label: string; color: string }>()
    if (!Array.isArray(categoryValue)) return map
    for (const category of categoryValue) {
      const actions = String(category?.actions || '')
        .split(/\r?\n/)
        .map((action) => action.trim())
        .filter(Boolean)
      for (const action of actions) {
        map.set(action, {
          label: String(category?.label || '').trim(),
          color: String(category?.color || 'sky'),
        })
      }
    }
    return map
  }, [categoryValue])

  // Parse newline-separated stored value -> Set
  const selected = useMemo(() => {
    const raw = typeof value === 'string' ? value : ''
    return new Set(
      raw
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    )
  }, [value])

  useEffect(() => {
    if (!id) return
    let cancelled = false

    const fetchActions = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/clients/${id}/google-ads-conversion-actions`,
          { credentials: 'include' },
        )
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          if (!cancelled) {
            setError(body.error || `Failed (${res.status})`)
            setAvailable(Array.isArray(body.available) ? body.available : [])
          }
          return
        }
        const data = await res.json()
        if (!cancelled) {
          setAvailable(Array.isArray(data.available) ? data.available : [])
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Fetch failed')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchActions()
    return () => {
      cancelled = true
    }
  }, [id])

  // Persist as newline-separated string (back-compat).
  // Keep the saved order stable: existing-saved-first, then newly-checked items
  // in the order the user clicked them.
  const selectedActionsInOrder = useMemo(() => {
    const currentOrder: string[] = (typeof value === 'string' ? value : '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    const kept = currentOrder.filter((name) => selected.has(name))
    const additions = Array.from(selected).filter((name) => !kept.includes(name))
    return [...kept, ...additions]
  }, [selected, value])

  const syncCategories = (actions: string[]) => {
    const rows = actions
      .map((action) => {
        const existing = categoryByAction.get(action)
        const label = existing?.label || action
        const color = existing?.color || 'sky'
        return { label, color, actions: action }
      })
      .filter((row) => row.label && row.actions)
    setCategoryValue(rows.length > 0 ? rows : null)
  }

  const writeSelection = (next: Set<string>) => {
    // Preserve current order from stored value where possible
    const currentOrder: string[] = (typeof value === 'string' ? value : '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    const kept = currentOrder.filter((name) => next.has(name))
    const additions = Array.from(next).filter((name) => !kept.includes(name))
    const final = [...kept, ...additions]
    setValue(final.length > 0 ? final.join('\n') : '')
    syncCategories(final)
  }

  const updateCategory = (
    action: string,
    updates: Partial<{ label: string; color: string }>,
  ) => {
    const rows = selectedActionsInOrder
      .map((selectedAction) => {
        const existing = categoryByAction.get(selectedAction)
        const current = {
          label: existing?.label || selectedAction,
          color: existing?.color || 'sky',
        }
        const next = selectedAction === action ? { ...current, ...updates } : current
        return {
          label: next.label.trim() || selectedAction,
          color: next.color || 'sky',
          actions: selectedAction,
        }
      })
      .filter((row) => row.actions)
    setCategoryValue(rows.length > 0 ? rows : null)
  }

  const toggle = (name: string) => {
    const next = new Set(selected)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    writeSelection(next)
  }

  const selectAll = () => writeSelection(new Set(available))
  const clearAll = () => writeSelection(new Set())

  const filtered = useMemo(() => {
    if (!filter.trim()) return available
    const f = filter.toLowerCase()
    return available.filter((a) => a.toLowerCase().includes(f))
  }, [available, filter])

  const availableSelectedCount = useMemo(
    () => available.filter((name) => selected.has(name)).length,
    [available, selected],
  )

  // Handle "saved-but-no-longer-available" — show those at the top so the user
  // doesn't lose track of historic selections that fell outside the 730d window
  // or were renamed in Google Ads.
  const orphaned = useMemo(
    () => Array.from(selected).filter((s) => !available.includes(s)),
    [selected, available],
  )

  if (!id) {
    return (
      <div
        style={{
          marginBottom: 16,
          fontSize: 13,
          color: 'var(--theme-elevation-500)',
        }}
      >
        Save the client first to enable the conversion action picker.
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <label
        style={{
          display: 'block',
          marginBottom: 4,
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--theme-elevation-800)',
        }}
      >
        Default Conversion Actions
      </label>
      <p
        style={{
          marginBottom: 8,
          fontSize: 12,
          color: 'var(--theme-elevation-500)',
        }}
      >
        These are the conversion actions used by default in this client&apos;s
        Google Ads dashboard and the Budget Management tool. Users can still
        override the selection ad-hoc in the dashboard. Leave none selected to
        include all available actions.
      </p>

      {loading && (
        <div
          style={{
            padding: '8px 12px',
            fontSize: 13,
            color: 'var(--theme-elevation-500)',
          }}
        >
          Loading conversion actions from Google Ads…
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '8px 12px',
            background: 'var(--theme-error-100)',
            color: 'var(--theme-error-800)',
            border: '1px solid var(--theme-error-300)',
            borderRadius: 4,
            fontSize: 13,
            marginBottom: 8,
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && available.length === 0 && (
        <div
          style={{
            padding: '8px 12px',
            fontSize: 13,
            color: 'var(--theme-elevation-500)',
          }}
        >
          No conversion actions found for this Google Ads account in the last
          2 years.
        </div>
      )}

      {available.length > 0 && (
        <div
          style={{
            border: '1px solid var(--theme-elevation-150)',
            borderRadius: 4,
            background: 'var(--theme-elevation-0)',
          }}
        >
          {/* Header bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderBottom: '1px solid var(--theme-elevation-150)',
              background: 'var(--theme-elevation-50)',
            }}
          >
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search…"
              style={{
                flex: 1,
                padding: '4px 8px',
                fontSize: 13,
                border: '1px solid var(--theme-elevation-200)',
                borderRadius: 3,
                background: 'var(--theme-input-bg)',
                color: 'var(--theme-elevation-800)',
              }}
            />
            <span
              style={{
                fontSize: 12,
                color: 'var(--theme-elevation-500)',
                whiteSpace: 'nowrap',
              }}
            >
              {availableSelectedCount} of {available.length} selected
            </span>
            <button
              type="button"
              onClick={selectAll}
              style={{
                fontSize: 12,
                padding: '4px 8px',
                background: 'var(--theme-elevation-100)',
                border: '1px solid var(--theme-elevation-200)',
                borderRadius: 3,
                cursor: 'pointer',
                color: 'var(--theme-elevation-700)',
              }}
            >
              All
            </button>
            <button
              type="button"
              onClick={clearAll}
              style={{
                fontSize: 12,
                padding: '4px 8px',
                background: 'var(--theme-elevation-100)',
                border: '1px solid var(--theme-elevation-200)',
                borderRadius: 3,
                cursor: 'pointer',
                color: 'var(--theme-elevation-700)',
              }}
            >
              None
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(320px, 1fr) 120px minmax(180px, 260px)',
              gap: 12,
              padding: '8px 12px',
              borderBottom: '1px solid var(--theme-elevation-150)',
              background: 'var(--theme-elevation-50)',
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 0.4,
              color: 'var(--theme-elevation-500)',
            }}
          >
            <span>Conversion action</span>
            <span>Color</span>
            <span>Dashboard label</span>
          </div>

          {/* Scrollable list */}
          <div
            style={{
              maxHeight: 320,
              overflowY: 'auto',
              padding: '4px 0',
            }}
          >
            {orphaned.length > 0 && (
              <div
                style={{
                  padding: '8px 12px',
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  color: 'var(--theme-elevation-500)',
                  borderBottom: '1px solid var(--theme-elevation-100)',
                  background: 'var(--theme-elevation-50)',
                }}
              >
                Saved (no longer in last 2 years of data)
              </div>
            )}
            {orphaned.map((name) => {
              const category = categoryByAction.get(name)
              return (
                <div
                  key={`orphan-${name}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'minmax(320px, 1fr) 120px minmax(180px, 260px)',
                    alignItems: 'center',
                    gap: 12,
                    padding: '6px 12px',
                    fontSize: 13,
                    color: 'var(--theme-elevation-600)',
                    fontStyle: 'italic',
                  }}
                >
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={true}
                      onChange={() => toggle(name)}
                    />
                    <span>{name}</span>
                  </label>
                  <select
                    value={category?.color || 'sky'}
                    onChange={(e) =>
                      updateCategory(name, { color: e.target.value })
                    }
                    style={{ width: '100%', fontSize: 12, padding: '4px 6px' }}
                  >
                    {COLOR_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={category?.label || name}
                    onChange={(e) =>
                      updateCategory(name, { label: e.target.value })
                    }
                    style={{ width: '100%', fontSize: 12, padding: '4px 6px' }}
                  />
                </div>
              )
            })}
            {filtered.map((name) => {
              const isSelected = selected.has(name)
              const category = categoryByAction.get(name)
              return (
                <div
                  key={name}
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'minmax(320px, 1fr) 120px minmax(180px, 260px)',
                    alignItems: 'center',
                    gap: 12,
                    padding: '6px 12px',
                    fontSize: 13,
                    color: 'var(--theme-elevation-800)',
                  }}
                  onMouseEnter={(e) => {
                    ;(e.currentTarget as HTMLElement).style.background =
                      'var(--theme-elevation-50)'
                  }}
                  onMouseLeave={(e) => {
                    ;(e.currentTarget as HTMLElement).style.background = ''
                  }}
                >
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(name)}
                    />
                    <span>{name}</span>
                  </label>
                  <select
                    value={category?.color || 'sky'}
                    disabled={!isSelected}
                    onChange={(e) =>
                      updateCategory(name, { color: e.target.value })
                    }
                    style={{
                      width: '100%',
                      fontSize: 12,
                      padding: '4px 6px',
                      opacity: isSelected ? 1 : 0.35,
                    }}
                  >
                    {COLOR_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={category?.label || name}
                    disabled={!isSelected}
                    onChange={(e) =>
                      updateCategory(name, { label: e.target.value })
                    }
                    style={{
                      width: '100%',
                      fontSize: 12,
                      padding: '4px 6px',
                      opacity: isSelected ? 1 : 0.35,
                    }}
                  />
                </div>
              )
            })}
            {filtered.length === 0 && filter.trim() && (
              <div
                style={{
                  padding: '12px',
                  fontSize: 13,
                  color: 'var(--theme-elevation-500)',
                  textAlign: 'center',
                }}
              >
                No conversion actions match &ldquo;{filter}&rdquo;
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default GoogleAdsConversionActionPicker
