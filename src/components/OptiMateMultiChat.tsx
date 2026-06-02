'use client'

import {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from 'react'
import OptiMateChatCore, { type OptiMateChatCoreHandle } from './OptiMateChatCore'
import EmailAttachPicker, { type AttachedEmailMeta } from './EmailAttachPicker'
import OptiMateToolsHelp from './OptiMateToolsHelp'

export type OptiMateChatTarget =
  | {
      mode?: 'audit'
      id: string | number
      customerId: string
      businessName?: string
      /** Optional thread to resume on mount. Used by the popout window so the
       *  new tab shows the same conversation the launcher had open. */
      initialSessionId?: string
    }
  | {
      mode: 'portfolio'
      id: string
      businessName: string
      initialSessionId?: string
      messageContextPrefix?: string
    }

export interface OptiMateMultiChatHandle {
  /** Map of String(auditId) → current sessionId for that tab. Used by the
   *  launcher popout handler so the new window can resume each thread. */
  getSessionIds: () => Record<string, string>
}

interface OptiMateMultiChatProps {
  targets: OptiMateChatTarget[]
  /** Compact = launcher panel; default = full tab. Forwarded to each ChatCore. */
  compact?: boolean
  /** Fluid = standalone popout; chat and message bubbles expand with browser width. */
  fluid?: boolean
}

function targetLabel(target: OptiMateChatTarget | undefined): string {
  if (!target) return 'this account'
  if (target.businessName) return target.businessName
  return target.mode === 'portfolio' ? 'Portfolio' : target.customerId
}

/**
 * Multi-account chat shell. Renders one tab per selected Google Ads account,
 * each backed by its own `OptiMateChatCore` instance (independent history,
 * independent runs). A shared input at the bottom either:
 *   - sends to the active tab only (default), or
 *   - broadcasts in parallel to every selected account when "Send to all" is on.
 *
 * The shared input is owned here (not the per-tab ChatCore) so a broadcast
 * fan-out is one user gesture: we call each child's exposed `sendMessage` via
 * imperative ref, await Promise.all, and surface a single shared loading
 * state. Per-tab pending/proposal/notification behaviour stays inside each
 * ChatCore unchanged.
 */
const OptiMateMultiChat = forwardRef<OptiMateMultiChatHandle, OptiMateMultiChatProps>(
  function OptiMateMultiChat({ targets, compact = false, fluid = false }, ref) {
    const selectedAccountsTarget = useMemo<OptiMateChatTarget | null>(() => {
      const auditTargets = targets.filter((t) => t.mode !== 'portfolio')
      if (auditTargets.length < 2) return null
      const accountLines = auditTargets.map((t) => {
        const label = t.businessName || t.customerId
        const ref = String(t.id)
        const customer = t.customerId.replace(/-/g, '')
        return `- ${label}: accountRef=${ref}, customerKey=${customer}`
      })
      return {
        mode: 'portfolio',
        id: 'selected-accounts',
        businessName: 'Selected accounts',
        messageContextPrefix:
          'Answer using only these selected Google Ads accounts unless the user explicitly asks to widen the scope. ' +
          'When the user asks for an email or draft, compare/summarise these selected accounts together and create one combined Gmail draft if requested.\n' +
          accountLines.join('\n'),
      }
    }, [targets])
    const chatTargets = useMemo(
      () => (selectedAccountsTarget ? [selectedAccountsTarget, ...targets] : targets),
      [selectedAccountsTarget, targets],
    )
    const [activeId, setActiveId] = useState<string>(() => String(selectedAccountsTarget?.id ?? targets[0]?.id ?? ''))
    const [broadcast, setBroadcast] = useState(false)
    const [input, setInput] = useState('')
    const [busy, setBusy] = useState(false)
    const [pickerOpen, setPickerOpen] = useState(false)
    const [attachedEmail, setAttachedEmail] = useState<AttachedEmailMeta | null>(null)
    const refs = useRef<Map<string, OptiMateChatCoreHandle | null>>(new Map())
    const inputRef = useRef<HTMLTextAreaElement>(null)
    /* Auto-grow the shared textarea as the user types. Caps at 8 lines so
     * the panel doesn't get crowded; past that it scrolls. */
    useEffect(() => {
      const el = inputRef.current
      if (!el) return
      el.style.height = 'auto'
      const maxPx = 8 * 20
      el.style.height = Math.min(el.scrollHeight, maxPx) + 'px'
    }, [input])

    const setRef = useCallback(
      (id: string) => (handle: OptiMateChatCoreHandle | null) => {
        refs.current.set(id, handle)
      },
      [],
    )

    useEffect(() => {
      if (!chatTargets.some((t) => String(t.id) === activeId)) {
        setActiveId(String(chatTargets[0]?.id ?? ''))
      }
    }, [activeId, chatTargets])

    const activeTarget = useMemo(
      () => chatTargets.find((t) => String(t.id) === activeId) ?? chatTargets[0],
      [chatTargets, activeId],
    )

    const send = async () => {
      const text = input.trim()
      if (!text || busy) return
      setInput('')
      setBusy(true)
      try {
        if (broadcast) {
          // Fan out to every tab in parallel. Pre-switch the active tab to the
          // first one so the user sees something stream in immediately, but all
          // tabs run concurrently.
          const handles = targets
            .map((t) => refs.current.get(String(t.id)))
            .filter((h): h is OptiMateChatCoreHandle => Boolean(h))
          await Promise.allSettled(handles.map((h) => h.sendMessage(text)))
        } else {
          const h = refs.current.get(activeId)
          if (h) await h.sendMessage(text)
        }
      } finally {
        setBusy(false)
      }
    }

    const onKeyDown = (e: React.KeyboardEvent) => {
      e.stopPropagation()
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        send()
      }
    }

    if (targets.length === 0) {
      return <p style={{ fontSize: 12, color: '#6b7280', padding: 8 }}>No accounts selected.</p>
    }

    // Expose per-tab sessionIds so the launcher's popout button can pass them
    // through to the new window. Reads live from the imperative handles so the
    // value is always current (even after the server mints a fresh sessionId
    // mid-turn).
    useImperativeHandle(
      ref,
      () => ({
        getSessionIds: () => {
          const out: Record<string, string> = {}
          for (const t of chatTargets) {
            const key = String(t.id)
            const sid = refs.current.get(key)?.getSessionId()
            if (sid) out[key] = sid
          }
          return out
        },
      }),
      [chatTargets],
    )

    // Single-account / portfolio fast path: ChatCore owns the header row so
    // History and Expand sit beside the account/portfolio name.
    if (chatTargets.length === 1) {
      const t = chatTargets[0]
      return (
        <OptiMateChatCore
          ref={setRef(String(t.id))}
          key={String(t.id)}
          mode={t.mode ?? 'audit'}
          auditId={t.id}
          customerId={t.mode === 'portfolio' ? undefined : t.customerId}
          businessName={t.businessName}
          compact={compact}
          fluid={fluid}
          initialSessionId={t.initialSessionId}
          messageContextPrefix={t.mode === 'portfolio' ? t.messageContextPrefix : undefined}
        />
      )
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        {/* Tab strip — one per selected account. */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            borderBottom: '1px solid var(--theme-border-color, #e5e7eb)',
            marginBottom: 8,
            overflowX: 'auto',
            flexShrink: 0,
          }}
        >
          {chatTargets.map((t) => {
            const isActive = String(t.id) === activeId
            return (
              <button
                key={String(t.id)}
                type="button"
                onClick={() => setActiveId(String(t.id))}
                title={t.mode === 'portfolio' ? 'Portfolio' : t.customerId}
                style={{
                  padding: '6px 10px',
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 500,
                  background: isActive ? 'var(--theme-input-bg, #fff)' : 'transparent',
                  color: isActive ? '#111' : '#6b7280',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #2563eb' : '2px solid transparent',
                  borderRadius: 0,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {t.businessName || (t.mode === 'portfolio' ? 'Portfolio' : t.customerId)}
              </button>
            )
          })}
          <div
            style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '3px 2px 0 8px',
              flexShrink: 0,
            }}
          >
            <OptiMateToolsHelp compact={compact} />
          </div>
        </div>

        {/* Voice CTA is rendered inside each OptiMateChatCore (above its input). */}

        {/* Render every ChatCore but show only the active one. Mounting all of
          them keeps each tab's history hot when the user switches between
          them, and broadcast-mode needs every ref live anyway. */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          {chatTargets.map((t) => {
            const isActive = String(t.id) === activeId
            return (
              <div
                key={String(t.id)}
                style={{
                  display: isActive ? 'block' : 'none',
                  height: '100%',
                }}
              >
                <OptiMateChatCore
                  ref={setRef(String(t.id))}
                  mode={t.mode ?? 'audit'}
                  auditId={t.id}
                  customerId={t.mode === 'portfolio' ? undefined : t.customerId}
                  businessName={t.businessName}
                  compact={compact}
                  fluid={fluid}
                  hideInput
                  initialSessionId={t.initialSessionId}
                  messageContextPrefix={t.mode === 'portfolio' ? t.messageContextPrefix : undefined}
                />
              </div>
            )
          })}
        </div>

        {/* Shared input + broadcast toggle. */}
        <div
          style={{
            flexShrink: 0,
            marginTop: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: '#374151',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={broadcast}
              onChange={(e) => setBroadcast(e.target.checked)}
              style={{ margin: 0 }}
            />
            Send to all {targets.length} accounts
            {broadcast && (
              <span style={{ color: '#6b7280' }}>· stacks one reply per account in each tab</span>
            )}
          </label>
          {attachedEmail && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 8px',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: 12,
                fontSize: 11,
                color: '#1e40af',
                maxWidth: '100%',
              }}
              title={`From ${attachedEmail.from} · ${attachedEmail.date}`}
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setPickerOpen((v) => !v)
              }}
              disabled={busy}
              title="Browse your Gmail inbox to attach an email"
              style={{
                padding: '10px 12px',
                background: pickerOpen ? '#e0e7ff' : '#f3f4f6',
                color: '#374151',
                border: '1px solid var(--theme-border-color, #e5e7eb)',
                borderRadius: 8,
                fontSize: 14,
                cursor: busy ? 'not-allowed' : 'pointer',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
              }}
              aria-label="Browse Gmail inbox"
            >
              {/* Inbox / mailbox icon — matches the single-account chat's
                picker button so the affordance reads as "open Gmail"
                rather than "attach any file". */}
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
              </svg>
            </button>
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={
                broadcast
                  ? `Ask all ${targets.length} accounts... (Shift+Enter for newline)`
                  : activeTarget?.mode === 'portfolio' && activeTarget.id === 'selected-accounts'
                    ? `Ask selected accounts together... (Shift+Enter for newline)`
                    : `Ask ${targetLabel(activeTarget)}... (Shift+Enter for newline)`
              }
              disabled={busy}
              style={{
                flex: 1,
                minWidth: 0,
                padding: '10px 14px',
                border: '1px solid var(--theme-border-color, #e5e7eb)',
                borderRadius: 8,
                fontSize: 13,
                lineHeight: '20px',
                background: 'var(--theme-input-bg, #fff)',
                color: 'var(--theme-text, #1f2937)',
                outline: 'none',
                resize: 'none',
                fontFamily: 'inherit',
                overflowY: 'auto',
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
                send()
              }}
              disabled={busy || !input.trim()}
              style={{
                padding: '10px 18px',
                background: busy || !input.trim() ? '#9ca3af' : '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 13,
                cursor: busy || !input.trim() ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {busy ? 'Sending…' : broadcast ? `Send to ${targets.length}` : 'Send'}
            </button>
          </div>
        </div>
      </div>
    )
  },
)

export default OptiMateMultiChat
