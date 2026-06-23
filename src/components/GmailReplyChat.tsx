'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CHAT_PICKER_MODELS,
  DEFAULT_CHAT_MODEL,
  isCanonicalModel,
} from '@/lib/agents/_shared/llm/registry'
import VoiceField from './VoiceField'

/**
 * Gmail draft flow for the OptiMate launcher panel.
 *
 * Supports two entry points:
 *   - draft a brand-new outbound email
 *   - search Gmail, pick a message, then work with a chat-style reply drafter
 *
 * We save to Gmail Drafts only. Nothing is sent automatically.
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

interface ContactSuggestion {
  name: string
  email: string
}

type Phase = 'compose' | 'search' | 'message'
type ChatRole = 'user' | 'assistant' | 'error'

interface ChatMessage {
  role: ChatRole
  content: string
  modelUsed?: string
  modelRequested?: string
  runId?: string
}

interface GmailReplyChatProps {
  initialPhase?: Phase
}

const DEFAULT_QUERY = ''

function parseFromAddress(from: string): string {
  // "Name <email@x.com>" → "email@x.com"; bare addresses pass through.
  const m = from.match(/<([^>]+)>/)
  return m ? m[1].trim() : from.trim()
}

function replySubject(subject: string): string {
  return /^re:/i.test(subject.trim()) ? subject : `Re: ${subject}`
}

interface EmailChatResponse {
  reply?: string
  stagedEmailReply?: { subject?: string; body?: string }
  runId?: string
  modelRequested?: string
  modelUsed?: string
  source?: string
  error?: string
}

function recipientSearchTerm(value: string): string {
  const last = value.split(',').pop()?.trim() ?? ''
  return last.replace(/^"|"$/g, '')
}

function replaceActiveRecipient(value: string, suggestion: ContactSuggestion): string {
  const parts = value.split(',')
  const prefix = parts.slice(0, -1).map((part) => part.trim()).filter(Boolean)
  const formatted = suggestion.name ? `${suggestion.name} <${suggestion.email}>` : suggestion.email
  return [...prefix, formatted].join(', ')
}

export default function GmailReplyChat({ initialPhase = 'compose' }: GmailReplyChatProps): React.ReactElement {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)

  const [phase, setPhase] = useState<Phase>(initialPhase)
  const [query, setQuery] = useState(DEFAULT_QUERY)
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  const [message, setMessage] = useState<MessageBody | null>(null)
  const [loadingMessage, setLoadingMessage] = useState(false)

  const [instructions, setInstructions] = useState('')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeTo, setComposeTo] = useState('')
  const [contactSuggestions, setContactSuggestions] = useState<ContactSuggestion[]>([])
  const [contactsOpen, setContactsOpen] = useState(false)
  const [draftingReply, setDraftingReply] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [replyError, setReplyError] = useState<string | null>(null)

  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_CHAT_MODEL)
  const modelManuallyChangedRef = useRef(false)

  const [saving, setSaving] = useState(false)
  const [savedUrl, setSavedUrl] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [draftPreviewOpen, setDraftPreviewOpen] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/optimate/default-model', { credentials: 'include' })
        if (!res.ok) return
        const data = (await res.json()) as { emailAssistantModel?: unknown }
        const next = data.emailAssistantModel
        if (
          !cancelled &&
          !modelManuallyChangedRef.current &&
          typeof next === 'string' &&
          isCanonicalModel(next) &&
          CHAT_PICKER_MODELS.some((m) => m.canonical === next)
        ) {
          setSelectedModel(next)
        }
      } catch {
        // Keep bundled default.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

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

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (typeof el.scrollTo === 'function') {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    } else {
      el.scrollTop = el.scrollHeight
    }
  }, [phase, chatMessages, draftingReply, replyText, savedUrl])

  useEffect(() => {
    if (phase !== 'compose') return
    const term = recipientSearchTerm(composeTo)
    if (term.length < 2) {
      setContactSuggestions([])
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/gmail/contacts?q=${encodeURIComponent(term)}&max=8`, {
          credentials: 'include',
          signal: controller.signal,
        })
        const data = (await res.json()) as { suggestions?: ContactSuggestion[] }
        setContactSuggestions(res.ok && Array.isArray(data.suggestions) ? data.suggestions : [])
      } catch (err) {
        if ((err as { name?: string }).name !== 'AbortError') setContactSuggestions([])
      }
    }, 250)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [composeTo, phase])

  const resetDraftState = useCallback(() => {
    setReplyText('')
    setReplyError(null)
    setSavedUrl(null)
    setSaveError(null)
    setChatInput('')
    setChatMessages([])
    setDraftPreviewOpen(false)
    setContactSuggestions([])
    setContactsOpen(false)
  }, [])

  const switchToCompose = useCallback(() => {
    setPhase('compose')
    setMessage(null)
    resetDraftState()
  }, [resetDraftState])

  const switchToSearch = useCallback(() => {
    setPhase('search')
    setMessage(null)
    resetDraftState()
  }, [resetDraftState])

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
    setChatInput('')
    setChatMessages([])
    setSavedUrl(null)
    setSaveError(null)
    setDraftPreviewOpen(false)
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

  const draftNewEmail = useCallback(async () => {
    const prompt = instructions.trim()
    if (!prompt) return
    const userMessage: ChatMessage = { role: 'user', content: prompt }
    const history = [...chatMessages]
    setChatMessages((prev) => [...prev, userMessage])
    setInstructions('')
    setDraftingReply(true)
    setReplyError(null)
    setSavedUrl(null)
    setSaveError(null)
    setDraftPreviewOpen(false)
    try {
      const res = await fetch('/api/optimate/email/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          mode: 'draft',
          message: prompt,
          history: history.filter((msg) => msg.role !== 'error').map(({ role, content }) => ({ role, content })),
          model: selectedModel,
          draft: {
            to: composeTo.trim() || undefined,
            subject: composeSubject.trim() || undefined,
            body: replyText || undefined,
          },
        }),
      })
      const data = (await res.json()) as EmailChatResponse
      if (!res.ok) {
        setChatMessages((prev) => [...prev, { role: 'error', content: data.error || `Draft failed (${res.status})` }])
        return
      }
      const stagedBody = data.stagedEmailReply?.body?.trim()
      const assistantText = data.reply || (stagedBody ? 'I’ve staged the latest draft below.' : 'No response received.')
      if (stagedBody) setReplyText(stagedBody)
      if (data.stagedEmailReply?.subject && !composeSubject.trim()) setComposeSubject(data.stagedEmailReply.subject)
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: assistantText,
          runId: typeof data.runId === 'string' ? data.runId : undefined,
          modelUsed: typeof data.modelUsed === 'string' ? data.modelUsed : undefined,
          modelRequested: typeof data.modelRequested === 'string' ? data.modelRequested : undefined,
        },
      ])
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'error', content: err instanceof Error ? err.message : 'Draft failed' },
      ])
    } finally {
      setDraftingReply(false)
    }
  }, [instructions, chatMessages, selectedModel, composeTo, composeSubject, replyText])

  const sendReplyChatMessage = useCallback(async () => {
    if (!message || draftingReply) return
    const request = chatInput.trim()
    if (!request) return

    const userMessage: ChatMessage = { role: 'user', content: request }
    const history = [...chatMessages]
    setChatMessages((prev) => [...prev, userMessage])
    setChatInput('')
    setDraftingReply(true)
    setReplyError(null)
    setSaveError(null)
    setSavedUrl(null)

    try {
      const res = await fetch('/api/optimate/email/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          mode: 'reply',
          message: request,
          history: history.filter((msg) => msg.role !== 'error').map(({ role, content }) => ({ role, content })),
          model: selectedModel,
          draft: {
            subject: replySubject(message.subject),
            to: parseFromAddress(message.from),
            body: replyText || undefined,
          },
          email: message,
        }),
      })
      const data = (await res.json()) as EmailChatResponse
      if (!res.ok) {
        setChatMessages((prev) => [...prev, { role: 'error', content: data.error || `Draft failed (${res.status})` }])
        return
      }
      const stagedBody = data.stagedEmailReply?.body?.trim()
      const assistantText = data.reply || (stagedBody ? 'I’ve staged the latest draft below.' : 'No response received.')
      if (stagedBody) setReplyText(stagedBody)
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: assistantText,
          runId: typeof data.runId === 'string' ? data.runId : undefined,
          modelUsed: typeof data.modelUsed === 'string' ? data.modelUsed : undefined,
          modelRequested: typeof data.modelRequested === 'string' ? data.modelRequested : undefined,
        },
      ])
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'error', content: err instanceof Error ? err.message : 'Draft failed' },
      ])
    } finally {
      setDraftingReply(false)
    }
  }, [message, draftingReply, chatInput, chatMessages, selectedModel, replyText])

  const saveNewDraft = useCallback(async () => {
    if (!replyText.trim()) return
    setSaving(true)
    setSaveError(null)
    setSavedUrl(null)
    try {
      const res = await fetch('/api/gmail/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          to: composeTo.trim() || undefined,
          subject: composeSubject.trim() || undefined,
          body: replyText,
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
  }, [replyText, composeTo, composeSubject])

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
          Connect your Gmail account to create drafts.
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
          {connectedEmail ? `Gmail · ${connectedEmail}` : 'Gmail draft'}
        </span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {phase !== 'compose' && (
            <button type="button" onClick={switchToCompose} style={ghostLink}>
              New draft
            </button>
          )}
          {phase === 'message' && (
            <button type="button" onClick={() => setPhase('search')} style={ghostLink}>
              ← Results
            </button>
          )}
          {phase === 'compose' && (
            <button type="button" onClick={switchToSearch} style={ghostLink}>
              Reply to an email
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 0', minHeight: 0 }}>
        {phase === 'compose' && (
          <div style={chatFirstPane}>
            <div style={detailStripStyle}>
              <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                <input
                  type="text"
                  value={composeTo}
                  onChange={(e) => {
                    setComposeTo(e.target.value)
                    setContactsOpen(true)
                  }}
                  onFocus={() => setContactsOpen(true)}
                  onBlur={() => window.setTimeout(() => setContactsOpen(false), 120)}
                  placeholder="To (optional)…"
                  style={compactInputStyle}
                />
                {contactsOpen && contactSuggestions.length > 0 && (
                  <div style={contactMenu}>
                    {contactSuggestions.map((contact) => (
                      <button
                        key={contact.email}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setComposeTo(replaceActiveRecipient(composeTo, contact))
                          setContactSuggestions([])
                          setContactsOpen(false)
                        }}
                        style={contactOption}
                      >
                        <span style={{ fontWeight: 600 }}>{contact.name || contact.email}</span>
                        {contact.name && <span style={{ color: '#6b7280' }}>{contact.email}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input
                type="text"
                value={composeSubject}
                onChange={(e) => setComposeSubject(e.target.value)}
                placeholder="Subject…"
                style={{ ...compactInputStyle, flex: 1 }}
              />
            </div>

            {replyError && <div style={errorBox}>{replyError}</div>}
            <div style={{ ...chatPanel, flex: 1, minHeight: 150, overflowY: 'auto' }}>
              {chatMessages.length === 0 && !draftingReply && (
                <div style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', padding: '18px 8px' }}>
                  Chat with GmailMate about the email. Ask for drafts, changes, tone edits, then preview and save when ready.
                </div>
              )}
              {chatMessages.map((msg, index) => (
                <ChatBubble key={`${msg.role}-${index}`} msg={msg} />
              ))}
              {draftingReply && (
                <div style={{ ...chatBubble, ...assistantBubble }}>
                  <div style={bubbleLabel}>GmailMate</div>
                  Thinking…
                </div>
              )}
            </div>
            <DraftPreviewPanel
              replyText={replyText}
              setReplyText={setReplyText}
              saving={saving}
              saveError={saveError}
              savedUrl={savedUrl}
              onSave={saveNewDraft}
              open={draftPreviewOpen}
              setOpen={setDraftPreviewOpen}
              summary={[composeTo.trim(), composeSubject.trim()].filter(Boolean).join(' · ')}
            />
            <div style={composerBlockStyle}>
              <div style={voiceWrapper}>
                <VoiceField
                  value={instructions}
                  onChange={setInstructions}
                  multiline
                  placeholder={replyText ? 'Ask GmailMate for an edit…' : 'Message GmailMate about the email…'}
                />
              </div>
              <button
                type="button"
                onClick={draftNewEmail}
                disabled={draftingReply || !instructions.trim()}
                style={{ ...primaryButton, opacity: draftingReply || !instructions.trim() ? 0.6 : 1 }}
              >
                {draftingReply ? 'Thinking…' : 'Send to GmailMate'}
              </button>
              <ModelSelector
                selectedModel={selectedModel}
                onChange={(model) => {
                  modelManuallyChangedRef.current = true
                  setSelectedModel(model)
                }}
              />
            </div>
          </div>
        )}

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
                Search your inbox, pick an email, then chat through the reply before saving it to Gmail Drafts.
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
          <div style={chatFirstPane}>
            {loadingMessage && (
              <div style={{ fontSize: 12, color: '#6b7280', padding: '8px 0' }}>Loading email…</div>
            )}
            {replyError && <div style={errorBox}>{replyError}</div>}

            {message && (
              <>
                <div style={{ background: 'var(--theme-elevation-50, #f3f4f6)', borderRadius: 8, padding: 10, flexShrink: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{message.subject || '(no subject)'}</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>From: {message.from}</div>
                  <div
                    style={{
                      fontSize: 12,
                      color: '#374151',
                      marginTop: 8,
                      whiteSpace: 'pre-wrap',
                      maxHeight: 96,
                      overflowY: 'auto',
                    }}
                  >
                    {message.body || '(empty body)'}
                  </div>
                </div>

                <div style={{ ...chatPanel, flex: 1, minHeight: 150, overflowY: 'auto' }}>
                  {chatMessages.length === 0 && !draftingReply && (
                    <div style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', padding: '18px 8px' }}>
                      Chat with GmailMate about the reply. Ask for edits until it sounds right, then open the draft preview to save.
                    </div>
                  )}
                  {chatMessages.map((msg, index) => (
                    <ChatBubble key={`${msg.role}-${index}`} msg={msg} />
                  ))}
                  {draftingReply && (
                    <div style={{ ...chatBubble, ...assistantBubble }}>
                      <div style={bubbleLabel}>GmailMate</div>
                      Thinking…
                    </div>
                  )}
                </div>

                <DraftPreviewPanel
                  replyText={replyText}
                  setReplyText={setReplyText}
                  saving={saving}
                  saveError={saveError}
                  savedUrl={savedUrl}
                  onSave={saveDraft}
                  open={draftPreviewOpen}
                  setOpen={setDraftPreviewOpen}
                  summary={message ? `${replySubject(message.subject)} · ${parseFromAddress(message.from)}` : undefined}
                />
                <div style={composerBlockStyle}>
                  <div style={voiceWrapper}>
                    <VoiceField
                      value={chatInput}
                      onChange={setChatInput}
                      multiline
                      placeholder={replyText ? 'Ask GmailMate for an edit…' : 'Message GmailMate about the reply…'}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={sendReplyChatMessage}
                    disabled={draftingReply || !chatInput.trim()}
                    style={{ ...primaryButton, opacity: draftingReply || !chatInput.trim() ? 0.6 : 1 }}
                  >
                    {draftingReply ? 'Thinking…' : 'Send to GmailMate'}
                  </button>
                  <ModelSelector
                    selectedModel={selectedModel}
                    onChange={(model) => {
                      modelManuallyChangedRef.current = true
                      setSelectedModel(model)
                    }}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ChatBubble({ msg }: { msg: ChatMessage }): React.ReactElement {
  return (
    <div
      style={{
        ...chatBubble,
        ...(msg.role === 'user' ? userBubble : msg.role === 'error' ? errorBubble : assistantBubble),
      }}
    >
      <div style={bubbleLabel}>
        {msg.role === 'user' ? 'You' : msg.role === 'error' ? 'Error' : 'GmailMate'}
      </div>
      <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
      {msg.role === 'assistant' && (msg.modelUsed || msg.modelRequested) && (
        <div style={modelBadgeStyle}>
          {msg.modelRequested && msg.modelUsed && msg.modelRequested !== msg.modelUsed
            ? `⚠️ ${msg.modelRequested} → ${msg.modelUsed}`
            : msg.modelUsed}
        </div>
      )}
    </div>
  )
}

function DraftPreviewPanel({
  replyText,
  setReplyText,
  saving,
  saveError,
  savedUrl,
  onSave,
  open,
  setOpen,
  summary,
}: {
  replyText: string
  setReplyText: (value: string) => void
  saving: boolean
  saveError: string | null
  savedUrl: string | null
  onSave: () => void
  open: boolean
  setOpen: (open: boolean) => void
  summary?: string
}): React.ReactElement | null {
  const hasDraft = replyText.trim().length > 0
  if (!hasDraft) return null

  if (!open) {
    return (
      <div style={draftStripStyle}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#166534' }}>Draft ready</div>
          <div style={{ fontSize: 11, color: '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {summary || 'Open preview when you are ready to review and save.'}
          </div>
        </div>
        <button type="button" onClick={() => setOpen(true)} style={smallPreviewButton}>
          Preview & save
        </button>
      </div>
    )
  }

  return (
    <div style={draftPanelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>Draft preview</div>
          {summary && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{summary}</div>}
        </div>
        <button type="button" onClick={() => setOpen(false)} style={ghostLink}>
          Collapse
        </button>
      </div>
      <textarea
        value={replyText}
        onChange={(e) => setReplyText(e.target.value)}
        rows={8}
        style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.45 }}
      />
      <button
        type="button"
        onClick={onSave}
        disabled={saving || !replyText.trim()}
        style={{ ...primaryButton, background: '#059669', opacity: saving || !replyText.trim() ? 0.6 : 1 }}
      >
        {saving ? 'Saving…' : 'Save latest draft to Gmail Drafts'}
      </button>
      {saveError && <div style={errorBox}>{saveError}</div>}
      {savedUrl && <SavedDraftLink savedUrl={savedUrl} />}
    </div>
  )
}

function SavedDraftLink({ savedUrl }: { savedUrl: string }): React.ReactElement {
  return (
    <div style={{ fontSize: 12, color: '#166534' }}>
      Saved to Drafts.{' '}
      <a href={savedUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>
        Open in Gmail →
      </a>
    </div>
  )
}

function ModelSelector({
  selectedModel,
  onChange,
}: {
  selectedModel: string
  onChange: (model: string) => void
}): React.ReactElement {
  return (
    <div style={modelSelectorWrap}>
      <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280' }}>Model</span>
      <select
        value={selectedModel}
        onChange={(e) => onChange(e.target.value)}
        title="Model used for the next GmailMate turn"
        style={modelSelectStyle}
      >
        {CHAT_PICKER_MODELS.map((m) => (
          <option key={m.canonical} value={m.canonical}>
            {m.label}
          </option>
        ))}
      </select>
    </div>
  )
}

// Constrain VoiceField to the compact launcher width and reserve room so the
// mic button (absolutely positioned at the textarea's top-right) never overlaps text.
const voiceWrapper: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
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

const contactMenu: React.CSSProperties = {
  position: 'absolute',
  zIndex: 10,
  top: 'calc(100% + 4px)',
  left: 0,
  right: 0,
  display: 'flex',
  flexDirection: 'column',
  maxHeight: 220,
  overflowY: 'auto',
  border: '1px solid var(--theme-border-color, #e5e7eb)',
  borderRadius: 8,
  background: 'var(--theme-input-bg, #fff)',
  boxShadow: '0 12px 28px rgba(15, 23, 42, 0.14)',
}

const contactOption: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: '8px 10px',
  border: 0,
  borderBottom: '1px solid var(--theme-border-color, #f3f4f6)',
  background: 'transparent',
  color: 'var(--theme-text, #1f2937)',
  textAlign: 'left',
  cursor: 'pointer',
  fontSize: 12,
}

const chatPanel: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 8,
  borderRadius: 8,
  background: 'var(--theme-elevation-50, #f9fafb)',
  border: '1px solid var(--theme-border-color, #e5e7eb)',
}

const chatBubble: React.CSSProperties = {
  maxWidth: '92%',
  borderRadius: 10,
  padding: '8px 10px',
  fontSize: 12,
  lineHeight: 1.45,
}

const userBubble: React.CSSProperties = {
  alignSelf: 'flex-end',
  background: '#2563eb',
  color: '#fff',
  borderBottomRightRadius: 3,
}

const assistantBubble: React.CSSProperties = {
  alignSelf: 'flex-start',
  background: '#fff',
  color: '#1f2937',
  border: '1px solid var(--theme-border-color, #e5e7eb)',
  borderBottomLeftRadius: 3,
}

const errorBubble: React.CSSProperties = {
  alignSelf: 'flex-start',
  background: '#fee2e2',
  color: '#b91c1c',
  border: '1px solid #fecaca',
}

const bubbleLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  opacity: 0.7,
  marginBottom: 3,
}

const modelBadgeStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: 10,
  color: '#6b7280',
}

const draftStripStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  padding: '8px 10px',
  borderRadius: 10,
  border: '1px solid #bbf7d0',
  background: '#f0fdf4',
}

const draftPanelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 10,
  borderRadius: 10,
  border: '1px solid var(--theme-border-color, #e5e7eb)',
  background: 'var(--theme-input-bg, #fff)',
}

const smallPreviewButton: React.CSSProperties = {
  padding: '6px 10px',
  background: '#059669',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontWeight: 700,
  fontSize: 11,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const composerBlockStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  flexShrink: 0,
}

const chatFirstPane: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  minHeight: '100%',
}

const detailStripStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  flexShrink: 0,
}

const compactInputStyle: React.CSSProperties = {
  ...inputStyle,
  padding: '6px 8px',
  fontSize: 12,
}

const modelSelectorWrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '2px 0 4px',
}

const modelSelectStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '5px 7px',
  border: '1px solid var(--theme-border-color, #e5e7eb)',
  borderRadius: 6,
  background: 'var(--theme-input-bg, #fff)',
  color: 'var(--theme-text, #1f2937)',
  fontSize: 11,
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
