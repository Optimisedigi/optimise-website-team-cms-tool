'use client'

import { useEffect, useState } from 'react'

/**
 * App-root global error boundary.
 *
 * This is the ONLY boundary Next.js invokes when the failure happens in the
 * root layout itself (e.g. the (payload) RootLayout, which initialises Payload
 * and makes its first Turso/libSQL round-trip on a cold serverless start).
 * Route-level `error.tsx` boundaries sit *inside* the layout and never run for
 * a root-layout crash — that case renders Next's bare "Application error: a
 * server-side exception has occurred" fallback instead.
 *
 * The overwhelming majority of these are one-off cold-start blips: the first
 * DB request to a freshly-spun lambda transiently fails, and an immediate
 * retry on a warm connection succeeds (which is why a manual refresh fixes it).
 * So we do that one refresh automatically.
 *
 * In production Next.js redacts error.message to a generic string and exposes
 * only `digest`, so we can't key off message text — we do a single guarded
 * reload (sessionStorage flag keyed by digest, auto-cleared after 10s) so a
 * transient error self-heals while a genuinely persistent failure falls
 * through to the visible UI instead of looping.
 *
 * Because it replaces the root layout when it fires, global-error must render
 * its own <html>/<body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [retried, setRetried] = useState(false)

  useEffect(() => {
    console.error('[global-error]', error)
    try {
      const key = `global-error-auto-reload:${error.digest ?? 'nodigest'}`
      if (typeof window !== 'undefined' && !sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, String(Date.now()))
        window.location.reload()
      }
    } catch {
      // sessionStorage unavailable (private mode/quota) — fall through to UI.
    }
  }, [error])

  // Clear the one-shot guard shortly after we land on the persistent-error UI
  // so a later, unrelated cold start can auto-recover again.
  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        sessionStorage.removeItem(`global-error-auto-reload:${error.digest ?? 'nodigest'}`)
      } catch {
        /* ignore */
      }
    }, 10_000)
    return () => window.clearTimeout(id)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#f4f6fa',
          color: '#111827',
        }}
      >
        <div style={{ maxWidth: 600, margin: '60px auto', padding: 40 }}>
          <h2 style={{ color: '#e11d48', marginBottom: 12 }}>Something went wrong</h2>
          <p style={{ color: '#4b5563', marginBottom: 16 }}>
            The page hit a temporary error while loading. We&rsquo;re retrying automatically;
            if this screen stays, use the buttons below.
          </p>
          {error.digest && (
            <p style={{ color: '#9ca3af', fontSize: 12, marginBottom: 16 }}>
              Error digest: {error.digest}
            </p>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            {!retried && (
              <button
                onClick={() => {
                  setRetried(true)
                  reset()
                }}
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
              onClick={() => window.location.reload()}
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
      </body>
    </html>
  )
}
