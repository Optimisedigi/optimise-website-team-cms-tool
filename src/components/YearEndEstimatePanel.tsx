'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { InfoNote } from './InfoNote'
import { HoverBreakdown, type BreakdownRow } from './HoverBreakdown'
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
  MANUAL_COST_ACCOUNT,
  excludeProjectionAccounts,
  type ProjectionAdjustment,
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
  if (row.setupFee) parts.push(`Setup fee ${money(row.setupFee.amount)} in ${monthLabel(row.setupFee.month)}`)
  return parts.join(' \u00b7 ')
}

function adjustmentAccount(a: ProjectionAdjustment): string {
  return a.account?.trim() || MANUAL_COST_ACCOUNT
}

/** What a month's invoiced figure is made of. */
function invoicedBreakdown(m: ProjectionMonth): BreakdownRow[] {
  const rows: BreakdownRow[] = []
  const retainerRows = (): BreakdownRow[] =>
    m.retainers.map((r) => ({ label: r.name, value: money(r.amount), note: r.kind === 'setup' ? 'Setup fee' : 'Expected retainer' }))
  if (m.kind === 'actual') {
    rows.push({ label: 'Xero invoices', value: money(m.invoicedActual), note: 'Approved and paid invoices dated this month' })
  } else if (m.kind === 'current') {
    const xeroWins = m.invoicedActual >= m.invoicedExpected
    rows.push({ label: 'Xero so far', value: money(m.invoicedActual), note: xeroWins ? 'Counted: higher than expected invoices' : 'Not counted: lower than expected invoices' })
    rows.push({ label: 'Expected retainers and setup fees', value: money(m.invoicedExpected), note: xeroWins ? 'Not counted: Xero so far is higher' : 'Counted: higher than Xero so far' })
    if (!xeroWins) rows.push(...retainerRows())
  } else {
    rows.push(...retainerRows())
  }
  for (const a of m.adjustments) {
    if (a.kind === 'invoiced') rows.push({ label: a.description, value: money(a.amount), note: 'Added manually' })
  }
  rows.push({ label: 'Total', value: money(m.invoiced), total: true })
  return rows
}

/** What a month's cost figure is made of, leaving out switched-off categories. */
function costsBreakdown(m: ProjectionMonth, excluded: ReadonlySet<string>, averageLabel: string): BreakdownRow[] {
  // Manual cost entries are merged into their category; list them on their own.
  const manual = new Map<string, number>()
  for (const a of m.adjustments) {
    if (a.kind === 'cost') manual.set(adjustmentAccount(a), (manual.get(adjustmentAccount(a)) ?? 0) + a.amount)
  }
  const basis =
    m.kind === 'actual'
      ? 'From Xero'
      : m.kind === 'current'
        ? `Higher of Xero so far and the ${averageLabel || 'recent'} monthly average`
        : `${averageLabel || 'Recent'} monthly average`
  const rows: BreakdownRow[] = []
  let hidden = 0
  for (const c of m.costsByAccount) {
    if (excluded.has(c.account)) {
      hidden += 1
      continue
    }
    const base = Math.round((c.amount - (manual.get(c.account) ?? 0)) * 100) / 100
    if (Math.abs(base) >= 0.5) rows.push({ label: c.account, value: money(base) })
  }
  if (rows.length > 0) rows.unshift({ label: basis, value: '', note: undefined })
  for (const a of m.adjustments) {
    if (a.kind !== 'cost' || excluded.has(adjustmentAccount(a))) continue
    rows.push({ label: a.description, value: money(a.amount), note: `Added manually \u00b7 ${adjustmentAccount(a)}` })
  }
  if (hidden > 0) rows.push({ label: `${hidden} switched-off ${hidden === 1 ? 'category' : 'categories'} not counted`, value: '' })
  rows.push({ label: 'Total', value: money(m.costs), total: true })
  return rows
}

const inputStyle: React.CSSProperties = {
  fontSize: 13,
  padding: '5px 8px',
  borderRadius: 4,
  border: '1px solid var(--theme-elevation-200)',
  background: 'var(--theme-input-bg, var(--theme-elevation-0))',
  color: 'inherit',
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
  // Bumped after adding/removing a manual estimate to reload the projection.
  const [reloadKey, setReloadKey] = useState(0)

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
  }, [from, to, reloadKey])

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
  const openMonths = estimate?.months.filter((m) => m.kind !== 'actual').map((m) => m.month) ?? []
  const adjustments = estimate?.months.flatMap((m) => m.adjustments) ?? []

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
                      <td style={{ ...td, fontSize: 12, color: isEstimate ? '#92400e' : 'var(--theme-elevation-500)' }}>
                        {KIND_TEXT[m.kind]}
                        {m.adjustments.length > 0 ? ' + manual' : ''}
                      </td>
                      <td style={tdNum}>
                        <HoverBreakdown title={`Invoiced \u00b7 ${monthLabel(m.month)}`} rows={invoicedBreakdown(m)}>
                          {money(m.invoiced)}
                        </HoverBreakdown>
                      </td>
                      <td style={tdNum}>
                        <HoverBreakdown title={`Costs \u00b7 ${monthLabel(m.month)}`} rows={costsBreakdown(m, activeExcluded, averageLabel)}>
                          {money(m.costs)}
                        </HoverBreakdown>
                      </td>
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

          {openMonths.length > 0 && (
            <ManualEstimates
              months={openMonths}
              adjustments={adjustments}
              categories={categories.map((c) => c.account).filter((a) => a !== MANUAL_COST_ACCOUNT)}
              onChange={() => setReloadKey((k) => k + 1)}
            />
          )}

          {futureMonths.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <h3 id="estimate-retainers-title" style={{ fontSize: 14, fontWeight: 600, margin: '0 0 8px' }}>
                Retainers counted for {restLabel}
              </h3>
              <div style={{ fontSize: 12, color: 'var(--theme-elevation-500)', margin: '-4px 0 8px' }}>
                Edit a monthly amount to change it in this estimate only. The client record stays as it is.
              </div>
              {estimate.clients.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--theme-elevation-500)' }}>No active client has a retainer or setup fee for these months.</div>
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
                          <td style={tdNum}>
                            <RetainerAmount row={c} onChange={() => setReloadKey((k) => k + 1)} />
                          </td>
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
            Retainers are full invoice amounts, before revenue share and commissions (those payouts sit in costs). Setup fees count in the month the retainer (or client) starts. One-off projects and inactive clients aren&rsquo;t included. Xero figures are approved and paid invoices by invoice date: draft and scheduled Xero invoices aren&rsquo;t counted, so add any you expect as manual estimates. This month counts the higher of Xero so far and the estimate. Hover a figure to see what it&rsquo;s made of.
          </div>
        </>
      )}
    </section>
  )
}

/**
 * Manually entered estimated invoices and costs for this or later months,
 * added on top of the estimate for that month.
 */
function ManualEstimates({
  months,
  adjustments,
  categories,
  onChange,
}: {
  months: string[]
  adjustments: ProjectionAdjustment[]
  categories: string[]
  onChange: () => void
}) {
  const [month, setMonth] = useState(months[0] ?? '')
  const [kind, setKind] = useState<'invoiced' | 'cost'>('invoiced')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [account, setAccount] = useState('')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState<string | number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedMonth = months.includes(month) ? month : (months[0] ?? '')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const value = Number(amount)
    if (!description.trim()) return setError('Add a description.')
    if (!Number.isFinite(value) || value === 0) return setError('Enter an amount other than 0.')
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/costs/projection/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: selectedMonth, kind, amount: value, description: description.trim(), account: kind === 'cost' && account ? account : null }),
      })
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null)
        const message = typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string' ? (body as { error: string }).error : null
        setError(message ?? 'Could not add the estimate.')
        return
      }
      setDescription('')
      setAmount('')
      onChange()
    } catch {
      setError('Could not add the estimate.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string | number) => {
    setRemoving(id)
    setError(null)
    try {
      const res = await fetch(`/api/costs/projection/adjustments/${encodeURIComponent(String(id))}`, { method: 'DELETE' })
      if (!res.ok) {
        setError('Could not remove the estimate.')
        return
      }
      onChange()
    } catch {
      setError('Could not remove the estimate.')
    } finally {
      setRemoving(null)
    }
  }

  const sorted = [...adjustments].sort((a, b) => a.month.localeCompare(b.month) || a.description.localeCompare(b.description))

  return (
    <div style={{ marginTop: 18 }}>
      <h3 id="estimate-manual-title" style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Manual estimates</h3>
      <div style={{ fontSize: 12, color: 'var(--theme-elevation-500)', marginBottom: 8 }}>
        Add an expected invoice or cost to a month, ex-GST. It&rsquo;s added on top of that month&rsquo;s estimate. Use a negative amount to reduce it.
      </div>

      {sorted.length > 0 && (
        <div style={{ overflowX: 'auto', marginBottom: 10 }}>
          <table aria-labelledby="estimate-manual-title" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--theme-elevation-150)' }}>
                <th scope="col" style={th}>Month</th>
                <th scope="col" style={th}>Type</th>
                <th scope="col" style={th}>Description</th>
                <th scope="col" style={thNum}>Amount</th>
                <th scope="col" style={th}><span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((a) => (
                <tr key={a.id} style={{ borderBottom: '1px solid var(--theme-elevation-100)' }}>
                  <td style={td}>{monthLabel(a.month)}</td>
                  <td style={{ ...td, fontSize: 12, color: 'var(--theme-elevation-500)' }}>
                    {a.kind === 'invoiced' ? 'Invoice' : `Cost \u00b7 ${adjustmentAccount(a)}`}
                  </td>
                  <th scope="row" style={{ ...td, fontWeight: 500, textAlign: 'left' }}>{a.description}</th>
                  <td style={tdNum}>{money(a.amount)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => void remove(a.id)}
                      disabled={removing === a.id}
                      aria-label={`Remove ${a.description} (${monthLabel(a.month)})`}
                      style={{ ...rangeBtn, fontSize: 11, padding: '3px 10px' }}
                    >
                      {removing === a.id ? 'Removing\u2026' : 'Remove'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={(e) => void submit(e)} aria-label="Add a manual estimate" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--theme-elevation-500)' }}>
          Month
          <select value={selectedMonth} onChange={(e) => setMonth(e.target.value)} style={inputStyle}>
            {months.map((m) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--theme-elevation-500)' }}>
          Type
          <select value={kind} onChange={(e) => setKind(e.target.value === 'cost' ? 'cost' : 'invoiced')} style={inputStyle}>
            <option value="invoiced">Invoice</option>
            <option value="cost">Cost</option>
          </select>
        </label>
        {kind === 'cost' && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--theme-elevation-500)' }}>
            Category
            <select value={account} onChange={(e) => setAccount(e.target.value)} style={inputStyle}>
              <option value="">{MANUAL_COST_ACCOUNT}</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        )}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--theme-elevation-500)', flex: '1 1 180px' }}>
          Description
          <input type="text" value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Website build deposit" style={inputStyle} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--theme-elevation-500)' }}>
          Amount (ex-GST)
          <input type="number" inputMode="decimal" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ ...inputStyle, width: 120 }} />
        </label>
        <button type="submit" disabled={saving} style={{ ...rangeBtn, fontSize: 12 }}>
          {saving ? 'Adding\u2026' : 'Add estimate'}
        </button>
      </form>
      {error && <div role="alert" style={{ fontSize: 12, color: '#991b1b', marginTop: 6 }}>{error}</div>}
    </div>
  )
}

/**
 * A client's monthly retainer in the estimate, editable without touching the
 * client record. An override shows the stored amount it replaces.
 */
function RetainerAmount({ row, onChange }: { row: ProjectionClientRow; onChange: () => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const current = row.override?.amount ?? row.monthlyRetainer

  // One-off clients only appear for their setup fee: nothing to edit.
  if (row.monthlyRetainer === 0 && !row.override) return <>{'\u2013'}</>

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const amount = Number(value)
    if (value.trim() === '' || !Number.isFinite(amount) || amount < 0) {
      setError('Enter 0 or more.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/costs/projection/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'retainer', clientId: Number(row.id), amount }),
      })
      if (!res.ok) {
        setError('Could not save.')
        return
      }
      setEditing(false)
      onChange()
    } catch {
      setError('Could not save.')
    } finally {
      setSaving(false)
    }
  }

  const reset = async () => {
    if (!row.override) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/costs/projection/adjustments/${encodeURIComponent(String(row.override.id))}`, { method: 'DELETE' })
      if (!res.ok) {
        setError('Could not reset.')
        return
      }
      onChange()
    } catch {
      setError('Could not reset.')
    } finally {
      setSaving(false)
    }
  }

  const smallBtn: React.CSSProperties = { ...rangeBtn, fontSize: 11, padding: '2px 8px', marginLeft: 6 }

  if (editing) {
    return (
      <form onSubmit={(e) => void save(e)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, flexWrap: 'wrap' }}>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={value}
          autoFocus
          aria-label={`Estimated monthly retainer for ${row.name}`}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditing(false)
          }}
          style={{ ...inputStyle, width: 100, textAlign: 'right' }}
        />
        <button type="submit" disabled={saving} style={smallBtn}>{saving ? 'Saving\u2026' : 'Save'}</button>
        <button type="button" onClick={() => setEditing(false)} style={smallBtn}>Cancel</button>
        {error && <span role="alert" style={{ fontSize: 11, color: '#991b1b', width: '100%' }}>{error}</span>}
      </form>
    )
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2, flexWrap: 'wrap' }}>
      {row.override && (
        <span style={{ fontSize: 11, color: 'var(--theme-elevation-400)', textDecoration: 'line-through', marginRight: 6 }} aria-label={`Client record: ${money(row.monthlyRetainer)}`}>
          {money(row.monthlyRetainer)}
        </span>
      )}
      <span style={row.override ? { color: '#92400e', fontWeight: 600 } : undefined}>{money(current)}</span>
      <button
        type="button"
        onClick={() => {
          setValue(String(current))
          setError(null)
          setEditing(true)
        }}
        aria-label={`Edit estimated monthly retainer for ${row.name}`}
        style={smallBtn}
      >
        Edit
      </button>
      {row.override && (
        <button type="button" disabled={saving} onClick={() => void reset()} aria-label={`Reset ${row.name} to the client record`} style={smallBtn}>
          Reset
        </button>
      )}
      {error && <span role="alert" style={{ fontSize: 11, color: '#991b1b', width: '100%' }}>{error}</span>}
    </span>
  )
}
