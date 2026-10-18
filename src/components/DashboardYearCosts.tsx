'use client'

import { useEffect, useMemo, useState } from 'react'
import type { PnlMonth, PnlTotals } from '@/lib/finance/monthly-pnl'
import { monthKeyOf, periodContaining, periodRange, type PeriodMode } from '@/lib/finance/periods'

interface PnlResponse {
  months: PnlMonth[]
  totals: PnlTotals
  source?: 'xero' | 'bank'
  xeroUnavailable?: string
}

function isPnlResponse(body: unknown): body is PnlResponse {
  return (
    typeof body === 'object' &&
    body !== null &&
    Array.isArray((body as PnlResponse).months) &&
    typeof (body as PnlResponse).totals === 'object' &&
    (body as PnlResponse).totals !== null
  )
}

function money(n: number): string {
  const abs = Math.abs(n).toLocaleString('en-AU', { maximumFractionDigits: 0 })
  return n < 0 ? `-$${abs}` : `$${abs}`
}

function monthName(key: string, style: 'short' | 'long'): string {
  const [y = 0, m = 1] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString(
    'en-AU',
    style === 'short' ? { month: 'short' } : { month: 'long', year: 'numeric' },
  )
}

const MODES = [
  ['fy', 'Financial year'],
  ['cy', 'Calendar year'],
] as const

/**
 * Dashboard Finance → Costs: invoiced, received, costs and profit for the
 * financial or calendar year to date, with a monthly bar chart. Clicking a
 * month narrows the figures to that month; clicking it again (or "Whole year")
 * goes back to the year.
 */
export function DashboardYearCosts() {
  // "Now" is fixed for the life of the card so the period doesn't shift.
  const [currentMonth] = useState(() => monthKeyOf(new Date()))
  const [mode, setMode] = useState<PeriodMode>('fy')
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [data, setData] = useState<PnlResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const range = useMemo(() => periodRange(periodContaining(mode, currentMonth), currentMonth), [mode, currentMonth])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    const qs = new URLSearchParams({ from: range.from, to: range.to })
    fetch(`/api/costs/pnl?${qs.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        const body: unknown = await res.json().catch(() => null)
        if (!res.ok || !isPnlResponse(body)) {
          setData(null)
          setError(res.status === 403 ? 'You need Clients and Business Costs access to see yearly costs.' : 'Could not load yearly costs.')
          return
        }
        setError(null)
        setData(body)
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        setError('Could not load yearly costs.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [range.from, range.to])

  const handleModeChange = (next: PeriodMode) => {
    if (next === mode) return
    setMode(next)
    setSelectedMonth(null)
  }

  const toggleMonth = (month: string) => setSelectedMonth((prev) => (prev === month ? null : month))

  const isXero = data?.source === 'xero'
  const salesLabel = isXero ? 'Invoiced' : 'Agreed sales'
  const focus = selectedMonth ? data?.months.find((m) => m.month === selectedMonth) ?? null : null
  const figures: PnlTotals | null = focus ?? data?.totals ?? null
  const scopeText = focus
    ? monthName(focus.month, 'long')
    : range.toDate
      ? `${range.label}, year to date`
      : range.label
  const maxValue = data ? Math.max(1, ...data.months.flatMap((m) => [m.sales, m.costs])) : 1

  return (
    <div className="od-yearcosts">
      <div className="od-yearcosts__top">
        <div className="od-yearcosts__scope" aria-live="polite">
          {scopeText}
          {loading && data && <span className="od-yearcosts__updating">Updating…</span>}
        </div>
        <div className="od-yearcosts__controls">
          {selectedMonth && (
            <button type="button" className="od-yearcosts__btn" onClick={() => setSelectedMonth(null)}>
              Whole year
            </button>
          )}
          <div role="group" aria-label="Year type" className="od-yearcosts__toggle">
            {MODES.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                className={`od-yearcosts__btn${mode === value ? ' is-active' : ''}`}
                onClick={() => handleModeChange(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <div role="alert" className="od-yearcosts__message od-yearcosts__message--error">{error}</div>}
      {!error && !data && loading && <div className="od-yearcosts__message">Loading…</div>}

      {!error && data && figures && (
        <>
          <div className="od-gsc-stats od-gsc-stats--4">
            <div className="od-stat">
              <div className="k">{salesLabel}</div>
              <div className="v">{money(figures.sales)}</div>
            </div>
            <div className="od-stat">
              <div className="k">Received</div>
              <div className="v">{money(figures.received)}</div>
            </div>
            <div className="od-stat">
              <div className="k">Costs</div>
              <div className="v">{money(figures.costs)}</div>
            </div>
            <div className="od-stat">
              <div className="k">Profit</div>
              <div className="v" style={figures.profitSales < 0 ? { color: '#dc2626' } : undefined}>{money(figures.profitSales)}</div>
            </div>
          </div>

          <div className="od-yearcosts__chart" role="group" aria-label="Pick a month to see just that month">
            {data.months.map((m) => {
              const active = selectedMonth === m.month
              return (
                <button
                  key={m.month}
                  type="button"
                  aria-pressed={active}
                  aria-label={`${monthName(m.month, 'long')}: ${salesLabel.toLowerCase()} ${money(m.sales)}, costs ${money(m.costs)}`}
                  title={`${monthName(m.month, 'long')}\n${salesLabel}: ${money(m.sales)}\nCosts: ${money(m.costs)}`}
                  className={`od-yearcosts__month${active ? ' is-active' : ''}${selectedMonth && !active ? ' is-dimmed' : ''}`}
                  onClick={() => toggleMonth(m.month)}
                >
                  <span className="od-yearcosts__bars" aria-hidden="true">
                    <span className="od-yearcosts__bar od-yearcosts__bar--sales" style={{ height: `${(m.sales / maxValue) * 100}%` }} />
                    <span className="od-yearcosts__bar od-yearcosts__bar--costs" style={{ height: `${(m.costs / maxValue) * 100}%` }} />
                  </span>
                  <span className="od-yearcosts__label" aria-hidden="true">{monthName(m.month, 'short')}</span>
                </button>
              )
            })}
          </div>

          <div className="od-chart__legend" aria-hidden="true">
            <span className="od-chart__legend-item">
              <span className="od-chart__legend-dot od-yearcosts__bar--sales" />
              {salesLabel}
            </span>
            <span className="od-chart__legend-item">
              <span className="od-chart__legend-dot od-yearcosts__bar--costs" />
              Costs
            </span>
          </div>
          <div className="od-yearcosts__note">
            {isXero
              ? 'From Xero, ex-GST. Click a month to see just that month.'
              : `${data.xeroUnavailable ? 'Xero unavailable: ' : ''}from client records and imported bank statements. Click a month to see just that month.`}
          </div>
        </>
      )}
    </div>
  )
}
