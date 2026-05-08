'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@payloadcms/ui'
import OptiMateChatCore from './OptiMateChatCore'

type AgentKey = 'google-ads'

interface AuditOption {
  id: string | number
  businessName?: string
  customerId: string
}

type Step = 'agent' | 'audit' | 'chat'

const PILL_RIGHT = 160 // pixels — left of Pomodoro (which sits at right:20)
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
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('agent')
  const [agent, setAgent] = useState<AgentKey | ''>('')
  const [audits, setAudits] = useState<AuditOption[] | null>(null)
  const [auditsLoading, setAuditsLoading] = useState(false)
  const [auditsError, setAuditsError] = useState<string | null>(null)
  const [selectedAudit, setSelectedAudit] = useState<AuditOption | null>(null)
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

  const handleAgentSelect = (val: string) => {
    if (val === 'google-ads') {
      setAgent('google-ads')
      setStep('audit')
    }
  }

  const handleAuditPick = (opt: AuditOption) => {
    setSelectedAudit(opt)
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
          onClick={() => setOpen(true)}
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
            <div style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>
              OptiMate
              {step === 'audit' && (
                <span style={{ opacity: 0.7, fontWeight: 400, marginLeft: 6, fontSize: 11 }}>
                  · Pick an audit
                </span>
              )}
              {step === 'chat' && selectedAudit && (
                <span style={{ opacity: 0.7, fontWeight: 400, marginLeft: 6, fontSize: 11 }}>
                  · {selectedAudit.businessName ?? selectedAudit.customerId}
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
                onClick={() => {
                  setSelectedAudit(null)
                  setStep('audit')
                }}
                title="Switch audit"
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
                ← Switch
              </button>
            )}
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

          {/* Panel body */}
          <div style={{ flex: 1, padding: 14, overflowY: 'auto' }}>
            {step === 'agent' && (
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
                  Choose an agent
                </label>
                <select
                  value={agent}
                  onChange={(e) => handleAgentSelect(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    border: '1px solid var(--theme-border-color, #e5e7eb)',
                    borderRadius: 6,
                    background: 'var(--theme-input-bg, #fff)',
                    color: 'var(--theme-text, #1f2937)',
                    fontSize: 13,
                  }}
                >
                  <option value="">Select an agent…</option>
                  <option value="google-ads">Google Ads</option>
                </select>
                <p style={{ fontSize: 11, color: '#6b7280', marginTop: 10 }}>
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
                  Pick a Google Ads audit
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
                  <p style={{ fontSize: 12, color: '#6b7280' }}>Loading audits…</p>
                )}
                {auditsError && (
                  <p style={{ fontSize: 12, color: '#dc2626' }}>{auditsError}</p>
                )}
                {!auditsLoading && !auditsError && filteredAudits.length === 0 && (
                  <p style={{ fontSize: 12, color: '#6b7280' }}>
                    No audits with a Customer ID found.
                  </p>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {filteredAudits.map((opt) => (
                    <button
                      key={String(opt.id)}
                      type="button"
                      onClick={() => handleAuditPick(opt)}
                      style={{
                        textAlign: 'left',
                        padding: '8px 10px',
                        border: '1px solid var(--theme-border-color, #e5e7eb)',
                        borderRadius: 6,
                        background: 'var(--theme-input-bg, #fff)',
                        color: 'var(--theme-text, #1f2937)',
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#f3f4f6'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'var(--theme-input-bg, #fff)'
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>
                        {opt.businessName || 'Untitled audit'}
                      </div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>{opt.customerId}</div>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAgent('')
                    setStep('agent')
                  }}
                  style={{
                    marginTop: 12,
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
              </div>
            )}

            {step === 'chat' && selectedAudit && (
              <OptiMateChatCore
                key={String(selectedAudit.id)}
                auditId={selectedAudit.id}
                customerId={selectedAudit.customerId}
                businessName={selectedAudit.businessName}
                compact
              />
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default OptiMateLauncher
