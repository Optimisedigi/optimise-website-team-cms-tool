'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState, useRef, useEffect, useCallback } from 'react'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTED_QUESTIONS = [
  'How is my budget pacing this month?',
  'Which campaigns are performing best this week?',
  'Are there any keywords wasting spend?',
  'Give me a weekly performance summary',
]

const GoogleAdsChat = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const sessionIdRef = useRef(crypto.randomUUID())

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  if (!id) return null

  const customerId = fields?.customerId?.value as string | undefined
  const businessName = fields?.businessName?.value as string | undefined

  if (!customerId) {
    return (
      <div style={{ padding: 16, color: '#9ca3af', fontSize: 13 }}>
        Save a Customer ID on the Client Info tab to use the chat.
      </div>
    )
  }

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return

    const userMsg: ChatMessage = { role: 'user', content: text.trim() }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/google-ads-audits/${id}/chat`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          sessionId: sessionIdRef.current,
          history: messages.slice(-20),
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Failed (${res.status})`)
      }

      const data = await res.json()
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.reply || 'No response received.',
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Stop ALL keydown events from reaching Payload's parent form
    e.stopPropagation()
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const stopFormBubble = (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <div
      style={{ maxWidth: 700, marginBottom: 20 }}
      onSubmit={stopFormBubble}
      onKeyPress={stopFormBubble}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          O
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>OptiMate</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>
            Google Ads specialist{businessName ? ` for ${businessName}` : ''} ({customerId})
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div
        style={{
          border: '1px solid var(--theme-border-color, #e5e7eb)',
          borderRadius: 8,
          background: 'var(--theme-input-bg, #fff)',
          minHeight: 300,
          maxHeight: 500,
          overflowY: 'auto',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 16px' }}>
            <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 16 }}>
              Ask OptiMate anything about this Google Ads account.
            </p>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
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
                    padding: '6px 12px',
                    fontSize: 12,
                    background: '#f3f4f6',
                    border: '1px solid #e5e7eb',
                    borderRadius: 16,
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
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
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
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {msg.content}
            </div>
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

      {/* Error */}
      {error && (
        <p style={{ marginTop: 8, fontSize: 12, color: '#dc2626' }}>{error}</p>
      )}

      {/* Input */}
      <div
        style={{
          marginTop: 12,
          display: 'flex',
          gap: 8,
        }}
      >
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
            padding: '10px 20px',
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
  )
}

export default GoogleAdsChat
