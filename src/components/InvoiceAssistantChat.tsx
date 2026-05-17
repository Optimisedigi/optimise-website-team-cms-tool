'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Compact Invoice Assistant chat for the OptiMate launcher panel.
 *
 * Wraps the same `/api/xero/chat` endpoint the full-page chat on
 * `/admin/finance/invoices` uses. Conversation history lives in component
 * state — closing the panel discards it (matches the existing assistant's
 * behaviour). Styled to match the launcher's Google Ads chat surface
 * (dark input bar, flex column, sticky composer at the bottom).
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
}

interface ToolAction {
  tool: string
  result?: unknown
}

export default function InvoiceAssistantChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, sending, scrollToBottom])

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
        body: JSON.stringify({ message: text, history }),
        credentials: 'include',
      })

      const data = (await res.json()) as {
        reply?: string
        error?: string
        actions?: ToolAction[]
      }

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: 'error', content: data.error || `Request failed (${res.status})` },
        ])
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.reply ?? '(no reply)' },
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
              padding: '8px 10px',
              marginBottom: 6,
              borderRadius: 8,
              fontSize: 13,
              lineHeight: 1.45,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxWidth: '90%',
              ...messageStyle(msg.role),
            }}
          >
            {msg.content}
          </div>
        ))}

        {sending && (
          <div
            style={{
              display: 'flex',
              gap: 4,
              padding: '8px 10px',
              alignItems: 'center',
            }}
          >
            <span style={dotStyle} />
            <span style={{ ...dotStyle, animationDelay: '0.15s' }} />
            <span style={{ ...dotStyle, animationDelay: '0.3s' }} />
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

function messageStyle(role: ChatMessage['role']): React.CSSProperties {
  switch (role) {
    case 'user':
      return {
        background: '#2563eb',
        color: '#fff',
        alignSelf: 'flex-end',
        marginLeft: 'auto',
      }
    case 'assistant':
      return {
        background: 'var(--theme-elevation-50, #f3f4f6)',
        color: 'var(--theme-text, #1f2937)',
      }
    case 'error':
      return {
        background: '#fee2e2',
        color: '#b91c1c',
        border: '1px solid #fecaca',
      }
  }
}

const dotStyle: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: '#9ca3af',
  display: 'inline-block',
  animation: 'invoiceTypingPulse 1.2s ease-in-out infinite',
}
