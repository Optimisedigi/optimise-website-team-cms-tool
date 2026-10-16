'use client'

import { useDocumentInfo, useFormModified } from '@payloadcms/ui'
import React, { useCallback, useEffect, useState } from 'react'

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; url: string; expiresAt: number }
  | { kind: 'error'; message: string }

/**
 * The In The Picture website's own page for the last saved version of this
 * post, framed in the CMS. The link is signed by the CMS and expires after 15
 * minutes; saving the post, or pressing Refresh, loads a fresh one.
 */
export default function WebsiteArticlePreview(): React.ReactElement {
  const { id, data } = useDocumentInfo()
  const modified = useFormModified()
  const savedAt = typeof data?.updatedAt === 'string' ? data.updatedAt : ''
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [reload, setReload] = useState(0)

  const load = useCallback(
    async (signal: AbortSignal) => {
      setState({ kind: 'loading' })
      try {
        const response = await fetch('/api/content-sync/preview-link', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ postId: id }),
          signal,
        })
        const body = (await response.json().catch(() => null)) as { url?: unknown; expiresAt?: unknown; error?: unknown } | null
        if (signal.aborted) return
        if (!response.ok || typeof body?.url !== 'string' || !/^https?:\/\//.test(body.url)) {
          setState({ kind: 'error', message: typeof body?.error === 'string' ? body.error : `Preview failed (${response.status})` })
          return
        }
        setState({ kind: 'ready', url: body.url, expiresAt: typeof body.expiresAt === 'string' ? Date.parse(body.expiresAt) : 0 })
      } catch {
        if (!signal.aborted) setState({ kind: 'error', message: 'Network error. Check your connection and press Refresh.' })
      }
    },
    [id],
  )

  // Load on open, after every save (updatedAt changes) and on Refresh.
  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [id, savedAt, reload, load])

  if (!id) return <p style={{ marginBlock: 16 }}>Save the post to see how it will look on the website.</p>

  const expired = state.kind === 'ready' && state.expiresAt > 0 && state.expiresAt <= Date.now()
  return (
    <div style={{ marginBlock: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <p style={{ margin: 0, flex: '1 1 260px', fontSize: 13, color: 'var(--theme-elevation-600, #555)' }}>
          This is the In The Picture website showing the <strong>last saved</strong> version. It is private and nothing is published.
          {modified ? <strong style={{ color: 'var(--theme-warning-700, #b45309)' }}> You have unsaved changes: save to update the preview.</strong> : null}
        </p>
        <button type="button" className="btn btn--style-secondary btn--size-small" onClick={() => setReload((n) => n + 1)} disabled={state.kind === 'loading'}>
          {state.kind === 'loading' ? 'Loading…' : 'Refresh'}
        </button>
        {state.kind === 'ready' && !expired ? (
          <a href={state.url} target="_blank" rel="noopener noreferrer">
            Open full screen
          </a>
        ) : null}
      </div>
      {state.kind === 'error' ? (
        <div role="alert" style={{ padding: '10px 12px', border: '1px solid var(--theme-error-500, #dc2626)', borderRadius: 4, background: 'var(--theme-error-50, #fef2f2)', fontSize: 13 }}>
          <strong>Can&apos;t preview yet:</strong> {state.message}
        </div>
      ) : null}
      {expired ? <p style={{ fontSize: 13 }}>This preview link has expired. Press Refresh.</p> : null}
      {state.kind === 'ready' && !expired ? (
        <iframe
          key={state.url}
          src={state.url}
          title="Website preview of this post"
          // Server-rendered page: no scripts needed. Links open in a new tab.
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          style={{ display: 'block', width: '100%', height: '85vh', border: '1px solid var(--theme-elevation-150, #ddd)', borderRadius: 4, background: '#fff' }}
        />
      ) : null}
    </div>
  )
}
