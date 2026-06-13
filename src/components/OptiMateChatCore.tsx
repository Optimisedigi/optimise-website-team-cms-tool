'use client'

import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import {
  CHAT_PICKER_MODELS,
  DEFAULT_CHAT_MODEL,
  isCanonicalModel,
} from '@/lib/agents/_shared/llm/registry'

/** localStorage key for the user's preferred chat model. Kept module-scoped so
 *  every ChatCore instance reads/writes the same slot — picking a model in
 *  one tab updates the default the next tab opens with. ~25 bytes total. */
const MODEL_STORAGE_KEY = 'optimate-chat-model'
type ReasoningMode = 'off' | 'low' | 'medium' | 'high'

/** Read a persisted model choice from localStorage, falling back to the
 *  registry default. Guards against:
 *  - SSR (no window)
 *  - localStorage disabled / quota exceeded (try/catch)
 *  - stale values from a model that's since been removed from the registry
 *    (isCanonicalModel) or from the chat picker (CHAT_PICKER_MODELS) */
function normaliseStoredModel(raw: string | null): string | null {
  if (raw === 'gpt-5.5-codex-medium' || raw === 'gpt-5.5-codex-low') return 'gpt-5.5-codex'
  return raw
}

function loadPersistedModel(): string {
  if (typeof window === 'undefined') return DEFAULT_CHAT_MODEL
  try {
    const raw = normaliseStoredModel(window.localStorage.getItem(MODEL_STORAGE_KEY))
    if (!raw) return DEFAULT_CHAT_MODEL
    if (!isCanonicalModel(raw)) return DEFAULT_CHAT_MODEL
    if (!CHAT_PICKER_MODELS.some((m) => m.canonical === raw)) return DEFAULT_CHAT_MODEL
    return raw
  } catch {
    return DEFAULT_CHAT_MODEL
  }
}

/** True when the user has an explicit, still-valid model choice in
 *  localStorage. When false, the chat should defer to the agency-configured
 *  default (OptiMate Settings global) fetched on mount. */
function hasExplicitModelChoice(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = normaliseStoredModel(window.localStorage.getItem(MODEL_STORAGE_KEY))
    if (!raw) return false
    if (!isCanonicalModel(raw)) return false
    return CHAT_PICKER_MODELS.some((m) => m.canonical === raw)
  } catch {
    return false
  }
}

/** Persist a model choice. Silently no-ops on SSR or storage failure —
 *  the in-memory state is still correct for the current session. */
function savePersistedModel(model: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(MODEL_STORAGE_KEY, model)
  } catch {
    // Quota exceeded or storage disabled — fine, just don't persist.
  }
}

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
import OptiMateToolsHelp from './OptiMateToolsHelp'
import OptiMateVoice from './OptiMateVoice'
import OptiMateTranscribe from './OptiMateTranscribe'
import { isVoiceEnabled } from '@/lib/realtime/token-provider'

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

const SUGGESTED_QUESTIONS = [
  'How is my budget pacing this month?',
  'Which campaigns are performing best this week?',
  'Are there any keywords wasting spend?',
  'Give me a weekly performance summary',
]

const PORTFOLIO_SUGGESTED_QUESTIONS = [
  'Show me the account inventory',
  'Summarise portfolio performance',
  'Find cross-account search-term waste',
  'Draft an account-priority email',
]

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
      initialSessionId,
    },
    ref,
  ) {
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const abortControllerRef = useRef<AbortController | null>(null)
    // Portal target for the active voice controls (under the account name).
    // A state mirror forces one re-render once the ref node is attached so the
    // portal has a valid container on the first active render.
    const voiceControlsRef = useRef<HTMLDivElement | null>(null)
    const [voiceControlsEl, setVoiceControlsEl] = useState<HTMLDivElement | null>(null)
    useEffect(() => {
      setVoiceControlsEl(voiceControlsRef.current)
    }, [])

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
    // Lazy initializer: runs once on mount, so localStorage is only read once.
    // Reset on reload picks up whatever the user last chose in any tab.
    const [selectedModel, setSelectedModel] = useState<string>(() => loadPersistedModel())
    const [reasoningMode, setReasoningMode] = useState<ReasoningMode>('off')
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)
    // Feature flag: render the voice CTA only when a provider is configured.
    const voiceEnabled = isVoiceEnabled()
    const canUseVoice = voiceEnabled && (mode === 'audit' || selectedAccountRefs.length > 0)
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

    /* Seed the picker from the agency-configured default (OptiMate Settings
     * global) on first load. Only applies when the user has NOT made their own
     * explicit per-browser choice — once they pick a model, their choice wins
     * and survives reloads. Best-effort: a fetch failure leaves the registry
     * default in place. */
    useEffect(() => {
      if (hasExplicitModelChoice()) return
      let cancelled = false
      ;(async () => {
        try {
          const res = await fetch('/api/optimate/default-model')
          if (!res.ok) return
          const json = (await res.json()) as { defaultChatModel?: string }
          const next = json.defaultChatModel
          if (
            !cancelled &&
            typeof next === 'string' &&
            isCanonicalModel(next) &&
            CHAT_PICKER_MODELS.some((m) => m.canonical === next)
          ) {
            // Don't persist — this is the inherited default, not an explicit
            // user choice. If the user keeps it and sends, they can still pick
            // it explicitly later; we only persist on an actual select change.
            setSelectedModel(next)
          }
        } catch {
          // Network/parse failure — keep the registry default already in state.
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
    // Persist the initial session id immediately so a reload before the first
    // message still attaches to the same thread.
    useEffect(() => {
      savePersistedSessionId(storageScope, sessionIdRef.current)
      // We intentionally only run on mount / scope change — sessionIdRef
      // mutations elsewhere call savePersistedSessionId themselves.
    }, [storageScope])
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
        const chatUrl = mode === 'portfolio' ? '/api/optimate/google-ads-portfolio/chat' : `/api/google-ads-audits/${auditId}/chat`
        const apiMessage = messageContextPrefix
          ? `${messageContextPrefix.trim()}\n\nUser request: ${trimmedText || 'Please review the attached image.'}`
          : trimmedText || 'Please review the attached image.'
        const res = await fetch(chatUrl, {
          method: 'POST',
          credentials: 'include',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: apiMessage,
            displayMessage: trimmedText || 'Please review the attached image.',
            sessionId: sessionIdRef.current,
            history: messages.map(({ role, content }) => ({ role, content })),
            model: selectedModel,
            reasoningMode,
            selectedAccountRefs: mode === 'portfolio' ? selectedAccountRefs : undefined,
            imageAttachments: currentImages.map((image) => ({
              name: image.name,
              mediaType: image.mediaType,
              data: image.data,
            })),
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
        const confirmRequests: OptiMateConfirmRequest[] = Array.isArray(data.confirmRequests)
          ? (data.confirmRequests as Array<Record<string, unknown>>)
              .filter(
                (c) =>
                  c &&
                  typeof c.confirmId === 'string' &&
                  typeof c.wording === 'string' &&
                  (c.proposalType === 'campaign-restructure' ||
                    c.proposalType === 'campaign-build') &&
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
        // `persisted` is sent by the chat route when one or both DB writes
        // (user prompt + assistant reply) failed. The reply still flows —
        // we just badge it so the user knows reload will lose it. Treat
        // missing/undefined as "persisted" (older deploys / future shapes).
        const turnPersisted = data.persisted !== false
        if (!turnPersisted) setPersistenceFailedSeen(true)
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: data.reply || 'No response received.',
          runId: typeof data.runId === 'string' ? data.runId : undefined,
          modelUsed: typeof data.modelUsed === 'string' ? data.modelUsed : undefined,
          modelRequested: typeof data.modelRequested === 'string' ? data.modelRequested : undefined,
          proposals: proposals.length > 0 ? proposals : undefined,
          confirmRequests: confirmRequests.length > 0 ? confirmRequests : undefined,
          confirmResolutions: confirmRequests.length > 0 ? {} : undefined,
          historyNotSaved: !turnPersisted,
        }
        setMessages((prev) => [...prev, assistantMsg])

        // Server may have minted a fresh sessionId when none was sent. Keep
        // our local ref in sync so subsequent turns + reloads attach to it.
        if (
          typeof data.sessionId === 'string' &&
          data.sessionId.length > 0 &&
          data.sessionId !== sessionIdRef.current
        ) {
          sessionIdRef.current = data.sessionId
          savePersistedSessionId(storageScope, data.sessionId)
        } else {
          // Reaffirm storage (cheap) so any earlier write failure is retried.
          savePersistedSessionId(storageScope, sessionIdRef.current)
        }

        // Attachments are per-turn context only — clear after a successful
        // send so the next unrelated question doesn't accidentally reuse them.
        setAttachedEmail(null)
        setImageAttachments([])
        if (imageInputRef.current) imageInputRef.current.value = ''

        // Refresh the pending strip and (when tab is hidden) fire a browser
        // notification so the user notices the proposal landed.
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
              controlsContainer={voiceControlsEl}
              triggerSize={29}
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
                {(mode === 'portfolio' ? PORTFOLIO_SUGGESTED_QUESTIONS : SUGGESTED_QUESTIONS).map((q) => (
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
                      controlsContainer={voiceControlsEl}
                      triggerSize={29}
                      attachedEmailMessageId={attachedEmail?.messageId ?? null}
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
                marginBottom: 18,
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
                  setSelectedModel(e.target.value)
                  savePersistedModel(e.target.value)
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
          </div>
        )}
      </div>
    )
  },
)

export default OptiMateChatCore
