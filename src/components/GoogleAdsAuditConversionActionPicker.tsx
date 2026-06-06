'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ConversionActionPickerView,
  type ConversionActionCategory,
} from './ConversionActionPickerView'

/**
 * Remote conversion-action picker for the Google Ads Audit > Conversions tab.
 *
 * The conversion-action config lives on the CLIENT, not the audit. This wrapper
 * loads the linked client's `dashboardConversionActions` +
 * `conversionActionCategories` via REST, holds them in local state, and saves
 * them back with an explicit Save button (PATCH /api/clients/[clientId]) —
 * independent of the audit's own Save button.
 */
type Props = {
  clientId: string
}

const parseNames = (value: unknown): string[] =>
  typeof value === 'string'
    ? value
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
    : []

const GoogleAdsAuditConversionActionPicker = ({ clientId }: Props) => {
  const [available, setAvailable] = useState<string[]>([])
  const [catalog, setCatalog] = useState<string[]>([])
  const [actionsLoading, setActionsLoading] = useState(false)
  const [actionsError, setActionsError] = useState<string | null>(null)

  const [configLoading, setConfigLoading] = useState(true)
  const [configError, setConfigError] = useState<string | null>(null)

  const [selectedNames, setSelectedNames] = useState<string[]>([])
  const [categories, setCategories] = useState<ConversionActionCategory[]>([])
  // Baseline serialized form to compute dirty state.
  const [savedSnapshot, setSavedSnapshot] = useState<string>('[]|')

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const snapshot = useMemo(
    () => `${JSON.stringify(categories)}|${selectedNames.join('\n')}`,
    [categories, selectedNames],
  )
  const dirty = snapshot !== savedSnapshot

  // Load the client's current conversion-action config.
  useEffect(() => {
    if (!clientId) return
    let cancelled = false

    const loadConfig = async () => {
      setConfigLoading(true)
      setConfigError(null)
      try {
        const res = await fetch(`/api/clients/${clientId}?depth=0`, {
          credentials: 'include',
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          if (!cancelled) {
            setConfigError(body.errors?.[0]?.message || `Failed (${res.status})`)
          }
          return
        }
        const client = await res.json()
        if (cancelled) return
        const names = parseNames(client?.dashboardConversionActions)
        const cats: ConversionActionCategory[] = Array.isArray(
          client?.conversionActionCategories,
        )
          ? client.conversionActionCategories
          : []
        setSelectedNames(names)
        setCategories(cats)
        setSavedSnapshot(`${JSON.stringify(cats)}|${names.join('\n')}`)
      } catch (err) {
        if (!cancelled) {
          setConfigError(err instanceof Error ? err.message : 'Fetch failed')
        }
      } finally {
        if (!cancelled) setConfigLoading(false)
      }
    }

    loadConfig()
    return () => {
      cancelled = true
    }
  }, [clientId])

  // Load available + catalog conversion actions from Google Ads.
  useEffect(() => {
    if (!clientId) return
    let cancelled = false

    const fetchActions = async () => {
      setActionsLoading(true)
      setActionsError(null)
      try {
        const res = await fetch(
          `/api/clients/${clientId}/google-ads-conversion-actions`,
          { credentials: 'include' },
        )
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          if (!cancelled) {
            setActionsError(body.error || `Failed (${res.status})`)
            setAvailable(Array.isArray(body.available) ? body.available : [])
            setCatalog(Array.isArray(body.catalog) ? body.catalog : [])
          }
          return
        }
        const data = await res.json()
        if (!cancelled) {
          setAvailable(Array.isArray(data.available) ? data.available : [])
          setCatalog(Array.isArray(data.catalog) ? data.catalog : [])
        }
      } catch (err) {
        if (!cancelled) {
          setActionsError(err instanceof Error ? err.message : 'Fetch failed')
        }
      } finally {
        if (!cancelled) setActionsLoading(false)
      }
    }

    fetchActions()
    return () => {
      cancelled = true
    }
  }, [clientId])

  const save = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dashboardConversionActions:
            selectedNames.length > 0 ? selectedNames.join('\n') : '',
          conversionActionCategories: categories.length > 0 ? categories : null,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setSaveError(body.errors?.[0]?.message || `Save failed (${res.status})`)
        return
      }
      setSavedSnapshot(snapshot)
      setSavedAt(Date.now())
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (configLoading) {
    return (
      <div
        style={{
          padding: '8px 12px',
          fontSize: 13,
          color: 'var(--theme-elevation-500)',
        }}
      >
        Loading conversion action settings…
      </div>
    )
  }

  if (configError) {
    return (
      <div
        style={{
          padding: '8px 12px',
          background: 'var(--theme-error-100)',
          color: 'var(--theme-error-800)',
          border: '1px solid var(--theme-error-300)',
          borderRadius: 4,
          fontSize: 13,
        }}
      >
        {configError}
      </div>
    )
  }

  return (
    <div>
      <div
        style={{
          marginBottom: 12,
          padding: '8px 12px',
          background: 'var(--theme-elevation-50)',
          border: '1px solid var(--theme-elevation-150)',
          borderRadius: 4,
          fontSize: 12,
          color: 'var(--theme-elevation-600)',
        }}
      >
        These settings are saved on the linked client record (not this audit) and
        take effect immediately on save — separate from the audit&apos;s Save
        button.
      </div>

      <ConversionActionPickerView
        available={available}
        catalog={catalog}
        loading={actionsLoading}
        error={actionsError}
        selectedNames={selectedNames}
        categories={categories}
        onChangeSelection={setSelectedNames}
        onChangeCategories={setCategories}
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginTop: 8,
        }}
      >
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          style={{
            fontSize: 13,
            padding: '8px 16px',
            background: dirty
              ? 'var(--theme-success-500)'
              : 'var(--theme-elevation-100)',
            border: '1px solid var(--theme-elevation-200)',
            borderRadius: 4,
            cursor: !dirty || saving ? 'not-allowed' : 'pointer',
            opacity: !dirty || saving ? 0.6 : 1,
            color: dirty ? '#fff' : 'var(--theme-elevation-700)',
            fontWeight: 600,
          }}
        >
          {saving ? 'Saving…' : 'Save conversion actions'}
        </button>
        {dirty && !saving && (
          <span style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>
            Unsaved changes
          </span>
        )}
        {!dirty && savedAt && (
          <span style={{ fontSize: 12, color: 'var(--theme-success-600)' }}>
            Saved
          </span>
        )}
        {saveError && (
          <span style={{ fontSize: 12, color: 'var(--theme-error-600)' }}>
            {saveError}
          </span>
        )}
      </div>
    </div>
  )
}

export default GoogleAdsAuditConversionActionPicker
