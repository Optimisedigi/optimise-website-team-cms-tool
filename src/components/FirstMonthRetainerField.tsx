'use client'

import { useFormFields } from '@payloadcms/ui'
import type { ReactElement } from 'react'

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
const FirstMonthRetainerField = (): ReactElement => {
  const { retainerStartDate, clientStartDate, monthlyRetainer } = useFormFields(
    ([fields]) => ({
      retainerStartDate: asString(fields?.retainerStartDate?.value),
      clientStartDate: asString(fields?.clientStartDate?.value),
      monthlyRetainer: asNumber(fields?.monthlyRetainer?.value),
    }),
  )

  const anchor = retainerStartDate ?? clientStartDate
  const amount = firstMonthRetainerAmount(monthlyRetainer, anchor)

  const computable = Boolean(anchor) && monthlyRetainer > 0

  const formatted = computable
    ? amount.toLocaleString('en-AU', {
        style: 'currency',
        currency: 'AUD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })
    : '\u2014'

  const fromDate =
    computable && anchor
      ? new Date(anchor).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
      : null

  return (
    <div className="field-type od-biz-first-month" style={{ marginBottom: 0 }}>
      <span className="od-biz-label" id="od-biz-first-month-label">
        First month
      </span>
      <div
        className="od-biz-first-month__value"
        role="status"
        aria-labelledby="od-biz-first-month-label"
        data-testid="first-month-value"
      >
        {formatted}
      </div>
      <p className="od-biz-hint" data-testid="first-month-hint">
        {fromDate ? `Pro-rated from ${fromDate}` : 'Set a retainer and start date'}
      </p>
    </div>
  )
}

export default FirstMonthRetainerField
