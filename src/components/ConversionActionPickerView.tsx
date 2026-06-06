'use client'

import { useMemo, useState } from 'react'

/**
 * Presentational conversion-action picker.
 *
 * Renders the search bar, manual-add datalist, the rows (checkbox + color +
 * dashboard label) and the orphaned-selections section. It is fully controlled:
 * the parent owns `selectedNames` + `categories` and receives updates via
 * `onChangeSelection` / `onChangeCategories`.
 *
 * Two wrappers consume it:
 *  - `GoogleAdsConversionActionPicker` — form-bound (Client > Google Ads tab),
 *    persists through Payload's `useField`.
 *  - `GoogleAdsAuditConversionActionPicker` — remote, persists to the linked
 *    client via REST PATCH (Google Ads Audit > Conversions tab).
 */
export type ConversionActionCategory = {
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

export type ConversionActionPickerViewProps = {
  available: string[]
  catalog: string[]
  loading: boolean
  error: string | null
  selectedNames: string[]
  categories: ConversionActionCategory[]
  onChangeSelection: (names: string[]) => void
  onChangeCategories: (categories: ConversionActionCategory[]) => void
}

export const ConversionActionPickerView = ({
  available,
  catalog,
  loading,
  error,
  selectedNames,
  categories,
  onChangeSelection,
  onChangeCategories,
}: ConversionActionPickerViewProps) => {
  const [filter, setFilter] = useState('')
  const [manualName, setManualName] = useState('')

  const selected = useMemo(() => new Set(selectedNames), [selectedNames])

  const categoryByAction = useMemo(() => {
    const map = new Map<string, { label: string; color: string }>()
    if (!Array.isArray(categories)) return map
    for (const category of categories) {
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
  }, [categories])

  const syncCategories = (actions: string[]) => {
    const rows = actions
      .map((action) => {
        const existing = categoryByAction.get(action)
        const label = existing?.label || action
        const color = existing?.color || 'sky'
        return { label, color, actions: action }
      })
      .filter((row) => row.label && row.actions)
    onChangeCategories(rows)
  }

  // Preserve current order where possible: existing selected first, new last.
  const writeSelection = (next: Set<string>) => {
    const kept = selectedNames.filter((name) => next.has(name))
    const additions = Array.from(next).filter((name) => !kept.includes(name))
    const final = [...kept, ...additions]
    onChangeSelection(final)
    syncCategories(final)
  }

  const updateCategory = (
    action: string,
    updates: Partial<{ label: string; color: string }>,
  ) => {
    const rows = selectedNames
      .map((selectedAction) => {
        const existing = categoryByAction.get(selectedAction)
        const current = {
          label: existing?.label || selectedAction,
          color: existing?.color || 'sky',
        }
        const next =
          selectedAction === action ? { ...current, ...updates } : current
        return {
          label: next.label.trim() || selectedAction,
          color: next.color || 'sky',
          actions: selectedAction,
        }
      })
      .filter((row) => row.actions)
    onChangeCategories(rows)
  }

  const toggle = (name: string) => {
    const next = new Set(selected)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    writeSelection(next)
  }

  const selectAll = () => writeSelection(new Set(available))
  const clearAll = () => writeSelection(new Set())

  const addManual = () => {
    const name = manualName.trim()
    if (!name) return
    const next = new Set(selected)
    next.add(name)
    writeSelection(next)
    setManualName('')
  }

  const catalogSuggestions = useMemo(() => {
    const availableSet = new Set(available)
    return catalog.filter(
      (name) => !availableSet.has(name) && !selected.has(name),
    )
  }, [catalog, available, selected])

  const filtered = useMemo(() => {
    if (!filter.trim()) return available
    const f = filter.toLowerCase()
    return available.filter((a) => a.toLowerCase().includes(f))
  }, [available, filter])

  const availableSelectedCount = useMemo(
    () => available.filter((name) => selected.has(name)).length,
    [available, selected],
  )

  const orphaned = useMemo(
    () => Array.from(selected).filter((s) => !available.includes(s)),
    [selected, available],
  )

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
        include all available actions. The list below shows actions with recent
        conversions; use the Add box to include defined actions that haven&apos;t
        recorded a conversion yet (start typing to pick the exact name).
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
          No conversion actions reported by Google Ads for this account. Add
          them by name above.
        </div>
      )}

      {/* Manually-added selections when Google Ads reported nothing — so the
          user still sees and can remove what they typed. */}
      {!loading && available.length === 0 && orphaned.length > 0 && (
        <div
          style={{
            border: '1px solid var(--theme-elevation-150)',
            borderRadius: 4,
            background: 'var(--theme-elevation-0)',
            marginTop: 8,
          }}
        >
          {orphaned.map((name) => {
            const category = categoryByAction.get(name)
            return (
              <div
                key={`manual-${name}`}
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
                  onChange={(e) => updateCategory(name, { color: e.target.value })}
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
                  onChange={(e) => updateCategory(name, { label: e.target.value })}
                  style={{ width: '100%', fontSize: 12, padding: '4px 6px' }}
                />
              </div>
            )
          })}
        </div>
      )}

      {/* Manual add — for conversion actions with no reported conversions yet. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <input
          type="text"
          list="od-conversion-action-catalog"
          value={manualName}
          onChange={(e) => setManualName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addManual()
            }
          }}
          placeholder={
            catalogSuggestions.length > 0
              ? 'Add another conversion action (pick from the list)…'
              : 'Add a conversion action by name (exact Google Ads name)…'
          }
          style={{
            flex: 1,
            padding: '6px 8px',
            fontSize: 13,
            border: '1px solid var(--theme-elevation-200)',
            borderRadius: 3,
            background: 'var(--theme-input-bg)',
            color: 'var(--theme-elevation-800)',
          }}
        />
        <datalist id="od-conversion-action-catalog">
          {catalogSuggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <button
          type="button"
          onClick={addManual}
          disabled={!manualName.trim()}
          style={{
            fontSize: 12,
            padding: '6px 12px',
            background: 'var(--theme-elevation-100)',
            border: '1px solid var(--theme-elevation-200)',
            borderRadius: 3,
            cursor: manualName.trim() ? 'pointer' : 'not-allowed',
            opacity: manualName.trim() ? 1 : 0.5,
            color: 'var(--theme-elevation-700)',
            whiteSpace: 'nowrap',
          }}
        >
          Add
        </button>
      </div>

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
                Saved (no recent conversions — newly added or aged out)
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
