'use client'

import { useEffect, useState } from 'react'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [retried, setRetried] = useState(false)

  useEffect(() => {
    console.error('[admin-error]', error)

    // Auto-recover from transient cold-start failures.
    //
    // The overwhelming majority of admin load errors here are one-off:
    // the first request to a freshly-spun serverless lambda occasionally
    // fails on its first Turso/libSQL round-trip (connection not yet warm,
    // or a transient network blip), and an immediate retry on a warm
    // connection succeeds. Users already work around this by refreshing —
    // so we do that one refresh for them automatically.
    //
    // IMPORTANT: in production Next.js redacts error.message to a generic
    // string and only exposes `digest`, so we cannot key off the message
    // text (the old substring checks never matched in prod). Instead we do
    // a single guarded reload: a sessionStorage flag (keyed by digest)
    // ensures we reload at most once per error, so a genuinely persistent
    // failure falls through to the visible UI below instead of looping.
    try {
      const key = `admin-error-auto-reload:${error.digest ?? 'nodigest'}`
      if (typeof window !== 'undefined' && !sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, String(Date.now()))
        window.location.reload()
      }
    } catch {
      // sessionStorage unavailable (private mode/quota) — fall through to UI.
    }
  }, [error])

  // Clear the one-shot reload guard once the page has successfully rendered
  // this boundary without immediately reloading (i.e. the auto-reload already
  // happened and we're now showing the persistent-error UI). This keeps the
  // guard from blocking a fresh auto-recover on a later, unrelated cold start.
  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const key = `admin-error-auto-reload:${error.digest ?? 'nodigest'}`
        sessionStorage.removeItem(key)
      } catch {
        /* ignore */
      }
    }, 10_000)
    return () => window.clearTimeout(id)
  }, [error])

  const handleRefresh = () => {
    window.location.reload()
  }

  const handleRetry = () => {
    setRetried(true)
    reset()
  }

  return (
    <div
      style={{
        padding: 40,
        fontFamily: 'system-ui, sans-serif',
        maxWidth: 600,
        margin: '60px auto',
      }}
    >
      <h2 style={{ color: '#e11d48', marginBottom: 12 }}>
        Something went wrong
      </h2>
      <p style={{ color: '#666', marginBottom: 16 }}>
        {error.message || 'An unexpected error occurred while loading this page.'}
      </p>
      {error.digest && (
        <p style={{ color: '#999', fontSize: 12, marginBottom: 16 }}>
          Error digest: {error.digest}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        {!retried && (
          <button
            onClick={handleRetry}
            style={{
              padding: '8px 16px',
              background: '#000',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Try again
          </button>
        )}
        <button
          onClick={handleRefresh}
          style={{
            padding: '8px 16px',
            background: retried ? '#000' : 'transparent',
            color: retried ? '#fff' : '#000',
            border: retried ? 'none' : '1px solid #ccc',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          Refresh page
        </button>
      </div>
    </div>
  )
}
