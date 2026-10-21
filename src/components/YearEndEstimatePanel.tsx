'use client'

import { useEffect, useMemo, useState } from 'react'
import { InfoNote } from './InfoNote'
import {
  CostCategoryToggles,
  Kpi,
  XERO_UNAVAILABLE_TEXT,
  money,
  monthLabel,
  panelStyle,
  rangeBtn,
  td,
  tdNum,
  th,
  thNum,
  type XeroUnavailableReason,
} from './SalesVsCostsPanel'
import {
  excludeProjectionAccounts,
  type ProjectionClientRow,
  type ProjectionMonth,
  type ProjectionMonthKind,
} from '@/lib/finance/year-projection'

interface EstimateAvailable {
  available: true
  months: ProjectionMonth[]
  costAverage: { months: string[]; monthly: number }
  clients: ProjectionClientRow[]
  currentMonth: string
}
type EstimateResponse = EstimateAvailable | { available: false; reason: XeroUnavailableReason }

function isEstimateResponse(body: unknown): body is EstimateResponse {
  if (typeof body !== 'object' || body === null) return false
  const b = body as { available?: unknown; months?: unknown; clients?: unknown; costAverage?: unknown }
  if (b.available === false) return true
  return b.available === true && Array.isArray(b.months) && Array.isArray(b.clients) && typeof b.costAverage === 'object'
}

const KIND_TEXT: Record<ProjectionMonthKind, string> = {
  actual: 'Xero',
  current: 'Xero so far + estimate',
  estimate: 'Estimate',
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function monthSpan(keys: string[]): string {
  const first = keys[0]
  const last = keys[keys.length - 1]
  if (!first || !last) return ''
  return first === last ? monthLabel(first) : `${monthLabel(first, true)}\u2013${monthLabel(last)}`
}

function clientNote(row: ProjectionClientRow): string {
  const parts: string[] = []
  if (row.startsOn) parts.push(`Starts ${formatDate(row.startsOn)}`)
  if (row.change) {
    parts.push(
      row.change.action === 'end'
        ? `Ends ${formatDate(row.change.date)}`
        : `Changes to ${money(row.change.amount)} from ${formatDate(row.change.date)}`,
    )
  }
  return parts.join(' \u00b7 ')
}

export interface YearEndEstimatePanelProps {
  /** First month of the period (YYYY-MM). */
  from: string
  /** Last month of the period (YYYY-MM), including months still to come. */
  to: string
  /** Period name, e.g. "FY 2026–27" or "2026". */
  label: string
  /** Xero cost categories switched off in the Sales vs Costs what-if view. */
  excluded: ReadonlySet<string>
  onExcludedChange: (next: ReadonlySet<string>) => void
}

/**
 * Where the period should land: Xero so far, plus expected retainers (start
 * dates and scheduled changes included) and costs at the recent monthly
 * average for the months still to come.
 */
export function YearEndEstimatePanel({ from, to, label, excluded, onExcludedChange }: YearEndEstimatePanelProps) {
  const [data, setData] = useState<EstimateResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    const qs = new URLSearchParams({ from, to })
    fetch(`/api/costs/projection?${qs.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        const body: unknown = await res.json().catch(() => null)
        if (!res.ok || !isEstimateResponse(body)) {
          setError(res.status === 403 ? 'You need Clients and Business Costs access to see the year-end estimate.' : 'Could not load the year-end estimate.')
          return
        }
        setError(null)
        setData(body)
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        setError('Could not load the year-end estimate.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [from, to])

  const estimate = data?.available ? data : null

  // Only exclude categories present in this estimate.
  const activeExcluded = useMemo(() => {
    const present = new Set(estimate?.months.flatMap((m) => m.costsByAccount.map((c) => c.account)) ?? [])
    return new Set([...excluded].filter((a) => present.has(a)))
  }, [excluded, estimate])

  const view = useMemo(
    () => (estimate ? excludeProjectionAccounts(estimate.months, activeExcluded) : null),
    [estimate, activeExcluded],
  )

  // Estimated cost per category over the whole period (Xero so far + estimate).
  const categories = useMemo(() => {
    const totals = new Map<string, number>()
    for (const m of estimate?.months ?? []) {
      for (const c of m.costsByAccount) totals.set(c.account, (totals.get(c.account) ?? 0) + c.amount)
    }
    return [...totals.entries()]
      .map(([account, amount]) => ({ account, amount: Math.round(amount * 100) / 100 }))
      .filter((c) => c.amount !== 0)
      .sort((a, b) => b.amount - a.amount || a.account.localeCompare(b.account))
  }, [estimate])
  const categoriesTotal = categories.reduce((s, c) => s + c.amount, 0)

  const toggleAccount = (account: string) => {
    const next = new Set(excluded)
    if (next.has(account)) next.delete(account)
    else next.add(account)
    onExcludedChange(next)
  }

  const futureMonths = estimate?.months.filter((m) => m.kind === 'estimate').map((m) => m.month) ?? []
  const restLabel = monthSpan(futureMonths)
  const averageLabel = monthSpan(estimate?.costAverage.months ?? [])
  const excludedList = [...activeExcluded].sort((a, b) => a.localeCompare(b))

  return (
    <section aria-labelledby="year-end-estimate-title" style={panelStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h2 id="year-end-estimate-title" style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Year-end estimate: {label}</h2>
          {estimate && (
            <div style={{ fontSize: 12, color: 'var(--theme-elevation-500)', marginTop: 2 }}>
              Xero so far, plus expected retainers
              {averageLabel ? ` and costs at the ${averageLabel} monthly average` : ''}
              {restLabel ? ` for ${restLabel}` : ''}.
            </div>
          )}
        </div>
        {loading && data && (
          <span aria-live="polite" style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>Updating…</span>
        )}
      </div>

      {error && <div role="alert" style={{ fontSize: 13, color: '#991b1b' }}>{error}</div>}
      {!error && !data && loading && <div style={{ fontSize: 13, color: 'var(--theme-elevation-400)' }}>Loading…</div>}

      {!error && data && !data.available && (
        <InfoNote role="status" label="Why there's no estimate" style={{ fontSize: 12, padding: '8px 12px', borderRadius: 6, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af' }}>
          The year-end estimate starts from Xero. {XERO_UNAVAILABLE_TEXT[data.reason]}
        </InfoNote>
      )}

      {!error && estimate && view && (
        <>
          {excludedList.length > 0 && (
            <div role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', fontSize: 12, padding: '8px 12px', borderRadius: 6, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', marginBottom: 14 }}>
              <span>What-if view: excluding {excludedList.join(', ')}, including from the estimate.</span>
              <button type="button" onClick={() => onExcludedChange(new Set())} style={{ ...rangeBtn, fontSize: 11, padding: '3px 10px' }}>
                Show all costs
              </button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
            <Kpi label="Invoiced so far" value={money(view.totals.invoicedActual)} />
            <Kpi label="Still to invoice" value={`+${money(view.totals.invoicedExpected)}`} />
            <Kpi label="Estimated invoiced" value={money(view.totals.invoiced)} />
            <Kpi label="Estimated costs" value={money(view.totals.costs)} />
            <Kpi label="Estimated profit" value={money(view.totals.profit)} tone={view.totals.profit} />
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Year-end estimate by month</caption>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--theme-elevation-150)' }}>
                  <th scope="col" style={th}>Month</th>
                  <th scope="col" style={th}>Source</th>
                  <th scope="col" style={thNum}>Invoiced</th>
                  <th scope="col" style={thNum}>Costs</th>
                  <th scope="col" style={thNum}>Profit</th>
                </tr>
              </thead>
              <tbody>
                {view.months.map((m) => {
                  const isEstimate = m.kind !== 'actual'
                  return (
                    <tr key={m.month} style={{ borderBottom: '1px solid var(--theme-elevation-100)', fontStyle: m.kind === 'estimate' ? 'italic' : undefined }}>
                      <th scope="row" style={{ ...td, fontWeight: 500, textAlign: 'left' }}>{monthLabel(m.month)}</th>
                      <td style={{ ...td, fontSize: 12, color: isEstimate ? '#92400e' : 'var(--theme-elevation-500)' }}>{KIND_TEXT[m.kind]}</td>
                      <td style={tdNum}>{money(m.invoiced)}</td>
                      <td style={tdNum}>{money(m.costs)}</td>
                      <td style={{ ...tdNum, color: m.profit < 0 ? '#dc2626' : undefined }}>{money(m.profit)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--theme-elevation-150)', fontWeight: 700 }}>
                  <th scope="row" colSpan={2} style={{ ...td, textAlign: 'left' }}>Estimated total</th>
                  <td style={tdNum}>{money(view.totals.invoiced)}</td>
                  <td style={tdNum}>{money(view.totals.costs)}</td>
                  <td style={{ ...tdNum, color: view.totals.profit < 0 ? '#dc2626' : undefined }}>{money(view.totals.profit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {categories.length > 0 && (
            <CostCategoryToggles
              id="estimate-categories-title"
              title={`Estimated costs by Xero category (${label})`}
              hint="Click a category to switch it off and see the estimate without it. Click again to bring it back."
              categories={categories}
              total={categoriesTotal}
              excluded={activeExcluded}
              onToggle={toggleAccount}
            />
          )}

          {futureMonths.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <h3 id="estimate-retainers-title" style={{ fontSize: 14, fontWeight: 600, margin: '0 0 8px' }}>
                Retainers counted for {restLabel}
              </h3>
              {estimate.clients.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--theme-elevation-500)' }}>No active client has a retainer for these months.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table aria-labelledby="estimate-retainers-title" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--theme-elevation-150)' }}>
                        <th scope="col" style={th}>Client</th>
                        <th scope="col" style={th}>Change</th>
                        <th scope="col" style={thNum}>Monthly</th>
                        <th scope="col" style={thNum}>{restLabel}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {estimate.clients.map((c) => (
                        <tr key={c.id} style={{ borderBottom: '1px solid var(--theme-elevation-100)' }}>
                          <th scope="row" style={{ ...td, fontWeight: 500, textAlign: 'left' }}>{c.name}</th>
                          <td style={{ ...td, fontSize: 12, color: 'var(--theme-elevation-500)' }}>{clientNote(c)}</td>
                          <td style={tdNum}>{money(c.monthlyRetainer)}</td>
                          <td style={tdNum}>{money(c.restOfPeriod)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div style={{ fontSize: 11, color: 'var(--theme-elevation-400)', marginTop: 8, lineHeight: 1.5 }}>
            Retainers are full invoice amounts, before revenue share and commissions (those payouts sit in costs). One-off projects and inactive clients aren&rsquo;t included. This month counts the higher of Xero so far and the estimate.
          </div>
        </>
      )}
    </section>
  )
}
