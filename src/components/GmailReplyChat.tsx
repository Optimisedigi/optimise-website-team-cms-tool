'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Gmail reply flow for the OptiMate launcher panel.
 *
 * A self-contained, agent-less shortcut: search the inbox → pick a message →
 * AI drafts a reply → edit it → save to Gmail Drafts (threaded in-reply). It
 * reuses the existing per-user Gmail OAuth and read-only search/body routes,
 * the new /api/gmail/ai-reply generator, and /api/gmail/draft for saving.
 *
 * We never send mail — the draft lands in the user's Gmail Drafts with the
 * original recipient prefilled, threaded into the original conversation.
 */

interface SearchResult {
  messageId: string
  threadId: string
  subject: string
  from: string
  date: string
  snippet: string
}

interface MessageBody {
  messageId: string
  threadId: string
  rfcMessageId: string
  subject: string
  from: string
  to: string
  date: string
  body: string
}

type Phase = 'search' | 'message'

const DEFAULT_QUERY = 'in:inbox newer_than:14d'

function parseFromAddress(from: string): string {
  // "Name <email@x.com>" → "email@x.com"; bare addresses pass through.
  const m = from.match(/<([^>]+)>/)
  return m ? m[1].trim() : from.trim()
}

function replySubject(subject: string): string {
  return /^re:/i.test(subject.trim()) ? subject : `Re: ${subject}`
}

export default function GmailReplyChat(): React.ReactElement {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)

  const [phase, setPhase] = useState<Phase>('search')
  const [query, setQuery] = useState(DEFAULT_QUERY)
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  const [message, setMessage] = useState<MessageBody | null>(null)
  const [loadingMessage, setLoadingMessage] = useState(false)

  const [instructions, setInstructions] = useState('')
  const [draftingReply, setDraftingReply] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [replyError, setReplyError] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [savedUrl, setSavedUrl] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/gmail/status', { credentials: 'include' })
        const data = (await res.json()) as { connected?: boolean; email?: string | null; error?: string }
        if (cancelled) return
        if (!res.ok) {
          setStatusError(data.error ?? `Failed (${res.status})`)
          setConnected(false)
          return
        }
        setConnected(Boolean(data.connected))
        setConnectedEmail(data.email ?? null)
      } catch (err) {
        if (cancelled) return
        setStatusError(err instanceof Error ? err.message : 'Failed to check Gmail status')
        setConnected(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const runSearch = useCallback(async () => {
    const q = query.trim() || DEFAULT_QUERY
    setSearching(true)
    setSearchError(null)
    setSearched(true)
    try {
      const res = await fetch(`/api/gmail/search?q=${encodeURIComponent(q)}&max=20`, {
        credentials: 'include',
      })
      const data = (await res.json()) as { results?: SearchResult[]; error?: string; reason?: string }
      if (!res.ok) {
        setSearchError(
          data.error === 'scope-insufficient'
            ? 'Gmail needs reconnecting to grant read access.'
            : data.reason || data.error || `Search failed (${res.status})`,
        )
        setResults([])
        return
      }
      setResults(Array.isArray(data.results) ? data.results : [])
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed')
      setResults([])
    } finally {
      setSearching(false)
    }
  }, [query])

  const openMessage = useCallback(async (r: SearchResult) => {
    setPhase('message')
    setLoadingMessage(true)
    setMessage(null)
    setReplyText('')
    setReplyError(null)
    setInstructions('')
    setSavedUrl(null)
    setSaveError(null)
    try {
      const res = await fetch(`/api/gmail/message/${encodeURIComponent(r.messageId)}`, {
        credentials: 'include',
      })
      const data = (await res.json()) as MessageBody & { error?: string; reason?: string }
      if (!res.ok) {
        setReplyError(data.reason || (data as { error?: string }).error || `Failed to load message (${res.status})`)
        return
      }
      setMessage(data)
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'Failed to load message')
    } finally {
      setLoadingMessage(false)
    }
  }, [])

  const draftReply = useCallback(async () => {
    if (!message) return
    setDraftingReply(true)
    setReplyError(null)
    try {
      const res = await fetch('/api/gmail/ai-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          bodyText: message.body,
          subject: message.subject,
          from: message.from,
          instructions: instructions.trim() || undefined,
        }),
      })
      const data = (await res.json()) as { reply?: string; error?: string }
      if (!res.ok) {
        setReplyError(data.error || `Draft failed (${res.status})`)
        return
      }
      setReplyText(data.reply ?? '')
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'Draft failed')
    } finally {
      setDraftingReply(false)
    }
  }, [message, instructions])

  const saveDraft = useCallback(async () => {
    if (!message || !replyText.trim()) return
    setSaving(true)
    setSaveError(null)
    setSavedUrl(null)
    try {
      const res = await fetch('/api/gmail/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          to: parseFromAddress(message.from),
          subject: replySubject(message.subject),
          body: replyText,
          threadId: message.threadId || undefined,
          inReplyTo: message.rfcMessageId || undefined,
        }),
      })
      const data = (await res.json()) as { gmailUrl?: string; error?: string; reason?: string }
      if (!res.ok) {
        setSaveError(data.reason || data.error || `Save failed (${res.status})`)
        return
      }
      setSavedUrl(data.gmailUrl ?? null)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [message, replyText])

  // ---- Render branches ----

  if (connected === null) {
    return (
      <div style={{ ...fillColumn, alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 13 }}>
        Checking Gmail connection…
      </div>
    )
  }

  if (!connected) {
    return (
      <div style={{ ...fillColumn, alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center', padding: 16 }}>
        <div style={{ fontSize: 13, color: '#374151' }}>
          Connect your Gmail account to draft replies.
        </div>
        {statusError && <div style={{ fontSize: 12, color: '#dc2626' }}>{statusError}</div>}
        <a
          href="/api/gmail/connect"
          style={{
            padding: '8px 14px',
            background: '#2563eb',
            color: '#fff',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Connect Gmail
        </a>
      </div>
    )
  }

  return (
    <div style={fillColumn}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '0 0 8px 0',
          marginBottom: 4,
          borderBottom: '1px solid var(--theme-border-color, #e5e7eb)',
        }}
      >
        <span style={{ fontSize: 11, color: '#6b7280' }}>
          {connectedEmail ? `Gmail · ${connectedEmail}` : 'Gmail reply'}
        </span>
        {phase === 'message' && (
          <button
            type="button"
            onClick={() => setPhase('search')}
            style={ghostLink}
          >
            ← Back to results
          </button>
        )}
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 0', minHeight: 0 }}>
        {phase === 'search' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    runSearch()
                  }
                }}
                placeholder="Search inbox (Gmail syntax)…"
                style={inputStyle}
              />
              <button
                type="button"
                onClick={runSearch}
                disabled={searching}
                style={{ ...primaryButton, opacity: searching ? 0.6 : 1, whiteSpace: 'nowrap' }}
              >
                {searching ? 'Searching…' : 'Search'}
              </button>
            </div>

            {searchError && <div style={errorBox}>{searchError}</div>}

            {!searching && searched && results.length === 0 && !searchError && (
              <div style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', padding: '16px 8px' }}>
                No matching emails.
              </div>
            )}

            {!searched && !searching && (
              <div style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', padding: '16px 8px' }}>
                Search your inbox to pick an email to reply to.
              </div>
            )}

            {results.map((r) => (
              <button
                key={r.messageId}
                type="button"
                onClick={() => openMessage(r)}
                style={resultRow}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f3f4f6'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--theme-input-bg, #fff)'
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.subject || '(no subject)'}
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.from}
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.snippet}
                </div>
              </button>
            ))}
          </div>
        )}

        {phase === 'message' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {loadingMessage && (
              <div style={{ fontSize: 12, color: '#6b7280', padding: '8px 0' }}>Loading email…</div>
            )}
            {replyError && <div style={errorBox}>{replyError}</div>}

            {message && (
              <>
                <div style={{ background: 'var(--theme-elevation-50, #f3f4f6)', borderRadius: 8, padding: 10 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{message.subject || '(no subject)'}</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>From: {message.from}</div>
                  <div
                    style={{
                      fontSize: 12,
                      color: '#374151',
                      marginTop: 8,
                      whiteSpace: 'pre-wrap',
                      maxHeight: 160,
                      overflowY: 'auto',
                    }}
                  >
                    {message.body || '(empty body)'}
                  </div>
                </div>

                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Optional: how should I reply? (tone, key points, decisions)…"
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                />

                <button
                  type="button"
                  onClick={draftReply}
                  disabled={draftingReply}
                  style={{ ...primaryButton, opacity: draftingReply ? 0.6 : 1 }}
                >
                  {draftingReply ? 'Drafting…' : replyText ? 'Redraft reply' : 'Draft reply'}
                </button>

                {replyText && (
                  <>
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      rows={8}
                      style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.45 }}
                    />
                    <button
                      type="button"
                      onClick={saveDraft}
                      disabled={saving || !replyText.trim()}
                      style={{ ...primaryButton, background: '#059669', opacity: saving || !replyText.trim() ? 0.6 : 1 }}
                    >
                      {saving ? 'Saving…' : 'Save to Gmail Drafts'}
                    </button>
                    {saveError && <div style={errorBox}>{saveError}</div>}
                    {savedUrl && (
                      <div style={{ fontSize: 12, color: '#166534' }}>
                        Saved to Drafts.{' '}
                        <a href={savedUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>
                          Open in Gmail →
                        </a>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const fillColumn: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--theme-border-color, #e5e7eb)',
  borderRadius: 6,
  background: 'var(--theme-input-bg, #fff)',
  color: 'var(--theme-text, #1f2937)',
  fontSize: 13,
}

const primaryButton: React.CSSProperties = {
  padding: '8px 14px',
  background: '#2563eb',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
}

const ghostLink: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#2563eb',
  fontSize: 11,
  cursor: 'pointer',
  padding: 0,
}

const errorBox: React.CSSProperties = {
  background: '#fee2e2',
  color: '#b91c1c',
  border: '1px solid #fecaca',
  borderRadius: 6,
  padding: '8px 10px',
  fontSize: 12,
}

const resultRow: React.CSSProperties = {
  textAlign: 'left',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: '8px 10px',
  border: '1px solid var(--theme-border-color, #e5e7eb)',
  borderRadius: 6,
  background: 'var(--theme-input-bg, #fff)',
  color: 'var(--theme-text, #1f2937)',
  cursor: 'pointer',
}
