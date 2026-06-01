'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

// ─── Types ────────────────────────────────────────────────

interface StatementInvoice {
  invoiceId: string
  invoiceNumber: string
  reference: string
  date: string
  dueDate: string
  total: number
  amountDue: number
  status: string
  onlineInvoiceUrl: string | null
}

interface StatementSnapshot {
  contact: {
    contactId: string
    contactName: string
    firstName: string
    lastName: string
    emailAddress: string
  }
  unpaid: StatementInvoice[]
  paid: StatementInvoice[]
  totalOutstanding: number
  totalOverdue: number
  unpaidCount: number
  overdueCount: number
  capturedAt: string
}

interface DraftRow {
  id: number
  status: 'pending' | 'approved' | 'rejected' | 'failed' | 'expired'
  generatedAt: string
  xeroContactId: string
  contactName: string
  recipientEmail: string
  totalOutstanding: number
  totalOverdue: number
  unpaidCount: number
  overdueCount: number
  snapshot: StatementSnapshot
  customMessage: string | null
  greetingOverride: string | null
  reviewedAt: string | null
  sentAt: string | null
  postmarkMessageId: string | null
  ccList: string | null
  sendError: string | null
  rejectionReason: string | null
  lastRefreshedAt: string | null
}

interface PendingSummary {
  pendingCount: number
  totalOutstanding: number
  sentThisMonth: number
  monthlyCap: number
}

// ─── Helpers ──────────────────────────────────────────────

function formatAud(n: number): string {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 })
}

function formatDate(s: string | null): string {
  if (!s) return '\u2014'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return '\u2014'
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function relativeAge(iso: string | null): string {
  if (!iso) return '\u2014'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '\u2014'
  const ms = Date.now() - d.getTime()
  const h = Math.floor(ms / (1000 * 60 * 60))
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  return `${days}d ago`
}

function isStale(iso: string | null): boolean {
  if (!iso) return true
  const ms = Date.now() - new Date(iso).getTime()
  return ms > 24 * 60 * 60 * 1000
}

// ─── Styles ───────────────────────────────────────────────

const card: React.CSSProperties = {
  background: 'var(--theme-elevation-0)',
  border: '1px solid var(--theme-elevation-100)',
  borderRadius: 8,
  marginBottom: 20,
  overflow: 'hidden',
}

const cardHead: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 16px',
  borderBottom: '1px solid var(--theme-elevation-100)',
}

const thStyle: React.CSSProperties = {
  padding: '8px 12px',
  textAlign: 'left',
  fontWeight: 600,
  color: '#6b7280',
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderBottom: '2px solid var(--theme-elevation-100)',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 13,
  whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--theme-elevation-50)',
}

const badge = (bg: string, color: string): React.CSSProperties => ({
  display: 'inline-block',
  padding: '2px 10px',
  borderRadius: 9999,
  fontSize: 11,
  fontWeight: 600,
  background: bg,
  color,
})

const btnPrimary: React.CSSProperties = {
  background: '#16a34a',
  color: '#fff',
  border: 0,
  padding: '8px 16px',
  borderRadius: 6,
  fontWeight: 600,
  cursor: 'pointer',
}

const btnSecondary: React.CSSProperties = {
  background: 'var(--theme-elevation-50)',
  color: 'var(--theme-elevation-700)',
  border: '1px solid var(--theme-elevation-100)',
  padding: '8px 16px',
  borderRadius: 6,
  cursor: 'pointer',
}

const btnDanger: React.CSSProperties = {
  background: '#fff',
  color: '#b91c1c',
  border: '1px solid #fecaca',
  padding: '8px 16px',
  borderRadius: 6,
  cursor: 'pointer',
}

// ─── Cap meter ─────────────────────────────────────────────

function CapMeter({ summary }: { summary: PendingSummary | null }) {
  if (!summary) {
    return (
      <div style={{ ...card, padding: 12, fontSize: 13, color: 'var(--theme-elevation-500)' }}>
        Loading summary…
      </div>
    )
  }
  const pct = summary.monthlyCap > 0 ? (summary.sentThisMonth / summary.monthlyCap) * 100 : 0
  const color = pct >= 95 ? '#dc2626' : pct >= 80 ? '#d97706' : '#6b7280'

  return (
    <div style={{ ...card, padding: 14, marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--theme-elevation-500)', marginBottom: 4 }}>
            Statements sent this month
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color }}>
            {summary.sentThisMonth} / {summary.monthlyCap}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          <Kpi label="Pending" value={String(summary.pendingCount)} />
          <Kpi label="Total outstanding" value={formatAud(summary.totalOutstanding)} />
        </div>
      </div>
      <div style={{ height: 6, background: 'var(--theme-elevation-50)', borderRadius: 9999, marginTop: 10, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, transition: 'width 200ms' }} />
      </div>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--theme-elevation-500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600 }}>{value}</div>
    </div>
  )
}

// ─── Status pill ───────────────────────────────────────────

function StatusPill({ status }: { status: DraftRow['status'] }) {
  const palette: Record<DraftRow['status'], { bg: string; color: string; label: string }> = {
    pending: { bg: '#fef3c7', color: '#92400e', label: 'Pending' },
    approved: { bg: '#dcfce7', color: '#166534', label: 'Sent' },
    rejected: { bg: '#f3f4f6', color: '#374151', label: 'Rejected' },
    failed: { bg: '#fee2e2', color: '#b91c1c', label: 'Failed' },
    expired: { bg: '#f3f4f6', color: '#6b7280', label: 'Expired' },
  }
  const p = palette[status]
  return <span style={badge(p.bg, p.color)}>{p.label}</span>
}

// ─── Review modal ──────────────────────────────────────────

interface ReviewModalProps {
  draft: DraftRow
  onClose: () => void
  onUpdated: () => void
}

function ReviewModal({ draft: initialDraft, onClose, onUpdated }: ReviewModalProps) {
  const [draft, setDraft] = useState(initialDraft)
  const [customMessage, setCustomMessage] = useState(initialDraft.customMessage ?? '')
  const [greetingOverride, setGreetingOverride] = useState(initialDraft.greetingOverride ?? '')
  const [recipientOverride, setRecipientOverride] = useState(initialDraft.recipientEmail ?? '')
  const [previewHtml, setPreviewHtml] = useState<string>('')
  const [previewSubject, setPreviewSubject] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [rejectMode, setRejectMode] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const refreshPreview = useCallback(
    async (msg: string, greeting: string) => {
      try {
        const res = await fetch(`/api/invoice-statements/${draft.id}/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customMessage: msg, greetingOverride: greeting }),
        })
        const data = await res.json()
        if (res.ok) {
          setPreviewHtml(data.html ?? '')
          setPreviewSubject(data.subject ?? '')
        } else {
          setError(data.error ?? 'Preview failed')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    [draft.id],
  )

  useEffect(() => {
    setLoading(true)
    // On open, pull live data from Xero once (re-pull + URL union + sticky +
    // persist) so payment links are current and durable. refreshSnapshot ends
    // by rendering the preview. Pending + failed drafts can be refreshed (a
    // failed send is retryable); approved/expired/rejected are terminal, so we
    // just render the stored snapshot.
    if (draft.status === 'pending' || draft.status === 'failed') {
      void refreshSnapshot()
    } else {
      void refreshPreview(customMessage, greetingOverride)
    }
    // initial load only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.id])

  // Debounce preview when custom message or greeting override changes.
  useEffect(() => {
    const t = setTimeout(() => {
      void refreshPreview(customMessage, greetingOverride)
    }, 300)
    return () => clearTimeout(t)
  }, [customMessage, greetingOverride, refreshPreview])

  const refreshSnapshot = async () => {
    setRefreshing(true)
    setError(null)
    try {
      const res = await fetch(`/api/invoice-statements/${draft.id}/refresh-snapshot`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Refresh failed')
      if (data.allPaid) {
        setError('Client has paid everything since the sweep. Rejecting this draft is probably the right call.')
      } else {
        setDraft((prev) => ({
          ...prev,
          snapshot: data.snapshot,
          totalOutstanding: data.snapshot.totalOutstanding,
          totalOverdue: data.snapshot.totalOverdue,
          unpaidCount: data.snapshot.unpaidCount,
          overdueCount: data.snapshot.overdueCount,
          lastRefreshedAt: data.refreshedAt,
        }))
      }
      await refreshPreview(customMessage, greetingOverride)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRefreshing(false)
    }
  }

  const approveSend = async () => {
    if (!recipientOverride) {
      setError('Recipient email is required.')
      return
    }
    const ccLine = draft.snapshot.unpaid.length > 0
      ? `Will email ${draft.snapshot.unpaidCount} invoices totalling ${formatAud(draft.totalOutstanding)} and CC peter@optimisedigital.online.`
      : ''
    const resendNote = draft.status === 'approved'
      ? `\n\nThis is a RESEND \u2014 the previous statement was already sent on ${formatDate(draft.sentAt)} to ${draft.recipientEmail || '(unknown)'}.`
      : ''
    if (!window.confirm(`Send to ${recipientOverride}? ${ccLine}${resendNote}`)) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/invoice-statements/${draft.id}/approve-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customMessage,
          greetingOverride,
          recipientEmailOverride: recipientOverride,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Send failed (${res.status})`)
      onUpdated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const submitReject = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/invoice-statements/${draft.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Reject failed (${res.status})`)
      onUpdated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const stale = isStale(draft.lastRefreshedAt)
  const recipientMissing = !recipientOverride.trim()
  const alreadySent = draft.status === 'approved' && Boolean(draft.sentAt)
  const canSend = !recipientMissing

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999,
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--theme-elevation-0)',
          borderRadius: 8,
          maxWidth: 1200,
          width: '100%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--theme-elevation-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{draft.contactName}</div>
            <div style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>
              Generated {formatDate(draft.generatedAt)} · Last refreshed {relativeAge(draft.lastRefreshedAt)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={refreshSnapshot} disabled={refreshing} style={btnSecondary}>
              {refreshing ? 'Refreshing\u2026' : 'Refresh from Xero'}
            </button>
            <button onClick={onClose} style={btnSecondary}>Close</button>
          </div>
        </div>

        {stale && (
          <div style={{ padding: '10px 20px', background: '#fef3c7', borderBottom: '1px solid #fde68a', fontSize: 13, color: '#92400e' }}>
            <span>Snapshot is over 24h old. Status may have changed in Xero — click “Refresh from Xero” above.</span>
          </div>
        )}

        {alreadySent && (
          <div style={{ padding: '10px 20px', background: '#dcfce7', borderBottom: '1px solid #bbf7d0', fontSize: 13, color: '#166534' }}>
            <div>
              <strong>Already sent</strong> on {formatDate(draft.sentAt)} ({relativeAge(draft.sentAt)}) to <strong>{draft.recipientEmail || '(unknown)'}</strong>
              {draft.ccList ? <> · CC: {draft.ccList}</> : null}
              {draft.postmarkMessageId ? <> · Brevo ID: <code style={{ fontSize: 11 }}>{draft.postmarkMessageId}</code></> : null}
            </div>
          </div>
        )}

        {error && (
          <div style={{ padding: '10px 20px', background: '#fee2e2', borderBottom: '1px solid #fecaca', fontSize: 13, color: '#b91c1c' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', flex: 1, minHeight: 0 }}>
          {/* Left: editor */}
          <div style={{ padding: 20, borderRight: '1px solid var(--theme-elevation-100)', overflowY: 'auto' }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--theme-elevation-600)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Custom message (optional)
            </label>
            <textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Anything you want to say above the invoice table\u2026"
              rows={5}
              style={{ width: '100%', marginTop: 6, padding: 10, border: '1px solid var(--theme-elevation-100)', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
            />

            <label style={{ display: 'block', marginTop: 16, fontSize: 12, fontWeight: 600, color: 'var(--theme-elevation-600)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Greeting override (optional)
            </label>
            <input
              type="text"
              value={greetingOverride}
              onChange={(e) => setGreetingOverride(e.target.value)}
              placeholder={`Hi ${draft.snapshot.contact.firstName || draft.contactName.split(' ')[0]},`}
              style={{ width: '100%', marginTop: 6, padding: 8, border: '1px solid var(--theme-elevation-100)', borderRadius: 6, fontSize: 13 }}
            />
            <div style={{ fontSize: 12, color: 'var(--theme-elevation-500)', marginTop: 6 }}>
              Replaces only the “Hi [name],” line at the top of the email. Leave blank to use the template default. Useful when the Xero contact name is wrong (e.g. “Accounts Payable”).
            </div>

            <label style={{ display: 'block', marginTop: 16, fontSize: 12, fontWeight: 600, color: 'var(--theme-elevation-600)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Recipient(s)
            </label>
            <input
              type="text"
              value={recipientOverride}
              onChange={(e) => setRecipientOverride(e.target.value)}
              placeholder="primary@client.com, secondary@client.com"
              style={{ width: '100%', marginTop: 6, padding: 8, border: '1px solid var(--theme-elevation-100)', borderRadius: 6, fontSize: 13 }}
            />
            <div style={{ fontSize: 12, color: 'var(--theme-elevation-500)', marginTop: 6 }}>
              Comma-separated for multiple. Will CC: <strong>peter@optimisedigital.online</strong>
            </div>

            <div style={{ marginTop: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--theme-elevation-600)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Invoices ({draft.snapshot.unpaid.length})
              </label>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, padding: '6px 8px' }}>#</th>
                    <th style={{ ...thStyle, padding: '6px 8px' }}>Due</th>
                    <th style={{ ...thStyle, padding: '6px 8px', textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.snapshot.unpaid.map((inv) => (
                    <tr key={inv.invoiceId}>
                      <td style={{ ...tdStyle, padding: '6px 8px' }}>{inv.invoiceNumber}</td>
                      <td style={{ ...tdStyle, padding: '6px 8px' }}>{formatDate(inv.dueDate)}</td>
                      <td style={{ ...tdStyle, padding: '6px 8px', textAlign: 'right' }}>{formatAud(inv.amountDue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {rejectMode && (
              <div style={{ marginTop: 20 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--theme-elevation-600)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Rejection reason
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  style={{ width: '100%', marginTop: 6, padding: 10, border: '1px solid var(--theme-elevation-100)', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }}
                />
              </div>
            )}
          </div>

          {/* Right: preview */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--theme-elevation-100)', background: 'var(--theme-elevation-50)', fontSize: 12, color: 'var(--theme-elevation-600)' }}>
              <strong>Subject:</strong> {previewSubject || '\u2014'}
            </div>
            <div style={{ flex: 1, background: '#f3f4f6', overflow: 'hidden' }}>
              {loading ? (
                <div style={{ padding: 30, color: 'var(--theme-elevation-500)' }}>Building preview\u2026</div>
              ) : (
                <iframe
                  // Keyed by content length so React fully remounts the
                  // iframe when the HTML changes. Some browsers do not
                  // reliably re-render srcDoc updates on the same DOM node.
                  key={previewHtml.length}
                  title="Statement preview"
                  srcDoc={previewHtml}
                  // allow-popups + allow-popups-to-escape-sandbox so View &
                  // pay links open in a new tab when the team tests the
                  // preview. Without this, clicks blink and do nothing.
                  sandbox="allow-popups allow-popups-to-escape-sandbox"
                  style={{ width: '100%', height: '100%', minHeight: 500, border: 0, background: '#fff' }}
                />
              )}
            </div>
          </div>
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--theme-elevation-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            {rejectMode ? (
              <button onClick={() => setRejectMode(false)} style={btnSecondary} disabled={busy}>
                Cancel reject
              </button>
            ) : (
              <button onClick={() => setRejectMode(true)} style={btnDanger} disabled={busy}>
                Reject
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={btnSecondary} disabled={busy}>
              Cancel
            </button>
            {rejectMode ? (
              <button onClick={submitReject} style={{ ...btnPrimary, background: '#b91c1c' }} disabled={busy}>
                {busy ? 'Rejecting\u2026' : 'Confirm reject'}
              </button>
            ) : (
              <button
                onClick={approveSend}
                style={{ ...btnPrimary, opacity: canSend ? 1 : 0.5 }}
                disabled={busy || !canSend}
                title={
                  recipientMissing
                    ? 'Add email address in Xero first'
                    : ''
                }
              >
                {busy
                  ? 'Sending\u2026'
                  : draft.status === 'failed'
                    ? 'Retry send'
                    : alreadySent
                      ? 'Resend'
                      : 'Approve & Send'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────

export default function InvoiceStatementsPage() {
  const [drafts, setDrafts] = useState<DraftRow[]>([])
  const [summary, setSummary] = useState<PendingSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [sweeping, setSweeping] = useState(false)
  const [sweepResult, setSweepResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeDraft, setActiveDraft] = useState<DraftRow | null>(null)
  const [tab, setTab] = useState<'pending' | 'recent'>('pending')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [draftsRes, summaryRes] = await Promise.all([
        fetch('/api/invoice-statement-drafts?limit=200&sort=-totalOverdue&depth=0'),
        fetch('/api/invoice-statements/pending-summary'),
      ])
      if (draftsRes.ok) {
        const j = await draftsRes.json()
        setDrafts((j.docs ?? []) as DraftRow[])
      }
      if (summaryRes.ok) {
        setSummary((await summaryRes.json()) as PendingSummary)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const runSweep = useCallback(async () => {
    if (
      !window.confirm(
        'Re-pull all outstanding invoices from Xero and refresh pending drafts? This will pick up clients with new outstanding invoices and update existing drafts with the latest amounts.',
      )
    ) {
      return
    }
    setSweeping(true)
    setSweepResult(null)
    setError(null)
    try {
      const res = await fetch('/api/invoice-statements/sweep', { method: 'POST' })
      const body = (await res.json().catch(() => ({}))) as {
        generated?: number
        updatedPending?: number
        expired?: number
        contactsProcessed?: number
        error?: string
      }
      if (!res.ok) {
        setError(body.error ?? `Sweep failed (${res.status})`)
      } else {
        setSweepResult(
          `Sweep complete \u2014 ${body.contactsProcessed ?? 0} contact(s) processed, ` +
            `${body.generated ?? 0} new draft(s), ${body.updatedPending ?? 0} updated, ` +
            `${body.expired ?? 0} expired.`,
        )
        await load()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSweeping(false)
    }
  }, [load])

  const pending = useMemo(
    () => drafts.filter((d) => d.status === 'pending' || d.status === 'failed'),
    [drafts],
  )
  const recent = useMemo(
    () => drafts.filter((d) => d.status !== 'pending').slice(0, 30),
    [drafts],
  )

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>
            Finance › Invoice Statements
          </div>
          <h1 style={{ fontSize: 24, margin: '4px 0 0 0' }}>Invoice Statements</h1>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div
            style={{
              fontSize: 11,
              lineHeight: 1.4,
              color: 'var(--theme-elevation-500)',
              maxWidth: 260,
              textAlign: 'right',
            }}
          >
            <div>
              <strong>Refresh list</strong>: reload this page from the CMS (fast,
              no Xero call).
            </div>
            <div>
              <strong>Refresh sweep from Xero</strong>: re-pull live data from
              Xero, add/update drafts (slow).
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => void load()}
              style={btnSecondary}
              disabled={loading || sweeping}
              title="Reloads the drafts shown on this page from the CMS. Does not contact Xero — use this to see the latest saved drafts after a sweep or someone else's changes."
            >
              {loading ? 'Loading\u2026' : 'Refresh list'}
            </button>
            <button
              onClick={() => void runSweep()}
              style={btnPrimary}
              disabled={sweeping || loading}
              title="Re-pulls all outstanding invoices live from Xero: creates new drafts for clients who now qualify, updates existing pending drafts with the latest amounts and payment links, and expires stale ones. Slower — it hits the Xero API."
            >
              {sweeping ? 'Sweeping\u2026' : 'Refresh sweep from Xero'}
            </button>
          </div>
        </div>
      </div>

      {sweepResult && (
        <div
          style={{
            padding: 12,
            background: '#dcfce7',
            color: '#166534',
            borderRadius: 6,
            fontSize: 13,
            marginBottom: 14,
          }}
        >
          {sweepResult}
        </div>
      )}

      <CapMeter summary={summary} />

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <button
          onClick={() => setTab('pending')}
          style={{
            ...btnSecondary,
            background: tab === 'pending' ? 'var(--theme-elevation-100)' : 'var(--theme-elevation-0)',
            fontWeight: tab === 'pending' ? 600 : 400,
          }}
        >
          Pending review ({pending.length})
        </button>
        <button
          onClick={() => setTab('recent')}
          style={{
            ...btnSecondary,
            background: tab === 'recent' ? 'var(--theme-elevation-100)' : 'var(--theme-elevation-0)',
            fontWeight: tab === 'recent' ? 600 : 400,
          }}
        >
          Recent activity ({recent.length})
        </button>
      </div>

      {error && (
        <div style={{ padding: 12, background: '#fee2e2', color: '#b91c1c', borderRadius: 6, fontSize: 13, marginBottom: 14 }}>
          {error}
        </div>
      )}

      <div style={card}>
        <div style={cardHead}>
          <strong>{tab === 'pending' ? 'Pending drafts' : 'Recent activity'}</strong>
        </div>
        <div style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'auto' }}>
            <thead>
              <tr>
                <th style={thStyle}>Client</th>
                <th style={{ ...thStyle, maxWidth: 180 }}>Recipient</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Invoices</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Outstanding</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Overdue</th>
                <th style={thStyle}>Generated</th>
                <th style={thStyle}>Last sent</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {(tab === 'pending' ? pending : recent).map((d) => {
                const stale = isStale(d.lastRefreshedAt) && d.status === 'pending'
                return (
                  <tr
                    key={d.id}
                    style={{
                      cursor: 'pointer',
                      ...(d.status === 'failed' ? { background: '#fef2f2' } : {}),
                    }}
                    onClick={() => setActiveDraft(d)}
                  >
                    <td style={tdStyle}>
                      <strong>{d.contactName}</strong>
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        maxWidth: 180,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={d.recipientEmail || ''}
                    >
                      {d.recipientEmail || <span style={{ color: '#dc2626' }}>(no email)</span>}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{d.unpaidCount}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{formatAud(d.totalOutstanding)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: d.totalOverdue > 0 ? '#b91c1c' : 'inherit' }}>
                      {formatAud(d.totalOverdue)}
                    </td>
                    <td style={tdStyle}>
                      {formatDate(d.generatedAt)}
                      {stale && (
                        <span style={{ marginLeft: 6, fontSize: 11, color: '#d97706' }}>(stale)</span>
                      )}
                    </td>
                    <td style={tdStyle} title={d.sentAt ?? ''}>
                      {d.sentAt ? (
                        <span>
                          {formatDate(d.sentAt)}
                          <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--theme-elevation-500)' }}>
                            ({relativeAge(d.sentAt)})
                          </span>
                        </span>
                      ) : (
                        '\u2014'
                      )}
                    </td>
                    <td style={tdStyle}>
                      <StatusPill status={d.status} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setActiveDraft(d)
                        }}
                        style={{ ...btnSecondary, padding: '4px 12px', fontSize: 12 }}
                      >
                        {d.status === 'failed' ? 'Retry' : 'Review'}
                      </button>
                    </td>
                  </tr>
                )
              })}
              {(tab === 'pending' ? pending : recent).length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: 30, textAlign: 'center', color: 'var(--theme-elevation-500)' }}>
                    {loading ? 'Loading\u2026' : 'No drafts.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {activeDraft && (
        <ReviewModal
          draft={activeDraft}
          onClose={() => setActiveDraft(null)}
          onUpdated={() => void load()}
        />
      )}
    </div>
  )
}
