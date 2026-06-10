'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import OptiMateVoice from './OptiMateVoice'

/**
 * OptiMate Email Reply voice agent panel.
 *
 * A full conversational voice agent (the SAME OpenAI Realtime / WebRTC
 * infrastructure as the OptiMate Google Ads voice agent — local helper bridge,
 * oai-events data channel, response coordinator). You talk back and forth with
 * the agent about what an email reply should say; the agent drafts the reply
 * which lands in the review box here; you edit and confirm; then it saves to
 * Gmail Drafts (threaded reply when replying to an existing message).
 *
 * Gmail is DRAFT-ONLY — nothing is ever sent.
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

interface TurnMsg {
  id: string
  role: 'user' | 'assistant'
  text: string
}

function parseFromAddress(from: string): string {
  const m = from.match(/<([^>]+)>/)
  return m ? m[1].trim() : from.trim()
}

function replySubject(subject: string): string {
  return /^re:/i.test(subject.trim()) ? subject : `Re: ${subject}`
}

export default function EmailReplyVoiceChat(): React.ReactElement {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)

  // Optional inbound message to reply to.
  const [picking, setPicking] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [attached, setAttached] = useState<MessageBody | null>(null)
  const [loadingMessage, setLoadingMessage] = useState(false)

  // Live voice transcript turns.
  const [turns, setTurns] = useState<TurnMsg[]>([])
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null)
  const controlsRef = useRef<HTMLDivElement | null>(null)

  // The drafted reply under review.
  const [draftSubject, setDraftSubject] = useState('')
  const [draftBody, setDraftBody] = useState('')

  const [saving, setSaving] = useState(false)
  const [savedUrl, setSavedUrl] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/gmail/status', { credentials: 'include' })
        const data = (await res.json()) as {
          connected?: boolean
          email?: string | null
          error?: string
        }
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

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [turns, draftBody])

  const pushTurn = useCallback((voiceId: string, role: 'user' | 'assistant', text: string) => {
    setTurns((prev) => {
      const idx = prev.findIndex((t) => t.id === voiceId)
      if (idx === -1) return [...prev, { id: voiceId, role, text }]
      const next = [...prev]
      next[idx] = { ...next[idx], text }
      return next
    })
  }, [])

  const onStagedEmailReply = useCallback((reply: { subject?: string; body: string }) => {
    setDraftBody(reply.body)
    if (reply.subject) setDraftSubject(reply.subject)
    setSavedUrl(null)
    setSaveError(null)
  }, [])

  const runSearch = useCallback(async () => {
    const q = query.trim()
    if (!q) return
    setSearching(true)
    setSearchError(null)
    setSearched(true)
    try {
      const res = await fetch(`/api/gmail/search?q=${encodeURIComponent(q)}&max=20`, {
        credentials: 'include',
      })
      const data = (await res.json()) as {
        results?: SearchResult[]
        error?: string
        reason?: string
      }
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

  const attachMessage = useCallback(async (r: SearchResult) => {
    setLoadingMessage(true)
    setSearchError(null)
    try {
      const res = await fetch(`/api/gmail/message/${encodeURIComponent(r.messageId)}`, {
        credentials: 'include',
      })
      const data = (await res.json()) as MessageBody & { error?: string; reason?: string }
      if (!res.ok) {
        setSearchError(
          data.reason || (data as { error?: string }).error || `Failed to load message (${res.status})`,
        )
        return
      }
      setAttached(data)
      setDraftSubject(replySubject(data.subject))
      setPicking(false)
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Failed to load message')
    } finally {
      setLoadingMessage(false)
    }
  }, [])

  const saveDraft = useCallback(async () => {
    if (!draftBody.trim()) return
    setSaving(true)
    setSaveError(null)
    setSavedUrl(null)
    try {
      const replyingTo = attached
      const res = await fetch('/api/gmail/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(
          replyingTo
            ? {
                to: parseFromAddress(replyingTo.from),
                subject: draftSubject.trim() || replySubject(replyingTo.subject),
                body: draftBody,
                threadId: replyingTo.threadId || undefined,
                inReplyTo: replyingTo.rfcMessageId || undefined,
              }
            : {
                subject: draftSubject.trim() || undefined,
                body: draftBody,
              },
        ),
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
  }, [attached, draftBody, draftSubject])

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
        <a href="/api/gmail/connect" style={connectButton}>
          Connect Gmail
        </a>
      </div>
    )
  }

  return (
    <div style={fillColumn}>
      {/* Header: connection + voice controls portal target */}
      <div style={header}>
        <span style={{ fontSize: 11, color: '#6b7280', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {connectedEmail ? `Gmail · ${connectedEmail}` : 'Email reply'}
          {voiceStatus ? ` · ${voiceStatus}` : ''}
        </span>
        <div ref={controlsRef} style={{ display: 'flex', alignItems: 'center' }} />
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 0', minHeight: 0 }}>
        {/* Inbound email picker */}
        {!attached && !picking && (
          <button type="button" onClick={() => setPicking(true)} style={pickLink}>
            ↩ Reply to an existing email (optional)
          </button>
        )}

        {picking && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
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
              <button type="button" onClick={runSearch} disabled={searching} style={{ ...primaryButton, opacity: searching ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                {searching ? 'Searching…' : 'Search'}
              </button>
            </div>
            <button type="button" onClick={() => setPicking(false)} style={ghostLink}>
              Cancel
            </button>
            {searchError && <div style={errorBox}>{searchError}</div>}
            {loadingMessage && <div style={{ fontSize: 12, color: '#6b7280' }}>Loading email…</div>}
            {!searching && searched && results.length === 0 && !searchError && (
              <div style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', padding: '12px 8px' }}>
                No matching emails.
              </div>
            )}
            {results.map((r) => (
              <button key={r.messageId} type="button" onClick={() => attachMessage(r)} style={resultRow}>
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

        {attached && (
          <div style={{ background: 'var(--theme-elevation-50, #f3f4f6)', borderRadius: 8, padding: 10, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Replying to: {attached.subject || '(no subject)'}
              </div>
              <button type="button" onClick={() => { setAttached(null); setDraftSubject('') }} style={ghostLink}>
                Remove
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>From: {attached.from}</div>
            <div style={{ fontSize: 12, color: '#374151', marginTop: 8, whiteSpace: 'pre-wrap', maxHeight: 120, overflowY: 'auto' }}>
              {attached.body || '(empty body)'}
            </div>
          </div>
        )}

        {/* Voice transcript */}
        {turns.length === 0 ? (
          <div style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', padding: '12px 8px' }}>
            Tap the mic and talk to the agent about the reply you want. It will draft it here for
            you to review before saving to Gmail Drafts.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {turns.map((t) => (
              <div
                key={t.id}
                style={{
                  alignSelf: t.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  background: t.role === 'user' ? '#2563eb' : 'var(--theme-elevation-50, #f3f4f6)',
                  color: t.role === 'user' ? '#fff' : 'var(--theme-text, #1f2937)',
                  borderRadius: 10,
                  padding: '6px 10px',
                  fontSize: 13,
                  lineHeight: 1.4,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {t.text}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Draft review box */}
      {draftBody && (
        <div style={{ borderTop: '1px solid var(--theme-border-color, #e5e7eb)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>
            Draft reply — review &amp; edit before saving
          </div>
          {!attached && (
            <input
              type="text"
              value={draftSubject}
              onChange={(e) => setDraftSubject(e.target.value)}
              placeholder="Subject (optional)…"
              style={inputStyle}
            />
          )}
          <textarea
            value={draftBody}
            onChange={(e) => setDraftBody(e.target.value)}
            rows={8}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.45 }}
          />
          <button
            type="button"
            onClick={saveDraft}
            disabled={saving || !draftBody.trim()}
            style={{ ...primaryButton, background: '#059669', opacity: saving || !draftBody.trim() ? 0.6 : 1 }}
          >
            {saving ? 'Saving…' : attached ? 'Confirm & save threaded reply' : 'Confirm & save to Gmail Drafts'}
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
        </div>
      )}

      {/* Voice trigger row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, paddingTop: 10, marginTop: 4, borderTop: '1px solid var(--theme-border-color, #e5e7eb)' }}>
        <OptiMateVoice
          auditId="email"
          mode="email"
          businessName="email reply"
          attachedEmailMessageId={attached?.messageId ?? null}
          onTurn={pushTurn}
          onStatusChange={setVoiceStatus}
          onStagedEmailReply={onStagedEmailReply}
          controlsContainer={controlsRef.current}
        />
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

const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '0 0 8px 0',
  marginBottom: 4,
  borderBottom: '1px solid var(--theme-border-color, #e5e7eb)',
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

const connectButton: React.CSSProperties = {
  padding: '8px 14px',
  background: '#2563eb',
  color: '#fff',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  textDecoration: 'none',
}

const ghostLink: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#2563eb',
  fontSize: 11,
  cursor: 'pointer',
  padding: 0,
}

const pickLink: React.CSSProperties = {
  background: 'transparent',
  border: '1px dashed var(--theme-border-color, #d1d5db)',
  color: '#2563eb',
  fontSize: 12,
  cursor: 'pointer',
  padding: '8px 10px',
  borderRadius: 6,
  width: '100%',
  textAlign: 'left',
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
