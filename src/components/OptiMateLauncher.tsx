'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@payloadcms/ui'
import OptiMateMultiChat, { type OptiMateChatTarget } from './OptiMateMultiChat'
import { usePomodoro, PomodoroBody } from './PomodoroTimer'

type AgentKey = 'google-ads'

interface AgentDef {
  key: AgentKey
  label: string
  /** Public path to the agent's icon. Falls back to the OptiMate mark if missing. */
  icon: string
  enabled: boolean
}

const AGENTS: AgentDef[] = [
  { key: 'google-ads', label: 'Google Ads', icon: '/optimate-icon.png', enabled: true },
  // Add more agents here as they ship — just append a row; the grid auto-fills.
]

interface AuditOption {
  id: string | number
  businessName?: string
  customerId: string
}

type Step = 'agent' | 'audit' | 'chat' | 'pomodoro'

const PILL_RIGHT = 20 // pixels — pomodoro pill is gone, sit bottom-right alone
const PILL_BOTTOM = 20

const PANEL_WIDTH = 420
const PANEL_HEIGHT = 600

/**
 * Floating OptiMate launcher mounted globally on every admin page.
 * Pill sits to the left of the Pomodoro pill. Clicking it opens a panel that
 * walks the user through agent picker → audit picker → chat.
 */
const OptiMateLauncher = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth()
  // Pomodoro state lives at launcher level so timer/tracker survive panel
  // close + step navigation. Hook owns ALL pomodoro/tracker state.
  const pomo = usePomodoro()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('agent')
  const previousStepRef = useRef<Step>('agent')
  const [agent, setAgent] = useState<AgentKey | ''>('')
  const [audits, setAudits] = useState<AuditOption[] | null>(null)
  const [auditsLoading, setAuditsLoading] = useState(false)
  const [auditsError, setAuditsError] = useState<string | null>(null)
  const [selectedAudits, setSelectedAudits] = useState<AuditOption[]>([])
  const [filter, setFilter] = useState('')
  const [pendingCount, setPendingCount] = useState<number>(0)

  const loadAudits = useCallback(async () => {
    setAuditsLoading(true)
    setAuditsError(null)
    try {
      const res = await fetch(
        '/api/google-ads-audits?where[customerId][not_equals]=&limit=200&depth=0&sort=-updatedAt',
        { credentials: 'include' },
      )
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      const data = (await res.json()) as { docs?: Array<Record<string, unknown>> }
      const docs = Array.isArray(data.docs) ? data.docs : []
      const opts: AuditOption[] = docs
        .map((d) => ({
          id: d.id as string | number,
          businessName: typeof d.businessName === 'string' ? d.businessName : undefined,
          customerId: typeof d.customerId === 'string' ? d.customerId : '',
        }))
        .filter((o) => o.customerId)
      setAudits(opts)
    } catch (err) {
      setAuditsError(err instanceof Error ? err.message : 'Failed to load audits')
    } finally {
      setAuditsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open && step === 'audit' && audits === null && !auditsLoading) {
      loadAudits()
    }
  }, [open, step, audits, auditsLoading, loadAudits])

  // Poll pending approvals so the launcher pill shows a live count badge.
  // Cheap query: limit=0 returns just totalDocs. Polled while the panel is
  // closed (every 60s) and refetched once when opened.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    const fetchCount = async () => {
      try {
        const res = await fetch(
          '/api/agent-approval-queue?where[status][equals]=pending&limit=0&depth=0',
          { credentials: 'include' },
        )
        if (!res.ok) return
        const data = (await res.json()) as { totalDocs?: number }
        if (!cancelled && typeof data.totalDocs === 'number') {
          setPendingCount(data.totalDocs)
        }
      } catch {
        /* silent */
      }
    }
    fetchCount()
    const interval = setInterval(fetchCount, 60_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [user, open])

  // Reset to agent step when closing the panel.
  const close = () => {
    setOpen(false)
  }

  if (!user) return <>{children}</>

  // Toggle between pomodoro and the previously-active step.
  const togglePomodoro = () => {
    setStep((current) => {
      if (current === 'pomodoro') {
        return previousStepRef.current
      }
      previousStepRef.current = current
      return 'pomodoro'
    })
  }

  const handleAgentSelect = (key: AgentKey) => {
    setAgent(key)
    setStep('audit')
  }

  const toggleAudit = (opt: AuditOption) => {
    setSelectedAudits((prev) => {
      const exists = prev.some((a) => String(a.id) === String(opt.id))
      return exists ? prev.filter((a) => String(a.id) !== String(opt.id)) : [...prev, opt]
    })
  }

  const goToChat = () => {
    if (selectedAudits.length === 0) return
    setStep('chat')
  }

  const filteredAudits = (audits ?? []).filter((a) => {
    if (!filter.trim()) return true
    const q = filter.trim().toLowerCase()
    return (
      (a.businessName ?? '').toLowerCase().includes(q) ||
      a.customerId.toLowerCase().includes(q)
    )
  })

  return (
    <>
      {children}

      {/* Collapsed pill */}
      {!open && (
        <button
          type="button"
          onClick={() => {
            setOpen(true)
            pomo.requestNotificationPermission()
          }}
          title={pendingCount > 0 ? `Open OptiMate (${pendingCount} pending approval${pendingCount === 1 ? '' : 's'})` : 'Open OptiMate'}
          style={{
            position: 'fixed',
            bottom: PILL_BOTTOM,
            right: PILL_RIGHT,
            zIndex: 99998, // just below Pomodoro (99999) so we don't fight z-order
            background: '#111',
            color: '#fff',
            border: 'none',
            borderRadius: 24,
            padding: '8px 14px 8px 8px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          <img
            src="/optimate-icon.png"
            alt=""
            width={28}
            height={28}
            style={{ borderRadius: '50%', display: 'block' }}
          />
          OptiMate
          {pomo.pillLabel && (
            <span
              style={{
                fontFamily: '"Press Start 2P", "Courier New", monospace',
                fontSize: 10,
                letterSpacing: 0.5,
                background: 'rgba(255,255,255,0.12)',
                padding: '3px 6px',
                borderRadius: 6,
                marginLeft: 2,
              }}
              title={pomo.tracking ? `Tracking: ${pomo.taskName}` : 'Pomodoro running'}
            >
              ⏱ {pomo.pillLabel}
            </span>
          )}
          {pendingCount > 0 && (
            <span
              role="link"
              tabIndex={0}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                window.open('/agent-approvals?status=pending', '_blank', 'noopener,noreferrer')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  e.stopPropagation()
                  window.open('/agent-approvals?status=pending', '_blank', 'noopener,noreferrer')
                }
              }}
              title={`${pendingCount} pending — open queue`}
              style={{
                background: '#ef4444',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                lineHeight: 1,
                padding: '3px 6px',
                borderRadius: 999,
                marginLeft: 2,
                cursor: 'pointer',
              }}
            >
              {pendingCount > 99 ? '99+' : pendingCount}
            </span>
          )}
        </button>
      )}

      {/* Expanded panel */}
      {open && (
        <div
          style={{
            position: 'fixed',
            bottom: PILL_BOTTOM,
            right: PILL_RIGHT,
            zIndex: 99998,
            width: PANEL_WIDTH,
            maxWidth: 'calc(100vw - 40px)',
            height: PANEL_HEIGHT,
            maxHeight: 'calc(100vh - 40px)',
            background: 'var(--theme-input-bg, #fff)',
            color: 'var(--theme-text, #1f2937)',
            border: '1px solid var(--theme-border-color, #e5e7eb)',
            borderRadius: 12,
            boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {/* Panel header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              borderBottom: '1px solid var(--theme-border-color, #e5e7eb)',
              background: '#111',
              color: '#fff',
            }}
          >
            <img
              src="/optimate-icon.png"
              alt=""
              width={24}
              height={24}
              style={{ borderRadius: '50%', display: 'block' }}
            />
            <div style={{ fontWeight: 600, fontSize: 13, flex: 1, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span>{step === 'pomodoro' ? 'Pomodoro' : 'OptiMate'}</span>
              {pomo.pillLabel && (
                <span
                  title={pomo.tracking ? `Tracking: ${pomo.taskName}` : 'Pomodoro running'}
                  style={{
                    fontFamily: '"Press Start 2P", "Courier New", monospace',
                    fontSize: 9,
                    letterSpacing: 0.5,
                    background: 'rgba(34,197,94,0.18)',
                    color: '#22c55e',
                    padding: '3px 6px',
                    borderRadius: 6,
                  }}
                >
                  ⏱ {pomo.pillLabel}
                </span>
              )}
              {step === 'audit' && (
                <span style={{ opacity: 0.7, fontWeight: 400, marginLeft: 6, fontSize: 11 }}>
                  · Pick Google Ads accounts
                </span>
              )}
              {step === 'chat' && selectedAudits.length > 0 && (
                <span style={{ opacity: 0.7, fontWeight: 400, marginLeft: 6, fontSize: 11 }}>
                  · {selectedAudits.length === 1
                    ? (selectedAudits[0].businessName ?? selectedAudits[0].customerId)
                    : `${selectedAudits.length} accounts`}
                </span>
              )}
              {pendingCount > 0 && (
                <a
                  href="/agent-approvals?status=pending"
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`${pendingCount} pending approval${pendingCount === 1 ? '' : 's'} — open queue`}
                  style={{
                    background: '#ef4444',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 999,
                    marginLeft: 8,
                    textDecoration: 'none',
                    verticalAlign: 'middle',
                  }}
                >
                  {pendingCount > 99 ? '99+' : pendingCount} pending
                </a>
              )}
            </div>
            {step === 'chat' && (
              <button
                type="button"
                onClick={() => setStep('audit')}
                title="Switch accounts"
                style={{
                  background: 'transparent',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: 6,
                  fontSize: 11,
                  padding: '3px 8px',
                  cursor: 'pointer',
                }}
              >
                ← Accounts
              </button>
            )}
            <button
              type="button"
              onClick={togglePomodoro}
              title={step === 'pomodoro' ? 'Back to OptiMate' : 'Open Pomodoro / Tracker'}
              style={{
                background: step === 'pomodoro' ? 'rgba(255,255,255,0.18)' : 'transparent',
                color: pomo.running || pomo.tracking ? '#22c55e' : '#fff',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: 6,
                padding: '4px 6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                lineHeight: 1,
                animation: pomo.running || pomo.tracking ? 'optimate-pulse 1.6s ease-in-out infinite' : undefined,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </button>
            <button
              type="button"
              onClick={close}
              title="Close"
              style={{
                background: 'transparent',
                color: '#fff',
                border: 'none',
                fontSize: 18,
                lineHeight: 1,
                cursor: 'pointer',
                padding: '0 4px',
              }}
            >
              ×
            </button>
          </div>

          {/* Panel body. Note: chat step uses flex layout (no scroll on the
              wrapper) so OptiMateMultiChat can manage its own scrolling and
              keep the shared input glued to the bottom. */}
          <div
            style={{
              flex: 1,
              padding: step === 'pomodoro' ? 0 : 14,
              overflowY: step === 'chat' ? 'hidden' : 'auto',
              display: step === 'chat' ? 'flex' : 'block',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            {step === 'pomodoro' && <PomodoroBody pomo={pomo} />}

            {step === 'agent' && (
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: 600,
                    marginBottom: 10,
                    color: '#374151',
                  }}
                >
                  Choose an agent
                </label>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                    gap: 10,
                  }}
                >
                  {AGENTS.map((a) => (
                    <button
                      key={a.key}
                      type="button"
                      onClick={() => a.enabled && handleAgentSelect(a.key)}
                      disabled={!a.enabled}
                      title={a.enabled ? a.label : `${a.label} (coming soon)`}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 6,
                        padding: '14px 8px',
                        border: '1px solid var(--theme-border-color, #e5e7eb)',
                        borderRadius: 10,
                        background: 'var(--theme-input-bg, #fff)',
                        cursor: a.enabled ? 'pointer' : 'not-allowed',
                        opacity: a.enabled ? 1 : 0.5,
                        transition: 'background 0.15s, transform 0.1s',
                      }}
                      onMouseEnter={(e) => {
                        if (!a.enabled) return
                        e.currentTarget.style.background = '#f9fafb'
                      }}
                      onMouseLeave={(e) => {
                        if (!a.enabled) return
                        e.currentTarget.style.background = 'var(--theme-input-bg, #fff)'
                      }}
                    >
                      <img
                        src={a.icon}
                        alt=""
                        width={36}
                        height={36}
                        style={{ borderRadius: '50%', display: 'block' }}
                        onError={(e) => {
                          const t = e.currentTarget
                          if (t.src.endsWith('/optimate-icon.png')) return
                          t.src = '/optimate-icon.png'
                        }}
                      />
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: 'var(--theme-text, #1f2937)',
                          textAlign: 'center',
                        }}
                      >
                        {a.label}
                      </span>
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: 11, color: '#6b7280', marginTop: 12 }}>
                  More agents coming soon.
                </p>
              </div>
            )}

            {step === 'audit' && (
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: 600,
                    marginBottom: 6,
                    color: '#374151',
                  }}
                >
                  Pick Google Ads accounts
                  <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 6 }}>
                    (select one or more)
                  </span>
                </label>
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter by business name or customer ID…"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    border: '1px solid var(--theme-border-color, #e5e7eb)',
                    borderRadius: 6,
                    background: 'var(--theme-input-bg, #fff)',
                    color: 'var(--theme-text, #1f2937)',
                    fontSize: 13,
                    marginBottom: 10,
                  }}
                />
                {auditsLoading && (
                  <p style={{ fontSize: 12, color: '#6b7280' }}>Loading accounts…</p>
                )}
                {auditsError && (
                  <p style={{ fontSize: 12, color: '#dc2626' }}>{auditsError}</p>
                )}
                {!auditsLoading && !auditsError && filteredAudits.length === 0 && (
                  <p style={{ fontSize: 12, color: '#6b7280' }}>
                    No accounts with a Customer ID found.
                  </p>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {filteredAudits.map((opt) => {
                    const checked = selectedAudits.some((a) => String(a.id) === String(opt.id))
                    return (
                      <button
                        key={String(opt.id)}
                        type="button"
                        onClick={() => toggleAudit(opt)}
                        aria-pressed={checked}
                        style={{
                          textAlign: 'left',
                          padding: '8px 10px',
                          border: `1px solid ${checked ? '#2563eb' : 'var(--theme-border-color, #e5e7eb)'}`,
                          borderRadius: 6,
                          background: checked ? '#eff6ff' : 'var(--theme-input-bg, #fff)',
                          color: 'var(--theme-text, #1f2937)',
                          fontSize: 13,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                        }}
                        onMouseEnter={(e) => {
                          if (checked) return
                          e.currentTarget.style.background = '#f3f4f6'
                        }}
                        onMouseLeave={(e) => {
                          if (checked) return
                          e.currentTarget.style.background = 'var(--theme-input-bg, #fff)'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          readOnly
                          tabIndex={-1}
                          style={{ margin: 0, pointerEvents: 'none' }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {opt.businessName || 'Untitled audit'}
                          </div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>{opt.customerId}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>

                {/* Sticky-ish action row at the bottom of the picker. */}
                <div
                  style={{
                    marginTop: 14,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    justifyContent: 'space-between',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setAgent('')
                      setSelectedAudits([])
                      setStep('agent')
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#2563eb',
                      fontSize: 12,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    ← Change agent
                  </button>
                  <button
                    type="button"
                    onClick={goToChat}
                    disabled={selectedAudits.length === 0}
                    style={{
                      padding: '8px 14px',
                      background: selectedAudits.length === 0 ? '#9ca3af' : '#2563eb',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: selectedAudits.length === 0 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {selectedAudits.length === 0
                      ? 'Select accounts'
                      : selectedAudits.length === 1
                        ? 'Continue'
                        : `Continue with ${selectedAudits.length}`}
                  </button>
                </div>
              </div>
            )}

            {step === 'chat' && selectedAudits.length > 0 && (
              <OptiMateMultiChat
                key={selectedAudits.map((a) => String(a.id)).join('|')}
                targets={selectedAudits.map((a): OptiMateChatTarget => ({
                  id: a.id,
                  customerId: a.customerId,
                  businessName: a.businessName,
                }))}
                compact
              />
            )}
          </div>
        </div>
      )}

      {/* PiP portal lives outside the panel so it survives panel close. */}
      {pomo.pipPortal}

      {/* Pulse keyframe for the pomodoro icon when timer/tracker is active. */}
      <style>{`@keyframes optimate-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.55 } }`}</style>
    </>
  )
}

export default OptiMateLauncher
