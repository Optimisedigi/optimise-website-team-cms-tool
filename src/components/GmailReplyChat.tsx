'use client'

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import {
  CHAT_PICKER_MODELS,
  DEFAULT_CHAT_MODEL,
  isCanonicalModel,
} from '@/lib/agents/_shared/llm/registry'

/**
 * Gmail draft flow for the OptiMate launcher panel.
 *
 * Supports three entry points:
 *   - draft a brand-new outbound email
 *   - search Gmail, pick a message, then work with a chat-style reply drafter
 *   - search Gmail, pick a message, then get a thread summary before replying
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
  initialSummariseMode?: boolean
}

const DEFAULT_QUERY = ''
const GMAIL_REPLY_CHAT_STORAGE_PREFIX = 'optimate:gmail-reply-chat:'

interface PersistedGmailReplyChatState {
  phase?: Phase
  query?: string
  results?: SearchResult[]
  searched?: boolean
  message?: MessageBody | null
  instructions?: string
  composeSubject?: string
  composeTo?: string
  replyText?: string
  chatInput?: string
  chatMessages?: ChatMessage[]
  selectedModel?: string
  savedUrl?: string | null
  originalEmailCollapsed?: boolean
  readThread?: boolean
  summariseMode?: boolean
}

function gmailReplyChatStorageKey(initialPhase: Phase): string {
  return `${GMAIL_REPLY_CHAT_STORAGE_PREFIX}${initialPhase}`
}

function readPersistedGmailReplyChatState(initialPhase: Phase): PersistedGmailReplyChatState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(gmailReplyChatStorageKey(initialPhase))
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedGmailReplyChatState
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

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
  gmailDraft?: { gmailUrl?: string; draftId?: string; messageId?: string; subject?: string; to?: string }
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

function assistantMessageText(data: EmailChatResponse, stagedBody?: string): string {
  const parts = [data.reply || (stagedBody ? 'I\u2019ve drafted the email below.' : 'No response received.')]
  if (stagedBody) parts.push(`Draft preview:\n\n${stagedBody}`)
  if (data.gmailDraft?.gmailUrl) parts.push(`Open in Gmail: ${data.gmailDraft.gmailUrl}`)
  return parts.filter((part) => part.trim()).join('\n\n')
}

export default function GmailReplyChat({ initialPhase = 'compose', initialSummariseMode = false }: GmailReplyChatProps): React.ReactElement {
  const persistedState = readPersistedGmailReplyChatState(initialPhase)
  const [connected, setConnected] = useState<boolean | null>(null)
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)

  const [phase, setPhase] = useState<Phase>(persistedState?.phase ?? initialPhase)
  const [query, setQuery] = useState(persistedState?.query ?? DEFAULT_QUERY)
  const [results, setResults] = useState<SearchResult[]>(persistedState?.results ?? [])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searched, setSearched] = useState(Boolean(persistedState?.searched))

  const [message, setMessage] = useState<MessageBody | null>(persistedState?.message ?? null)
  const [loadingMessage, setLoadingMessage] = useState(false)

  const [instructions, setInstructions] = useState(persistedState?.instructions ?? '')
  const [composeSubject, setComposeSubject] = useState(persistedState?.composeSubject ?? '')
  const [composeTo, setComposeTo] = useState(persistedState?.composeTo ?? '')
  const [contactSuggestions, setContactSuggestions] = useState<ContactSuggestion[]>([])
  const [contactsOpen, setContactsOpen] = useState(false)
  const [draftingReply, setDraftingReply] = useState(false)
  const [replyText, setReplyText] = useState(persistedState?.replyText ?? '')
  const [replyError, setReplyError] = useState<string | null>(null)

  const [chatInput, setChatInput] = useState(persistedState?.chatInput ?? '')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(persistedState?.chatMessages ?? [])
  const [selectedModel, setSelectedModel] = useState<string>(persistedState?.selectedModel ?? DEFAULT_CHAT_MODEL)
  const modelManuallyChangedRef = useRef(Boolean(persistedState?.selectedModel))

  const [saving, setSaving] = useState(false)
  const [savedUrl, setSavedUrl] = useState<string | null>(persistedState?.savedUrl ?? null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [originalEmailCollapsed, setOriginalEmailCollapsed] = useState(Boolean(persistedState?.originalEmailCollapsed))
  const [readThread, setReadThread] = useState(Boolean(persistedState?.readThread))
  const [summariseMode, setSummariseMode] = useState(Boolean(persistedState?.summariseMode ?? initialSummariseMode))

  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const state: PersistedGmailReplyChatState = {
      phase,
      query,
      results,
      searched,
      message,
      instructions,
      composeSubject,
      composeTo,
      replyText,
      chatInput,
      chatMessages,
      selectedModel,
      savedUrl,
      originalEmailCollapsed,
      readThread,
      summariseMode,
    }
    window.sessionStorage.setItem(gmailReplyChatStorageKey(initialPhase), JSON.stringify(state))
  }, [
    initialPhase,
    phase,
    query,
    results,
    searched,
    message,
    instructions,
    composeSubject,
    composeTo,
    replyText,
    chatInput,
    chatMessages,
    selectedModel,
    savedUrl,
    originalEmailCollapsed,
    readThread,
    summariseMode,
  ])

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
    setOriginalEmailCollapsed(false)
    setReadThread(false)
    setContactSuggestions([])
    setContactsOpen(false)
    setSummariseMode(false)
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
    setOriginalEmailCollapsed(true)
    setReadThread(false)
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
      const assistantText = assistantMessageText(data, stagedBody)
      if (stagedBody) setReplyText(stagedBody)
      if (data.gmailDraft?.gmailUrl) setSavedUrl(data.gmailDraft.gmailUrl)
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
          mode: summariseMode ? 'summarise' : 'reply',
          message: request,
          history: history.filter((msg) => msg.role !== 'error').map(({ role, content }) => ({ role, content })),
          model: selectedModel,
          draft: {
            subject: replySubject(message.subject),
            to: parseFromAddress(message.from),
            body: replyText || undefined,
          },
          email: message,
          readThread,
        }),
      })
      const data = (await res.json()) as EmailChatResponse
      if (!res.ok) {
        setChatMessages((prev) => [...prev, { role: 'error', content: data.error || `Draft failed (${res.status})` }])
        return
      }
      const stagedBody = data.stagedEmailReply?.body?.trim()
      const assistantText = assistantMessageText(data, stagedBody)
      if (stagedBody) setReplyText(stagedBody)
      if (data.gmailDraft?.gmailUrl) setSavedUrl(data.gmailDraft.gmailUrl)
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
  }, [message, draftingReply, chatInput, chatMessages, selectedModel, replyText, readThread, summariseMode])

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
                  Chat with GmailMate about the email. Ask for drafts, changes, and tone edits, then create a Gmail draft when ready.
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
            <DraftActionRow
              replyText={replyText}
              saving={saving}
              saveError={saveError}
              savedUrl={savedUrl}
              onSave={saveNewDraft}
            />
            <GmailChatComposer
              value={instructions}
              onChange={setInstructions}
              onSend={draftNewEmail}
              disabled={draftingReply}
              placeholder={replyText ? 'Ask GmailMate for an edit…' : 'Message GmailMate about the email…'}
              selectedModel={selectedModel}
              onModelChange={(model) => {
                modelManuallyChangedRef.current = true
                setSelectedModel(model)
              }}
            />
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
                <OriginalEmailCard
                  message={message}
                  collapsed={originalEmailCollapsed}
                  onToggle={() => setOriginalEmailCollapsed((value) => !value)}
                  summariseMode={summariseMode}
                />

                {!summariseMode && (
                  <label style={threadToggleStyle}>
                    <input
                      type="checkbox"
                      checked={readThread}
                      disabled={draftingReply}
                      onChange={(e) => setReadThread(e.target.checked)}
                    />
                    <span>Read full thread for more context</span>
                  </label>
                )}

                {summariseMode && (
                  <button
                    type="button"
                    onClick={() => setSummariseMode(false)}
                    style={{
                      ...primaryButton,
                      width: '100%',
                      marginTop: 4,
                      fontSize: 12,
                    }}
                  >
                    Reply to this
                  </button>
                )}

                <div style={{ ...chatPanel, flex: 1, minHeight: 150, overflowY: 'auto' }}>
                  {chatMessages.length === 0 && !draftingReply && (
                    <div style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', padding: '18px 8px' }}>
                      {summariseMode
                        ? 'Chat with GmailMate to summarise the thread. Ask for a summary, key points, or action items.'
                        : 'Chat with GmailMate about the reply. Ask for edits until it sounds right, then create a Gmail draft when ready.'}
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

                <DraftActionRow
                  replyText={replyText}
                  saving={saving}
                  saveError={saveError}
                  savedUrl={savedUrl}
                  onSave={saveDraft}
                />
                <GmailChatComposer
                  value={chatInput}
                  onChange={setChatInput}
                  onSend={sendReplyChatMessage}
                  disabled={draftingReply}
                  placeholder={replyText ? 'Ask GmailMate for an edit…' : 'Message GmailMate about the reply…'}
                  selectedModel={selectedModel}
                  onModelChange={(model) => {
                    modelManuallyChangedRef.current = true
                    setSelectedModel(model)
                  }}
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function LinkifiedText({ text }: { text: string }): React.ReactElement {
  const parts = text.split(/(https?:\/\/\S+)/g)
  return (
    <>
      {parts.map((part, index) => {
        if (!/^https?:\/\//.test(part)) return <Fragment key={`${index}-${part}`}>{part}</Fragment>
        const href = part.replace(/[).,]+$/, '')
        const suffix = part.slice(href.length)
        return (
          <Fragment key={`${index}-${part}`}>
            <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>
              Open in Gmail
            </a>
            {suffix}
          </Fragment>
        )
      })}
    </>
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
      <div style={{ whiteSpace: 'pre-wrap' }}><LinkifiedText text={msg.content} /></div>
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

function DraftActionRow({
  replyText,
  saving,
  saveError,
  savedUrl,
  onSave,
}: {
  replyText: string
  saving: boolean
  saveError: string | null
  savedUrl: string | null
  onSave: () => void
}): React.ReactElement | null {
  const hasDraft = replyText.trim().length > 0
  if (!hasDraft && !saveError && !savedUrl) return null
  return (
    <div style={draftActionRowStyle}>
      {hasDraft && !savedUrl && (
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          style={{ ...createDraftButtonStyle, opacity: saving ? 0.6 : 1 }}
        >
          {saving ? 'Creating…' : 'Create Gmail draft'}
        </button>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        {saveError && <div style={inlineErrorStyle}>{saveError}</div>}
        {savedUrl && <SavedDraftLink savedUrl={savedUrl} />}
      </div>
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

function GmailChatComposer({
  value,
  onChange,
  onSend,
  disabled,
  placeholder,
  selectedModel,
  onModelChange,
}: {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  disabled: boolean
  placeholder: string
  selectedModel: string
  onModelChange: (model: string) => void
}): React.ReactElement {
  const canSend = !disabled && value.trim().length > 0
  return (
    <div style={gmailComposerWrapStyle}>
      <div style={composerInputRowStyle}>
        <div style={googleMateComposerBoxStyle}>
          <textarea
            rows={3}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (canSend) onSend()
              }
            }}
            placeholder={placeholder}
            disabled={disabled}
            style={googleMateTextareaStyle}
          />
        </div>
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          title="Send"
          aria-label="Send"
          style={{
            ...sendIconButtonStyle,
            background: canSend ? '#2563eb' : '#9ca3af',
            cursor: canSend ? 'pointer' : 'not-allowed',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 19V5M5 12l7-7 7 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      <div style={modelSelectorRowStyle}>
        <select
          value={selectedModel}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={disabled}
          title="Model used for the next GmailMate turn"
          style={modelSelectGoogleMateStyle}
        >
          {CHAT_PICKER_MODELS.map((m) => (
            <option key={m.canonical} value={m.canonical}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

function OriginalEmailCard({
  message,
  collapsed,
  onToggle,
  summariseMode,
}: {
  message: MessageBody
  collapsed: boolean
  onToggle: () => void
  summariseMode?: boolean
}): React.ReactElement {
  return (
    <div style={originalEmailCardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {message.subject || '(no subject)'}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>From: {message.from}</div>
        </div>
        <button type="button" onClick={onToggle} style={minimalButtonStyle}>
          {collapsed ? (summariseMode ? 'Show thread' : 'Show original email') : (summariseMode ? 'Collapse thread' : 'Collapse original email')}
        </button>
      </div>
      {!collapsed && (
        <div style={originalEmailBodyStyle}>
          {message.body || '(empty body)'}
        </div>
      )}
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

const threadToggleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  fontSize: 12,
  color: '#4b5563',
  userSelect: 'none',
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

const draftActionRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
  flexShrink: 0,
}

const createDraftButtonStyle: React.CSSProperties = {
  padding: '7px 11px',
  background: '#059669',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontWeight: 700,
  fontSize: 11,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const inlineErrorStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#b91c1c',
}

const gmailComposerWrapStyle: React.CSSProperties = {
  flexShrink: 0,
}

const composerInputRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  gap: 8,
}

const googleMateComposerBoxStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  minHeight: 104,
  border: '1px solid var(--theme-border-color, #e5e7eb)',
  borderRadius: 14,
  background: 'var(--theme-input-bg, #fff)',
  padding: '12px 14px',
}

const googleMateTextareaStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 80,
  height: '100%',
  padding: 0,
  border: 'none',
  fontSize: 13,
  lineHeight: '20px',
  background: 'transparent',
  color: 'var(--theme-text, #1f2937)',
  outline: 'none',
  resize: 'none',
  fontFamily: 'inherit',
  overflowY: 'auto',
}

const sendIconButtonStyle: React.CSSProperties = {
  alignSelf: 'flex-end',
  marginBottom: 14,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 29,
  height: 29,
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  transition: 'background 0.15s',
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

const modelSelectorRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  marginTop: 6,
  marginBottom: 18,
}

const modelSelectGoogleMateStyle: React.CSSProperties = {
  fontSize: 11,
  padding: '4px 8px',
  border: '1px solid var(--theme-border-color, #e5e7eb)',
  borderRadius: 6,
  background: 'var(--theme-input-bg, #fff)',
  color: 'var(--theme-text, #1f2937)',
  width: 270,
  maxWidth: '100%',
}

const originalEmailCardStyle: React.CSSProperties = {
  background: 'var(--theme-elevation-50, #f3f4f6)',
  borderRadius: 8,
  padding: 10,
  flexShrink: 0,
}

const originalEmailBodyStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#374151',
  marginTop: 8,
  whiteSpace: 'pre-wrap',
  maxHeight: 96,
  overflowY: 'auto',
}

const minimalButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#2563eb',
  fontSize: 11,
  cursor: 'pointer',
  padding: 0,
  whiteSpace: 'nowrap',
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
