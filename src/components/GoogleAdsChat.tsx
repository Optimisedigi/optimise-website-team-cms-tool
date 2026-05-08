'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState, useRef, useEffect, useCallback } from 'react'
import { CHAT_PICKER_MODELS, DEFAULT_CHAT_MODEL } from '@/lib/agents/_shared/llm/registry'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  runId?: string
  modelUsed?: string
}

const SUGGESTED_QUESTIONS = [
  'How is my budget pacing this month?',
  'Which campaigns are performing best this week?',
  'Are there any keywords wasting spend?',
  'Give me a weekly performance summary',
]

/**
 * Lightweight markdown renderer for chat messages.
 * Handles: **bold**, bullet lists (- item), numbered lists, and paragraphs.
 */
function renderMarkdown(text: string) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let listItems: React.ReactNode[] = []
  let listType: 'ul' | 'ol' | null = null
  let codeBlock: string[] | null = null
  let codeBlockLang = ''

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
      codeBlockLang = ''
    }
  }

  const formatInline = (line: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = []
    // Handle **bold** and `inline code`
    const regex = /\*\*(.+?)\*\*|`([^`]+)`/g
    let lastIndex = 0
    let match
    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index))
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
      parts.push(line.slice(lastIndex))
    }
    return parts.length > 0 ? parts : [line]
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Fenced code block start/end
    if (line.trimStart().startsWith('```')) {
      if (codeBlock === null) {
        flushList()
        codeBlock = []
        codeBlockLang = line.trimStart().slice(3).trim()
      } else {
        flushCodeBlock()
      }
      continue
    }

    // Inside a code block — collect lines as-is
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
  flushCodeBlock() // close unclosed code block
  return elements
}

const GoogleAdsChat = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_CHAT_MODEL)
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
          history: messages.slice(-20).map(({ role, content }) => ({ role, content })),
          model: selectedModel,
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
        runId: typeof data.runId === 'string' ? data.runId : undefined,
        modelUsed: typeof data.modelUsed === 'string' ? data.modelUsed : undefined,
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
    // Stop keydown from reaching Payload's parent form
    e.stopPropagation()
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <div
      style={{ maxWidth: 700, marginBottom: 20 }}
      onKeyDown={(e) => e.stopPropagation()}
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
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>OptiMate</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>
            Google Ads specialist{businessName ? ` for ${businessName}` : ''} ({customerId})
          </div>
        </div>
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
          }}
        >
          {CHAT_PICKER_MODELS.map((m) => (
            <option key={m.canonical} value={m.canonical}>
              {m.label}
            </option>
          ))}
        </select>
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
            {msg.role === 'assistant' && msg.runId && (
              <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4, paddingLeft: 4 }}>
                {msg.modelUsed ? <span style={{ marginRight: 8 }}>{msg.modelUsed}</span> : null}
                <a
                  href={`/agent-runs/${msg.runId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#2563eb', textDecoration: 'none' }}
                >
                  View run details →
                </a>
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
