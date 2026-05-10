'use client'

import { useState, useRef, useCallback, useMemo } from 'react'
import OptiMateChatCore, { type OptiMateChatCoreHandle } from './OptiMateChatCore'

export interface OptiMateChatTarget {
  id: string | number
  customerId: string
  businessName?: string
}

interface OptiMateMultiChatProps {
  targets: OptiMateChatTarget[]
  /** Compact = launcher panel; default = full tab. Forwarded to each ChatCore. */
  compact?: boolean
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
const OptiMateMultiChat = ({ targets, compact = false }: OptiMateMultiChatProps) => {
  const [activeId, setActiveId] = useState<string>(() => String(targets[0]?.id ?? ''))
  const [broadcast, setBroadcast] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const refs = useRef<Map<string, OptiMateChatCoreHandle | null>>(new Map())

  const setRef = useCallback((id: string) => (handle: OptiMateChatCoreHandle | null) => {
    refs.current.set(id, handle)
  }, [])

  const activeTarget = useMemo(
    () => targets.find((t) => String(t.id) === activeId) ?? targets[0],
    [targets, activeId],
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
    return (
      <p style={{ fontSize: 12, color: '#6b7280', padding: 8 }}>
        No accounts selected.
      </p>
    )
  }

  // Single-account fast path: skip the tab strip and let the ChatCore render
  // its own input. Keeps behaviour identical to the old launcher when only
  // one account is picked.
  if (targets.length === 1) {
    const t = targets[0]
    return (
      <OptiMateChatCore
        key={String(t.id)}
        auditId={t.id}
        customerId={t.customerId}
        businessName={t.businessName}
        compact={compact}
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
        {targets.map((t) => {
          const isActive = String(t.id) === activeId
          return (
            <button
              key={String(t.id)}
              type="button"
              onClick={() => setActiveId(String(t.id))}
              title={t.customerId}
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
              {t.businessName || t.customerId}
            </button>
          )
        })}
      </div>

      {/* Render every ChatCore but show only the active one. Mounting all of
          them keeps each tab's history hot when the user switches between
          them, and broadcast-mode needs every ref live anyway. */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {targets.map((t) => {
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
                auditId={t.id}
                customerId={t.customerId}
                businessName={t.businessName}
                compact={compact}
                hideInput
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
            <span style={{ color: '#6b7280' }}>
              · stacks one reply per account in each tab
            </span>
          )}
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={broadcast
              ? `Ask all ${targets.length} accounts...`
              : `Ask ${activeTarget?.businessName ?? activeTarget?.customerId ?? 'this account'}...`
            }
            disabled={busy}
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
            onFocus={(e) => { e.currentTarget.style.borderColor = '#2563eb' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--theme-border-color, #e5e7eb)' }}
          />
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); send() }}
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
}

export default OptiMateMultiChat
