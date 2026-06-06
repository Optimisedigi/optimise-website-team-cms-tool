'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CHAT_PICKER_MODELS,
  DEFAULT_CHAT_MODEL,
  isCanonicalModel,
} from '@/lib/agents/_shared/llm/registry'
import { renderMarkdown } from './OptiMateChatCore'

/**
 * Compact Invoice Assistant chat for the OptiMate launcher panel.
 *
 * Wraps the same `/api/xero/chat` endpoint the full-page chat on
 * `/admin/finance/invoices` uses. Conversation history lives in component
 * state — closing the panel discards it (matches the existing assistant's
 * behaviour).
 *
 * Visually mirrors the Google Ads OptiMate chat (OptiMateChatCore): asymmetric
 * rounded message bubbles, markdown + GFM table rendering for assistant
 * replies (via the shared `renderMarkdown`), a typing-dots loader, and a model
 * selector below the composer. The selected model is sent to the endpoint so
 * the user's pick overrides the configured invoice-assistant default.
 *
 * Limitations vs the Google Ads OptiMate stack (intentional, see CLAUDE.md
 * notes from the agent migration plan):
 *  - No `optimate-chat-turns` persistence; thread is per-session.
 *  - No `agent-approval-queue` — destructive Xero actions (send/approve/
 *    schedule) execute as soon as the LLM calls the tool. The system
 *    prompt instructs the model to confirm with the user first, but
 *    that's an instruction, not a code gate.
 *  - No activity log for tool calls.
 *  - Single-shot; no per-account tabs.
 */

interface ChatMessage {
  role: 'user' | 'assistant' | 'error'
  content: string
  /** Model that produced an assistant reply (shown as a small caption). */
  modelUsed?: string
}

interface ToolAction {
  tool: string
  result?: unknown
}

/** localStorage slot for the invoice chat's preferred model. Kept separate
 *  from the Google Ads chat key so picking a model in one surface doesn't
 *  silently change the other. */
const MODEL_STORAGE_KEY = 'optimate-invoice-model'

/** True when the stored value is a real model still offered in the picker. */
function isUsablePickerModel(raw: string | null): raw is string {
  if (!raw || !isCanonicalModel(raw)) return false
  return CHAT_PICKER_MODELS.some((m) => m.canonical === raw)
}

function loadPersistedModel(): string {
  if (typeof window === 'undefined') return DEFAULT_CHAT_MODEL
  try {
    const raw = window.localStorage.getItem(MODEL_STORAGE_KEY)
    return isUsablePickerModel(raw) ? raw : DEFAULT_CHAT_MODEL
  } catch {
    return DEFAULT_CHAT_MODEL
  }
}

function hasExplicitModelChoice(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return isUsablePickerModel(window.localStorage.getItem(MODEL_STORAGE_KEY))
  } catch {
    return false
  }
}

function savePersistedModel(model: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(MODEL_STORAGE_KEY, model)
  } catch {
    /* ignore storage failures */
  }
}

export default function InvoiceAssistantChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [selectedModel, setSelectedModel] = useState<string>(() => loadPersistedModel())
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, sending, scrollToBottom])

  /**
   * Seed the picker from the configured invoice-assistant default until the
   * user makes an explicit per-browser choice — once they pick a model, their
   * choice wins. Mirrors OptiMateChatCore's seeding behaviour.
   */
  useEffect(() => {
    if (hasExplicitModelChoice()) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/optimate/default-model', { credentials: 'include' })
        if (!res.ok) return
        const json = (await res.json()) as { invoiceAssistantModel?: string }
        const next = json.invoiceAssistantModel
        if (!cancelled && isUsablePickerModel(next ?? null)) {
          setSelectedModel(next as string)
        }
      } catch {
        /* keep the local default */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending) return

    setInput('')
    setSending(true)
    setMessages((prev) => [...prev, { role: 'user', content: text }])

    // Only user/assistant turns become history — drop errors so the model
    // doesn't try to interpret them.
    const history = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch('/api/xero/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history, model: selectedModel }),
        credentials: 'include',
      })

      const data = (await res.json()) as {
        reply?: string
        error?: string
        actions?: ToolAction[]
        model?: string
      }

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: 'error', content: data.error || `Request failed (${res.status})` },
        ])
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.reply ?? '(no reply)',
            modelUsed: data.model,
          },
        ])
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'error',
          content: err instanceof Error ? err.message : 'Failed to reach the assistant',
        },
      ])
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleClear = () => setMessages([])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        gap: 0,
      }}
    >
      {/* Sub-header: clear button + lightweight note */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 0 8px 0',
          marginBottom: 4,
          borderBottom: '1px solid var(--theme-border-color, #e5e7eb)',
        }}
      >
        <span style={{ fontSize: 11, color: '#6b7280' }}>
          Xero invoices · creates &amp; sends in real time
        </span>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#6b7280',
              fontSize: 11,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Messages scroll area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 0',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {messages.length === 0 && !sending && (
          <div
            style={{
              fontSize: 12,
              color: '#6b7280',
              padding: '16px 8px',
              textAlign: 'center',
            }}
          >
            Ask me to create, send, schedule, or look up invoices.
            <br />
            <span style={{ color: '#9ca3af', fontSize: 11 }}>
              e.g. <em>“Show me overdue invoices”</em> or <em>“Create this month’s retainer for MTP”</em>
            </span>
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
                maxWidth: '90%',
                padding: '10px 14px',
                borderRadius:
                  msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background:
                  msg.role === 'error'
                    ? '#fee2e2'
                    : msg.role === 'user'
                      ? '#2563eb'
                      : '#f3f4f6',
                color:
                  msg.role === 'error'
                    ? '#b91c1c'
                    : msg.role === 'user'
                      ? '#fff'
                      : '#1f2937',
                border: msg.role === 'error' ? '1px solid #fecaca' : undefined,
                fontSize: 13,
                lineHeight: 1.5,
                wordBreak: 'break-word',
              }}
            >
              {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
            </div>
            {msg.role === 'assistant' && msg.modelUsed && (
              <div
                style={{
                  fontSize: 10,
                  color: '#6b7280',
                  marginTop: 4,
                  paddingLeft: 4,
                }}
              >
                {msg.modelUsed}
              </div>
            )}
          </div>
        ))}

        {sending && (
          <div
            style={{
              display: 'flex',
              gap: 4,
              padding: '10px 14px',
              alignItems: 'center',
              alignSelf: 'flex-start',
              background: '#f3f4f6',
              borderRadius: '16px 16px 16px 4px',
            }}
          >
            <span style={dotStyle} />
            <span style={{ ...dotStyle, animationDelay: '0.25s' }} />
            <span style={{ ...dotStyle, animationDelay: '0.5s' }} />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          paddingTop: 8,
          borderTop: '1px solid var(--theme-border-color, #e5e7eb)',
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask the invoice assistant…"
          disabled={sending}
          style={{
            flex: 1,
            padding: '8px 10px',
            border: '1px solid var(--theme-border-color, #e5e7eb)',
            borderRadius: 6,
            background: 'var(--theme-input-bg, #fff)',
            color: 'var(--theme-text, #1f2937)',
            fontSize: 13,
          }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !input.trim()}
          style={{
            padding: '8px 14px',
            background: !input.trim() || sending ? '#9ca3af' : '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontWeight: 600,
            fontSize: 13,
            cursor: !input.trim() || sending ? 'not-allowed' : 'pointer',
          }}
        >
          Send
        </button>
      </div>

      {/* Model selector — sits below the composer, matching the Google Ads chat. */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          justifyContent: 'flex-end',
          marginTop: 6,
        }}
      >
        <select
          value={selectedModel}
          onChange={(e) => {
            setSelectedModel(e.target.value)
            savePersistedModel(e.target.value)
          }}
          disabled={sending}
          title="Model used for the next message"
          style={{
            fontSize: 11,
            padding: '4px 8px',
            border: '1px solid var(--theme-border-color, #e5e7eb)',
            borderRadius: 6,
            background: 'var(--theme-input-bg, #fff)',
            color: 'var(--theme-text, #1f2937)',
            cursor: sending ? 'not-allowed' : 'pointer',
            width: 270,
            maxWidth: '100%',
          }}
        >
          {CHAT_PICKER_MODELS.map((m) => (
            <option key={m.canonical} value={m.canonical}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {/* Keyframes for typing dots */}
      <style>{`
        @keyframes invoiceTypingPulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.85); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}

const dotStyle: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: '#6b7280',
  display: 'inline-block',
  animation: 'invoiceTypingPulse 1.2s ease-in-out infinite',
}
