'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import OptiMateVoice from './OptiMateVoice'
import {
  CHAT_PICKER_MODELS,
  DEFAULT_CHAT_MODEL,
  isCanonicalModel,
} from '@/lib/agents/_shared/llm/registry'
import { DEFAULT_INVOICE_MATE_STARTER_QUESTIONS } from '@/lib/agents/_shared/optimate-starter-questions'
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
  id?: string
  role: 'user' | 'assistant' | 'error'
  content: string
  /** Model that produced an assistant reply (shown as a small caption). */
  modelUsed?: string
}

interface ImageAttachment {
  name: string
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  data: string
  size: number
}

interface ToolAction {
  tool: string
  result?: unknown
}

/** localStorage slot for the invoice chat's preferred model. Kept separate
 *  from the Google Ads chat key so picking a model in one surface doesn't
 *  silently change the other. */
const MODEL_STORAGE_KEY = 'optimate-invoice-model'
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const MAX_IMAGE_ATTACHMENTS = 3
const MAX_IMAGE_ATTACHMENT_BYTES = 5 * 1024 * 1024

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

interface OptiMateSettingsResponse {
  invoiceAssistantModel?: string
  invoiceMateStarterQuestions?: string[]
}

export default function InvoiceAssistantChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [selectedModel, setSelectedModel] = useState<string>(() => loadPersistedModel())
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null)
  const [imageAttachments, setImageAttachments] = useState<ImageAttachment[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [starterQuestions, setStarterQuestions] = useState<string[]>(() => [
    ...DEFAULT_INVOICE_MATE_STARTER_QUESTIONS,
  ])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const pushVoiceTurn = useCallback((voiceId: string, role: 'user' | 'assistant', text: string) => {
    setMessages((prev) => {
      const existingIndex = prev.findIndex((msg) => msg.id === voiceId)
      if (existingIndex === -1) return [...prev, { id: voiceId, role, content: text }]
      const next = [...prev]
      next[existingIndex] = { ...next[existingIndex], role, content: text }
      return next
    })
  }, [])

  const pushVoiceAssistantMessage = useCallback((text: string) => {
    setMessages((prev) => [...prev, { role: 'assistant', content: text }])
  }, [])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, sending, scrollToBottom])

  /**
   * Seed the picker and starter questions from OptiMate Settings. The model only
   * applies until the user makes an explicit per-browser choice; configured
   * starter chips always apply. Mirrors OptiMateChatCore's seeding behaviour.
   */
  useEffect(() => {
    const hasExplicitModel = hasExplicitModelChoice()
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/optimate/default-model', { credentials: 'include' })
        if (!res.ok) return
        const json = (await res.json()) as OptiMateSettingsResponse
        const next = json.invoiceAssistantModel
        if (!cancelled && !hasExplicitModel && isUsablePickerModel(next ?? null)) {
          setSelectedModel(next as string)
        }
        if (!cancelled && Array.isArray(json.invoiceMateStarterQuestions)) {
          setStarterQuestions(json.invoiceMateStarterQuestions)
        }
      } catch {
        /* keep the local defaults */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const sendMessage = async (raw: string) => {
    const text = raw.trim()
    const currentImages = imageAttachments
    if ((!text && currentImages.length === 0) || sending) return

    const imageSummary = currentImages.length > 0
      ? `\n\n[Attached image${currentImages.length === 1 ? '' : 's'}: ${currentImages.map((img) => img.name).join(', ')}]`
      : ''
    const displayText = text || 'Please review the attached image.'

    setInput('')
    setSending(true)
    setMessages((prev) => [...prev, { role: 'user', content: `${displayText}${imageSummary}` }])

    // Only user/assistant turns become history — drop errors so the model
    // doesn't try to interpret them.
    const history = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch('/api/xero/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: displayText,
          history,
          model: selectedModel,
          imageAttachments: currentImages.map((image) => ({
            name: image.name,
            mediaType: image.mediaType,
            data: image.data,
          })),
        }),
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
        setImageAttachments([])
        if (imageInputRef.current) imageInputRef.current.value = ''
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

  const handleSend = () => sendMessage(input)

  const readImageAttachment = (file: File): Promise<ImageAttachment> =>
    new Promise((resolve, reject) => {
      if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
        reject(new Error(`${file.name} is not a supported image type. Use PNG, JPEG, GIF, or WebP.`))
        return
      }
      if (file.size > MAX_IMAGE_ATTACHMENT_BYTES) {
        reject(new Error(`${file.name} is too large. Use images up to 5 MB.`))
        return
      }
      const reader = new FileReader()
      reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : ''
        const comma = result.indexOf(',')
        const data = comma >= 0 ? result.slice(comma + 1) : result
        resolve({
          name: file.name,
          mediaType: file.type as ImageAttachment['mediaType'],
          data,
          size: file.size,
        })
      }
      reader.readAsDataURL(file)
    })

  const handleImageFiles = useCallback(async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return
    const incoming = Array.from(files).filter((file) => file.type.startsWith('image/'))
    if (incoming.length === 0) {
      setMessages((prev) => [...prev, { role: 'error', content: 'Attach PNG, JPEG, GIF, or WebP screenshots.' }])
      return
    }
    const availableSlots = Math.max(0, MAX_IMAGE_ATTACHMENTS - imageAttachments.length)
    const nextFiles = incoming.slice(0, availableSlots)
    if (nextFiles.length === 0) {
      setMessages((prev) => [...prev, { role: 'error', content: `Attach up to ${MAX_IMAGE_ATTACHMENTS} images per message.` }])
      return
    }
    try {
      const next = await Promise.all(nextFiles.map(readImageAttachment))
      setImageAttachments((prev) => [...prev, ...next].slice(0, MAX_IMAGE_ATTACHMENTS))
      if (incoming.length > nextFiles.length) {
        setMessages((prev) => [...prev, { role: 'error', content: `Attached the first ${nextFiles.length} images. Limit is ${MAX_IMAGE_ATTACHMENTS} per message.` }])
      }
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'error', content: err instanceof Error ? err.message : 'Could not attach image' }])
    } finally {
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }, [imageAttachments.length])

  useEffect(() => {
    let dragDepth = 0

    const eventHasFiles = (event: DragEvent): boolean =>
      Array.from(event.dataTransfer?.types ?? []).includes('Files')

    const handleWindowDragEnter = (event: DragEvent) => {
      if (!eventHasFiles(event)) return
      event.preventDefault()
      dragDepth += 1
      setDragActive(true)
    }

    const handleWindowDragOver = (event: DragEvent) => {
      if (!eventHasFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
      setDragActive(true)
    }

    const handleWindowDragLeave = (event: DragEvent) => {
      if (!eventHasFiles(event)) return
      event.preventDefault()
      dragDepth = Math.max(0, dragDepth - 1)
      if (dragDepth === 0) setDragActive(false)
    }

    const handleWindowDrop = (event: DragEvent) => {
      if (!eventHasFiles(event)) return
      event.preventDefault()
      dragDepth = 0
      setDragActive(false)
      void handleImageFiles(event.dataTransfer?.files ?? null)
    }

    window.addEventListener('dragenter', handleWindowDragEnter)
    window.addEventListener('dragover', handleWindowDragOver)
    window.addEventListener('dragleave', handleWindowDragLeave)
    window.addEventListener('drop', handleWindowDrop)

    return () => {
      window.removeEventListener('dragenter', handleWindowDragEnter)
      window.removeEventListener('dragover', handleWindowDragOver)
      window.removeEventListener('dragleave', handleWindowDragLeave)
      window.removeEventListener('drop', handleWindowDrop)
    }
  }, [handleImageFiles])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
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
          Xero invoices · creates &amp; sends in real time{voiceStatus ? ` · ${voiceStatus}` : ''}
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

      {/* Messages area — bordered box matching the Google Ads chat. */}
      <div
        style={{
          flex: 1,
          border: '1px solid var(--theme-border-color, #e5e7eb)',
          borderRadius: 8,
          background: 'var(--theme-input-bg, #fff)',
          overflowY: 'auto',
          padding: 16,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {messages.length === 0 && !sending && (
          <div style={{ textAlign: 'center', padding: '32px 8px' }}>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 14 }}>
              Ask me to create, send, schedule, or look up invoices.
            </p>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                justifyContent: 'center',
              }}
            >
              {starterQuestions.map((q) => (
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

      {/* Composer — bordered box with a borderless textarea and a round
        up-arrow send button, identical to the Google Ads chat. */}
      <div
        style={{
          position: 'relative',
          marginTop: 8,
          minHeight: 104,
          border: '1px solid var(--theme-border-color, #e5e7eb)',
          borderRadius: 14,
          background: 'var(--theme-input-bg, #fff)',
          padding: '12px 14px 46px',
        }}
      >
        {imageAttachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {imageAttachments.map((image, idx) => (
              <span
                key={`${image.name}-${idx}`}
                title={`${image.name} · ${Math.round(image.size / 1024)} KB`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  maxWidth: 180,
                  padding: '4px 7px',
                  borderRadius: 999,
                  border: '1px solid #dbeafe',
                  background: '#eff6ff',
                  color: '#1d4ed8',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{image.name}</span>
                <button
                  type="button"
                  onClick={() => setImageAttachments((prev) => prev.filter((_, i) => i !== idx))}
                  aria-label={`Remove ${image.name}`}
                  disabled={sending}
                  style={{ border: 0, background: 'transparent', color: '#1d4ed8', cursor: sending ? 'not-allowed' : 'pointer', padding: 0, fontWeight: 900 }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Feel free to ask"
          disabled={sending}
          style={{
            width: '100%',
            minHeight: 36,
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
          }}
        />

        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          onChange={(e) => handleImageFiles(e.target.files)}
          style={{ display: 'none' }}
        />

        <div
          style={{
            position: 'absolute',
            right: 14,
            bottom: 8,
            display: 'flex',
            gap: 7,
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              imageInputRef.current?.click()
            }}
            disabled={sending || imageAttachments.length >= MAX_IMAGE_ATTACHMENTS}
            title="Attach a screenshot"
            aria-label="Attach image screenshot"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 29,
              height: 29,
              border: '1px solid #d1d5db',
              borderRadius: 8,
              background: '#fff',
              color: '#374151',
              cursor: sending || imageAttachments.length >= MAX_IMAGE_ATTACHMENTS ? 'not-allowed' : 'pointer',
              opacity: sending || imageAttachments.length >= MAX_IMAGE_ATTACHMENTS ? 0.55 : 1,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 7h3l1.4-2h7.2L17 7h3v12H4V7Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              <circle cx="12" cy="13" r="3.5" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
          <OptiMateVoice
            mode="invoice"
            triggerSize={29}
            onTurn={pushVoiceTurn}
            onAssistantMessage={pushVoiceAssistantMessage}
            onStatusChange={setVoiceStatus}
          />
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleSend()
            }}
            disabled={sending || (!input.trim() && imageAttachments.length === 0)}
            title="Send"
            aria-label="Send"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 29,
              height: 29,
              background: sending || (!input.trim() && imageAttachments.length === 0) ? '#9ca3af' : '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: sending || (!input.trim() && imageAttachments.length === 0) ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
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
      </div>

      {dragActive && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2147483647,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(37, 99, 235, 0.12)',
            border: '3px dashed rgba(37, 99, 235, 0.7)',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              padding: '16px 22px',
              borderRadius: 16,
              background: '#fff',
              color: '#1d4ed8',
              boxShadow: '0 18px 45px rgba(15, 23, 42, 0.18)',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Drop screenshots to attach to InvoiceMate
          </div>
        </div>
      )}

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
