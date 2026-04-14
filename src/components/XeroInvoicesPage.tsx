'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import './XeroInvoiceChat.css'

// ─── Types ────────────────────────────────────────────────

interface XeroInvoice {
  invoiceNumber: string
  contact: { name: string }
  total: number
  amountDue: number
  dueDate: string
  status: string
  isOverdue: boolean
  reference: string
}

interface XeroInvoiceSummary {
  totalOutstanding: number
  totalOverdue: number
  overdueCount: number
  unpaidCount: number
  draftCount: number
  recentInvoices: XeroInvoice[]
}

interface XeroScheduledSend {
  invoiceId: string
  sendDate: string | null
  description: string
  status: 'draft' | 'scheduled'
  contact: string
  total: number
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'error'
  content: string
}

// Tools that modify data — used to trigger a table refresh after chat actions
const MUTATING_TOOLS = new Set([
  'createInvoice',
  'approveInvoice',
  'sendInvoice',
  'scheduleSend',
])

// ─── Helpers ──────────────────────────────────────────────

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

function formatCurrency(n: number) {
  return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
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
  padding: '14px 20px',
  borderBottom: '1px solid var(--theme-elevation-100)',
}

const cardTitle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 15,
  color: 'var(--theme-elevation-800)',
}

const kpiRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(5, 1fr)',
  gap: 0,
  borderBottom: '1px solid var(--theme-elevation-100)',
}

const kpi: React.CSSProperties = {
  padding: '16px 20px',
  textAlign: 'center' as const,
  borderRight: '1px solid var(--theme-elevation-50)',
}

const kpiValue: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  lineHeight: 1.2,
}

const kpiLabel: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--theme-elevation-500)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  marginTop: 4,
}

const thStyle: React.CSSProperties = {
  padding: '10px 16px',
  textAlign: 'left',
  fontWeight: 600,
  color: '#6b7280',
  whiteSpace: 'nowrap',
  fontSize: 12,
  borderBottom: '2px solid var(--theme-elevation-100)',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 16px',
  fontSize: 13,
  whiteSpace: 'nowrap',
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

const refreshBtn: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--theme-elevation-500)',
  background: 'none',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 4,
  cursor: 'pointer',
  padding: '4px 12px',
}

// ─── Invoice Chat Panel ───────────────────────────────────

function InvoiceChatPanel({ onDataChange }: { onDataChange: () => void }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, sending, scrollToBottom])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending) return

    setInput('')
    setSending(true)
    setMessages((prev) => [...prev, { role: 'user', content: text }])

    // Build history from existing messages (user + assistant only)
    const history = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch('/api/xero/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      })

      const data = await res.json()

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: 'error', content: data.error || `Request failed (${res.status})` },
        ])
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.reply },
        ])

        // If any mutating tool was called, refresh the invoice tables
        const didMutate = data.actions?.some(
          (a: { tool: string }) => MUTATING_TOOLS.has(a.tool)
        )
        if (didMutate) onDataChange()
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'error',
          content: err instanceof Error ? err.message : 'Failed to reach the AI assistant',
        },
      ])
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    setMessages([])
  }

  return (
    <div className="xero-chat">
      <div
        className={`xero-chat__header ${open ? 'xero-chat__header--open' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="xero-chat__header-left">
          <img src="/optimate-icon.png" alt="OptiMate" style={{ width: 22, height: 22, borderRadius: 4, objectFit: 'contain' }} />
          <span>Invoice Assistant</span>
        </div>
        <div className="xero-chat__header-actions">
          {open && messages.length > 0 && (
            <button type="button" className="xero-chat__btn-icon" onClick={handleClear}>
              Clear
            </button>
          )}
          <span className={`xero-chat__expand-icon ${open ? 'xero-chat__expand-icon--open' : ''}`}>
            ▾
          </span>
        </div>
      </div>

      <div className={`xero-chat__body ${open ? 'xero-chat__body--open' : ''}`}>
        <div className="xero-chat__messages">
          {messages.length === 0 && !sending && (
            <div className="xero-chat__empty">
              Ask me to create, send, or schedule invoices…
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`xero-chat__msg xero-chat__msg--${msg.role}`}>
              {msg.content}
            </div>
          ))}

          {sending && (
            <div className="xero-chat__typing">
              <div className="xero-chat__typing-dot" />
              <div className="xero-chat__typing-dot" />
              <div className="xero-chat__typing-dot" />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="xero-chat__input-bar">
          <input
            type="text"
            className="xero-chat__input"
            placeholder="e.g. Create an invoice for Malcolm Thompson Pumps for this month's retainer"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
          />
          <button
            type="button"
            className="xero-chat__send-btn"
            onClick={handleSend}
            disabled={sending || !input.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────

export default function XeroInvoicesPage() {
  const [invoices, setInvoices] = useState<XeroInvoiceSummary | null>(null)
  const [scheduled, setScheduled] = useState<XeroScheduledSend[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = async () => {
    try {
      const [invRes, schedRes] = await Promise.all([
        fetch('/api/xero/invoices'),
        fetch('/api/xero/scheduled-sends'),
      ])

      if (!invRes.ok) throw new Error(`Invoice fetch failed (${invRes.status})`)

      const invData = await invRes.json()
      const schedData = schedRes.ok ? await schedRes.json() : []

      if (invData.error) throw new Error(invData.error)

      setInvoices(invData)
      setScheduled(Array.isArray(schedData) ? schedData : [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load Xero data')
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 300_000) // 5 min
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--theme-elevation-400)' }}>
        Loading Xero data...
      </div>
    )
  }

  if (error || !invoices) {
    return (
      <div style={{ padding: '40px 0' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Xero Invoices</h2>
        <div style={{ ...card, padding: '40px 20px', textAlign: 'center' }}>
          <p style={{ color: '#ef4444', fontSize: 14, margin: '0 0 12px' }}>
            {error || 'Could not load Xero data'}
          </p>
          <p style={{ color: 'var(--theme-elevation-400)', fontSize: 13, margin: 0 }}>
            Check that Growth Tools is running and Xero OAuth tokens are valid.
          </p>
          <button type="button" onClick={handleRefresh} style={{ ...refreshBtn, marginTop: 16 }}>
            {refreshing ? 'Retrying...' : 'Retry'}
          </button>
        </div>
      </div>
    )
  }

  const sortedScheduled = [...scheduled].sort((a, b) => {
    // Scheduled items first, then drafts
    if (a.status !== b.status) return a.status === 'scheduled' ? -1 : 1
    // Within same status, sort by sendDate (nulls last)
    if (!a.sendDate) return 1
    if (!b.sendDate) return -1
    return new Date(a.sendDate).getTime() - new Date(b.sendDate).getTime()
  })

  return (
    <div style={{ padding: '24px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Xero Invoices</h2>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          style={{ ...refreshBtn, opacity: refreshing ? 0.5 : 1, cursor: refreshing ? 'not-allowed' : 'pointer' }}
        >
          {refreshing ? 'Refreshing...' : 'Refresh ↻'}
        </button>
      </div>

      {/* KPI Summary */}
      <div style={card}>
        <div style={kpiRow}>
          <div style={kpi}>
            <div style={kpiValue}>{formatCurrency(invoices.totalOutstanding)}</div>
            <div style={kpiLabel}>Outstanding</div>
          </div>
          <div style={kpi}>
            <div style={{ ...kpiValue, color: invoices.totalOverdue > 0 ? '#ef4444' : undefined }}>
              {formatCurrency(invoices.totalOverdue)}
            </div>
            <div style={kpiLabel}>Overdue</div>
          </div>
          <div style={kpi}>
            <div style={kpiValue}>{invoices.unpaidCount}</div>
            <div style={kpiLabel}>Unpaid</div>
          </div>
          <div style={kpi}>
            <div style={{ ...kpiValue, color: invoices.overdueCount > 0 ? '#ef4444' : undefined }}>
              {invoices.overdueCount}
            </div>
            <div style={kpiLabel}>Overdue</div>
          </div>
          <div style={kpi}>
            <div style={{ ...kpiValue, color: invoices.draftCount > 0 ? '#f59e0b' : undefined }}>
              {invoices.draftCount}
            </div>
            <div style={kpiLabel}>Drafts</div>
          </div>
        </div>
      </div>

      {/* Unpaid Invoices Table */}
      <div style={card}>
        <div style={cardHead}>
          <span style={cardTitle}>Unpaid Invoices</span>
          <span style={{ fontSize: 12, color: 'var(--theme-elevation-400)' }}>
            {invoices.recentInvoices.length} invoice{invoices.recentInvoices.length !== 1 ? 's' : ''}
          </span>
        </div>

        {invoices.recentInvoices.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Client</th>
                  <th style={thStyle}>Invoice #</th>
                  <th style={thStyle}>Description</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Amount Due</th>
                  <th style={thStyle}>Due Date</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.recentInvoices.map((inv) => (
                  <tr
                    key={inv.invoiceNumber}
                    style={{
                      borderBottom: '1px solid var(--theme-elevation-50)',
                      background: inv.isOverdue ? 'rgba(239, 68, 68, 0.04)' : undefined,
                    }}
                  >
                    <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--theme-elevation-800)' }}>
                      {inv.contact.name}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--theme-elevation-500)' }}>
                      {inv.invoiceNumber}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--theme-elevation-500)' }}>
                      {inv.reference || '—'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--theme-elevation-600)' }}>
                      {formatCurrency(inv.total)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>
                      {formatCurrency(inv.amountDue)}
                    </td>
                    <td style={tdStyle}>
                      {formatDate(inv.dueDate)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span style={
                        inv.isOverdue
                          ? badge('#fef2f2', '#b91c1c')
                          : inv.status === 'DRAFT'
                          ? badge('#f3f4f6', '#6b7280')
                          : badge('#f0fdf4', '#15803d')
                      }>
                        {inv.isOverdue ? 'Overdue' : inv.status === 'DRAFT' ? 'Draft' : 'Unpaid'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: '32px 20px', textAlign: 'center' }}>
            <p style={{ color: 'var(--theme-elevation-400)', fontSize: 14, margin: 0 }}>
              No unpaid invoices 🎉
            </p>
          </div>
        )}
      </div>

      {/* Drafts & Scheduled Sends */}
      <div style={card}>
        <div style={cardHead}>
          <span style={cardTitle}>Drafts & Scheduled</span>
          <span style={{ fontSize: 12, color: 'var(--theme-elevation-400)' }}>
            {sortedScheduled.filter(s => s.status === 'draft').length} draft, {sortedScheduled.filter(s => s.status === 'scheduled').length} scheduled
          </span>
        </div>

        {sortedScheduled.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Client</th>
                  <th style={thStyle}>Description</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
                  <th style={thStyle}>Send Date</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {sortedScheduled.map((send) => {
                  const days = send.sendDate ? daysUntil(send.sendDate) : null
                  const isUrgent = days !== null && days <= 3 && days >= 0
                  const isPast = days !== null && days < 0
                  return (
                    <tr
                      key={send.invoiceId}
                      style={{
                        borderBottom: '1px solid var(--theme-elevation-50)',
                        background: isUrgent ? 'rgba(245, 158, 11, 0.06)' : undefined,
                      }}
                    >
                      <td style={{ ...tdStyle, fontWeight: 500, color: 'var(--theme-elevation-700)' }}>
                        {send.contact}
                      </td>
                      <td style={tdStyle}>
                        {send.description}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500 }}>
                        ${send.total.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span style={
                          send.status === 'scheduled'
                            ? badge('#eff6ff', '#2563eb')
                            : badge('#f3f4f6', '#6b7280')
                        }>
                          {send.status === 'scheduled' ? 'Scheduled' : 'Draft'}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        {send.sendDate ? (
                          <>
                            {formatDate(send.sendDate)}
                            {days !== null && (
                              <span style={{ marginLeft: 8, ...( isPast ? badge('#fef2f2', '#b91c1c') : isUrgent ? badge('#fffbeb', '#b45309') : badge('#f3f4f6', '#6b7280')) }}>
                                {isPast ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days}d`}
                              </span>
                            )}
                          </>
                        ) : (
                          <span style={{ color: 'var(--theme-elevation-300)', fontSize: 12 }}>Not scheduled</span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <a
                          href={`https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${send.invoiceId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: 12, color: '#6366f1', textDecoration: 'none' }}
                        >
                          View in Xero ↗
                        </a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: '32px 20px', textAlign: 'center' }}>
            <p style={{ color: 'var(--theme-elevation-400)', fontSize: 14, margin: 0 }}>
              No drafts or scheduled sends
            </p>
          </div>
        )}
      </div>

      {/* AI Invoice Chat */}
      <InvoiceChatPanel onDataChange={fetchData} />
    </div>
  )
}
