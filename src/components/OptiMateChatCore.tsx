'use client'

import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { CHAT_PICKER_MODELS, DEFAULT_CHAT_MODEL } from '@/lib/agents/_shared/llm/registry'
import OptiMateProposalCard, { type OptiMateProposal } from './OptiMateProposalCard'
import EmailAttachPicker, { type AttachedEmailMeta } from './EmailAttachPicker'

/**
 * Imperative handle exposed via ref so a multi-account wrapper can broadcast
 * a single user-typed message to many `OptiMateChatCore` instances at once.
 * `sendMessage` resolves when the turn completes; the wrapper awaits all to
 * coordinate the shared input's loading state.
 */
export interface OptiMateChatCoreHandle {
  sendMessage: (text: string) => Promise<void>
  isBusy: () => boolean
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  runId?: string
  modelUsed?: string
  /** Set when the agent fell back to a different model than requested
   *  (e.g. Anthropic 429 → Kimi). Drives the amber failover pill. */
  modelRequested?: string
  proposals?: OptiMateProposal[]
}

export interface OptiMateChatCoreProps {
  auditId: string | number
  customerId: string
  businessName?: string
  /** Compact mode = launcher panel; default = full tab */
  compact?: boolean
  /** Hide the per-tab input row (the multi-chat wrapper supplies a shared one). */
  hideInput?: boolean
}

const SUGGESTED_QUESTIONS = [
  'How is my budget pacing this month?',
  'Which campaigns are performing best this week?',
  'Are there any keywords wasting spend?',
  'Give me a weekly performance summary',
]

type AuthBadgeStatus =
  | { tone: 'green'; label: 'OAuth connected' }
  | { tone: 'amber'; label: 'API key fallback' }
  | { tone: 'red'; label: 'No credential' }
  | { tone: 'grey'; label: 'Checking…' }

const TONE_COLORS: Record<AuthBadgeStatus['tone'], string> = {
  green: '#10b981',
  amber: '#f59e0b',
  red: '#ef4444',
  grey: '#9ca3af',
}

/**
 * Lightweight markdown renderer for chat messages.
 * Handles: **bold**, bullet lists (- item), numbered lists, paragraphs, fenced code.
 */
function renderMarkdown(text: string) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let listItems: React.ReactNode[] = []
  let listType: 'ul' | 'ol' | null = null
  let codeBlock: string[] | null = null

  const flushList = () => {
    if (listItems.length > 0 && listType) {
      const Tag = listType
      elements.push(
        <Tag key={`list-${elements.length}`} style={{ margin: '6px 0', paddingLeft: 20 }}>
          {listItems}
        </Tag>,
      )
      listItems = []
      listType = null
    }
  }

  const flushCodeBlock = () => {
    if (codeBlock !== null) {
      elements.push(
        <pre
          key={`code-${elements.length}`}
          style={{
            margin: '8px 0',
            padding: 12,
            background: '#1f2937',
            color: '#e5e7eb',
            borderRadius: 6,
            fontSize: 11,
            lineHeight: 1.4,
            overflowX: 'auto',
            whiteSpace: 'pre',
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
          }}
        >
          {codeBlock.join('\n')}
        </pre>,
      )
      codeBlock = null
    }
  }

  /**
   * Inline formatter. Handles:
   *   - **bold** and `inline code`
   *   - bare URLs (https://…)
   *   - in-app paths /agent-approvals/<id>
   *
   * Order matters: we run the bold/code regex first so URLs inside backticks
   * are kept literal, then the URL/path regex on the remaining text spans.
   */
  const linkifyText = (text: string, keyPrefix: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = []
    // Combined: full URL OR /agent-approvals/<id>
    const regex = /(https?:\/\/[^\s)]+)|(\/agent-approvals\/\d+)/g
    let lastIndex = 0
    let match: RegExpExecArray | null
    let matchIdx = 0
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index))
      }
      const href = match[0]
      parts.push(
        <a
          key={`${keyPrefix}-link-${matchIdx++}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}
        >
          {href}
        </a>,
      )
      lastIndex = regex.lastIndex
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex))
    return parts
  }

  const formatInline = (line: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = []
    const regex = /\*\*(.+?)\*\*|`([^`]+)`/g
    let lastIndex = 0
    let match
    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        const span = line.slice(lastIndex, match.index)
        parts.push(...linkifyText(span, `t-${match.index}`))
      }
      if (match[1]) {
        parts.push(<strong key={`b-${match.index}`}>{match[1]}</strong>)
      } else if (match[2]) {
        parts.push(
          <code
            key={`c-${match.index}`}
            style={{
              padding: '1px 5px',
              background: '#e5e7eb',
              borderRadius: 3,
              fontSize: '0.9em',
              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
            }}
          >
            {match[2]}
          </code>,
        )
      }
      lastIndex = regex.lastIndex
    }
    if (lastIndex < line.length) {
      parts.push(...linkifyText(line.slice(lastIndex), `t-end`))
    }
    return parts.length > 0 ? parts : [line]
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.trimStart().startsWith('```')) {
      if (codeBlock === null) {
        flushList()
        codeBlock = []
      } else {
        flushCodeBlock()
      }
      continue
    }

    if (codeBlock !== null) {
      codeBlock.push(line)
      continue
    }

    const bulletMatch = line.match(/^[-*]\s+(.+)/)
    const numberedMatch = line.match(/^\d+\.\s+(.+)/)

    if (bulletMatch) {
      if (listType !== 'ul') flushList()
      listType = 'ul'
      listItems.push(
        <li key={`li-${i}`} style={{ marginBottom: 2 }}>
          {formatInline(bulletMatch[1])}
        </li>,
      )
    } else if (numberedMatch) {
      if (listType !== 'ol') flushList()
      listType = 'ol'
      listItems.push(
        <li key={`li-${i}`} style={{ marginBottom: 2 }}>
          {formatInline(numberedMatch[1])}
        </li>,
      )
    } else {
      flushList()
      if (line.trim() === '') {
        elements.push(<div key={`br-${i}`} style={{ height: 8 }} />)
      } else {
        elements.push(
          <p key={`p-${i}`} style={{ margin: '4px 0' }}>
            {formatInline(line)}
          </p>,
        )
      }
    }
  }
  flushList()
  flushCodeBlock()
  return elements
}

const OptiMateChatCore = forwardRef<OptiMateChatCoreHandle, OptiMateChatCoreProps>(function OptiMateChatCore(
  { auditId, customerId, businessName, compact = false, hideInput = false },
  ref,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_CHAT_MODEL)
  const [authStatus, setAuthStatus] = useState<AuthBadgeStatus>({
    tone: 'grey',
    label: 'Checking…',
  })
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const sessionIdRef = useRef(crypto.randomUUID())
  const [pendingForAudit, setPendingForAudit] = useState<OptiMateProposal[]>([])
  const [pendingRefreshTick, setPendingRefreshTick] = useState(0)
  const bumpPendingRefresh = useCallback(() => setPendingRefreshTick((n) => n + 1), [])
  const [attachedEmail, setAttachedEmail] = useState<AttachedEmailMeta | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  /** Per-message draft state: 'saving' → 'saved' → (1.5s later) cleared,
   *  or 'error' on failure. Keyed by message index. */
  const [draftState, setDraftState] = useState<
    Record<number, { status: 'saving' | 'saved' | 'error'; url?: string; error?: string }>
  >({})

  const copyToClipboard = useCallback(async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx((cur) => (cur === idx ? null : cur)), 1500)
    } catch {
      // Clipboard API can fail on insecure contexts or when permissions denied.
      // Silent: the user will see no feedback and can try again.
    }
  }, [])

  // Esc closes fullscreen view. Bound globally only while expanded.
  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  /**
   * Save a chat reply into the user's Gmail Drafts. We POST the raw markdown
   * — the server converts it to lightweight HTML so paragraphs and bullets
   * survive in Gmail's compose pane. On success the response includes a
   * deep-link to the draft in Gmail; we expose it via 'Open in Gmail ↗'.
   */
  const saveAsDraft = useCallback(
    async (text: string, idx: number) => {
      setDraftState((prev) => ({ ...prev, [idx]: { status: 'saving' } }))
      try {
        const res = await fetch('/api/gmail/draft', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject: `OptiMate · ${businessName ?? customerId}`,
            body: text,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          const msg =
            data?.error === 'gmail-not-connected'
              ? 'Connect Gmail first.'
              : data?.error === 'scope-insufficient'
                ? 'Reconnect Gmail to grant compose access.'
                : data?.error || `Failed (${res.status})`
          setDraftState((prev) => ({ ...prev, [idx]: { status: 'error', error: msg } }))
          return
        }
        setDraftState((prev) => ({
          ...prev,
          [idx]: { status: 'saved', url: data.gmailUrl },
        }))
      } catch (err) {
        setDraftState((prev) => ({
          ...prev,
          [idx]: {
            status: 'error',
            error: err instanceof Error ? err.message : 'Network error',
          },
        }))
      }
    },
    [businessName, customerId],
  )

  // Pending-strip fetch: query approvals for this audit and surface anything
  // still pending. We over-fetch then client-filter on auditId because the
  // proposalPayload field is JSON and Payload's REST query syntax doesn't
  // index into JSON cleanly across both sqlite + postgres.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(
          '/api/agent-approval-queue?where[agentName][equals]=optimate-google-ads&where[status][equals]=pending&depth=0&limit=20',
          { credentials: 'include' },
        )
        if (!res.ok) return
        const data = (await res.json()) as { docs?: Array<Record<string, unknown>> }
        if (cancelled) return
        const auditIdStr = String(auditId)
        const items: OptiMateProposal[] = (data.docs ?? [])
          .map((d) => {
            const payload = d.proposalPayload as Record<string, unknown> | null
            const payloadAuditId = payload?.auditId
            return {
              id: Number(d.id),
              title: String(d.title ?? ''),
              proposalType: String(d.proposalType ?? ''),
              status: String(d.status ?? 'pending'),
              _audit: payloadAuditId !== undefined && payloadAuditId !== null ? String(payloadAuditId) : '',
            }
          })
          .filter((d) => d._audit === auditIdStr || d._audit === '')
          .map(({ _audit: _drop, ...rest }) => rest)
        setPendingForAudit(items)
      } catch {
        /* silent: strip is best-effort */
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [auditId, pendingRefreshTick])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Fetch OAuth status once on mount.
  useEffect(() => {
    let cancelled = false
    fetch('/api/agent-auth/status', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.providers) return
        const anthropic = (data.providers as Array<Record<string, unknown>>).find(
          (p) => p.provider === 'anthropic',
        )
        if (!anthropic) {
          setAuthStatus({ tone: 'red', label: 'No credential' })
          return
        }
        if (anthropic.oauthConnected && !anthropic.forceFallback) {
          setAuthStatus({ tone: 'green', label: 'OAuth connected' })
        } else if (anthropic.envApiKeyPresent) {
          setAuthStatus({ tone: 'amber', label: 'API key fallback' })
        } else {
          setAuthStatus({ tone: 'red', label: 'No credential' })
        }
      })
      .catch(() => {
        if (!cancelled) setAuthStatus({ tone: 'red', label: 'No credential' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return

    const userMsg: ChatMessage = { role: 'user', content: text.trim() }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/google-ads-audits/${auditId}/chat`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          sessionId: sessionIdRef.current,
          history: messages.slice(-20).map(({ role, content }) => ({ role, content })),
          model: selectedModel,
          attachedEmail: attachedEmail
            ? {
                messageId: attachedEmail.messageId,
                subject: attachedEmail.subject,
                from: attachedEmail.from,
                date: attachedEmail.date,
              }
            : undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Failed (${res.status})`)
      }

      const data = await res.json()
      const proposals: OptiMateProposal[] = Array.isArray(data.proposals)
        ? (data.proposals as Array<Record<string, unknown>>)
            .map((p) => ({
              id: Number(p.id),
              title: String(p.title ?? ''),
              proposalType: String(p.proposalType ?? ''),
              status: String(p.status ?? 'pending'),
            }))
            .filter((p) => Number.isFinite(p.id))
        : []
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.reply || 'No response received.',
        runId: typeof data.runId === 'string' ? data.runId : undefined,
        modelUsed: typeof data.modelUsed === 'string' ? data.modelUsed : undefined,
        modelRequested: typeof data.modelRequested === 'string' ? data.modelRequested : undefined,
        proposals: proposals.length > 0 ? proposals : undefined,
      }
      setMessages((prev) => [...prev, assistantMsg])

      // Email attachment is per-turn context only — clear after a successful
      // send so the next unrelated question doesn't accidentally reuse it.
      setAttachedEmail(null)

      // Refresh the pending strip and (when tab is hidden) fire a browser
      // notification so the user notices the proposal landed.
      if (proposals.length > 0) {
        bumpPendingRefresh()
        if (typeof document !== 'undefined' && document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          for (const p of proposals) {
            try {
              new Notification('OptiMate: proposal queued', { body: p.title, tag: `optimate-${p.id}` })
            } catch {
              /* notification API can throw on some platforms; silent */
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  // Expose a tiny imperative API so a multi-chat wrapper can broadcast.
  // We deliberately re-use sendMessage so behaviour stays in sync (proposals,
  // notifications, history-trimming) instead of forking a second code path.
  useImperativeHandle(ref, () => ({
    sendMessage: async (text: string) => {
      await sendMessage(text)
    },
    isBusy: () => loading,
  }), [loading, sendMessage])

  // Sizing
  const messagesMinHeight = expanded ? 'calc(100vh - 220px)' : compact ? 240 : 300
  const messagesMaxHeight = expanded ? 'calc(100vh - 220px)' : compact ? 360 : 500
  const wrapperMaxWidth = compact ? '100%' : 700

  // Stop keydown bubbling so our Enter handler in the input doesn't trigger
  // Payload's parent-form save shortcuts. We deliberately do NOT block
  // onKeyPress with preventDefault — that swallows the character itself and
  // breaks typing in any nested input (e.g. the email-attach search box).
  const wrapperStyle: React.CSSProperties = expanded
    ? {
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'var(--theme-bg, #fff)',
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        maxWidth: '100%',
        marginBottom: 0,
        overflowY: 'auto',
      }
    : { maxWidth: wrapperMaxWidth, marginBottom: compact ? 0 : 20, width: '100%' }

  return (
    <div
      style={wrapperStyle}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            width: compact ? 28 : 32,
            height: compact ? 28 : 32,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: compact ? 12 : 14,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          O
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: compact ? 13 : 14 }}>OptiMate</div>
          <div
            style={{
              fontSize: 11,
              color: '#6b7280',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            Google Ads{businessName ? ` · ${businessName}` : ''} ({customerId})
          </div>
        </div>
        <a
          href="/agent-auth"
          target="_blank"
          rel="noopener noreferrer"
          title={`Anthropic credential: ${authStatus.label}. Click to manage.`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 8px',
            fontSize: 10,
            color: '#374151',
            background: '#f3f4f6',
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: TONE_COLORS[authStatus.tone],
              display: 'inline-block',
            }}
          />
          {authStatus.label}
        </a>
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          disabled={loading}
          title="Model used for the next message"
          style={{
            fontSize: 11,
            padding: '4px 8px',
            border: '1px solid var(--theme-border-color, #e5e7eb)',
            borderRadius: 6,
            background: 'var(--theme-input-bg, #fff)',
            color: 'var(--theme-text, #1f2937)',
            cursor: loading ? 'not-allowed' : 'pointer',
            maxWidth: compact ? 110 : 160,
          }}
        >
          {CHAT_PICKER_MODELS.map((m) => (
            <option key={m.canonical} value={m.canonical}>
              {m.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setExpanded((v) => !v)
          }}
          title={expanded ? 'Exit fullscreen (Esc)' : 'Open in fullscreen'}
          aria-label={expanded ? 'Exit fullscreen' : 'Open in fullscreen'}
          style={{
            padding: '4px 8px',
            fontSize: 12,
            lineHeight: 1,
            background: '#f3f4f6',
            border: '1px solid #e5e7eb',
            borderRadius: 6,
            cursor: 'pointer',
            color: '#374151',
            flexShrink: 0,
          }}
        >
          {expanded ? '✕' : '⛶'}
        </button>
      </div>

      {/* Messages area */}
      <div
        style={{
          border: '1px solid var(--theme-border-color, #e5e7eb)',
          borderRadius: 8,
          background: 'var(--theme-input-bg, #fff)',
          minHeight: messagesMinHeight,
          maxHeight: messagesMaxHeight,
          overflowY: 'auto',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {pendingForAudit.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 6,
              padding: '8px 4px',
              borderBottom: '1px dashed #e5e7eb',
              marginBottom: 4,
              overflowX: 'auto',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 10, color: '#6b7280', alignSelf: 'center', flexShrink: 0, marginRight: 4 }}>
              Pending
            </span>
            {pendingForAudit.map((p) => (
              <OptiMateProposalCard key={p.id} proposal={p} variant="strip" />
            ))}
          </div>
        )}

        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 8px' }}>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 14 }}>
              Ask OptiMate anything about this Google Ads account.
            </p>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                justifyContent: 'center',
              }}
            >
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    sendMessage(q)
                  }}
                  style={{
                    padding: '5px 10px',
                    fontSize: 11,
                    background: '#f3f4f6',
                    border: '1px solid #e5e7eb',
                    borderRadius: 14,
                    cursor: 'pointer',
                    color: '#374151',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#e5e7eb'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#f3f4f6'
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div
              style={{
                maxWidth: '85%',
                padding: '10px 14px',
                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background: msg.role === 'user' ? '#2563eb' : '#f3f4f6',
                color: msg.role === 'user' ? '#fff' : '#1f2937',
                fontSize: 13,
                lineHeight: 1.5,
                wordBreak: 'break-word',
              }}
            >
              {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
            </div>
            {msg.role === 'assistant' && msg.proposals && msg.proposals.length > 0 && (
              <div style={{ width: '100%', maxWidth: '85%' }}>
                {msg.proposals.map((p) => (
                  <OptiMateProposalCard key={p.id} proposal={p} variant="inline" />
                ))}
              </div>
            )}
            {msg.role === 'assistant' && (
              <div
                style={{
                  fontSize: 10,
                  color: '#6b7280',
                  marginTop: 4,
                  paddingLeft: 4,
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                {/* Failover badge: amber pill when the agent had to walk
                    the fallback chain (typically Anthropic 429 → Kimi). */}
                {msg.modelRequested && msg.modelUsed && msg.modelRequested !== msg.modelUsed ? (
                  <span
                    title={`Requested ${msg.modelRequested}; primary model rate-limited or unavailable, served by ${msg.modelUsed}.`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '2px 6px',
                      background: '#fffbeb',
                      color: '#92400e',
                      border: '1px solid #fde68a',
                      borderRadius: 10,
                      fontWeight: 600,
                      fontSize: 10,
                    }}
                  >
                    ⚠️ {msg.modelRequested.split('-')[0]} fell back → {msg.modelUsed}
                  </span>
                ) : msg.modelUsed ? (
                  <span>{msg.modelUsed}</span>
                ) : null}

                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    copyToClipboard(msg.content, i)
                  }}
                  title="Copy reply to clipboard"
                  aria-label="Copy reply to clipboard"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: copiedIdx === i ? '#10b981' : '#6b7280',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: 10,
                    fontWeight: 500,
                  }}
                >
                  {copiedIdx === i ? '✓ Copied' : '📋 Copy'}
                </button>

                {/* Save-as-Gmail-draft. Three render states: idle, saving,
                    saved (with deep-link), error (with reason on hover). */}
                {(() => {
                  const ds = draftState[i]
                  if (ds?.status === 'saved' && ds.url) {
                    return (
                      <a
                        href={ds.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#10b981', textDecoration: 'none', fontWeight: 500 }}
                      >
                        ✓ Saved — open in Gmail ↗
                      </a>
                    )
                  }
                  if (ds?.status === 'error') {
                    return (
                      <button
                        type="button"
                        title={ds.error}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          saveAsDraft(msg.content, i)
                        }}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: '#dc2626',
                          cursor: 'pointer',
                          padding: 0,
                          fontSize: 10,
                          fontWeight: 500,
                        }}
                      >
                        ⚠ Draft failed — retry
                      </button>
                    )
                  }
                  return (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        saveAsDraft(msg.content, i)
                      }}
                      disabled={ds?.status === 'saving'}
                      title="Save this reply as a Gmail draft"
                      aria-label="Save as Gmail draft"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: '#6b7280',
                        cursor: ds?.status === 'saving' ? 'wait' : 'pointer',
                        padding: 0,
                        fontSize: 10,
                        fontWeight: 500,
                      }}
                    >
                      {ds?.status === 'saving' ? 'Saving…' : '✉ Save as draft'}
                    </button>
                  )
                })()}

                {msg.runId && (
                  <a
                    href={`/agent-runs/${msg.runId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#2563eb', textDecoration: 'none' }}
                  >
                    View run details →
                  </a>
                )}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '16px 16px 16px 4px',
                background: '#f3f4f6',
                fontSize: 13,
                color: '#6b7280',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span style={{ animation: 'pulse 1.5s infinite' }}>Thinking</span>
              <span style={{ animation: 'pulse 1.5s infinite 0.2s' }}>.</span>
              <span style={{ animation: 'pulse 1.5s infinite 0.4s' }}>.</span>
              <span style={{ animation: 'pulse 1.5s infinite 0.6s' }}>.</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {error && (
        <p style={{ marginTop: 8, fontSize: 12, color: '#dc2626' }}>{error}</p>
      )}

      {/* Input — hidden when a multi-chat wrapper is supplying a shared one. */}
      {!hideInput && (
        <div style={{ position: 'relative', marginTop: 10 }}>
          {attachedEmail && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 8px',
                marginBottom: 8,
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: 12,
                fontSize: 11,
                color: '#1e40af',
                maxWidth: '100%',
              }}
              title={`From ${attachedEmail.from} · ${attachedEmail.date}`}
            >
              <span style={{ flexShrink: 0 }}>📎</span>
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 360,
                }}
              >
                {attachedEmail.subject || '(no subject)'} — {attachedEmail.from}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  setAttachedEmail(null)
                }}
                aria-label="Remove attached email"
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: '#1e40af',
                  padding: 0,
                  lineHeight: 1,
                  fontSize: 12,
                }}
              >
                ✕
              </button>
            </div>
          )}

          <EmailAttachPicker
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            onSelect={(meta) => {
              setAttachedEmail(meta)
              setPickerOpen(false)
            }}
          />

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setPickerOpen((v) => !v)
              }}
              disabled={loading}
              title="Attach an email from your Gmail inbox"
              style={{
                padding: '10px 12px',
                background: pickerOpen ? '#e0e7ff' : '#f3f4f6',
                color: '#374151',
                border: '1px solid var(--theme-border-color, #e5e7eb)',
                borderRadius: 8,
                fontSize: 14,
                cursor: loading ? 'not-allowed' : 'pointer',
                flexShrink: 0,
              }}
              aria-label="Attach email"
            >
              📎
            </button>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about budget, keywords, campaigns..."
              disabled={loading}
              style={{
                flex: 1,
                minWidth: 0,
                padding: '10px 14px',
                border: '1px solid var(--theme-border-color, #e5e7eb)',
                borderRadius: 8,
                fontSize: 13,
                background: 'var(--theme-input-bg, #fff)',
                color: 'var(--theme-text, #1f2937)',
                outline: 'none',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#2563eb'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--theme-border-color, #e5e7eb)'
              }}
            />
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                sendMessage(input)
              }}
              disabled={loading || !input.trim()}
              style={{
                padding: '10px 18px',
                background: loading || !input.trim() ? '#9ca3af' : '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 13,
                cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  )
})

export default OptiMateChatCore
