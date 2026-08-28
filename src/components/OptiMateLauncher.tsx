'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@payloadcms/ui'
import OptiMateMultiChat, {
  type OptiMateChatTarget,
  type OptiMateMultiChatHandle,
} from './OptiMateMultiChat'
import InvoiceAssistantChat from './InvoiceAssistantChat'
import GmailReplyChat from './GmailReplyChat'
import TaskMateChat from './TaskMateChat'
import { usePomodoro, PomodoroBody } from './PomodoroTimer'
import { OPTIMATE_MODAL_CSS } from './optimate-modal-styles'
import RocketSplash from './RocketSplash'

type AgentKey = 'google-ads' | 'invoices' | 'taskmate'

interface AgentDef {
  key: AgentKey
  label: string
  /** Public path to the agent's icon. Falls back to the OptiMate mark if missing. */
  icon: string
  /** Icon width/height in px; defaults to 44 (the CSS baseline). */
  iconSize?: number
  enabled: boolean
}

const AGENTS: AgentDef[] = [
  { key: 'google-ads', label: 'GoogleMate', icon: '/optimate-orb.png', enabled: true },
  { key: 'invoices', label: 'InvoiceMate', icon: '/invoicemate-orb.png', iconSize: 28, enabled: true },
  { key: 'taskmate', label: 'TaskMate', icon: '/taskmate-orb.png', iconSize: 28, enabled: true },
]

/** Gmail shortcuts on the agent step. Tints match the Gmail palette. */
const QUICK_ACTIONS: Array<{
  step: Step
  label: string
  glyph: string
  tint: string
  ink: string
}> = [
  { step: 'gmail', label: 'Draft an email', glyph: '✉', tint: '#eaf1fe', ink: '#2b6cb0' },
  { step: 'email-reply', label: 'Reply to an email', glyph: '↩', tint: '#fdeeee', ink: '#c2413a' },
  { step: 'email-summarise', label: 'Summarise an email', glyph: '≡', tint: '#eaf7ee', ink: '#2f7d47' },
]

interface AuditOption {
  id: string | number
  businessName?: string
  customerId: string
}

type Step = 'agent' | 'audit' | 'chat' | 'invoice-chat' | 'taskmate' | 'gmail' | 'email-reply' | 'email-summarise' | 'pomodoro'

const PILL_RIGHT = 24 // pixels — pomodoro pill is gone, sit bottom-right alone
const PILL_BOTTOM = 24

const PANEL_WIDTH = 412
const PANEL_HEIGHT = 640

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
  /** Imperative handle on the embedded MultiChat so the popout button can
   *  read each tab's live sessionId and hand it off to the new window. */
  const multiChatRef = useRef<OptiMateMultiChatHandle | null>(null)
  const [agent, setAgent] = useState<AgentKey | ''>('')
  const [audits, setAudits] = useState<AuditOption[] | null>(null)
  const [auditsLoading, setAuditsLoading] = useState(false)
  const [auditsError, setAuditsError] = useState<string | null>(null)
  const [selectedAudits, setSelectedAudits] = useState<AuditOption[]>([])
  const [portfolioSelected, setPortfolioSelected] = useState(false)
  const [filter, setFilter] = useState('')

  const loadAudits = useCallback(async () => {
    setAuditsLoading(true)
    setAuditsError(null)
    try {
      const res = await fetch('/api/optimate/google-ads-accounts', { credentials: 'include' })
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      const data = (await res.json()) as { accounts?: Array<Record<string, unknown>> }
      const docs = Array.isArray(data.accounts) ? data.accounts : []
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

  useEffect(() => {
    const openTaskMate = () => {
      if ((user as { role?: string } | null)?.role !== 'admin') return
      setAgent('taskmate')
      setStep('taskmate')
      setOpen(true)
    }
    window.addEventListener('optimate:open-taskmate', openTaskMate)
    return () => window.removeEventListener('optimate:open-taskmate', openTaskMate)
  }, [user])

  // Reset to agent step when closing the panel.
  const close = () => {
    setOpen(false)
  }

  if (!user) return <>{children}</>

  // Don't render the floating launcher on the standalone popout window
  // (otherwise we'd get a recursive pill-in-window UI). The popout page
  // renders the chat directly, no launcher needed.
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/optimate-popout')) {
    return <>{children}</>
  }

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
    if (key === 'invoices') {
      setStep('invoice-chat')
      return
    }
    if (key === 'taskmate') {
      setStep('taskmate')
      return
    }
    setStep('audit')
  }

  const toggleAudit = (opt: AuditOption) => {
    setPortfolioSelected(false)
    setSelectedAudits((prev) => {
      const exists = prev.some((a) => String(a.id) === String(opt.id))
      return exists ? prev.filter((a) => String(a.id) !== String(opt.id)) : [...prev, opt]
    })
  }

  const startPortfolioChat = () => {
    setSelectedAudits([])
    setPortfolioSelected(true)
    setStep('chat')
  }

  const goToChat = () => {
    if (selectedAudits.length === 0 && !portfolioSelected) return
    setStep('chat')
  }

  /** Client context under the selected agent name. */
  const accountLabel = portfolioSelected
    ? 'Portfolio'
    : selectedAudits.length === 1
      ? (selectedAudits[0]?.businessName ?? selectedAudits[0]?.customerId ?? '')
      : selectedAudits.length > 1
        ? `${selectedAudits.length} accounts`
        : ''
  const headerTitle =
    step === 'chat'
      ? 'GoogleMate'
      : step === 'invoice-chat'
        ? 'InvoiceMate'
        : step === 'taskmate'
          ? 'TaskMate'
          : step === 'pomodoro'
            ? 'Pomodoro'
            : 'OptiMate'
  const headerSub =
    step === 'chat'
      ? accountLabel
      : step === 'gmail'
        ? 'Gmail · Draft'
        : step === 'email-reply'
          ? 'Gmail · Reply'
          : step === 'email-summarise'
            ? 'Gmail · Summarise'
            : ''

  const filteredAudits = (audits ?? []).filter((a) => {
    if (!filter.trim()) return true
    const q = filter.trim().toLowerCase()
    return (
      (a.businessName ?? '').toLowerCase().includes(q) || a.customerId.toLowerCase().includes(q)
    )
  })

  return (
    <>
      {children}

      {/* Collapsed launcher: floating orb with an "Ask OptiMate" tooltip. */}
      {!open && (
        <button
          type="button"
          className="om-launcher"
          onClick={() => {
            setOpen(true)
            pomo.requestNotificationPermission()
          }}
          aria-label="Ask OptiMate"
          style={{ bottom: PILL_BOTTOM, right: PILL_RIGHT }}
        >
          <span className="om-tip">
            Ask OptiMate
            {pomo.pillLabel && (
              <span
                className="om-timer"
                title={pomo.tracking ? `Tracking: ${pomo.taskName}` : 'Pomodoro running'}
              >
                ⏱ {pomo.pillLabel}
              </span>
            )}
          </span>
          <span className="om-orb">
            <span className="om-ring" />
            <img src="/optimate-orb.png" alt="" />
          </span>
        </button>
      )}

      {/* Expanded panel */}
      {open && (
        <div
          className="om-panel"
          style={{
            position: 'fixed',
            bottom: PILL_BOTTOM,
            right: PILL_RIGHT,
            zIndex: 99998,
            width: PANEL_WIDTH,
            maxWidth: 'calc(100vw - 40px)',
            height: PANEL_HEIGHT,
            maxHeight: 'calc(100vh - 40px)',
          }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {/* Panel header */}
          <div className="om-head">
            <span className="om-avatar">
              <img src="/optimate-orb.png" alt="" />
            </span>
            <div className="om-head-titles">
              <span className="om-brand">{headerTitle}</span>
              {headerSub && <span className="om-head-sub">{headerSub}</span>}
            </div>
            <div className="om-head-actions">
              {pomo.pillLabel && (
                <span
                  className="om-timer-chip"
                  title={pomo.tracking ? `Tracking: ${pomo.taskName}` : 'Pomodoro running'}
                >
                  ⏱ {pomo.pillLabel}
                </span>
              )}
              {step === 'chat' && (
                <button type="button" className="om-headlink" onClick={() => setStep('audit')}>
                  ← Accounts
                </button>
              )}
              {(step === 'invoice-chat' ||
                step === 'taskmate' ||
                step === 'gmail' ||
                step === 'email-reply' ||
                step === 'email-summarise') && (
                <button
                  type="button"
                  className="om-headlink"
                  onClick={() => {
                    setAgent('')
                    setStep('agent')
                  }}
                >
                  ← Change agent
                </button>
              )}
              {(step === 'invoice-chat' ||
                step === 'gmail' ||
                step === 'email-reply' ||
                step === 'email-summarise') && (
                <button
                  type="button"
                  className="om-iconbtn lg"
                  onClick={() => {
                    // Open standalone agents in a separate browser window so the
                    // user can park them next to their work. Gmail keeps the same
                    // entry mode (new draft vs reply search) via the phase param.
                    const features = [
                      'popup=yes',
                      'width=680',
                      'height=720',
                      'menubar=no',
                      'toolbar=no',
                      'location=no',
                      'status=no',
                    ].join(',')
                    const url =
                      step === 'invoice-chat'
                        ? '/optimate-popout?agent=invoices'
                        : `/optimate-popout?agent=gmail&phase=${step === 'email-reply' ? 'reply' : step === 'email-summarise' ? 'summarise' : 'compose'}`
                    const name = step === 'invoice-chat' ? 'invoices' : `gmail-${step === 'email-reply' ? 'reply' : step === 'email-summarise' ? 'summarise' : 'compose'}`
                    window.open(url, `optimate-popout-${name}`, features)
                    setOpen(false)
                  }}
                  title="Pop out to a separate window"
                  aria-label="Pop out to a separate window"
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
                  >
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                  </svg>
                </button>
              )}
              {step === 'chat' && (selectedAudits.length > 0 || portfolioSelected) && (
                <button
                  type="button"
                  className="om-iconbtn lg"
                  onClick={() => {
                    // Open the chat in a separate browser window so the user
                    // can park it next to their work without keeping the CMS
                    // panel open. The popout page reads ?audits=... and
                    // re-mounts the multi-chat full-window. Close the launcher
                    // panel as soon as we hand off so we don't have two
                    // copies of the same conversation.
                    //
                    // Pass each tab's live sessionId in the URL so the popout
                    // window resumes the same thread instead of starting a
                    // fresh one. Without this, the new window mounts a fresh
                    // ChatCore and the in-progress conversation appears lost
                    // (the rows are still in the DB — reachable via the
                    // History popover — but the user expects the chat to be
                    // there).
                    const ids = selectedAudits.map((a) => String(a.id)).join(',')
                    const sessionMap = multiChatRef.current?.getSessionIds() ?? {}
                    // Pair sessionIds with audit ids by index so the popout
                    // page can zip them back together. Empty string for any
                    // tab whose ChatCore hasn't reported a sessionId yet (the
                    // popout falls back to a fresh thread for those).
                    const sessionIds = selectedAudits
                      .map((a) => sessionMap[String(a.id)] ?? '')
                      .join(',')
                    // Popout lives under (frontend), NOT (payload), so the
                    // Payload admin layout doesn't wrap it with a sidebar +
                    // floating launcher and doesn't trap our `position:
                    // fixed` container — the chat fills the whole window
                    // and resizes with it.
                    const url = portfolioSelected
                      ? `/optimate-popout?mode=portfolio&sessionIds=${encodeURIComponent(sessionMap.portfolio ?? '')}`
                      : `/optimate-popout?audits=${encodeURIComponent(ids)}` +
                        `&sessionIds=${encodeURIComponent(sessionIds)}`
                    const features = [
                      'popup=yes',
                      'width=680',
                      'height=720',
                      'menubar=no',
                      'toolbar=no',
                      'location=no',
                      'status=no',
                    ].join(',')
                    window.open(url, `optimate-popout-${portfolioSelected ? 'portfolio' : ids}`, features)
                    setOpen(false)
                  }}
                  title="Pop out to a separate window"
                  aria-label="Pop out to a separate window"
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
                  >
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                className={`om-iconbtn lg${step === 'pomodoro' ? ' is-on' : ''}${
                  pomo.running || pomo.tracking ? ' is-live' : ''
                }`}
                onClick={togglePomodoro}
                title={step === 'pomodoro' ? 'Back to OptiMate' : 'Open Pomodoro / Tracker'}
                aria-label={step === 'pomodoro' ? 'Back to OptiMate' : 'Open Pomodoro / Tracker'}
                style={{
                  animation:
                    pomo.running || pomo.tracking
                      ? 'optimate-pulse 1.6s ease-in-out infinite'
                      : undefined,
                }}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </button>
              <button type="button" className="om-iconbtn" onClick={close} title="Close" aria-label="Close">
                ✕
              </button>
            </div>
          </div>

          {/* Panel body. Note: chat steps use flex layout (no scroll on the
              wrapper) so the chat component can manage its own scrolling and
              keep the input glued to the bottom. */}
          <div
            style={{
              flex: 1,
              // Steps that own their internal spacing (pomodoro, agent picker,
              // account picker) run full-bleed; only the chat steps get the
              // wrapper's padding.
              padding: step === 'pomodoro' || step === 'agent' || step === 'audit' ? 0 : 14,
              overflowY:
                step === 'audit' || step === 'chat' || step === 'invoice-chat' || step === 'taskmate' || step === 'gmail' || step === 'email-reply' || step === 'email-summarise'
                  ? 'hidden'
                  : 'auto',
              display:
                step === 'audit' || step === 'chat' || step === 'invoice-chat' || step === 'taskmate' || step === 'gmail' || step === 'email-reply' || step === 'email-summarise'
                  ? 'flex'
                  : 'block',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            {step === 'pomodoro' && <PomodoroBody pomo={pomo} />}

            {step === 'agent' && (
              <div className="om-s1">
                <div className="om-group">
                  <span className="om-label">Choose an agent</span>
                  <div className="om-agents">
                    {AGENTS.filter(
                      (a) => a.key !== 'taskmate' || (user as { role?: string }).role === 'admin',
                    ).map((a) => (
                      <button
                        key={a.key}
                        type="button"
                        className="om-agent"
                        onClick={() => a.enabled && handleAgentSelect(a.key)}
                        disabled={!a.enabled}
                        title={a.enabled ? a.label : `${a.label} (coming soon)`}
                      >
                        <span className="om-agent-orb">
                          <img
                            src={a.icon}
                            alt=""
                            style={a.iconSize ? { width: a.iconSize, height: a.iconSize } : undefined}
                            onError={(e) => {
                              const t = e.currentTarget
                              if (t.src.endsWith('/optimate-orb.png')) return
                              t.src = '/optimate-orb.png'
                            }}
                          />
                        </span>
                        <span><span style={{ color: '#1a3a6b' }}>{a.label.replace('Mate', '')}</span>Mate</span>
                      </button>
                    ))}
                  </div>

                </div>

                {/* Persistent Gmail shortcuts: draft, reply, summarise. */}
                <div className="om-group">
                  <span className="om-label">Quick actions</span>
                  <div className="om-actions">
                    {QUICK_ACTIONS.map((action) => (
                      <button
                        key={action.step}
                        type="button"
                        className="om-action"
                        onClick={() => setStep(action.step)}
                        title={action.label}
                      >
                        <span
                          className="om-action-ico"
                          style={{ background: action.tint, color: action.ink }}
                          aria-hidden="true"
                        >
                          {action.glyph}
                        </span>
                        <b>{action.label}</b>
                        <span className="om-chev" aria-hidden="true">
                          ›
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 'audit' && (
              <div className="om-s2">
                <div className="om-s2-top">
                  <div className="om-s2-title">
                    <b>Google Ads</b>
                    <span>Select one or more</span>
                  </div>
                  <label className="om-search">
                    <span aria-hidden="true">⌕</span>
                    <input
                      type="text"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      placeholder="Filter accounts…"
                      aria-label="Filter accounts by business name or customer ID"
                    />
                  </label>
                </div>

                <button type="button" className="om-portfolio" onClick={startPortfolioChat}>
                  <span className="om-portfolio-ico" aria-hidden="true">
                    ◱
                  </span>
                  <span className="om-portfolio-copy">
                    <b>Start portfolio chat</b>
                    <span>Ask across every account at once</span>
                  </span>
                  <span className="om-portfolio-go" aria-hidden="true">
                    →
                  </span>
                </button>

                <div className="om-accounts">
                  {auditsLoading && (
                    <div className="om-accounts-loading">
                      <RocketSplash compact onLight />
                    </div>
                  )}
                  {auditsError && <p className="om-accounts-msg is-error">{auditsError}</p>}
                  {!auditsLoading && !auditsError && filteredAudits.length === 0 && (
                    <p className="om-accounts-msg">No accounts with a Customer ID found.</p>
                  )}
                  {filteredAudits.map((opt) => {
                    const checked = selectedAudits.some((a) => String(a.id) === String(opt.id))
                    return (
                      <button
                        key={String(opt.id)}
                        type="button"
                        className={`om-acct${checked ? ' is-on' : ''}`}
                        onClick={() => toggleAudit(opt)}
                        aria-pressed={checked}
                      >
                        <span className="om-acct-box" aria-hidden="true">
                          {checked ? '✓' : ''}
                        </span>
                        <span className="om-acct-txt">
                          <span className="om-acct-name">
                            {opt.businessName || 'Untitled audit'}
                          </span>
                          <span className="om-acct-id">{opt.customerId}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Action row pinned under the account list. */}
                <div className="om-foot">
                  <span className="om-count">
                    {portfolioSelected
                      ? 'Portfolio selected'
                      : selectedAudits.length === 0
                        ? 'No accounts selected'
                        : `${selectedAudits.length} selected`}
                  </span>
                  <div className="om-btnrow">
                    <button
                      type="button"
                      className="om-btn"
                      onClick={() => {
                        setAgent('')
                        setSelectedAudits([])
                        setPortfolioSelected(false)
                        setStep('agent')
                      }}
                    >
                      ← Change agent
                    </button>
                    <button
                      type="button"
                      className={`om-btn om-btn--primary${
                        selectedAudits.length > 0 || portfolioSelected ? ' is-ready' : ''
                      }`}
                      onClick={goToChat}
                      disabled={selectedAudits.length === 0 && !portfolioSelected}
                    >
                      {portfolioSelected
                        ? 'Continue with portfolio'
                        : selectedAudits.length === 0
                          ? 'Select accounts'
                          : selectedAudits.length === 1
                            ? 'Continue'
                            : `Continue with ${selectedAudits.length}`}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === 'chat' && (selectedAudits.length > 0 || portfolioSelected) && (
              <OptiMateMultiChat
                ref={multiChatRef}
                key={portfolioSelected ? 'portfolio' : selectedAudits.map((a) => String(a.id)).join('|')}
                targets={
                  portfolioSelected
                    ? [{ mode: 'portfolio', id: 'portfolio', businessName: 'Portfolio' }]
                    : selectedAudits.map(
                        (a): OptiMateChatTarget => ({
                          mode: 'audit',
                          id: a.id,
                          customerId: a.customerId,
                          businessName: a.businessName,
                        }),
                      )
                }
                compact
                fluid
              />
            )}

            {step === 'invoice-chat' && <InvoiceAssistantChat />}

            {step === 'taskmate' && <TaskMateChat />}

            {step === 'gmail' && <GmailReplyChat initialPhase="compose" />}

            {step === 'email-reply' && <GmailReplyChat initialPhase="search" />}

            {step === 'email-summarise' && <GmailReplyChat initialPhase="search" initialSummariseMode />}
          </div>
        </div>
      )}

      {/* PiP portal lives outside the panel so it survives panel close. */}
      {pomo.pipPortal}

      {/* Pomodoro "session complete" modal — stays open until dismissed. */}
      {pomo.pomodoroDonePortal}

      {/* Pulse keyframe for the pomodoro icon when timer/tracker is active. */}
      <style>{`@keyframes optimate-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.55 } }`}</style>

      {/* Panel + chat styling, shared with OptiMateChatCore. */}
      <style>{OPTIMATE_MODAL_CSS}</style>

      {/* Collapsed launcher styling. Kept as a stylesheet rather than inline
          styles because it needs pseudo-classes, keyframes and the
          reduced-motion query. z-index sits just below Pomodoro (99999). */}
      <style>{`
        .om-launcher {
          position: fixed;
          z-index: 99998;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 0;
          border: none;
          background: transparent;
          font-family: 'Manrope', Helvetica, Arial, sans-serif;
          cursor: pointer;
        }
        .om-tip {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 600;
          color: #11141a;
          background: #fff;
          padding: 8px 13px;
          border-radius: 12px;
          box-shadow: 0 6px 20px rgba(16, 20, 28, 0.14);
          white-space: nowrap;
        }
        .om-timer {
          font-family: 'Press Start 2P', 'Courier New', monospace;
          font-size: 9px;
          letter-spacing: 0.5px;
          color: #15803d;
          background: rgba(34, 197, 94, 0.16);
          padding: 3px 6px;
          border-radius: 6px;
        }
        .om-orb {
          position: relative;
          width: 72px;
          height: 72px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          background: linear-gradient(160deg, #fff, #e8f2fb);
          border: 1px solid rgba(255, 255, 255, 0.9);
          box-shadow: 0 10px 30px rgba(46, 92, 140, 0.26), inset 0 1px 0 #fff;
          transition: transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .om-launcher:hover .om-orb { transform: scale(1.06); }
        .om-launcher:focus-visible { outline: none; }
        .om-launcher:focus-visible .om-orb {
          box-shadow: 0 0 0 3px #7fb6e8, 0 10px 30px rgba(46, 92, 140, 0.26);
        }
        .om-ring {
          position: absolute;
          inset: 0;
          border-radius: 999px;
          border: 2px solid #7fb6e8;
          animation: om-ring 2.6s ease-out infinite;
        }
        .om-orb img {
          position: relative;
          width: 72px;
          height: 72px;
          object-fit: contain;
          animation: om-bob 3.4s ease-in-out infinite;
        }
        @keyframes om-bob { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }
        @keyframes om-ring { 0% { transform: scale(1); opacity: 0.5 } 70%, 100% { transform: scale(1.5); opacity: 0 } }
        @media (prefers-reduced-motion: reduce) {
          .om-orb img, .om-ring { animation: none }
        }
      `}</style>
    </>
  )
}

export default OptiMateLauncher
