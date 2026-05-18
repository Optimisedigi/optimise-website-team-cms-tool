'use client'

/**
 * Doc-level toolbar for the Contracts trash flow.
 *
 * Active contract: shows a red "Move to Trash" button (replaces Payload's
 *   one-click Delete with a two-step recoverable flow).
 *
 * Trashed contract: shows "Restore" (green) and "Delete Forever" (red,
 *   admin only) plus a banner explaining the 30-day window.
 *
 * Calls the matching custom endpoints under /api/contracts/[id]/...
 */
import { useDocumentInfo } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

type DocState = {
  deletedAt?: string | null
  contractTitle?: string | null
  isCurrentUserAdmin: boolean
}

function ContractTrashActions() {
  const { id } = useDocumentInfo()
  const [state, setState] = useState<DocState | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      try {
        const [docRes, meRes] = await Promise.all([
          fetch(`/api/contracts/${id}?depth=0`),
          fetch('/api/users/me'),
        ])
        const doc = await docRes.json()
        const me = await meRes.json()
        if (cancelled) return
        setState({
          deletedAt: doc?.deletedAt ?? null,
          contractTitle: doc?.contractTitle ?? null,
          isCurrentUserAdmin: me?.user?.role === 'admin',
        })
      } catch {
        if (!cancelled) setError('Failed to load contract status.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  if (!id || !state) return null

  const title = state.contractTitle || `#${id}`

  const action = async (endpoint: 'trash' | 'restore' | 'purge', confirmMsg: string) => {
    if (!window.confirm(confirmMsg)) return
    setBusy(endpoint)
    setError(null)
    try {
      const res = await fetch(`/api/contracts/${id}/${endpoint}`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Failed to ${endpoint}`)
      if (endpoint === 'purge') {
        window.location.href = '/admin/collections/contracts'
      } else {
        window.location.reload()
      }
    } catch (e: any) {
      setError(e?.message || `Failed to ${endpoint}`)
      setBusy(null)
    }
  }

  const btn = (background: string): React.CSSProperties => ({
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 600,
    border: 'none',
    borderRadius: 6,
    background,
    color: '#fff',
    cursor: busy ? 'wait' : 'pointer',
    opacity: busy ? 0.7 : 1,
  })

  if (state.deletedAt) {
    const deleted = new Date(state.deletedAt)
    const purgeAt = new Date(deleted.getTime() + 30 * 24 * 60 * 60 * 1000)
    const daysLeft = Math.max(
      0,
      Math.ceil((purgeAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
    )
    return (
      <div
        style={{
          background: '#fef2f2',
          border: '1px solid #fecaca',
          color: '#991b1b',
          padding: '12px 16px',
          borderRadius: 8,
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontWeight: 600 }}>🗑 This contract is in trash.</span>
        <span style={{ fontSize: 13 }}>
          Trashed {deleted.toLocaleDateString('en-AU')} \u2014 auto-purges in{' '}
          <strong>{daysLeft} day{daysLeft === 1 ? '' : 's'}</strong>.
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => action('restore', `Restore \u201c${title}\u201d from trash?`)}
            disabled={!!busy}
            style={btn('#16a34a')}
          >
            {busy === 'restore' ? 'Restoring\u2026' : 'Restore'}
          </button>
          {state.isCurrentUserAdmin && (
            <button
              type="button"
              onClick={() =>
                action(
                  'purge',
                  `Permanently delete \u201c${title}\u201d? This cannot be undone.`,
                )
              }
              disabled={!!busy}
              style={btn('#dc2626')}
            >
              {busy === 'purge' ? 'Deleting\u2026' : 'Delete Forever'}
            </button>
          )}
        </div>
        {error && (
          <span style={{ width: '100%', color: '#991b1b', fontSize: 12, marginTop: 4 }}>
            {error}
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: 8,
        marginBottom: 12,
        alignItems: 'center',
      }}
    >
      {error && (
        <span style={{ color: '#991b1b', fontSize: 12, marginRight: 8 }}>{error}</span>
      )}
      <button
        type="button"
        onClick={() =>
          action(
            'trash',
            `Move \u201c${title}\u201d to trash?\n\nIt will be recoverable for 30 days, then permanently deleted.`,
          )
        }
        disabled={!!busy}
        style={btn('#dc2626')}
      >
        {busy === 'trash' ? 'Moving\u2026' : '🗑 Move to Trash'}
      </button>
    </div>
  )
}

export default ContractTrashActions
