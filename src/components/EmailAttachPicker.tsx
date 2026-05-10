'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Lightweight popover for searching the logged-in user's Gmail inbox and
 * picking one message to attach as per-turn context for OptiMate. No
 * caching, no store — re-searches on every open. Bodies aren't fetched
 * here; the chat route fetches them server-side from the metadata we hand
 * back via onSelect.
 */

export interface AttachedEmailMeta {
  messageId: string
  subject: string
  from: string
  date: string
  snippet: string
}

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (meta: AttachedEmailMeta) => void
}

interface SearchHit {
  messageId: string
  threadId: string
  subject: string
  from: string
  date: string
  snippet: string
}

type ErrorState =
  | { kind: 'none' }
  | { kind: 'scope-insufficient' }
  | { kind: 'not-connected' }
  | { kind: 'other'; message: string }

function relativeTime(iso: string): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const diffMs = Date.now() - t
  const min = Math.round(diffMs / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(t).toLocaleDateString()
}

export default function EmailAttachPicker({ open, onClose, onSelect }: Props) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ErrorState>({ kind: 'none' })
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset state every time the popover opens.
  useEffect(() => {
    if (open) {
      setQ('')
      setResults([])
      setError({ kind: 'none' })
      setLoading(false)
      // Defer focus so the input has rendered.
      const t = setTimeout(() => inputRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [open])

  // Debounced search on q changes.
  useEffect(() => {
    if (!open) return
    const trimmed = q.trim()
    if (trimmed.length < 2) {
      setResults([])
      setError({ kind: 'none' })
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/gmail/search?q=${encodeURIComponent(trimmed)}&max=20`,
          { credentials: 'include' },
        )
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          if (data?.error === 'scope-insufficient') {
            setError({ kind: 'scope-insufficient' })
          } else if (data?.error === 'gmail-not-connected') {
            setError({ kind: 'not-connected' })
          } else {
            setError({ kind: 'other', message: data?.error ?? `Search failed (${res.status})` })
          }
          setResults([])
        } else {
          setError({ kind: 'none' })
          setResults(Array.isArray(data?.results) ? data.results : [])
        }
      } catch (err) {
        if (!cancelled) {
          setError({ kind: 'other', message: err instanceof Error ? err.message : 'Search failed' })
          setResults([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [q, open])

  if (!open) return null

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        left: 0,
        right: 0,
        background: 'var(--theme-input-bg, #fff)',
        border: '1px solid var(--theme-border-color, #e5e7eb)',
        borderRadius: 10,
        boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
        zIndex: 50,
        maxHeight: 360,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 10px',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>📎 Attach email</span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            onClose()
          }}
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: '#6b7280',
            fontSize: 14,
            lineHeight: 1,
            padding: 4,
          }}
          aria-label="Close email picker"
        >
          ✕
        </button>
      </div>

      <div style={{ padding: 8, borderBottom: '1px solid #f3f4f6' }}>
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder='Search Gmail (e.g. from:client subject:"google ads")'
          style={{
            width: '100%',
            padding: '8px 10px',
            border: '1px solid var(--theme-border-color, #e5e7eb)',
            borderRadius: 6,
            fontSize: 12,
            background: 'var(--theme-input-bg, #fff)',
            color: 'var(--theme-text, #1f2937)',
            outline: 'none',
          }}
        />
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {error.kind === 'scope-insufficient' && (
          <div style={{ padding: 12, fontSize: 12, color: '#374151' }}>
            <p style={{ margin: '0 0 8px 0' }}>
              Gmail search needs the read-only permission. Reconnect Gmail to grant it.
            </p>
            <a
              href="/api/gmail/connect"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                padding: '6px 12px',
                background: '#2563eb',
                color: '#fff',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Reconnect Gmail
            </a>
          </div>
        )}

        {error.kind === 'not-connected' && (
          <div style={{ padding: 12, fontSize: 12, color: '#374151' }}>
            <p style={{ margin: '0 0 8px 0' }}>Gmail isn&apos;t connected yet.</p>
            <a
              href="/api/gmail/connect"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                padding: '6px 12px',
                background: '#2563eb',
                color: '#fff',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Connect Gmail
            </a>
          </div>
        )}

        {error.kind === 'other' && (
          <div style={{ padding: 12, fontSize: 12, color: '#dc2626' }}>{error.message}</div>
        )}

        {error.kind === 'none' && loading && (
          <div style={{ padding: 12, fontSize: 12, color: '#6b7280' }}>Searching…</div>
        )}

        {error.kind === 'none' && !loading && q.trim().length >= 2 && results.length === 0 && (
          <div style={{ padding: 12, fontSize: 12, color: '#6b7280' }}>No matching emails.</div>
        )}

        {error.kind === 'none' && !loading && q.trim().length < 2 && (
          <div style={{ padding: 12, fontSize: 12, color: '#6b7280' }}>
            Type at least 2 characters. Gmail&apos;s full search syntax works
            (<code style={{ fontSize: 11 }}>from:</code>, <code style={{ fontSize: 11 }}>subject:</code>,{' '}
            <code style={{ fontSize: 11 }}>has:attachment</code>, etc.).
          </div>
        )}

        {error.kind === 'none' &&
          results.map((r) => (
            <button
              key={r.messageId}
              type="button"
              onClick={(e) => {
                e.preventDefault()
                onSelect({
                  messageId: r.messageId,
                  subject: r.subject,
                  from: r.from,
                  date: r.date,
                  snippet: r.snippet,
                })
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 12px',
                border: 'none',
                borderBottom: '1px solid #f3f4f6',
                background: 'transparent',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f9fafb'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#1f2937',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {r.subject || '(no subject)'}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: '#6b7280',
                  display: 'flex',
                  gap: 6,
                  marginTop: 2,
                }}
              >
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r.from}
                </span>
                <span style={{ flexShrink: 0 }}>{relativeTime(r.date)}</span>
              </div>
              {r.snippet && (
                <div
                  style={{
                    fontSize: 11,
                    color: '#9ca3af',
                    marginTop: 2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {r.snippet}
                </div>
              )}
            </button>
          ))}
      </div>
    </div>
  )
}
