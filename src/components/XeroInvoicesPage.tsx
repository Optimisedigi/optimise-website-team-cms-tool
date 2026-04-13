'use client'

import { useEffect, useState } from 'react'

// ─── Types ────────────────────────────────────────────────

interface XeroInvoice {
  invoiceNumber: string
  contact: { name: string }
  total: number
  amountDue: number
  dueDate: string
  status: string
  isOverdue: boolean
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
  sendDate: string
  description: string
}

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

  const sortedScheduled = [...scheduled].sort(
    (a, b) => new Date(a.sendDate).getTime() - new Date(b.sendDate).getTime()
  )

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

      {/* Scheduled Sends */}
      <div style={card}>
        <div style={cardHead}>
          <span style={cardTitle}>Scheduled Sends</span>
          <span style={{ fontSize: 12, color: 'var(--theme-elevation-400)' }}>
            {sortedScheduled.length} scheduled
          </span>
        </div>

        {sortedScheduled.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Description</th>
                  <th style={thStyle}>Send Date</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Days Until Send</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {sortedScheduled.map((send) => {
                  const days = daysUntil(send.sendDate)
                  const isUrgent = days <= 3 && days >= 0
                  const isPast = days < 0
                  return (
                    <tr
                      key={send.invoiceId}
                      style={{
                        borderBottom: '1px solid var(--theme-elevation-50)',
                        background: isUrgent ? 'rgba(245, 158, 11, 0.06)' : undefined,
                      }}
                    >
                      <td style={{ ...tdStyle, fontWeight: 500, color: 'var(--theme-elevation-700)' }}>
                        {send.description}
                      </td>
                      <td style={tdStyle}>
                        {formatDate(send.sendDate)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span style={
                          isPast
                            ? badge('#fef2f2', '#b91c1c')
                            : isUrgent
                            ? badge('#fffbeb', '#b45309')
                            : badge('#f3f4f6', '#6b7280')
                        }>
                          {isPast ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days`}
                        </span>
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
              No scheduled sends
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
