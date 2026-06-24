'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import OptiMateMultiChat, { type OptiMateChatTarget } from '@/components/OptiMateMultiChat'
import InvoiceAssistantChat from '@/components/InvoiceAssistantChat'
import GmailReplyChat from '@/components/GmailReplyChat'

type Props =
  | { agent?: 'google-ads'; targets: OptiMateChatTarget[] }
  | { agent: 'invoices'; targets?: undefined }
  | { agent: 'gmail'; phase?: 'compose' | 'reply' | 'summarise'; targets?: undefined }

interface AccountOption {
  id: string | number
  businessName?: string
  customerId: string
}

/**
 * Client-side wrapper for the standalone Optimate window. Renders the
 * multi-chat full-window with light chrome (header strip + close button)
 * but no admin sidebar.
 *
 * Uses `position: fixed; inset: 0` to fill the entire window viewport,
 * and lives under the (frontend) route group so no ancestor in the
 * Payload admin layout traps the fixed positioning or injects a sidebar.
 *
 * The header carries an "Accounts" button that opens a lightweight picker
 * overlay so the user can switch the Google Ads account(s) this window is
 * chatting with WITHOUT opening a fresh browser window. Picking accounts
 * reloads this same window with new `?audits=` / `?mode=portfolio` params.
 */
export default function OptimatePopoutClient(props: Props) {
  const isInvoices = props.agent === 'invoices'
  const isGmail = props.agent === 'gmail'
  const targets = isInvoices || isGmail ? [] : props.targets
  const isPortfolio = !isInvoices && !isGmail && targets.some((t) => t.mode === 'portfolio')

  // Audit ids currently open in this window, used to pre-check the picker.
  const currentAuditIds = useMemo(
    () =>
      isInvoices || isGmail
        ? []
        : targets.filter((t) => t.mode !== 'portfolio').map((t) => String(t.id)),
    [isInvoices, isGmail, targets],
  )

  const [pickerOpen, setPickerOpen] = useState(false)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--theme-input-bg, #fff)',
        color: 'var(--theme-text, #1f2937)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Header strip */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
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
          {/* Agent-name slot. The active account is surfaced inside the chat
           *  itself (tab strip / single-account body header) so we don't
           *  repeat it in the black title bar. */}
          <span
            style={{
              opacity: 0.7,
              fontWeight: 400,
              marginLeft: 6,
              fontSize: 11,
            }}
          >
            {isInvoices ? '· Invoices' : isGmail ? '· Gmail' : '· Google Ads'}
          </span>
        </div>
        {!isInvoices && !isGmail && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            title="Switch Google Ads accounts"
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
            Accounts
          </button>
        )}
        <button
          type="button"
          onClick={() => window.close()}
          title="Close window"
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

      {/* Chat body. flex:1 + minHeight:0 lets OptiMateMultiChat manage its
       *  own scrolling. */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          padding: '6px 14px 14px',
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
        }}
      >
        {isInvoices ? (
          <InvoiceAssistantChat />
        ) : isGmail ? (
          <GmailReplyChat initialPhase={props.phase === 'reply' ? 'search' : props.phase === 'summarise' ? 'search' : 'compose'} initialSummariseMode={props.phase === 'summarise'} />
        ) : (
          <OptiMateMultiChat targets={targets} fluid />
        )}
      </div>

      {!isInvoices && !isGmail && pickerOpen && (
        <AccountPickerOverlay
          currentAuditIds={currentAuditIds}
          portfolioActive={isPortfolio}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

/**
 * Modal account picker. Re-fetches the same accounts endpoint the in-CMS
 * launcher uses, lets the user select one or more (or portfolio mode), then
 * navigates THIS window to the matching popout URL. No new browser window is
 * opened — the existing window reloads with the new account scope.
 */
function AccountPickerOverlay({
  currentAuditIds,
  portfolioActive,
  onClose,
}: {
  currentAuditIds: string[]
  portfolioActive: boolean
  onClose: () => void
}) {
  const [accounts, setAccounts] = useState<AccountOption[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>(
    portfolioActive ? [] : currentAuditIds,
  )
  const [portfolioSelected, setPortfolioSelected] = useState(portfolioActive)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/optimate/google-ads-accounts', { credentials: 'include' })
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      const data = (await res.json()) as { accounts?: Array<Record<string, unknown>> }
      const docs = Array.isArray(data.accounts) ? data.accounts : []
      const opts: AccountOption[] = docs
        .map((d) => ({
          id: d.id as string | number,
          businessName: typeof d.businessName === 'string' ? d.businessName : undefined,
          customerId: typeof d.customerId === 'string' ? d.customerId : '',
        }))
        .filter((o) => o.customerId)
      setAccounts(opts)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load accounts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Close on Escape for keyboard parity with the × button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const toggleAccount = (id: string | number): void => {
    setPortfolioSelected(false)
    setSelectedIds((prev) => {
      const key = String(id)
      return prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
    })
  }

  const choosePortfolio = (): void => {
    setSelectedIds([])
    setPortfolioSelected(true)
  }

  const apply = (): void => {
    // Navigate the SAME window. Fresh threads start for the new scope (we don't
    // carry sessionIds across a scope change) which matches "switch accounts".
    const url = portfolioSelected
      ? '/optimate-popout?mode=portfolio'
      : `/optimate-popout?audits=${encodeURIComponent(selectedIds.join(','))}`
    window.location.assign(url)
  }

  const filtered = (accounts ?? []).filter((a) => {
    if (!filter.trim()) return true
    const q = filter.trim().toLowerCase()
    return (a.businessName ?? '').toLowerCase().includes(q) || a.customerId.toLowerCase().includes(q)
  })

  const canApply = portfolioSelected || selectedIds.length > 0

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Switch Google Ads accounts"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460,
          maxWidth: '100%',
          maxHeight: 'calc(100vh - 40px)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--theme-input-bg, #fff)',
          color: 'var(--theme-text, #1f2937)',
          border: '1px solid var(--theme-border-color, #e5e7eb)',
          borderRadius: 12,
          boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Overlay header */}
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
          <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>Switch accounts</span>
          <button
            type="button"
            onClick={onClose}
            title="Cancel"
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

        {/* Overlay body */}
        <div style={{ padding: 14, overflowY: 'auto' }}>
          <button
            type="button"
            onClick={choosePortfolio}
            aria-pressed={portfolioSelected}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '10px 12px',
              border: portfolioSelected ? '1px solid #1d4ed8' : 'none',
              borderRadius: 8,
              background: '#2563eb',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              marginBottom: 10,
            }}
          >
            <span aria-hidden="true">↗</span>
            Portfolio chat (all accounts)
          </button>

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

          {loading && <p style={{ fontSize: 12, color: '#6b7280' }}>Loading accounts…</p>}
          {error && <p style={{ fontSize: 12, color: '#dc2626' }}>{error}</p>}
          {!loading && !error && filtered.length === 0 && (
            <p style={{ fontSize: 12, color: '#6b7280' }}>No accounts with a Customer ID found.</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {filtered.map((opt) => {
              const checked = selectedIds.includes(String(opt.id))
              return (
                <button
                  key={String(opt.id)}
                  type="button"
                  onClick={() => toggleAccount(opt.id)}
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
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    readOnly
                    tabIndex={-1}
                    style={{ margin: 0, pointerEvents: 'none' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {opt.businessName || 'Untitled audit'}
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>{opt.customerId}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Overlay footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 8,
            padding: '10px 14px',
            borderTop: '1px solid var(--theme-border-color, #e5e7eb)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#2563eb',
              fontSize: 13,
              cursor: 'pointer',
              padding: '8px 10px',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={!canApply}
            style={{
              padding: '8px 14px',
              background: canApply ? '#2563eb' : '#9ca3af',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 13,
              cursor: canApply ? 'pointer' : 'not-allowed',
            }}
          >
            {portfolioSelected
              ? 'Open portfolio'
              : selectedIds.length <= 1
                ? 'Open account'
                : `Open ${selectedIds.length} accounts`}
          </button>
        </div>
      </div>
    </div>
  )
}
