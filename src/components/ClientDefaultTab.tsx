'use client'

/**
 * Forces the Clients admin doc view to land on the first tab (Business)
 * every time, instead of restoring the last-active tab from
 * payload_preferences.
 *
 * Strategy:
 *  1. Synchronously reset any `tabs-*` keys in the local preferences
 *     cache to `{ tabIndex: 0 }` during render (before Payload's <Tabs>
 *     useEffect reads them).
 *  2. Persist the reset to the server in a useEffect, so subsequent
 *     navigations also land on tab 0.
 *
 * Scoped to the current document's `preferencesKey` so it only affects
 * the client the user just opened.
 */
import { useEffect, useRef } from 'react'
import { useDocumentInfo, usePreferences } from '@payloadcms/ui'

function ClientDefaultTab() {
  const { preferencesKey } = useDocumentInfo()
  const { getPreference, setPreference } = usePreferences()
  const ranRef = useRef(false)

  // Synchronous cache reset on first render. getPreference will return a
  // cached value if one exists; mutating it before <Tabs> reads it avoids
  // a tab-flicker. Wrapped in a ref to guarantee single execution per
  // mount.
  if (!ranRef.current && preferencesKey) {
    ranRef.current = true
    try {
      // Best-effort, no await: read whatever is in cache and reset tabs.
      const maybePromise = getPreference(preferencesKey) as
        | Promise<unknown>
        | { fields?: Record<string, { tabIndex?: number }> }
        | null
      const apply = (existing: any) => {
        const fields = (existing?.fields as Record<string, { tabIndex?: number }>) || {}
        const next: Record<string, { tabIndex?: number }> = { ...fields }
        let mutated = false
        for (const key of Object.keys(fields)) {
          if (key.startsWith('tabs-') && fields[key]?.tabIndex !== 0) {
            next[key] = { ...fields[key], tabIndex: 0 }
            mutated = true
          }
        }
        if (mutated) {
          void setPreference(preferencesKey, { ...(existing ?? {}), fields: next })
        }
      }
      if (maybePromise && typeof (maybePromise as Promise<unknown>).then === 'function') {
        ;(maybePromise as Promise<unknown>).then(apply).catch(() => {})
      } else {
        apply(maybePromise)
      }
    } catch {
      /* preferences are non-critical; swallow */
    }
  }

  // Backup: re-apply on every mount via useEffect as well, in case the
  // render-phase write lost a race with <Tabs>' own useEffect.
  useEffect(() => {
    if (!preferencesKey) return
    let cancelled = false
    ;(async () => {
      try {
        const existing = (await getPreference(preferencesKey)) as
          | { fields?: Record<string, { tabIndex?: number }> }
          | null
        if (cancelled) return
        const fields = existing?.fields || {}
        const next = { ...fields }
        let mutated = false
        for (const key of Object.keys(fields)) {
          if (key.startsWith('tabs-') && fields[key]?.tabIndex !== 0) {
            next[key] = { ...fields[key], tabIndex: 0 }
            mutated = true
          }
        }
        if (mutated) {
          await setPreference(preferencesKey, { ...(existing ?? {}), fields: next })
        }
      } catch {
        /* swallow */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [preferencesKey, getPreference, setPreference])

  return null
}

export default ClientDefaultTab
