'use client'

import { useDocumentInfo, useField } from '@payloadcms/ui'
import { useEffect, useMemo, useState } from 'react'
import {
  ConversionActionPickerView,
  type ConversionActionCategory,
} from './ConversionActionPickerView'

/**
 * Admin field component for `client.dashboardConversionActions`.
 *
 * Replaces the textarea with a checkbox list populated from the actual
 * conversion actions Google Ads returns for this client's customerId.
 *
 * Storage format remains newline-separated names (back-compat with existing
 * dashboard read paths in src/app/(frontend)/google-dashboard/[slug]/page.tsx).
 *
 * Form-bound wrapper: persists through Payload's `useField` against the current
 * document (the client). Presentational rendering lives in
 * `ConversionActionPickerView`.
 *
 * Used in: Clients collection > Google Ads tab.
 */
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
  const [catalog, setCatalog] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Parse newline-separated stored value -> ordered names
  const selectedNames = useMemo(() => {
    const raw = typeof value === 'string' ? value : ''
    return raw
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  }, [value])

  const categories = useMemo(
    () => (Array.isArray(categoryValue) ? categoryValue : []),
    [categoryValue],
  )

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
    <ConversionActionPickerView
      available={available}
      catalog={catalog}
      loading={loading}
      error={error}
      selectedNames={selectedNames}
      categories={categories}
      onChangeSelection={(names) =>
        setValue(names.length > 0 ? names.join('\n') : '')
      }
      onChangeCategories={(rows) => setCategoryValue(rows.length > 0 ? rows : null)}
    />
  )
}

export default GoogleAdsConversionActionPicker
