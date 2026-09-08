'use client'

import { useCallback, useEffect, useState } from 'react'
import OptiMateMultiChat, { type OptiMateChatTarget } from '@/components/OptiMateMultiChat'
import InvoiceAssistantChat from '@/components/InvoiceAssistantChat'
import GmailReplyChat from '@/components/GmailReplyChat'
import TaskMateChat from '@/components/TaskMateChat'
import AdminMateChat from '@/components/AdminMateChat'
import { OPTIMATE_MODAL_CSS } from '@/components/optimate-modal-styles'
import RocketSplash from '@/components/RocketSplash'

type Step = 'agent' | 'audit' | 'chat' | 'invoices' | 'taskmate' | 'adminmate' | 'gmail-compose' | 'gmail-reply' | 'gmail-summarise'

interface AgentDef {
  key: string
  label: string
  icon: string
  iconSize?: number
  enabled: boolean
}

const AGENTS: AgentDef[] = [
  { key: 'google-ads', label: 'GoogleMate', icon: '/optimate-orb.png', enabled: true },
  { key: 'invoices', label: 'InvoiceMate', icon: '/invoicemate-orb.png', iconSize: 28, enabled: true },
  { key: 'taskmate', label: 'TaskMate', icon: '/taskmate-orb.png', iconSize: 28, enabled: true },
  { key: 'adminmate', label: 'AdminMate', icon: '/adminmate-orb.webp', iconSize: 28, enabled: true },
]

const QUICK_ACTIONS = [
  { step: 'gmail-compose' as Step, label: 'Draft an email', glyph: '✉', tint: '#eaf1fe', ink: '#2b6cb0' },
  { step: 'gmail-reply' as Step, label: 'Reply to an email', glyph: '↩', tint: '#fdeeee', ink: '#c2413a' },
  { step: 'gmail-summarise' as Step, label: 'Summarise an email', glyph: '≡', tint: '#eaf7ee', ink: '#2f7d47' },
]

interface AuditOption {
  id: string | number
  businessName?: string
  customerId: string
}

export default function OptiMateExpandClient({ userRole }: { userRole: string }) {
  const isAdmin = userRole === 'admin'

  const [step, setStep] = useState<Step>('agent')
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
    if (step === 'audit' && audits === null && !auditsLoading) loadAudits()
  }, [step, audits, auditsLoading, loadAudits])

  const handleAgentSelect = (key: string) => {
    if (key === 'invoices') { setStep('invoices'); return }
    if (key === 'taskmate') { setStep('taskmate'); return }
    if (key === 'adminmate') { setStep('adminmate'); return }
    setStep('audit')
  }

  const toggleAudit = (opt: AuditOption) => {
    setPortfolioSelected(false)
    setSelectedAudits((prev) => {
      const exists = prev.some((a) => String(a.id) === String(opt.id))
      return exists ? prev.filter((a) => String(a.id) !== String(opt.id)) : [...prev, opt]
    })
  }

  const filteredAudits = (audits ?? []).filter((a) => {
    if (!filter.trim()) return true
    const q = filter.trim().toLowerCase()
    return (a.businessName ?? '').toLowerCase().includes(q) || a.customerId.toLowerCase().includes(q)
  })

  const chatTargets: OptiMateChatTarget[] = portfolioSelected
    ? [{ mode: 'portfolio', id: 'portfolio', businessName: 'Portfolio' }]
    : selectedAudits.map((a) => ({ mode: 'audit' as const, id: a.id, customerId: a.customerId, businessName: a.businessName }))

  const headerTitle =
    step === 'chat' ? 'GoogleMate'
      : step === 'invoices' ? 'InvoiceMate'
        : step === 'taskmate' ? 'TaskMate'
          : step === 'adminmate' ? 'AdminMate'
            : step === 'audit' ? 'Google Ads'
              : 'OptiMate'

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--theme-input-bg, #fff)', color: 'var(--theme-text, #1f2937)', fontFamily: "'Manrope', Helvetica, Arial, sans-serif" }}>
      <style dangerouslySetInnerHTML={{ __html: OPTIMATE_MODAL_CSS }} />

      {/* Header */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--theme-border-color, #e5e7eb)', background: '#111', color: '#fff' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
          <img src="/optimate-orb.png" alt="" width={24} height={24} style={{ borderRadius: '50%', display: 'block' }} />
        </span>
        <div style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>
          {headerTitle}
          {step === 'audit' && (
            <span style={{ opacity: 0.7, fontWeight: 400, marginLeft: 6, fontSize: 11 }}>· Select accounts</span>
          )}
        </div>
        {step === 'audit' && (
          <button
            type="button"
            onClick={() => setStep('agent')}
            style={{ background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, fontSize: 11, padding: '3px 8px', cursor: 'pointer' }}
          >
            ← Agents
          </button>
        )}
        {step === 'chat' && (
          <button
            type="button"
            onClick={() => setStep('audit')}
            style={{ background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, fontSize: 11, padding: '3px 8px', cursor: 'pointer' }}
          >
            ← Accounts
          </button>
        )}
        {(step === 'invoices' || step === 'taskmate' || step === 'adminmate' || step === 'gmail-compose' || step === 'gmail-reply' || step === 'gmail-summarise') && (
          <button
            type="button"
            onClick={() => setStep('agent')}
            style={{ background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, fontSize: 11, padding: '3px 8px', cursor: 'pointer' }}
          >
            ← Agents
          </button>
        )}
        <button
          type="button"
          onClick={() => window.close()}
          title="Close window"
          style={{ background: 'transparent', color: '#fff', border: 'none', fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: '0 4px' }}
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: step === 'agent' || step === 'audit' ? 16 : '6px 14px 14px', display: step === 'chat' || step === 'invoices' || step === 'taskmate' || step === 'adminmate' || step === 'gmail-compose' || step === 'gmail-reply' || step === 'gmail-summarise' ? 'flex' : 'block', flexDirection: 'column', width: '100%' }}>
        {/* ---- Agent picker ---- */}
        {step === 'agent' && (
          <div className="om-s1">
            <div className="om-group">
              <span className="om-label">Choose an agent</span>
              <div className="om-agents">
                {AGENTS.filter((a) => (a.key !== 'taskmate' && a.key !== 'adminmate') || isAdmin).map((a) => (
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
                    <span className="om-action-ico" style={{ background: action.tint, color: action.ink }} aria-hidden="true">
                      {action.glyph}
                    </span>
                    <b>{action.label}</b>
                    <span className="om-chev" aria-hidden="true">›</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ---- Audit picker ---- */}
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

            <button
              type="button"
              className="om-portfolio"
              onClick={() => { setSelectedAudits([]); setPortfolioSelected(true); setStep('chat') }}
            >
              <span className="om-portfolio-ico" aria-hidden="true">◱</span>
              <span className="om-portfolio-copy">
                <b>Start portfolio chat</b>
                <span>Ask across every account at once</span>
              </span>
              <span className="om-portfolio-go" aria-hidden="true">→</span>
            </button>

            <div className="om-accounts">
              {auditsLoading && <div className="om-accounts-loading"><RocketSplash compact onLight /></div>}
              {auditsError && <p className="om-accounts-msg is-error">{auditsError}</p>}
              {!auditsLoading && !auditsError && filteredAudits.length === 0 && <p className="om-accounts-msg">No accounts with a Customer ID found.</p>}
              {filteredAudits.map((opt) => {
                const checked = selectedAudits.some((a) => String(a.id) === String(opt.id))
                return (
                  <button
                    key={opt.id}
                    type="button"
                    className={`om-acct${checked ? ' is-on' : ''}`}
                    onClick={() => toggleAudit(opt)}
                    aria-pressed={checked}
                  >
                    <span className="om-acct-box" aria-hidden="true">{checked ? '✓' : ''}</span>
                    <span className="om-acct-txt">
                      <span className="om-acct-name">{opt.businessName || 'Untitled audit'}</span>
                      <span className="om-acct-id">{opt.customerId}</span>
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="om-foot">
              <span className="om-count">
                {portfolioSelected ? 'Portfolio selected' : selectedAudits.length === 0 ? 'No accounts selected' : `${selectedAudits.length} selected`}
              </span>
              <div className="om-btnrow">
                <button type="button" className="om-btn" onClick={() => { setSelectedAudits([]); setPortfolioSelected(false); setStep('agent') }}>← Agents</button>
                <button
                  type="button"
                  className={`om-btn om-btn--primary${selectedAudits.length > 0 || portfolioSelected ? ' is-ready' : ''}`}
                  onClick={() => { if (selectedAudits.length > 0 || portfolioSelected) setStep('chat') }}
                  disabled={selectedAudits.length === 0 && !portfolioSelected}
                >
                  {portfolioSelected ? 'Continue with portfolio' : selectedAudits.length === 0 ? 'Select accounts' : selectedAudits.length === 1 ? 'Continue' : `Continue with ${selectedAudits.length}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ---- Chat views ---- */}
        {step === 'chat' && chatTargets.length > 0 && (
          <OptiMateMultiChat targets={chatTargets} fluid />
        )}
        {step === 'invoices' && <InvoiceAssistantChat />}
        {step === 'taskmate' && <TaskMateChat />}
        {step === 'adminmate' && <AdminMateChat />}
        {step === 'gmail-compose' && <GmailReplyChat initialPhase="compose" />}
        {step === 'gmail-reply' && <GmailReplyChat initialPhase="search" />}
        {step === 'gmail-summarise' && <GmailReplyChat initialPhase="search" initialSummariseMode />}
      </div>
    </div>
  )
}
