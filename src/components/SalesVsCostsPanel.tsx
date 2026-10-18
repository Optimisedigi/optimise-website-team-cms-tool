'use client'

import { useCallback, useEffect, useState } from 'react'
import { COSTS_IMPORTED_EVENT } from '@/lib/finance/events'

interface PnlMonth {
  month: string
  sales: number
  received: number
  costs: number
  profitSales: number
  profitReceived: number
  noBankData: boolean
}

interface PnlTotals {
  sales: number
  received: number
  costs: number
  profitSales: number
  profitReceived: number
}

type XeroUnavailableReason = 'not_configured' | 'not_deployed' | 'not_connected' | 'scope_missing' | 'error'

interface PnlResponse {
  months: PnlMonth[]
  totals: PnlTotals
  source?: 'xero' | 'bank'
  costsByAccount?: Array<{ account: string; amount: number }>
  xeroUnavailable?: XeroUnavailableReason
  fetchedAt?: string
}

const XERO_UNAVAILABLE_TEXT: Record<XeroUnavailableReason, string> = {
  not_deployed: 'Xero is connected, but the Growth Tools update that reads monthly figures isn\u2019t deployed yet.',
  scope_missing: 'Xero is connected, but needs reconnecting once in Growth Tools to allow reading bank transactions and payments.',
  not_connected: 'Xero isn\u2019t connected in Growth Tools.',
  not_configured: 'The Growth Tools connection isn\u2019t configured for this environment.',
  error: 'Couldn\u2019t reach Xero just now.',
}

const LABELS = {
  xero: {
    sales: 'Invoiced',
    received: 'Received',
    costs: 'Costs',
    profitSales: 'Profit (invoiced)',
    profitReceived: 'Profit (received)',
    subtitle: 'From Xero, ex-GST, using your Xero categories. Invoiced = sales invoices. Received = payments and money in. Costs = bills and spend money.',
  },
  bank: {
    sales: 'Agreed sales',
    received: 'Received',
    costs: 'Costs',
    profitSales: 'Profit (agreed)',
    profitReceived: 'Profit (received)',
    subtitle: 'Agreed = from client records. Received = money in from imported bank statements. Costs = money out.',
  },
} as const

const RANGES = [6, 12, 24] as const

const COLORS = { agreed: '#213843', received: '#74B3A8', costs: '#EF4444' }

function money(n: number): string {
  const abs = Math.abs(n).toLocaleString('en-AU', { maximumFractionDigits: 0 })
  return n < 0 ? `-$${abs}` : `$${abs}`
}

function monthLabel(key: string, short = false): string {
  const [y = 0, m = 1] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('en-AU', short ? { month: 'short' } : { month: 'short', year: 'numeric' })
}

function isPnlResponse(body: unknown): body is PnlResponse {
  return typeof body === 'object' && body !== null && Array.isArray((body as PnlResponse).months) && typeof (body as PnlResponse).totals === 'object'
}

export function SalesVsCostsPanel() {
  const [range, setRange] = useState<(typeof RANGES)[number]>(12)
  const [data, setData] = useState<PnlResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback((months: number, signal?: AbortSignal) => {
    setLoading(true)
    fetch(`/api/costs/pnl?months=${months}`, { signal })
      .then(async (res) => {
        const body: unknown = await res.json().catch(() => null)
        if (!res.ok || !isPnlResponse(body)) {
          setError(res.status === 403 ? 'You need Clients and Business Costs access to see sales vs costs.' : 'Could not load sales vs costs.')
          return
        }
        setError(null)
        setData(body)
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        setError('Could not load sales vs costs.')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(range, controller.signal)
    return () => controller.abort()
  }, [range, load])

  useEffect(() => {
    const onImported = () => load(range)
    window.addEventListener(COSTS_IMPORTED_EVENT, onImported)
    return () => window.removeEventListener(COSTS_IMPORTED_EVENT, onImported)
  }, [range, load])

  const labels = LABELS[data?.source === 'xero' ? 'xero' : 'bank']
  const maxValue = data
    ? Math.max(1, ...data.months.flatMap((m) => [m.sales, m.received, m.costs]))
    : 1

  return (
    <section aria-labelledby="sales-vs-costs-title" style={panelStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h2 id="sales-vs-costs-title" style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Sales vs Costs</h2>
          <div style={{ fontSize: 12, color: 'var(--theme-elevation-500)', marginTop: 2 }}>
            {labels.subtitle}
          </div>
        </div>
        <div role="group" aria-label="Range" style={{ display: 'flex', gap: 4 }}>
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={range === r}
              onClick={() => setRange(r)}
              style={{ ...rangeBtn, ...(range === r ? { background: '#213843', color: '#fff', borderColor: '#213843' } : {}) }}
            >
              {r} months
            </button>
          ))}
        </div>
      </div>

      {error && <div role="alert" style={{ fontSize: 13, color: '#991b1b' }}>{error}</div>}
      {!error && !data && loading && <div style={{ fontSize: 13, color: 'var(--theme-elevation-400)' }}>Loading…</div>}

      {!error && data?.source === 'bank' && data.xeroUnavailable && (
        <div role="status" style={{ fontSize: 12, padding: '8px 12px', borderRadius: 6, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', marginBottom: 14 }}>
          Showing bank statement and client record figures. {XERO_UNAVAILABLE_TEXT[data.xeroUnavailable]}
        </div>
      )}

      {!error && data && (
        <>
          {/* Totals */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
            <Kpi label={labels.sales} value={money(data.totals.sales)} />
            <Kpi label={labels.received} value={money(data.totals.received)} />
            <Kpi label={labels.costs} value={money(data.totals.costs)} />
            <Kpi label={labels.profitSales} value={money(data.totals.profitSales)} tone={data.totals.profitSales} />
            <Kpi label={labels.profitReceived} value={money(data.totals.profitReceived)} tone={data.totals.profitReceived} />
          </div>

          {/* Chart */}
          <div aria-hidden="true" style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 140, marginBottom: 4 }}>
            {data.months.map((m) => (
              <div key={m.month} style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 2, height: '100%' }}>
                {([['agreed', m.sales], ['received', m.received], ['costs', m.costs]] as const).map(([k, v]) => (
                  <div
                    key={k}
                    title={`${monthLabel(m.month)} ${k}: ${money(v)}`}
                    style={{ width: '28%', maxWidth: 14, height: `${(v / maxValue) * 100}%`, minHeight: v > 0 ? 2 : 0, background: COLORS[k], borderRadius: '2px 2px 0 0' }}
                  />
                ))}
              </div>
            ))}
          </div>
          <div aria-hidden="true" style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            {data.months.map((m) => (
              <div key={m.month} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: 'var(--theme-elevation-400)' }}>{monthLabel(m.month, true)}</div>
            ))}
          </div>
          <div aria-hidden="true" style={{ display: 'flex', gap: 14, fontSize: 11, marginBottom: 16 }}>
            {([['agreed', labels.sales], ['received', labels.received], ['costs', labels.costs]] as const).map(([k, label]) => (
              <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[k] }} />{label}
              </span>
            ))}
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Sales vs costs by month</caption>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--theme-elevation-150)' }}>
                  <th scope="col" style={th}>Month</th>
                  <th scope="col" style={thNum}>{labels.sales}</th>
                  <th scope="col" style={thNum}>{labels.received}</th>
                  <th scope="col" style={thNum}>{labels.costs}</th>
                  <th scope="col" style={thNum}>{labels.profitSales}</th>
                  <th scope="col" style={thNum}>{labels.profitReceived}</th>
                </tr>
              </thead>
              <tbody>
                {[...data.months].reverse().map((m) => (
                  <tr key={m.month} style={{ borderBottom: '1px solid var(--theme-elevation-100)' }}>
                    <th scope="row" style={{ ...td, fontWeight: 500, textAlign: 'left' }}>
                      {monthLabel(m.month)}
                      {m.noBankData && (
                        <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#fffbeb', color: '#92400e' }}>
                          no statement imported
                        </span>
                      )}
                    </th>
                    <td style={tdNum}>{money(m.sales)}</td>
                    <td style={tdNum}>{money(m.received)}</td>
                    <td style={tdNum}>{money(m.costs)}</td>
                    <td style={{ ...tdNum, color: m.profitSales < 0 ? '#dc2626' : undefined }}>{money(m.profitSales)}</td>
                    <td style={{ ...tdNum, color: m.profitReceived < 0 ? '#dc2626' : undefined }}>{money(m.profitReceived)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--theme-elevation-150)', fontWeight: 700 }}>
                  <th scope="row" style={{ ...td, textAlign: 'left' }}>Total</th>
                  <td style={tdNum}>{money(data.totals.sales)}</td>
                  <td style={tdNum}>{money(data.totals.received)}</td>
                  <td style={tdNum}>{money(data.totals.costs)}</td>
                  <td style={{ ...tdNum, color: data.totals.profitSales < 0 ? '#dc2626' : undefined }}>{money(data.totals.profitSales)}</td>
                  <td style={{ ...tdNum, color: data.totals.profitReceived < 0 ? '#dc2626' : undefined }}>{money(data.totals.profitReceived)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {data.source === 'xero' && data.costsByAccount && data.costsByAccount.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 8px' }}>Costs by Xero category ({range} months)</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 4 }}>
                {data.costsByAccount.map((c) => (
                  <li key={c.account} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) 3fr auto', alignItems: 'center', gap: 10, fontSize: 13 }}>
                    <span>{c.account}</span>
                    <span aria-hidden="true" style={{ height: 6, background: 'var(--theme-elevation-150)', borderRadius: 3, overflow: 'hidden' }}>
                      <span style={{ display: 'block', height: '100%', width: `${data.totals.costs > 0 ? (c.amount / data.totals.costs) * 100 : 0}%`, background: COLORS.costs }} />
                    </span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{money(c.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--theme-elevation-400)', marginTop: 8, lineHeight: 1.5 }}>
            {data.source === 'xero'
              ? `Transfers, GST payments, loans and drawings aren\u2019t counted, matching Xero\u2019s Profit & Loss. Credit notes and manual journals aren\u2019t included yet.${data.fetchedAt ? ` Updated ${new Date(data.fetchedAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}.` : ''}`
              : 'Received includes every credit on the statement. Delete transfers, refunds or loans under Finance \u2192 Bank Receipts so they don\u2019t count as sales.'}
          </div>
        </>
      )}
    </section>
  )
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: number }) {
  return (
    <div style={{ background: 'var(--theme-elevation-0)', border: '1px solid var(--theme-elevation-150)', borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--theme-elevation-500)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: tone !== undefined && tone < 0 ? '#dc2626' : undefined }}>{value}</div>
    </div>
  )
}

const panelStyle: React.CSSProperties = {
  background: 'var(--theme-elevation-50)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 8,
  padding: 16,
  marginBottom: 24,
}
const rangeBtn: React.CSSProperties = {
  background: 'var(--theme-elevation-100)',
  border: '1px solid var(--theme-elevation-200)',
  padding: '5px 10px',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
  color: 'inherit',
}
const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--theme-elevation-500)', textTransform: 'uppercase', letterSpacing: '0.05em' }
const thNum: React.CSSProperties = { ...th, textAlign: 'right' }
const td: React.CSSProperties = { padding: '8px 10px' }
const tdNum: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
