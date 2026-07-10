'use client'

/**
 * Slide 21 — Return modelling (Mission Control). Dynamic + client-interactive.
 *
 * The four inputs (AOV, lead conversion rate, lead-to-sale conversion rate,
 * purchase frequency) are editable inline: double-click any value in the
 * footer to activate an input, type a new number, press Enter or click away
 * to confirm. The table recalculates instantly. Changes are local to the
 * browser session (presentation-time tweaks) and don't persist to the CMS.
 *
 * SECURITY: this component is `'use client'` so its props are serialized into
 * the RSC payload. It receives a pre-projected `trafficModel` DTO (built in
 * page.tsx) — NOT the full competitor-analysis document — to prevent internal
 * audit data (raw keywords, SERP results, ad screenshots) from crossing the
 * wire.
 */

import { useState, useRef, useCallback, type ReactElement, type KeyboardEvent } from 'react'

type Row = {
  name: string
  visits: number
  leads: number
  clients: number
  monthlyReturn: number
  annualReturn: number | null
  isYou?: boolean
}

// ---------------------------------------------------------------------------
// Pure helpers (no React)
// ---------------------------------------------------------------------------

function formatVisits(n: number): string {
  if (n <= 0) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function formatMoney(n: number): string {
  if (n <= 0) return ''
  return `$${Math.round(n).toLocaleString()}`
}

function formatPct(n: number | null): string {
  if (n == null) return ''
  const rounded = Math.round(n * 100) / 100
  return `${rounded}%`
}

function buildRow(
  name: string,
  visits: number,
  lcr: number,
  ltsr: number,
  aov: number,
  apf: number | null,
  isYou = false,
): Row {
  const leads = Math.round(visits * lcr)
  const clients = Math.round(leads * ltsr)
  const monthlyReturn = clients * aov
  // Annual return is 12 months of the monthly return. `apf` only gates whether
  // the annual column is shown for this proposal, not the multiplier.
  const annualReturn = apf != null ? monthlyReturn * 12 : null
  return { name, visits, leads, clients, monthlyReturn, annualReturn, isYou }
}

// ---------------------------------------------------------------------------
// EditableNumber — looks like static text, turns into an input on double-click
// ---------------------------------------------------------------------------

type EditableNumberProps = {
  value: number
  onChange: (next: number) => void
  format: (n: number) => string
  /** min allowed value (default 0) */
  min?: number
  /** max allowed value (default Infinity) */
  max?: number
  /** step for the hidden input (default 'any') */
  step?: string
  label: string
}

function EditableNumber({
  value,
  onChange,
  format,
  min = 0,
  max = Infinity,
  step = 'any',
  label,
}: EditableNumberProps): ReactElement {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const activate = useCallback(() => {
    setDraft(String(value))
    setEditing(true)
    // Focus after React flushes the state update.
    setTimeout(() => inputRef.current?.select(), 0)
  }, [value])

  const commit = useCallback(() => {
    const n = parseFloat(draft)
    if (Number.isFinite(n) && n >= min && n <= max) {
      onChange(n)
    }
    setEditing(false)
  }, [draft, min, max, onChange])

  const onKey = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') setEditing(false)
  }, [commit])

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKey}
        style={{
          width: 90,
          fontFamily: 'inherit',
          fontSize: 'inherit',
          fontWeight: 'inherit',
          color: 'var(--purple-deep)',
          background: 'rgba(77,148,255,0.08)',
          border: '1.5px solid var(--purple-deep)',
          borderRadius: 6,
          padding: '2px 6px',
          outline: 'none',
          textAlign: 'center',
        }}
      />
    )
  }

  return (
    <span
      onDoubleClick={activate}
      title={`Double-click to edit ${label}`}
      style={{
        cursor: 'default',
        borderBottom: '1.5px dashed rgba(77,148,255,0.4)',
        paddingBottom: 1,
        // Subtle affordance — no visible change until double-clicked.
        transition: 'border-color 120ms ease',
      }}
    >
      {format(value)}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Main slide component
// ---------------------------------------------------------------------------

export type ReturnModellingTrafficModel = {
  yourMonthlyVisits: number
  competitors: Array<{ name: string; monthlyVisits: number }>
}

export function ReturnModellingSlide({
  businessName,
  leadConversionRate,
  leadToSaleConversionRate,
  averageOrderValue,
  annualPurchaseFrequency,
  overrideMonthlyVisits,
  trafficModel,
}: {
  businessName: string
  leadConversionRate: number | null
  leadToSaleConversionRate: number | null
  averageOrderValue: number | null
  annualPurchaseFrequency: number | null
  overrideMonthlyVisits: number | null
  trafficModel: ReturnModellingTrafficModel
}): ReactElement | null {
  // Local editable state — seeded from CMS values, local-only changes.
  const [aov, setAov] = useState<number>(averageOrderValue ?? 0)
  const [lcr, setLcr] = useState<number>(leadConversionRate ?? 0)
  const [ltsr, setLtsr] = useState<number>(leadToSaleConversionRate ?? 0)
  const [apf, setApf] = useState<number | null>(annualPurchaseFrequency)

  // All three core inputs are required for the table to be meaningful.
  if (averageOrderValue == null || leadConversionRate == null || leadToSaleConversionRate == null) {
    return null
  }

  const lcrDecimal = lcr / 100
  const ltsrDecimal = ltsr / 100

  const yourVisits =
    overrideMonthlyVisits != null
      ? overrideMonthlyVisits
      : trafficModel.yourMonthlyVisits

  const rows: Row[] = [
    buildRow(businessName, yourVisits, lcrDecimal, ltsrDecimal, aov, apf, true),
  ]
  for (const c of trafficModel.competitors) {
    rows.push(buildRow(c.name, c.monthlyVisits, lcrDecimal, ltsrDecimal, aov, apf))
  }
  rows.sort((a, b) => {
    if (a.isYou) return -1
    if (b.isYou) return 1
    return b.visits - a.visits
  })

  const headMeta = 'What is your traffic actually worth?'

  return (
    <section className="slide" data-label="20 Return Modelling">
      <div className="brand-tag">
        <span className="dot"></span> 07 · Mission Control
      </div>
      <div className="slide-head">
        <div className="h-left">
          <div className="h-eyebrow">07 · Mission Control</div>
          <h1 className="h-title">Return modelling</h1>
        </div>
        <div className="h-meta">{headMeta}</div>
      </div>

      <table className="t compact" style={{ marginBottom: 24 }}>
        <thead>
          <tr>
            <th>Business</th>
            <th className="num" style={{ textAlign: 'right' }}>Monthly visits</th>
            <th className="num" style={{ textAlign: 'right' }}>Conv. rate</th>
            <th className="num" style={{ textAlign: 'right' }}>Leads / mo</th>
            <th className="num" style={{ textAlign: 'right' }}>Paying clients</th>
            <th className="num" style={{ textAlign: 'right' }}>Monthly return</th>
            {apf != null && (
              <th className="num" style={{ textAlign: 'right' }}>Annual return</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row.name}-${i}`} className={row.isYou ? 'you' : undefined}>
              <td style={{ whiteSpace: 'nowrap' }}>
                {row.name}
                {row.isYou && (
                  <span className="you-tag" style={{ marginLeft: 10, verticalAlign: 'middle' }}>
                    Today
                  </span>
                )}
              </td>
              <td className="num" style={{ textAlign: 'right' }}>{formatVisits(row.visits)}</td>
              <td className="num" style={{ textAlign: 'right' }}>{formatPct(lcr)}</td>
              <td className="num" style={{ textAlign: 'right' }}>{row.leads.toLocaleString()}</td>
              <td className="num" style={{ textAlign: 'right' }}>{row.clients.toLocaleString()}</td>
              <td className="num" style={{ textAlign: 'right' }}>{formatMoney(row.monthlyReturn)}</td>
              {apf != null && (
                <td className="num" style={{ textAlign: 'right' }}>
                  {row.annualReturn != null ? formatMoney(row.annualReturn) : ''}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Footer — all four editable values sit here. Double-click any to edit. */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 40,
          padding: '0 80px',
          fontSize: 18,
          fontFamily: "'JetBrains Mono', monospace",
          color: 'var(--ink-mute)',
          lineHeight: 1.4,
          flexWrap: 'wrap',
        }}
      >
        <span>
          AOV{' '}
          <EditableNumber
            value={aov}
            onChange={setAov}
            format={(n) => `$${n.toLocaleString()}`}
            min={0}
            step="1"
            label="Average Order Value"
          />
        </span>
        <span>
          Conv. rate{' '}
          <EditableNumber
            value={lcr}
            onChange={setLcr}
            format={formatPct}
            min={0}
            max={100}
            step="0.1"
            label="Lead Conversion Rate"
          />
        </span>
        <span>
          Lead to sale{' '}
          <EditableNumber
            value={ltsr}
            onChange={setLtsr}
            format={formatPct}
            min={0}
            max={100}
            step="0.1"
            label="Lead to Sale Rate"
          />
        </span>
        {apf != null && (
          <span>
            Frequency{' '}
            <EditableNumber
              value={apf}
              onChange={setApf}
              format={(n) => `${n}×`}
              min={0}
              step="0.1"
              label="Purchase Frequency"
            />
            {' / yr'}
          </span>
        )}
        <span style={{ color: 'var(--ink-mute)', opacity: 0.5, fontSize: 15, alignSelf: 'center' }}>
          double-click any value to edit
        </span>
      </div>

      <div className="slide-foot"></div>
    </section>
  )
}
