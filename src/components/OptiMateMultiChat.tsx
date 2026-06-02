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
      selectedAccountRefs?: Array<string | number>
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

/**
 * Multi-account chat shell. Renders a synthetic selected-accounts portfolio tab
 * plus one tab per selected Google Ads account, each backed by `OptiMateChatCore`.
 * The active tab owns its normal composer so Gmail attachment, image attachment,
 * model picker, text input and voice controls stay visually identical to the
 * single-account chat.
 */
const OptiMateMultiChat = forwardRef<OptiMateMultiChatHandle, OptiMateMultiChatProps>(
  function OptiMateMultiChat({ targets, compact = false, fluid = false }, ref) {
    const selectedAccountsTarget = useMemo<OptiMateChatTarget | null>(() => {
      const auditTargets = targets.filter((t) => t.mode !== 'portfolio')
      if (auditTargets.length < 2) return null
      const selectedAccountRefs = auditTargets.map((t) => t.id)
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
        selectedAccountRefs,
      }
    }, [targets])
    const chatTargets = useMemo(
      () => (selectedAccountsTarget ? [selectedAccountsTarget, ...targets] : targets),
      [selectedAccountsTarget, targets],
    )
    const [activeId, setActiveId] = useState<string>(() => String(selectedAccountsTarget?.id ?? targets[0]?.id ?? ''))
    const refs = useRef<Map<string, OptiMateChatCoreHandle | null>>(new Map())

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
          selectedAccountRefs={t.mode === 'portfolio' ? t.selectedAccountRefs ?? [] : []}
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

        {/* Render every ChatCore but show only the active one. Mounting all of
          them keeps each tab's history hot when the user switches between them. */}
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
                  initialSessionId={t.initialSessionId}
                  messageContextPrefix={t.mode === 'portfolio' ? t.messageContextPrefix : undefined}
                  selectedAccountRefs={t.mode === 'portfolio' ? t.selectedAccountRefs ?? [] : []}
                />
              </div>
            )
          })}
        </div>

      </div>
    )
  },
)

export default OptiMateMultiChat
