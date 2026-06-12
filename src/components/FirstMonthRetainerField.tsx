'use client'

import { useFormFields } from '@payloadcms/ui'

import { firstMonthRetainerAmount } from '../lib/client-revenue'

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function asNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * Read-only admin field showing the live pro-rated first-month retainer as the
 * user edits the retainer start date + monthly retainer. Mirrors the backend
 * `firstMonthRetainerAmount` math so the admin preview matches YTD rollups.
 */
const FirstMonthRetainerField = () => {
  const { retainerStartDate, clientStartDate, monthlyRetainer } = useFormFields(
    ([fields]) => ({
      retainerStartDate: asString(fields?.retainerStartDate?.value),
      clientStartDate: asString(fields?.clientStartDate?.value),
      monthlyRetainer: asNumber(fields?.monthlyRetainer?.value),
    }),
  )

  const anchor = retainerStartDate ?? clientStartDate
  const amount = firstMonthRetainerAmount(monthlyRetainer, anchor)

  if (!anchor || monthlyRetainer <= 0) {
    return (
      <div className="field-type" style={{ marginBottom: 0 }}>
        <label className="field-label">First-month retainer</label>
        <p style={{ color: 'var(--theme-elevation-400)', margin: '4px 0 0' }}>
          Set a monthly retainer and start date to preview the pro-rated first month.
        </p>
      </div>
    )
  }

  const start = new Date(anchor)
  const daysInMonth = new Date(
    start.getFullYear(),
    start.getMonth() + 1,
    0,
  ).getDate()
  const billedDays = daysInMonth - start.getDate() + 1
  const isProrated = billedDays < daysInMonth

  const formatted = amount.toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })

  return (
    <div className="field-type" style={{ marginBottom: 0 }}>
      <label className="field-label">First-month retainer</label>
      <p style={{ margin: '4px 0 0', fontWeight: 600 }}>
        {formatted}
        {isProrated && (
          <span
            style={{
              marginLeft: 8,
              fontWeight: 400,
              color: 'var(--theme-elevation-500)',
            }}
          >
            — pro-rated, {billedDays} of {daysInMonth} days
          </span>
        )}
        {!isProrated && (
          <span
            style={{
              marginLeft: 8,
              fontWeight: 400,
              color: 'var(--theme-elevation-500)',
            }}
          >
            — full month
          </span>
        )}
      </p>
    </div>
  )
}

export default FirstMonthRetainerField
