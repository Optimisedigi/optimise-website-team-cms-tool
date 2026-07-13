'use client'

import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import {
  CHAT_PICKER_MODELS,
  DEFAULT_CHAT_MODEL,
  isCanonicalModel,
} from '@/lib/agents/_shared/llm/registry'

type ReasoningMode = 'off' | 'low' | 'medium' | 'high'

/** sessionStorage key for the live chat sessionId, scoped per auditId so two
 *  audits open in different tabs don't share threads. sessionStorage (not
 *  localStorage) so closing the tab still clears it — the assumption is that
 *  a tab close means "I'm done with this thread". */
function sessionStorageKey(auditId: string | number): string {
  return `optimate-session:${String(auditId)}`
}

function loadPersistedSessionId(auditId: string | number): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(sessionStorageKey(auditId))
    return raw && raw.length > 0 ? raw : null
  } catch {
    return null
  }
}

function savePersistedSessionId(auditId: string | number, sid: string): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(sessionStorageKey(auditId), sid)
  } catch {
    // Quota exceeded or storage disabled — in-memory ref still works for
    // this tab; we just lose reload-survival.
  }
}

import OptiMateProposalCard, { type OptiMateProposal } from './OptiMateProposalCard'
import OptiMateConfirmBubble, {
  type OptiMateConfirmRequest,
  type ConfirmResolution,
} from './OptiMateConfirmBubble'
import EmailAttachPicker, { type AttachedEmailMeta } from './EmailAttachPicker'
import type { CanonicalModelName } from '@/lib/agents/_shared/llm/registry'
import OptiMateToolsHelp from './OptiMateToolsHelp'
import OptiMateVoice from './OptiMateVoice'
import OptiMateTranscribe from './OptiMateTranscribe'
import { isVoiceEnabled } from '@/lib/realtime/token-provider'
import {
  GOOGLE_MATE_PARITY_QUERY,
  summarizeForDevTrace,
  type GoogleMateDevTextTrace,
  type GoogleMateDevToolTrace,
  type GoogleMateDevVoiceTrace,
} from '@/lib/optimate/dev-google-mate-parity'

/**
 * Imperative handle exposed via ref so a multi-account wrapper can broadcast
 * a single user-typed message to many `OptiMateChatCore` instances at once.
 * `sendMessage` resolves when the turn completes; the wrapper awaits all to
 * coordinate the shared input's loading state.
 */
export interface OptiMateChatCoreHandle {
  sendMessage: (text: string) => Promise<void>
  stopThinking: () => void
  isBusy: () => boolean
  /** Current sessionId for this audit's chat thread. Read by the launcher
   *  popout handler so the new window can resume the same thread instead
   *  of starting fresh. Returns undefined if the ref isn't attached yet. */
  getSessionId: () => string | undefined
}

interface ImageAttachment {
  name: string
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  data: string
  size: number
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** True for turns spoken on a live voice call (rendered in the same thread
   *  but tagged so we can show a small "voice" affordance). */
  voice?: boolean
  /** Stable id for a voice turn so streaming deltas update one message. */
  voiceId?: string
  runId?: string
  modelUsed?: string
  /** Set when the agent fell back to a different model than requested
   *  (e.g. Anthropic 429 → Kimi). Drives the amber failover pill. */
  modelRequested?: string
  proposals?: OptiMateProposal[]
  /** Confirm-gate bubbles emitted by `request_confirm` during this turn.
   *  Resolution state is held alongside so Yes/No clicks flip the buttons
   *  to a static pill without forcing a server round-trip. */
  confirmRequests?: OptiMateConfirmRequest[]
  /** Per-confirmId resolution. Missing key = pending. */
  confirmResolutions?: Record<string, ConfirmResolution>
  /** True when the server reported `persisted: false` for this turn —
   *  the chat-turns DB write failed (typically because `/api/migrate`
   *  hasn't been run after a deploy that added the table). Drives an
   *  inline amber "history not saved" pill so the user knows reloading
   *  will lose this turn. */
  historyNotSaved?: boolean
}

interface ChatHistoryEntry {
  role: 'user' | 'assistant'
  content: string
}

interface TypedChatRequestPayload {
  message: string
  displayMessage: string
  sessionId: string
  history: ChatHistoryEntry[]
  model: CanonicalModelName
  reasoningMode: ReasoningMode
  selectedAccountRefs?: Array<string | number>
  imageAttachments?: Array<Pick<ImageAttachment, 'name' | 'mediaType' | 'data'>>
  attachedEmail?: {
    messageId: string
    subject: string
    from: string
    date: string
  }
}

interface TypedChatResponse {
  reply?: string
  runId?: string
  modelUsed?: string
  modelRequested?: string
  proposals?: Array<Record<string, unknown>>
  confirmRequests?: Array<Record<string, unknown>>
  sessionId?: string
  persisted?: boolean
}

interface ApplyTypedChatResponseOptions {
  voice?: boolean
  clearTurnAttachments?: boolean
}

export interface OptiMateChatCoreProps {
  mode?: 'audit' | 'portfolio'
  auditId: string | number
  customerId?: string
  businessName?: string
  /** Compact mode = launcher panel; default = full tab */
  compact?: boolean
  /** Standalone popout mode fills the browser width for wide tables/reports. */
  fluid?: boolean
  /** Hide the per-tab input row (the multi-chat wrapper supplies a shared one). */
  hideInput?: boolean
  /** Optional hidden context sent to the API before each user request, without showing it in the chat bubble. */
  messageContextPrefix?: string
  /** Account refs selected for the synthetic selected-accounts portfolio tab. */
  selectedAccountRefs?: Array<string | number>
  /** Display labels matching selectedAccountRefs, used for the tiny multi-account progress pill. */
  selectedAccountLabels?: string[]
  /**
   * Resume an existing chat thread on mount. When set, the component fetches
   * the thread's turns from /api/optimate-chat-history and seeds `messages`.
   * Leave unset to start a fresh thread.
   */
  initialSessionId?: string
}

function OptiMateTypingLoader(): React.ReactElement {
  return (
    <span
      aria-label="OptiMate is typing"
      role="status"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 20 }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: '#6b7280',
            animation: 'optimateTyping 1s infinite',
            animationDelay: `${i * 250}ms`,
          }}
        />
      ))}
    </span>
  )
}

interface ChatSession {
  sessionId: string
  firstMessage: string
  lastMessageAt: string
  turnCount: number
}

const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const MAX_IMAGE_ATTACHMENTS = 3
const MAX_IMAGE_ATTACHMENT_BYTES = 5 * 1024 * 1024

const MONTHLY_EMAIL_COMPONENT_CHIPS = [
  { key: 'keyword_relevancy', label: 'Keyword Relevancy' },
  { key: 'cpa_trend', label: 'CPA Trend' },
  { key: 'quality_score', label: 'Quality Score' },
  { key: 'top_converters', label: 'Top Converters' },
] as const

type MonthlyEmailComponentKey = (typeof MONTHLY_EMAIL_COMPONENT_CHIPS)[number]['key']

function shouldShowMonthlyEmailComponents(input: string, selectedCount: number): boolean {
  if (selectedCount > 0) return true
  const text = input.toLowerCase()
  return /\bmonthly\b/.test(text) && /\b(budget|email|report|gmail|draft)\b/.test(text)
}

interface OptiMateSettingsResponse {
  defaultChatModel?: string
  googleMateStarterQuestions?: string[]
  googleMatePortfolioStarterQuestions?: string[]
}

interface GoogleMateParityHarnessResponse {
  query: string
  textTrace: GoogleMateDevTextTrace
  voiceContext: {
    mode: 'audit' | 'portfolio'
    modelRequested?: string
    modelUsed?: string
    availableToolNames: string[]
    historyMessageCount: number
    replyPath?: 'typed-backend' | 'realtime-model'
  }
  divergenceHints: string[]
}

interface ParityToolComparison {
  index: number
  textTool: GoogleMateDevToolTrace | null
  voiceTool: GoogleMateDevToolTrace | null
  differs: boolean
  diffFields: string[]
}

function stringifyParityValue(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'string') return value || '—'
  return summarizeForDevTrace(value, 400)
}

function areParityValuesEqual(left: unknown, right: unknown): boolean {
  return stringifyParityValue(left) === stringifyParityValue(right)
}

function buildParityToolComparisons(
  textTools: GoogleMateDevToolTrace[],
  voiceTools: GoogleMateDevToolTrace[],
): ParityToolComparison[] {
  const count = Math.max(textTools.length, voiceTools.length)
  return Array.from({ length: count }, (_, index) => {
    const textTool = textTools[index] ?? null
    const voiceTool = voiceTools[index] ?? null
    const diffFields: string[] = []
    if (!textTool || !voiceTool) {
      diffFields.push(textTool ? 'missing in voice' : 'missing in text')
    } else {
      if (textTool.name !== voiceTool.name) diffFields.push('tool name')
      if (!areParityValuesEqual(textTool.args, voiceTool.args)) diffFields.push('args')
      if (!areParityValuesEqual(textTool.resultSummary, voiceTool.resultSummary)) diffFields.push('result summary')
      if ((textTool.ok ?? null) !== (voiceTool.ok ?? null)) diffFields.push('status')
    }
    return {
      index,
      textTool,
      voiceTool,
      differs: diffFields.length > 0,
      diffFields,
    }
  })
}

function summarizeToolSetDiff(textTools: string[], voiceTools: string[]): string {
  const onlyText = textTools.filter((name) => !voiceTools.includes(name))
  const onlyVoice = voiceTools.filter((name) => !textTools.includes(name))
  if (onlyText.length === 0 && onlyVoice.length === 0) return 'Same turn-1 tool set.'
  return [
    onlyText.length > 0 ? `Text-only: ${onlyText.join(', ')}` : '',
    onlyVoice.length > 0 ? `Voice-only: ${onlyVoice.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join(' • ')
}

/**
 * Lightweight markdown renderer for chat messages.
 * Handles: **bold**, bullet lists (- item), numbered lists, paragraphs, fenced code.
 */
export function renderMarkdown(text: string) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let listItems: React.ReactNode[] = []
  let listType: 'ul' | 'ol' | null = null
  let codeBlock: string[] | null = null

  /** Split a pipe-delimited row into trimmed cells, stripping leading/trailing `|`. */
  const splitRow = (row: string): string[] => {
    const trimmed = row.trim().replace(/^\|/, '').replace(/\|$/, '')
    return trimmed.split('|').map((c) => c.trim())
  }

  /** Right-align numeric / currency cells (matches the leading char). */
  const isNumericCell = (cell: string): boolean => /^-?[$£€]?\s*\d/.test(cell.trim())

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
   *   - in-app paths /admin/agent-approvals/<id>
   *
   * Order matters: we run the bold/code regex first so URLs inside backticks
   * are kept literal, then the URL/path regex on the remaining text spans.
   */
  const linkifyText = (text: string, keyPrefix: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = []
    // Combined: full URL OR /admin/agent-approvals/<id>
    const regex = /(https?:\/\/[^\s)]+)|(\/admin\/agent-approvals\/\d+)/g
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

    /* GFM table detection: pipe row followed by a separator row like
     * `| --- | :---: |`. We look ahead one line; if it matches, consume
     * header + separator + all subsequent pipe rows until a blank/non-pipe
     * line. Cells still pass through `formatInline` so bold/code/links work. */
    const nextLine = lines[i + 1]
    const isPipeRow = (s: string | undefined) =>
      typeof s === 'string' && s.includes('|') && s.trim().length > 0
    const isSeparator = (s: string | undefined) =>
      typeof s === 'string' && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(s)
    if (codeBlock === null && isPipeRow(line) && isSeparator(nextLine)) {
      flushList()
      const header = splitRow(line)
      const colCount = header.length
      const bodyRows: string[][] = []
      let j = i + 2
      while (j < lines.length && isPipeRow(lines[j]) && lines[j].trim() !== '') {
        bodyRows.push(splitRow(lines[j]))
        j++
      }

      // Some model-generated markdown tables accidentally put the intro sentence
      // into the first header cell, e.g. "Here's the table... | Week | Spend".
      // Treat that as prose outside the table so the data columns stay aligned.
      const introHeaderPattern = /^(here\s+is|here'?s|below\s+is|the\s+table|table\s+for)\b/i
      const hasIntroHeader =
        header.length > 1 && introHeaderPattern.test(header[0] ?? '') && /week|date/i.test(header[1] ?? '')
      const tableIntro = hasIntroHeader ? header[0] : null
      const tableHeader = hasIntroHeader ? header.slice(1) : header
      const tableColCount = tableHeader.length
      const tableNotes = bodyRows.flatMap((row) =>
        row
          .slice(tableColCount)
          .map((cell) => cell.trim())
          .filter((cell) => cell.length > 0),
      )

      // Determine numeric columns by inspecting the first body row.
      const numericCols = new Set<number>()
      if (bodyRows.length > 0) {
        bodyRows[0].slice(0, tableColCount).forEach((cell, idx) => {
          if (isNumericCell(cell)) numericCols.add(idx)
        })
      }

      const tableKey = `table-${elements.length}`
      elements.push(
        <div key={tableKey} style={{ overflowX: 'auto', margin: '8px 0' }}>
          {tableIntro && (
            <p style={{ margin: '0 0 8px 0', fontSize: 13, lineHeight: 1.45 }}>
              {formatInline(tableIntro)}
            </p>
          )}
          <table
            style={{
              borderCollapse: 'collapse',
              fontSize: 12,
              width: 'auto',
              maxWidth: '680px',
            }}
          >
            <thead>
              <tr>
                {tableHeader.map((cell, idx) => (
                  <th
                    key={`th-${idx}`}
                    style={{
                      background: '#f3f4f6',
                      padding: '6px 8px',
                      textAlign: numericCols.has(idx) ? 'right' : 'left',
                      border: '1px solid #e5e7eb',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, rIdx) => (
                <tr key={`tr-${rIdx}`}>
                  {Array.from({ length: tableColCount }).map((_, cIdx) => {
                    const cell = row[cIdx] ?? ''
                    return (
                      <td
                        key={`td-${rIdx}-${cIdx}`}
                        style={{
                          padding: '6px 8px',
                          border: '1px solid #e5e7eb',
                          textAlign: numericCols.has(cIdx) ? 'right' : 'left',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {formatInline(cell)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {tableNotes.map((note, noteIdx) => (
            <p key={`table-note-${noteIdx}`} style={{ margin: '8px 0 0 0', fontSize: 12, lineHeight: 1.45, color: '#4b5563' }}>
              {formatInline(note)}
            </p>
          ))}
        </div>,
      )
      i = j - 1
      continue
    }

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

const OptiMateChatCore = forwardRef<OptiMateChatCoreHandle, OptiMateChatCoreProps>(
  function OptiMateChatCore(
    {
      mode = 'audit',
      auditId,
      customerId,
      businessName,
      compact = false,
      fluid = false,
      hideInput = false,
      messageContextPrefix,
      selectedAccountRefs = [],
      selectedAccountLabels = [],
      initialSessionId,
    },
    ref,
  ) {
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [progressAccountIndex, setProgressAccountIndex] = useState(0)
    const [error, setError] = useState<string | null>(null)
    const abortControllerRef = useRef<AbortController | null>(null)
    // Portal target for the active voice controls (under the account name).
    // A state mirror forces one re-render once the ref node is attached so the
    // portal has a valid container on the first active render.
    const voiceControlsRef = useRef<HTMLDivElement | null>(null)
    const [voiceControlsEl, setVoiceControlsEl] = useState<HTMLDivElement | null>(null)
    const progressAccountLabels = selectedAccountLabels.length > 0
      ? selectedAccountLabels
      : selectedAccountRefs.map((ref) => `Account ${String(ref)}`)
    useEffect(() => {
      setVoiceControlsEl(voiceControlsRef.current)
    }, [])
    useEffect(() => {
      if (!loading || progressAccountLabels.length < 2) {
        setProgressAccountIndex(0)
        return
      }
      const timer = window.setInterval(() => {
        setProgressAccountIndex((current) => Math.min(current + 1, progressAccountLabels.length - 1))
      }, 2500)
      return () => window.clearInterval(timer)
    }, [loading, progressAccountLabels.length])

    // Insert or update a voice turn inside the SAME message thread as typed
    // chat. Streaming assistant deltas reuse the same voiceId so they update
    // one message in place instead of appending many.
    const upsertVoiceTurn = useCallback(
      (voiceId: string, role: 'user' | 'assistant', text: string) => {
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.voiceId === voiceId)
          if (idx === -1) {
            return [...prev, { role, content: text, voice: true, voiceId }]
          }
          const next = prev.slice()
          next[idx] = { ...next[idx], content: text }
          return next
        })
      },
      [],
    )

    const appendVoiceAssistantMessage = useCallback((text: string) => {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: text, voice: true, voiceId: `voice_tool_${Date.now()}` },
      ])
    }, [])
    const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_CHAT_MODEL)
    const devParityEnabled = process.env.NODE_ENV === 'development'
    const [parityBaseline, setParityBaseline] = useState<GoogleMateParityHarnessResponse | null>(null)
    const [parityVoiceTrace, setParityVoiceTrace] = useState<GoogleMateDevVoiceTrace | null>(null)
    const [parityLoading, setParityLoading] = useState(false)
    const [parityError, setParityError] = useState<string | null>(null)
    const modelManuallyChangedRef = useRef(false)
    const [starterQuestions, setStarterQuestions] = useState<string[]>([])
    const [portfolioStarterQuestions, setPortfolioStarterQuestions] = useState<string[]>([])
    const [reasoningMode, setReasoningMode] = useState<ReasoningMode>('off')
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    const runDevParityBaseline = useCallback(async () => {
      if (!devParityEnabled || loading) return
      setParityLoading(true)
      setParityError(null)
      try {
        const res = await fetch('/api/optimate/dev/google-mate-parity', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode,
            auditId,
            customerId,
            businessName,
            selectedAccountRefs,
          }),
        })
        const data = (await res.json().catch(() => ({}))) as GoogleMateParityHarnessResponse & { error?: string }
        if (!res.ok) throw new Error(data.error || `Failed (${res.status})`)
        setParityBaseline(data)
      } catch (err) {
        setParityError(err instanceof Error ? err.message : 'Failed to run parity baseline')
      } finally {
        setParityLoading(false)
      }
    }, [auditId, businessName, customerId, devParityEnabled, loading, mode, selectedAccountRefs])

    const prepareDevVoiceParity = useCallback(() => {
      setInput(GOOGLE_MATE_PARITY_QUERY)
      setParityVoiceTrace(null)
      setParityError(null)
      inputRef.current?.focus()
    }, [])

    const parityToolComparisons = buildParityToolComparisons(
      parityBaseline?.textTrace.toolsCalled ?? [],
      parityVoiceTrace?.toolsCalled ?? [],
    )
    const parityDiffItems = [
      {
        label: 'Model',
        textValue: parityBaseline?.textTrace.context.modelUsed ?? parityBaseline?.textTrace.context.modelRequested ?? null,
        voiceValue: parityVoiceTrace?.model ?? parityBaseline?.voiceContext.modelRequested ?? null,
      },
      {
        label: 'User message',
        textValue: parityBaseline?.textTrace.userMessage ?? null,
        voiceValue: parityVoiceTrace?.userMessage ?? parityVoiceTrace?.transcript ?? null,
      },
      {
        label: 'Reply path',
        textValue: parityBaseline?.textTrace.context.replyPath ?? 'typed-backend',
        voiceValue: parityVoiceTrace?.replyPath ?? parityBaseline?.voiceContext.replyPath ?? null,
      },
      {
        label: 'Final reply',
        textValue: parityBaseline?.textTrace.finalAssistantReply ?? null,
        voiceValue: parityVoiceTrace?.finalAssistantReply ?? null,
      },
      {
        label: 'Empty-response point',
        textValue: parityBaseline?.textTrace.emptyResponsePoint ?? null,
        voiceValue: parityVoiceTrace?.emptyResponsePoint ?? null,
      },
    ]
    const parityMismatchCount = parityDiffItems.filter((item) => !areParityValuesEqual(item.textValue, item.voiceValue)).length
    const parityToolMismatchCount = parityToolComparisons.filter((item) => item.differs).length
    const parityToolSetSummary = summarizeToolSetDiff(
      parityBaseline?.textTrace.context.availableToolNames ?? [],
      parityVoiceTrace?.availableToolNames ?? parityBaseline?.voiceContext.availableToolNames ?? [],
    )
    // Feature flag: render the voice CTA only when a provider is configured.
    const voiceEnabled = isVoiceEnabled()
    const canUseVoice = voiceEnabled && (mode === 'audit' || mode === 'portfolio' || selectedAccountRefs.length > 0)
    // On mobile the full Realtime voice *call* (which needs the local helper app)
    // is replaced by an Apple/Web Speech dictation button that transcribes into
    // the chat input. Track the viewport so we can swap the controls.
    const [isMobileViewport, setIsMobileViewport] = useState(false)
    useEffect(() => {
      const mq = window.matchMedia('(max-width: 768px)')
      const update = (): void => setIsMobileViewport(mq.matches)
      update()
      mq.addEventListener('change', update)
      return () => mq.removeEventListener('change', update)
    }, [])
    // Append dictated text to the current input, inserting a space when needed.
    const appendTranscript = useCallback((text: string) => {
      setInput((prev) => (prev ? `${prev.replace(/\s+$/, '')} ${text}` : text))
    }, [])
    const imageInputRef = useRef<HTMLInputElement>(null)
    const storageScope = mode === 'portfolio' ? 'portfolio' : auditId
    const displayName = businessName || (mode === 'portfolio' ? 'Portfolio' : customerId) || 'Google Ads'

    /* Auto-grow the textarea as the user types. Caps at 8 lines so the
     * chat panel never cramped; past that the textarea scrolls. */
    useEffect(() => {
      const el = inputRef.current
      if (!el) return
      el.style.height = 'auto'
      const maxPx = 8 * 20 // ~8 rows at 20px line-height
      el.style.height = Math.min(el.scrollHeight, maxPx) + 'px'
    }, [input])

    /* Seed the picker and starter questions from OptiMate Settings on first
     * load. The configured default should be reflected in the dropdown whenever
     * a chat opens; users can still switch models for the current chat. Starter
     * questions intentionally start empty so old bundled prompts never flash before
     * the settings request finishes. */
    useEffect(() => {
      let cancelled = false
      ;(async () => {
        try {
          const res = await fetch('/api/optimate/default-model')
          if (!res.ok) return
          const json = (await res.json()) as OptiMateSettingsResponse
          const next = json.defaultChatModel
          if (
            !cancelled &&
            !modelManuallyChangedRef.current &&
            typeof next === 'string' &&
            isCanonicalModel(next) &&
            CHAT_PICKER_MODELS.some((m) => m.canonical === next)
          ) {
            setSelectedModel(next)
          }
          if (!cancelled && Array.isArray(json.googleMateStarterQuestions)) {
            setStarterQuestions(json.googleMateStarterQuestions)
          }
          if (!cancelled && Array.isArray(json.googleMatePortfolioStarterQuestions)) {
            setPortfolioStarterQuestions(json.googleMatePortfolioStarterQuestions)
          }
        } catch {
          // Network/parse failure — keep starter questions empty rather than showing stale bundled prompts.
        }
      })()
      return () => {
        cancelled = true
      }
      // Mount-only: the configured default is read once per chat open.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    // Resolve the sessionId once on mount. Priority: caller-supplied
    // (resuming a thread) → sessionStorage (tab reload — lets us re-attach to
    // whatever thread this tab was last on without needing the DB) → fresh
    // UUID. The lazy initializer ensures we don't churn through UUIDs on
    // every render.
    const sessionIdRef = useRef<string>(
      initialSessionId ?? loadPersistedSessionId(storageScope) ?? crypto.randomUUID(),
    )
    const activeStorageScopeRef = useRef(storageScope)
    // Persist the initial session id immediately so a reload before the first
    // message still attaches to the same thread.
    useEffect(() => {
      if (activeStorageScopeRef.current !== storageScope) {
        activeStorageScopeRef.current = storageScope
        const nextSessionId = initialSessionId ?? loadPersistedSessionId(storageScope) ?? crypto.randomUUID()
        sessionIdRef.current = nextSessionId
        abortControllerRef.current?.abort('OptiMate client changed')
        abortControllerRef.current = null
        setMessages([])
        setInput('')
        setLoading(false)
        setError(null)
        setHistoryOpen(false)
        setAttachedEmail(null)
        setImageAttachments([])
        setDraftState({})
      }
      savePersistedSessionId(storageScope, sessionIdRef.current)
    }, [initialSessionId, storageScope])
    const [historyOpen, setHistoryOpen] = useState(false)
    const [sessions, setSessions] = useState<ChatSession[]>([])
    const [sessionsLoading, setSessionsLoading] = useState(false)
    /** Sticky flag: true if we've seen at least one `persisted: false` reply
     *  in this tab. Used by the History popover empty-state to suggest the
     *  user (or an ops person) runs /api/migrate. Resets on full reload —
     *  which is fine, it'll re-flag on the next failing turn. */
    const [persistenceFailedSeen, setPersistenceFailedSeen] = useState(false)
    const [pendingForAudit, setPendingForAudit] = useState<OptiMateProposal[]>([])
    const [pendingRefreshTick, setPendingRefreshTick] = useState(0)
    const bumpPendingRefresh = useCallback(() => setPendingRefreshTick((n) => n + 1), [])
    const [attachedEmail, setAttachedEmail] = useState<AttachedEmailMeta | null>(null)
    const [imageAttachments, setImageAttachments] = useState<ImageAttachment[]>([])
    const [selectedMonthlyEmailComponents, setSelectedMonthlyEmailComponents] = useState<MonthlyEmailComponentKey[]>([])
    const [dragActive, setDragActive] = useState(false)
    const [pickerOpen, setPickerOpen] = useState(false)
    // Drives the dim hint + popover that lists keyword triggers below the
    // chat input. Hover/focus on the textarea wrapper expands the popover.
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
    const saveAsDraft = useCallback(async (text: string, idx: number) => {
      setDraftState((prev) => ({ ...prev, [idx]: { status: 'saving' } }))
      try {
        // Don't hardcode a subject. The Gmail draft route parses a leading
        // `Subject:` / `To:` header block out of the body when OptiMate has
        // drafted an actual email — those land in the Gmail subject/to
        // fields directly. For non-email replies the subject stays blank
        // (Gmail compose pane shows an empty Subject line, which is the
        // honest default — nothing OptiMate-y leaks into client-facing
        // mail).
        const res = await fetch('/api/gmail/draft', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            body: text,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          const msg =
            data?.error === 'gmail-not-connected'
              ? 'Connect Gmail first.'
              : data?.error === 'scope-insufficient'
                ? 'Reconnect Gmail to grant compose and signature access.'
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
    }, [])

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
          const auditIdStr = mode === 'portfolio' ? '' : String(auditId)
          const items: OptiMateProposal[] = (data.docs ?? [])
            .map((d) => {
              const payload = d.proposalPayload as Record<string, unknown> | null
              const payloadAuditId = payload?.auditId
              return {
                id: Number(d.id),
                title: String(d.title ?? ''),
                proposalType: String(d.proposalType ?? ''),
                status: String(d.status ?? 'pending'),
                _audit:
                  payloadAuditId !== undefined && payloadAuditId !== null
                    ? String(payloadAuditId)
                    : '',
              }
            })
            .filter((d) => (mode === 'portfolio' ? d._audit === '' : d._audit === auditIdStr || d._audit === ''))
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
    }, [auditId, mode, pendingRefreshTick])

    const scrollToBottom = useCallback(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [])

    useEffect(() => {
      scrollToBottom()
    }, [messages, scrollToBottom])

    /* Resume an existing thread if `initialSessionId` was passed. Best-effort:
     * if the fetch fails or returns no turns we just start with an empty chat,
     * keeping the supplied sessionId so future writes still land on the same
     * thread. */
    useEffect(() => {
      if (!initialSessionId) return
      let cancelled = false
      const load = async () => {
        try {
          const res = await fetch(
            `/api/optimate-chat-history?sessionId=${encodeURIComponent(initialSessionId)}`,
            { credentials: 'include' },
          )
          if (!res.ok) return
          const data = (await res.json()) as {
            turns?: Array<Record<string, unknown>>
          }
          if (cancelled || !Array.isArray(data.turns)) return
          const loaded: ChatMessage[] = data.turns
            .filter((t) => t.role === 'user' || t.role === 'assistant')
            .map((t) => ({
              role: t.role as 'user' | 'assistant',
              content: typeof t.content === 'string' ? t.content : '',
              runId: typeof t.runId === 'string' ? t.runId : undefined,
              modelUsed: typeof t.modelUsed === 'string' ? t.modelUsed : undefined,
            }))
          setMessages(loaded)
        } catch {
          /* silent: resuming is best-effort */
        }
      }
      load()
      return () => {
        cancelled = true
      }
    }, [initialSessionId])

    /* Load the session list when the user opens the History popover. We refetch
     * every time the popover opens so newly-created threads show up without a
     * page reload. */
    const openHistory = useCallback(async () => {
      setHistoryOpen(true)
      setSessionsLoading(true)
      try {
        const res = await fetch(
          mode === 'portfolio'
            ? '/api/optimate-chat-history?mode=portfolio'
            : `/api/optimate-chat-history?auditId=${encodeURIComponent(String(auditId))}`,

          { credentials: 'include' },
        )
        if (!res.ok) {
          setSessions([])
          return
        }
        const data = (await res.json()) as { sessions?: ChatSession[] }
        setSessions(Array.isArray(data.sessions) ? data.sessions : [])
      } catch {
        setSessions([])
      } finally {
        setSessionsLoading(false)
      }
    }, [auditId, mode])

    const loadSession = useCallback(
      async (sid: string) => {
        setHistoryOpen(false)
        try {
          const res = await fetch(
            `/api/optimate-chat-history?sessionId=${encodeURIComponent(sid)}`,
            { credentials: 'include' },
          )
          if (!res.ok) return
          const data = (await res.json()) as { turns?: Array<Record<string, unknown>> }
          const loaded: ChatMessage[] = (data.turns ?? [])
            .filter((t) => t.role === 'user' || t.role === 'assistant')
            .map((t) => ({
              role: t.role as 'user' | 'assistant',
              content: typeof t.content === 'string' ? t.content : '',
              runId: typeof t.runId === 'string' ? t.runId : undefined,
              modelUsed: typeof t.modelUsed === 'string' ? t.modelUsed : undefined,
            }))
          sessionIdRef.current = sid
          savePersistedSessionId(storageScope, sid)
          setMessages(loaded)
          setError(null)
        } catch {
          /* silent */
        }
      },
      [storageScope],
    )

    const startNewChat = useCallback(() => {
      const fresh = crypto.randomUUID()
      sessionIdRef.current = fresh
      savePersistedSessionId(storageScope, fresh)
      setMessages([])
      setError(null)
      setHistoryOpen(false)
    }, [storageScope])

    const buildChatUrl = useCallback(() => {
      return mode === 'portfolio' ? '/api/optimate/google-ads-portfolio/chat' : `/api/google-ads-audits/${auditId}/chat`
    }, [auditId, mode])

    const mapMessagesToHistory = useCallback((historyMessages: ChatMessage[]): ChatHistoryEntry[] => {
      return historyMessages.map(({ role, content }) => ({ role, content }))
    }, [])

    const buildTypedChatRequestPayload = useCallback(
      (input: {
        text: string
        historyMessages?: ChatMessage[]
        imageAttachments?: ImageAttachment[]
        attachedEmail?: AttachedEmailMeta | null
      }): TypedChatRequestPayload => {
        const trimmedText = input.text.trim() || 'Please review the attached image.'
        const apiMessage = messageContextPrefix
          ? `${messageContextPrefix.trim()}\n\nUser request: ${trimmedText}`
          : trimmedText
        return {
          message: apiMessage,
          displayMessage: trimmedText,
          sessionId: sessionIdRef.current,
          history: mapMessagesToHistory(input.historyMessages ?? messages),
          model: selectedModel as CanonicalModelName,
          reasoningMode,
          selectedAccountRefs: mode === 'portfolio' ? selectedAccountRefs : undefined,
          imageAttachments: (input.imageAttachments ?? []).map((image) => ({
            name: image.name,
            mediaType: image.mediaType,
            data: image.data,
          })),
          attachedEmail: input.attachedEmail
            ? {
                messageId: input.attachedEmail.messageId,
                subject: input.attachedEmail.subject,
                from: input.attachedEmail.from,
                date: input.attachedEmail.date,
              }
            : undefined,
        }
      },
      [mapMessagesToHistory, messageContextPrefix, messages, mode, reasoningMode, selectedAccountRefs, selectedModel],
    )

    const syncSessionIdFromResponse = useCallback(
      (data: TypedChatResponse) => {
        if (
          typeof data.sessionId === 'string' &&
          data.sessionId.length > 0 &&
          data.sessionId !== sessionIdRef.current
        ) {
          sessionIdRef.current = data.sessionId
          savePersistedSessionId(storageScope, data.sessionId)
          return
        }
        savePersistedSessionId(storageScope, sessionIdRef.current)
      },
      [storageScope],
    )

    const applyTypedChatResponse = useCallback(
      (data: TypedChatResponse, options: ApplyTypedChatResponseOptions = {}) => {
        const proposals: OptiMateProposal[] = Array.isArray(data.proposals)
          ? data.proposals
              .map((p) => ({
                id: Number(p.id),
                title: String(p.title ?? ''),
                proposalType: String(p.proposalType ?? ''),
                status: String(p.status ?? 'pending'),
              }))
              .filter((p) => Number.isFinite(p.id))
          : []
        const confirmRequests: OptiMateConfirmRequest[] = Array.isArray(data.confirmRequests)
          ? data.confirmRequests
              .filter(
                (c) =>
                  c &&
                  typeof c.confirmId === 'string' &&
                  typeof c.wording === 'string' &&
                  (c.proposalType === 'campaign-restructure' || c.proposalType === 'campaign-build') &&
                  c.draftSettings &&
                  typeof c.draftSettings === 'object',
              )
              .map((c) => ({
                confirmId: String(c.confirmId),
                proposalType: c.proposalType as 'campaign-restructure' | 'campaign-build',
                wording: String(c.wording),
                draftSettings: c.draftSettings as Record<string, unknown>,
              }))
          : []
        const turnPersisted = data.persisted !== false
        if (!turnPersisted) setPersistenceFailedSeen(true)
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: data.reply || 'No response received.',
          voice: options.voice,
          voiceId: options.voice ? `voice_backend_${Date.now()}` : undefined,
          runId: typeof data.runId === 'string' ? data.runId : undefined,
          modelUsed: typeof data.modelUsed === 'string' ? data.modelUsed : undefined,
          modelRequested: typeof data.modelRequested === 'string' ? data.modelRequested : undefined,
          proposals: proposals.length > 0 ? proposals : undefined,
          confirmRequests: confirmRequests.length > 0 ? confirmRequests : undefined,
          confirmResolutions: confirmRequests.length > 0 ? {} : undefined,
          historyNotSaved: !turnPersisted,
        }
        setMessages((prev) => [...prev, assistantMsg])
        syncSessionIdFromResponse(data)

        if (options.clearTurnAttachments) {
          setAttachedEmail(null)
          setImageAttachments([])
          if (imageInputRef.current) imageInputRef.current.value = ''
        }

        if (proposals.length > 0) {
          bumpPendingRefresh()
          if (
            typeof document !== 'undefined' &&
            document.hidden &&
            typeof Notification !== 'undefined' &&
            Notification.permission === 'granted'
          ) {
            for (const p of proposals) {
              try {
                new Notification('OptiMate: proposal queued', {
                  body: p.title,
                  tag: `optimate-${p.id}`,
                })
              } catch {
                /* notification API can throw on some platforms; silent */
              }
            }
          }
        }
      },
      [bumpPendingRefresh, syncSessionIdFromResponse],
    )

    const stopThinking = useCallback(() => {
      const controller = abortControllerRef.current
      abortControllerRef.current = null
      if (controller && !controller.signal.aborted) {
        try {
          controller.abort('Stopped by user')
        } catch {
          // Some browser/dev overlays are noisy about abort reasons; stopping is best-effort.
        }
      }
      setLoading(false)
      setError(null)
    }, [])

    const sendMessage = async (text: string) => {
      const trimmedText = text.trim()
      const currentImages = imageAttachments
      if ((!trimmedText && currentImages.length === 0) || loading) return

      const imageSummary =
        currentImages.length > 0
          ? `\n\n[Attached image${currentImages.length === 1 ? '' : 's'}: ${currentImages.map((img) => img.name).join(', ')}]`
          : ''
      const userMsg: ChatMessage = {
        role: 'user',
        content: `${trimmedText || 'Please review the attached image.'}${imageSummary}`,
      }
      setMessages((prev) => [...prev, userMsg])
      setInput('')
      setLoading(true)
      setError(null)

      const controller = new AbortController()
      abortControllerRef.current = controller

      try {
        const payload = buildTypedChatRequestPayload({
          text,
          historyMessages: messages,
          imageAttachments: currentImages,
          attachedEmail,
        })
        const res = await fetch(buildChatUrl(), {
          method: 'POST',
          credentials: 'include',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || `Failed (${res.status})`)
        }

        const data = (await res.json()) as TypedChatResponse
        applyTypedChatResponse(data, { clearTurnAttachments: true })
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setError(null)
        } else {
          setError(err instanceof Error ? err.message : 'Failed to send message')
        }
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null
        }
        setLoading(false)
        inputRef.current?.focus()
      }
    }

    const buildMonthlyEmailPrompt = useCallback((components: MonthlyEmailComponentKey[]): string => {
      const selected = components.length > 0 ? components.join(', ') : 'keyword_relevancy'
      return `Create the monthly budget email with dashboard components: ${selected}.`
    }, [])

    const toggleMonthlyEmailComponent = useCallback((key: MonthlyEmailComponentKey) => {
      setSelectedMonthlyEmailComponents((prev) => {
        const next = prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
        setInput(buildMonthlyEmailPrompt(next))
        return next
      })
    }, [buildMonthlyEmailPrompt])

    const sendMonthlyEmailComponentPrompt = useCallback(() => {
      const prompt = buildMonthlyEmailPrompt(selectedMonthlyEmailComponents)
      sendMessage(prompt)
    }, [buildMonthlyEmailPrompt, selectedMonthlyEmailComponents, sendMessage])

    /**
     * Mark a confirm bubble's resolution state on the message that owns it.
     * The buttons disappear after this flip; the bubble keeps rendering as a
     * static "Confirmed"/"Declined" pill so the conversation history stays
     * legible.
     */
    const setConfirmResolution = (confirmId: string, resolution: ConfirmResolution) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (!m.confirmRequests || !m.confirmRequests.some((c) => c.confirmId === confirmId)) {
            return m
          }
          return {
            ...m,
            confirmResolutions: { ...(m.confirmResolutions ?? {}), [confirmId]: resolution },
          }
        }),
      )
    }

    /**
     * Yes handler. Fires a synthetic user message that nudges the agent to
     * proceed with the propose call. We pass the draftSettings JSON inline so
     * the agent can replay them verbatim — it doesn't have to re-derive them
     * from the earlier tool call.
     */
    const handleConfirmYes = (confirmId: string, draftSettings: Record<string, unknown>) => {
      setConfirmResolution(confirmId, 'confirmed')
      // Look up the proposalType so we can phrase the nudge correctly.
      let proposalType: 'campaign-restructure' | 'campaign-build' | null = null
      for (const m of messages) {
        const hit = m.confirmRequests?.find((c) => c.confirmId === confirmId)
        if (hit) {
          proposalType = hit.proposalType
          break
        }
      }
      const typeLabel = proposalType ?? 'proposal'
      const synthetic = `Confirmed: proceed with ${typeLabel}. Settings: ${JSON.stringify(draftSettings)}`
      sendMessage(synthetic)
    }

    /**
     * No handler. Tells the agent to give a plain-text answer describing what
     * it would have proposed but explicitly NOT to call the propose tool.
     */
    const handleConfirmNo = (confirmId: string) => {
      setConfirmResolution(confirmId, 'declined')
      let proposalType: 'campaign-restructure' | 'campaign-build' | null = null
      for (const m of messages) {
        const hit = m.confirmRequests?.find((c) => c.confirmId === confirmId)
        if (hit) {
          proposalType = hit.proposalType
          break
        }
      }
      const typeLabel = proposalType ?? 'proposal'
      const synthetic = `User declined the ${typeLabel}. Give them a plain-text answer instead — describe what you would have proposed, but do NOT call the propose tool.`
      sendMessage(synthetic)
    }

    const readImageAttachment = (file: File): Promise<ImageAttachment> =>
      new Promise((resolve, reject) => {
        if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
          reject(
            new Error(`${file.name} is not a supported image type. Use PNG, JPEG, GIF, or WebP.`),
          )
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
        setError('Drop PNG, JPEG, GIF, or WebP images into OptiMate.')
        return
      }
      const availableSlots = Math.max(0, MAX_IMAGE_ATTACHMENTS - imageAttachments.length)
      const nextFiles = incoming.slice(0, availableSlots)
      if (nextFiles.length === 0) {
        setError(`Attach up to ${MAX_IMAGE_ATTACHMENTS} images per message.`)
        return
      }
      try {
        const next = await Promise.all(nextFiles.map(readImageAttachment))
        setImageAttachments((prev) => [...prev, ...next].slice(0, MAX_IMAGE_ATTACHMENTS))
        setError(
          incoming.length > nextFiles.length
            ? `Attached the first ${nextFiles.length} images. Limit is ${MAX_IMAGE_ATTACHMENTS} per message.`
            : null,
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not attach image')
      } finally {
        if (imageInputRef.current) imageInputRef.current.value = ''
      }
    }, [imageAttachments.length])

    useEffect(() => {
      if (hideInput) return
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
    }, [handleImageFiles, hideInput])

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
    useImperativeHandle(
      ref,
      () => ({
        sendMessage: async (text: string) => {
          await sendMessage(text)
        },
        stopThinking,
        isBusy: () => loading,
        getSessionId: () => sessionIdRef.current,
      }),
      [loading, sendMessage, stopThinking],
    )

    // Sizing
    const messagesMinHeight = expanded ? 0 : compact ? 180 : fluid ? 0 : 260
    const messagesMaxHeight = expanded ? 'none' : compact ? 300 : fluid ? 'none' : 440
    const wrapperMaxWidth = compact || fluid ? '100%' : 700
    const messageBubbleMaxWidth = expanded || fluid ? '100%' : '85%'

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
          overflow: 'hidden',
          minHeight: 0,
        }
      : {
          maxWidth: wrapperMaxWidth,
          marginBottom: compact || fluid ? 0 : 20,
          width: '100%',
          ...(fluid
            ? { height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }
            : {}),
        }

    return (
      <div style={wrapperStyle} onKeyDown={(e) => e.stopPropagation()}>
        <style>{`
          @keyframes optimateTyping {
            0%, 60%, 100% { opacity: 0.35; transform: translateY(0); }
            30% { opacity: 1; transform: translateY(-3px); }
          }
        `}</style>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 8,
            flexShrink: 0,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              title={displayName}
              style={{
                fontSize: 13,
                lineHeight: 1.35,
                fontWeight: 650,
                color: 'var(--theme-text, #111827)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {displayName}
            </div>
            <div
              ref={voiceControlsRef}
              style={{ minWidth: 0, display: 'flex', alignItems: 'center', marginTop: 2 }}
            />
          </div>
          {/* Anthropic credential pill removed per request — it was noisy and the
            credential state is managed on the agent-auth admin page. */}
          {!compact && <OptiMateToolsHelp compact={compact} />}
          {hideInput && canUseVoice && !isMobileViewport && (
            <OptiMateVoice
              auditId={auditId}
              mode={mode}
              customerId={customerId}
              businessName={businessName}
              selectedAccountRefs={selectedAccountRefs}
              onTurn={upsertVoiceTurn}
              onAssistantMessage={appendVoiceAssistantMessage}
              onDevTrace={devParityEnabled ? setParityVoiceTrace : undefined}
              controlsContainer={voiceControlsEl}
              triggerSize={29}
              attachedEmailMessageId={attachedEmail?.messageId ?? null}
              typedChatContext={{
                sessionId: sessionIdRef.current,
                history: mapMessagesToHistory(messages),
                selectedModel,
                reasoningMode,
                attachedEmail,
              }}
              buildTypedChatRequest={(text) =>
                buildTypedChatRequestPayload({
                  text,
                  historyMessages: messages,
                  attachedEmail,
                })
              }
              onTypedChatResponse={(data) => applyTypedChatResponse(data, { voice: true, clearTurnAttachments: true })}
            />
          )}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (historyOpen) {
                  setHistoryOpen(false)
                } else {
                  openHistory()
                }
              }}
              title="Show previous chats for this audit"
              aria-label="Chat history"
              style={{
                padding: '4px 8px',
                fontSize: 11,
                lineHeight: 1.2,
                background: historyOpen ? '#e0e7ff' : '#f3f4f6',
                border: '1px solid #e5e7eb',
                borderRadius: 6,
                cursor: 'pointer',
                color: '#374151',
              }}
            >
              History
            </button>
            {historyOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  right: 0,
                  width: 280,
                  maxHeight: 320,
                  overflowY: 'auto',
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  zIndex: 50,
                  padding: 6,
                }}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    startNewChat()
                  }}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: 12,
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid #f3f4f6',
                    cursor: 'pointer',
                    color: '#2563eb',
                    fontWeight: 600,
                  }}
                >
                  + New chat
                </button>
                {sessionsLoading && (
                  <div style={{ padding: '8px', fontSize: 11, color: '#6b7280' }}>Loading…</div>
                )}
                {!sessionsLoading && sessions.length === 0 && (
                  <div style={{ padding: '8px', fontSize: 11, color: '#6b7280', lineHeight: 1.4 }}>
                    <div>No previous chats.</div>
                    <div style={{ marginTop: 4, color: '#9ca3af' }}>
                      Past chats appear here once they’re saved.
                    </div>
                    {persistenceFailedSeen && (
                      <div
                        style={{
                          marginTop: 6,
                          padding: '4px 6px',
                          background: '#fffbeb',
                          color: '#92400e',
                          border: '1px solid #fde68a',
                          borderRadius: 4,
                          fontSize: 10,
                        }}
                        title="The server reported it couldn’t save this session’s turns. Ops: POST /api/migrate with the x-api-key header to create the optimate_chat_turns table."
                      >
                        ⚠ History not saving — run <code>POST /api/migrate</code>
                      </div>
                    )}
                  </div>
                )}
                {!sessionsLoading &&
                  sessions.map((s) => (
                    <button
                      key={s.sessionId}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        loadSession(s.sessionId)
                      }}
                      title={`${s.turnCount} message${s.turnCount === 1 ? '' : 's'} · ${new Date(s.lastMessageAt).toLocaleString()}`}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '6px 8px',
                        fontSize: 11,
                        textAlign: 'left',
                        background:
                          sessionIdRef.current === s.sessionId ? '#eff6ff' : 'transparent',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer',
                        color: '#1f2937',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {s.firstMessage || '(empty)'}
                    </button>
                  ))}
              </div>
            )}
          </div>
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
            ...(fluid || expanded ? { flex: '1 1 auto', minHeight: 0, maxHeight: 'none' } : {}),
          }}
        >
          {pendingForAudit.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                padding: '8px 4px',
                borderBottom: '1px dashed #e5e7eb',
                marginBottom: 4,
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  color: '#6b7280',
                  alignSelf: 'center',
                  flexShrink: 0,
                  marginRight: 4,
                }}
              >
                Pending
              </span>
              {pendingForAudit.map((p) => (
                <OptiMateProposalCard
                  key={p.id}
                  proposal={p}
                  variant="strip"
                  onReject={(id) => {
                    setPendingForAudit((items) => items.filter((item) => item.id !== id))
                    bumpPendingRefresh()
                  }}
                />
              ))}
            </div>
          )}

          {messages.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 8px' }}>
              <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 14 }}>
                {mode === 'portfolio'
                  ? 'Ask OptiMate for compact cross-account Google Ads analysis.'
                  : 'Ask OptiMate anything about this Google Ads account.'}
              </p>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  justifyContent: 'center',
                }}
              >
                {(mode === 'portfolio' ? portfolioStarterQuestions : starterQuestions).map((q) => (
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
                  maxWidth: messageBubbleMaxWidth,
                  width: fluid && msg.role === 'assistant' ? '100%' : undefined,
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
                <div style={{ width: '100%', maxWidth: messageBubbleMaxWidth }}>
                  {msg.proposals.map((p) => (
                    <OptiMateProposalCard key={p.id} proposal={p} variant="inline" />
                  ))}
                </div>
              )}
              {msg.role === 'assistant' &&
                msg.confirmRequests &&
                msg.confirmRequests.length > 0 && (
                  <div style={{ width: '100%', maxWidth: messageBubbleMaxWidth }}>
                    {msg.confirmRequests.map((c) => (
                      <OptiMateConfirmBubble
                        key={c.confirmId}
                        request={c}
                        resolution={msg.confirmResolutions?.[c.confirmId] ?? 'pending'}
                        onConfirm={handleConfirmYes}
                        onReject={handleConfirmNo}
                      />
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
                  {/* History-not-saved pill: shown when the server couldn't
                    persist this turn (typically: optimate_chat_turns table
                    missing because /api/migrate wasn't run after deploy).
                    The reply itself worked — this just warns the user that
                    reloading will lose it. */}
                  {msg.historyNotSaved && (
                    <span
                      title="This turn was returned by the agent but the chat-turns DB write failed. Reloading the page will lose it. Ops: run POST /api/migrate with the x-api-key header."
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
                      ⚠ History not saved — run /api/migrate
                    </span>
                  )}
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
                      href={`/admin/agent-runs/${msg.runId}`}
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
                  padding: '10px 12px 10px 14px',
                  borderRadius: '16px 16px 16px 4px',
                  background: '#f3f4f6',
                  fontSize: 13,
                  color: '#6b7280',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {mode === 'portfolio' && progressAccountLabels.length > 1 && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 5,
                      minWidth: 160,
                      maxWidth: 240,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11 }}>
                      <span style={{ color: '#374151', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {progressAccountLabels[progressAccountIndex] ?? progressAccountLabels[0]}
                      </span>
                      <span style={{ color: '#6b7280', flexShrink: 0 }}>
                        {Math.min(progressAccountIndex + 1, progressAccountLabels.length)} of {progressAccountLabels.length}
                      </span>
                    </div>
                    <div style={{ height: 4, borderRadius: 999, background: '#e5e7eb', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${((Math.min(progressAccountIndex + 1, progressAccountLabels.length)) / progressAccountLabels.length) * 100}%`,
                          height: '100%',
                          borderRadius: 999,
                          background: '#2563eb',
                          transition: 'width 240ms ease',
                        }}
                      />
                    </div>
                  </div>
                )}
                <OptiMateTypingLoader />
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    stopThinking()
                  }}
                  style={{
                    border: '1px solid #d1d5db',
                    background: '#fff',
                    color: '#374151',
                    borderRadius: 999,
                    padding: '3px 8px',
                    fontSize: 11,
                    cursor: 'pointer',
                    lineHeight: 1.2,
                  }}
                >
                  Stop
                </button>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {error && <p style={{ marginTop: 8, fontSize: 12, color: '#dc2626' }}>{error}</p>}

        {dragActive && !hideInput && (
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
              Drop images to attach to OptiMate
            </div>
          </div>
        )}

        {/* Input — hidden when a multi-chat wrapper is supplying a shared one. */}
        {!hideInput && (
          <div style={{ position: 'relative', marginTop: 10, width: '100%', flexShrink: 0 }}>
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

            {imageAttachments.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {imageAttachments.map((image, idx) => (
                  <div
                    key={`${image.name}-${idx}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 8px',
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      borderRadius: 12,
                      fontSize: 11,
                      color: '#166534',
                      maxWidth: '100%',
                    }}
                    title={`${image.name} · ${Math.round(image.size / 1024)} KB`}
                  >
                    <span style={{ flexShrink: 0 }}>🖼️</span>
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: 220,
                      }}
                    >
                      {image.name}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        setImageAttachments((prev) => prev.filter((_, i) => i !== idx))
                      }}
                      aria-label={`Remove ${image.name}`}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        color: '#166534',
                        padding: 0,
                        lineHeight: 1,
                        fontSize: 12,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
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

            {shouldShowMonthlyEmailComponents(input, selectedMonthlyEmailComponents.length) && (
              <div
                aria-label="Monthly email components"
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 6,
                  margin: '0 0 8px',
                  padding: '8px 10px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 12,
                  background: '#f9fafb',
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginRight: 2 }}>
                  Monthly email components
                </span>
                {MONTHLY_EMAIL_COMPONENT_CHIPS.map((chip) => {
                  const selected = selectedMonthlyEmailComponents.includes(chip.key)
                  return (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        toggleMonthlyEmailComponent(chip.key)
                      }}
                      disabled={loading}
                      style={{
                        padding: '5px 9px',
                        fontSize: 11,
                        background: selected ? '#dbeafe' : '#fff',
                        border: selected ? '1px solid #93c5fd' : '1px solid #e5e7eb',
                        borderRadius: 999,
                        cursor: loading ? 'not-allowed' : 'pointer',
                        color: selected ? '#1d4ed8' : '#374151',
                        fontWeight: selected ? 700 : 500,
                      }}
                    >
                      {chip.label}
                    </button>
                  )
                })}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    sendMonthlyEmailComponentPrompt()
                  }}
                  disabled={loading}
                  style={{
                    marginLeft: 'auto',
                    padding: '5px 10px',
                    fontSize: 11,
                    background: '#111827',
                    border: '1px solid #111827',
                    borderRadius: 999,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    color: '#fff',
                    fontWeight: 700,
                  }}
                >
                  Draft monthly email
                </button>
              </div>
            )}

            <div
              style={{
                position: 'relative',
                minHeight: 104,
                border: '1px solid var(--theme-border-color, #e5e7eb)',
                borderRadius: 14,
                background: 'var(--theme-input-bg, #fff)',
                padding: '12px 14px 46px',
              }}
            >
              <input
                ref={imageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                multiple
                onChange={(e) => handleImageFiles(e.target.files)}
                style={{ display: 'none' }}
              />
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Feel free to ask"
                disabled={loading}
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

              <div
                style={{
                  position: 'absolute',
                  left: 14,
                  bottom: 8,
                  display: 'flex',
                  gap: 7,
                }}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setPickerOpen((v) => !v)
                  }}
                  disabled={loading}
                  title="Browse your Gmail inbox to attach an email"
                  style={{
                    width: 29,
                    height: 29,
                    padding: 0,
                    background: pickerOpen ? '#e0e7ff' : '#fff',
                    color: '#374151',
                    border: '1px solid var(--theme-border-color, #e5e7eb)',
                    borderRadius: 8,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                  }}
                  aria-label="Browse Gmail inbox"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    imageInputRef.current?.click()
                  }}
                  disabled={loading || imageAttachments.length >= MAX_IMAGE_ATTACHMENTS}
                  title="Attach a screenshot"
                  style={{
                    width: 29,
                    height: 29,
                    padding: 0,
                    background: '#fff',
                    color: '#374151',
                    border: '1px solid var(--theme-border-color, #e5e7eb)',
                    borderRadius: 8,
                    cursor:
                      loading || imageAttachments.length >= MAX_IMAGE_ATTACHMENTS
                        ? 'not-allowed'
                        : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                  }}
                  aria-label="Attach image screenshot"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>
              </div>

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
                    sendMessage(input)
                  }}
                  disabled={loading || (!input.trim() && imageAttachments.length === 0)}
                  title="Send"
                  aria-label="Send"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 29,
                    height: 29,
                    background:
                      loading || (!input.trim() && imageAttachments.length === 0)
                        ? '#9ca3af'
                        : '#2563eb',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    cursor:
                      loading || (!input.trim() && imageAttachments.length === 0)
                        ? 'not-allowed'
                        : 'pointer',
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
                {isMobileViewport ? (
                  <OptiMateTranscribe
                    onTranscript={appendTranscript}
                    triggerSize={29}
                    disabled={loading}
                  />
                ) : (
                  canUseVoice && (
                    <OptiMateVoice
                      auditId={auditId}
                      mode={mode}
                      customerId={customerId}
                      businessName={businessName}
                      selectedAccountRefs={selectedAccountRefs}
                      onTurn={upsertVoiceTurn}
                      onAssistantMessage={appendVoiceAssistantMessage}
                      onDevTrace={devParityEnabled ? setParityVoiceTrace : undefined}
                      controlsContainer={voiceControlsEl}
                      triggerSize={29}
                      attachedEmailMessageId={attachedEmail?.messageId ?? null}
                      typedChatContext={{
                        sessionId: sessionIdRef.current,
                        history: mapMessagesToHistory(messages),
                        selectedModel,
                        reasoningMode,
                        attachedEmail,
                      }}
                      buildTypedChatRequest={(text) =>
                        buildTypedChatRequestPayload({
                          text,
                          historyMessages: messages,
                          attachedEmail,
                        })
                      }
                      onTypedChatResponse={(data) => applyTypedChatResponse(data, { voice: true, clearTurnAttachments: true })}
                    />
                  )
                )}
              </div>
            </div>

            {/* Model selector lives BELOW the input row so the typebox is the
              primary affordance. Width is set to fit the longest current
              label ("Claude Sonnet 4.6 (OAuth)" — ~25 chars) without
              truncation. Browsers ignore most styling on <option> elements,
              but the closed-select width is controlled here. */}
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                justifyContent: 'flex-end',
                marginTop: 6,
                // Keep a clear gap below the model selector so it isn't clipped
                // by the bottom edge of the popout window.
                marginBottom: devParityEnabled ? 8 : 18,
              }}
            >
              <select
                value={reasoningMode}
                onChange={(e) => {
                  const next = e.target.value as ReasoningMode
                  setReasoningMode(next)
                }}
                disabled={loading}
                title="Reasoning mode for the next request. Off is fastest/cheapest."
                style={{
                  fontSize: 11,
                  padding: '4px 8px',
                  border: '1px solid var(--theme-border-color, #e5e7eb)',
                  borderRadius: 6,
                  background: 'var(--theme-input-bg, #fff)',
                  color: 'var(--theme-text, #1f2937)',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  width: 150,
                  maxWidth: '100%',
                }}
              >
                <option value="off">Reasoning off</option>
                <option value="low">Reasoning low</option>
                <option value="medium">Reasoning medium</option>
                <option value="high">Reasoning high</option>
              </select>
              <select
                value={selectedModel}
                onChange={(e) => {
                  modelManuallyChangedRef.current = true
                  setSelectedModel(e.target.value)
                }}
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

            {devParityEnabled && (
              <details
                style={{
                  marginBottom: 18,
                  border: '1px solid #e5e7eb',
                  borderRadius: 10,
                  padding: 10,
                  background: '#f8fafc',
                }}
              >
                <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#111827' }}>
                  Dev parity harness
                </summary>
                <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
                  <div style={{ fontSize: 12, color: '#4b5563' }}>
                    Query: <code>{GOOGLE_MATE_PARITY_QUERY}</code>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={runDevParityBaseline}
                      disabled={parityLoading || loading}
                      style={{
                        border: '1px solid #cbd5e1',
                        background: parityLoading ? '#cbd5e1' : '#fff',
                        borderRadius: 8,
                        padding: '6px 10px',
                        fontSize: 12,
                        cursor: parityLoading || loading ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {parityLoading ? 'Running typed baseline…' : 'Run typed baseline'}
                    </button>
                    <button
                      type="button"
                      onClick={prepareDevVoiceParity}
                      style={{
                        border: '1px solid #cbd5e1',
                        background: '#fff',
                        borderRadius: 8,
                        padding: '6px 10px',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      Prep voice comparison
                    </button>
                  </div>
                  {parityError && <div style={{ fontSize: 12, color: '#b91c1c' }}>{parityError}</div>}
                  {(parityBaseline || parityVoiceTrace) && (
                    <div style={{ display: 'grid', gap: 10 }}>
                      {!parityBaseline && (
                        <div style={{ border: '1px solid #bfdbfe', borderRadius: 8, padding: 10, background: '#eff6ff', fontSize: 12, color: '#1e40af' }}>
                          Run the typed baseline first so every diff row has a real text-side comparison.
                        </div>
                      )}
                      {parityBaseline && !parityVoiceTrace && (
                        <div style={{ border: '1px solid #fde68a', borderRadius: 8, padding: 10, background: '#fffbeb', fontSize: 12, color: '#92400e' }}>
                          Typed baseline is ready. Next, start voice on this same account and say the exact parity query shown above.
                        </div>
                      )}
                      <div
                        style={{
                          display: 'grid',
                          gap: 8,
                          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        }}
                      >
                        <div style={{ border: '1px solid #dbeafe', background: '#eff6ff', borderRadius: 8, padding: 10 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8' }}>Account</div>
                          <div style={{ marginTop: 4, fontSize: 12, color: '#111827' }}>{displayName}</div>
                        </div>
                        <div style={{ border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 8, padding: 10 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#b45309' }}>Field diffs</div>
                          <div style={{ marginTop: 4, fontSize: 12, color: '#111827' }}>{parityMismatchCount}</div>
                        </div>
                        <div style={{ border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 8, padding: 10 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#b91c1c' }}>Tool call diffs</div>
                          <div style={{ marginTop: 4, fontSize: 12, color: '#111827' }}>{parityToolMismatchCount}</div>
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gap: 10,
                          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                        }}
                      >
                        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, background: '#fff' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>Typed baseline</div>
                          <div style={{ marginTop: 8, display: 'grid', gap: 6, fontSize: 12, color: '#374151' }}>
                            <div><strong>Model:</strong> {stringifyParityValue(parityBaseline?.textTrace.context.modelUsed ?? parityBaseline?.textTrace.context.modelRequested)}</div>
                            <div><strong>Run ID:</strong> {stringifyParityValue(parityBaseline?.textTrace.runId)}</div>
                            <div><strong>Tools exposed:</strong> {(parityBaseline?.textTrace.context.availableToolNames ?? []).length}</div>
                            <div><strong>Tools called:</strong> {(parityBaseline?.textTrace.toolsCalled ?? []).length}</div>
                            <div><strong>Reply:</strong> {parityBaseline?.textTrace.finalAssistantReply ? 'Captured' : 'Empty'}</div>
                          </div>
                        </div>
                        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, background: '#fff' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>Live voice trace</div>
                          <div style={{ marginTop: 8, display: 'grid', gap: 6, fontSize: 12, color: '#374151' }}>
                            <div><strong>Model:</strong> {stringifyParityValue(parityVoiceTrace?.model ?? parityBaseline?.voiceContext.modelRequested)}</div>
                            <div><strong>Transcript:</strong> {parityVoiceTrace?.transcript ? 'Captured' : 'Waiting'}</div>
                            <div><strong>Tools exposed:</strong> {(parityVoiceTrace?.availableToolNames ?? parityBaseline?.voiceContext.availableToolNames ?? []).length}</div>
                            <div><strong>Tools called:</strong> {(parityVoiceTrace?.toolsCalled ?? []).length}</div>
                            <div><strong>Reply:</strong> {parityVoiceTrace?.finalAssistantReply ? 'Captured' : 'Waiting'}</div>
                          </div>
                        </div>
                      </div>

                      <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
                        <div style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', fontSize: 12, fontWeight: 700, color: '#111827' }}>
                          Field-by-field diff
                        </div>
                        <div style={{ display: 'grid', gap: 1, background: '#e5e7eb' }}>
                          <div style={{ display: 'grid', gap: 1, gridTemplateColumns: '160px minmax(0, 1fr) minmax(0, 1fr)', background: '#e5e7eb' }}>
                            <div style={{ background: '#e2e8f0', padding: 10, fontSize: 11, fontWeight: 700, color: '#111827' }}>Field</div>
                            <div style={{ background: '#e2e8f0', padding: 10, fontSize: 11, fontWeight: 700, color: '#111827' }}>Typed</div>
                            <div style={{ background: '#e2e8f0', padding: 10, fontSize: 11, fontWeight: 700, color: '#111827' }}>Voice</div>
                          </div>
                          {parityDiffItems.map((item) => {
                            const matches = areParityValuesEqual(item.textValue, item.voiceValue)
                            return (
                              <div
                                key={item.label}
                                style={{
                                  display: 'grid',
                                  gap: 1,
                                  gridTemplateColumns: '160px minmax(0, 1fr) minmax(0, 1fr)',
                                  background: '#e5e7eb',
                                }}
                              >
                                <div style={{ background: '#f8fafc', padding: 10, fontSize: 12, fontWeight: 700, color: '#111827' }}>
                                  {item.label}
                                  <div style={{ marginTop: 4, fontSize: 10, color: matches ? '#15803d' : '#b91c1c' }}>
                                    {matches ? 'MATCH' : 'DIFF'}
                                  </div>
                                </div>
                                <div style={{ background: matches ? '#f0fdf4' : '#fef2f2', padding: 10, fontSize: 12, color: '#1f2937', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                  {stringifyParityValue(item.textValue)}
                                </div>
                                <div style={{ background: matches ? '#f0fdf4' : '#fef2f2', padding: 10, fontSize: 12, color: '#1f2937', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                  {stringifyParityValue(item.voiceValue)}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, background: '#fff' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>Tool registry diff</div>
                        <div style={{ marginTop: 8, fontSize: 12, color: '#374151', whiteSpace: 'pre-wrap' }}>{parityToolSetSummary}</div>
                      </div>

                      <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
                        <div style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', fontSize: 12, fontWeight: 700, color: '#111827' }}>
                          Tool call diff
                        </div>
                        {parityToolComparisons.length === 0 ? (
                          <div style={{ padding: 12, fontSize: 12, color: '#6b7280' }}>
                            No tool calls captured yet. Run typed baseline, then reproduce the same query by voice.
                          </div>
                        ) : (
                          <div style={{ display: 'grid', gap: 1, background: '#e5e7eb' }}>
                            <div style={{ display: 'grid', gap: 1, gridTemplateColumns: '160px minmax(0, 1fr) minmax(0, 1fr)', background: '#e5e7eb' }}>
                              <div style={{ background: '#e2e8f0', padding: 10, fontSize: 11, fontWeight: 700, color: '#111827' }}>Step</div>
                              <div style={{ background: '#e2e8f0', padding: 10, fontSize: 11, fontWeight: 700, color: '#111827' }}>Typed</div>
                              <div style={{ background: '#e2e8f0', padding: 10, fontSize: 11, fontWeight: 700, color: '#111827' }}>Voice</div>
                            </div>
                            {parityToolComparisons.map((comparison) => (
                              <div
                                key={`tool-${comparison.index}`}
                                style={{
                                  display: 'grid',
                                  gap: 1,
                                  gridTemplateColumns: '160px minmax(0, 1fr) minmax(0, 1fr)',
                                  background: '#e5e7eb',
                                }}
                              >
                                <div style={{ background: '#f8fafc', padding: 10, fontSize: 12, color: '#111827' }}>
                                  <div style={{ fontWeight: 700 }}>Tool #{comparison.index + 1}</div>
                                  <div style={{ marginTop: 4, fontSize: 10, color: comparison.differs ? '#b91c1c' : '#15803d' }}>
                                    {comparison.differs ? `DIFF: ${comparison.diffFields.join(', ')}` : 'MATCH'}
                                  </div>
                                </div>
                                {[comparison.textTool, comparison.voiceTool].map((tool, columnIndex) => (
                                  <div
                                    key={`${comparison.index}-${columnIndex}`}
                                    style={{
                                      background: comparison.differs ? '#fef2f2' : '#f0fdf4',
                                      padding: 10,
                                      fontSize: 12,
                                      color: '#1f2937',
                                      display: 'grid',
                                      gap: 6,
                                    }}
                                  >
                                    {tool ? (
                                      <>
                                        <div><strong>Name:</strong> {tool.name}</div>
                                        <div><strong>Status:</strong> {tool.ok === undefined ? 'Unknown' : tool.ok ? 'OK' : 'Error'}</div>
                                        <div><strong>Args:</strong> <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{stringifyParityValue(tool.args)}</span></div>
                                        <div><strong>Result:</strong> <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{stringifyParityValue(tool.resultSummary)}</span></div>
                                      </>
                                    ) : (
                                      <div style={{ color: '#6b7280' }}>Missing</div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {(parityBaseline?.divergenceHints?.length ?? 0) > 0 && (
                        <div style={{ border: '1px solid #fde68a', borderRadius: 8, padding: 10, background: '#fffbeb' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>Known divergence hints</div>
                          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: '#78350f' }}>
                            {(parityBaseline?.divergenceHints ?? []).map((hint) => (
                              <li key={hint}>{hint}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <details>
                        <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#111827' }}>Raw trace JSON</summary>
                        <pre
                          style={{
                            margin: '10px 0 0',
                            padding: 10,
                            borderRadius: 8,
                            background: '#111827',
                            color: '#e5e7eb',
                            fontSize: 11,
                            lineHeight: 1.5,
                            overflowX: 'auto',
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {JSON.stringify(
                            {
                              textTrace: parityBaseline?.textTrace ?? null,
                              voiceContext: parityBaseline?.voiceContext ?? null,
                              liveVoiceTrace: parityVoiceTrace,
                              divergenceHints: parityBaseline?.divergenceHints ?? [],
                            },
                            null,
                            2,
                          )}
                        </pre>
                      </details>
                    </div>
                  )}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    )
  },
)

export default OptiMateChatCore
