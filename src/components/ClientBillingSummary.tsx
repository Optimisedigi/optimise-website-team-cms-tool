'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useEffect, useState } from 'react'
import {
  firstMonthProrationFactor,
  historicalRevenueTotal,
  monthlyCommissionForDate,
  netMonthlyRetainer,
  oneOffsYTD,
  retainerRevenueYTD,
  revenueShareFactor,
  type HistoricalRevenueYear,
  type ReferralCommission,
  type RetainerHistoryEntry,
  type OneOffProject,
} from '@/lib/client-revenue'

type ClientBillingData = {
  monthlyRetainer: number
  setupFee: number
  revenueSharePercent: number
  historicalRevenueByYear: HistoricalRevenueYear[]
  clientStartDate: string | null
  retainerStartDate: string | null
  oneOffProjects: OneOffProject[]
  retainerHistory: RetainerHistoryEntry[]
  referralCommissions: ReferralCommission[]
  isAgency: boolean
}

/**
 * Billing summary displayed above the tabs on the client edit page.
 * Shows monthly retainer (gross + net), active commissions, one-off
 * billings YTD, and total revenue to date.
 */
function ClientBillingSummary() {
  const { id } = useDocumentInfo()
  const [data, setData] = useState<ClientBillingData | null>(null)

  useEffect(() => {
    if (!id) return
    fetch(`/api/clients/${id}?depth=0`)
      .then((res) => res.json())
      .then((doc) => {
        setData({
          monthlyRetainer: doc.monthlyRetainer ?? 0,
          setupFee: doc.setupFee ?? 0,
          revenueSharePercent: Number(doc.revenueSharePercent ?? 100),
          historicalRevenueByYear: Array.isArray(doc.historicalRevenueByYear)
            ? doc.historicalRevenueByYear
            : [],
          clientStartDate: doc.clientStartDate ?? null,
          retainerStartDate: doc.retainerStartDate ?? null,
          oneOffProjects: Array.isArray(doc.oneOffProjects) ? doc.oneOffProjects : [],
          retainerHistory: Array.isArray(doc.retainerHistory) ? doc.retainerHistory : [],
          referralCommissions: Array.isArray(doc.referralCommissions)
            ? doc.referralCommissions
            : [],
          isAgency: !!doc.isAgency,
        })
      })
      .catch(() => {})
  }, [id])

  if (!id || !data || data.isAgency) return null

  const {
    monthlyRetainer,
    setupFee,
    revenueSharePercent,
    historicalRevenueByYear,
    clientStartDate,
    retainerStartDate,
    oneOffProjects,
    retainerHistory,
    referralCommissions,
  } = data

  const share = revenueShareFactor(revenueSharePercent)
  const shareLessThanFull = revenueSharePercent > 0 && revenueSharePercent < 100

  const now = new Date()
  const activeMonthlyCommission = monthlyCommissionForDate(
    referralCommissions,
    monthlyRetainer,
    now,
  )
  const anchorIso = retainerStartDate ?? clientStartDate
  const anchor = anchorIso ? new Date(anchorIso) : null
  const thisMonthFactor =
    anchor && !isNaN(anchor.getTime()) ? firstMonthProrationFactor(anchor, now) : 1
  const netRetainerFull =
    netMonthlyRetainer(monthlyRetainer, referralCommissions, now) * thisMonthFactor
  const netRetainer = netRetainerFull * share
  // Current-year historical rows are retainer income for this year that
  // pre-dates CMS tracking — count them toward Retainer YTD (matches the
  // dashboard rollup).
  const currentYear = now.getFullYear()
  const priorPeriodThisYear = Array.isArray(historicalRevenueByYear)
    ? historicalRevenueByYear.reduce(
        (s, r) =>
          Number(r?.year) === currentYear && Number.isFinite(Number(r?.amount))
            ? s + Math.max(0, Number(r?.amount))
            : s,
        0,
      )
    : 0
  // Retainer Revenue YTD now folds in setupFee + retainer-tagged one-offs
  // + current-year historical rows.
  const retainerRevenue =
    (retainerRevenueYTD(
      {
        monthlyRetainer,
        setupFee,
        clientStartDate,
        retainerStartDate,
        retainerHistory,
        referralCommissions,
        oneOffProjects,
      },
      now,
    ) +
      priorPeriodThisYear) *
    share
  // Pure one-offs only (rows without countTowardsRetainer).
  const oneOffTotal = oneOffsYTD(oneOffProjects, now, false) * share
  // Lifetime historical (all years) for the totalRevenue stat.
  const historicalRevenueFull = historicalRevenueTotal(historicalRevenueByYear)
  // Lifetime total = retainer-this-year (already incl. current-year historical)
  //                + one-offs this year
  //                + historical from prior years (also share-adjusted)
  const priorYearsHistorical = (historicalRevenueFull - priorPeriodThisYear) * share
  const totalRevenue = retainerRevenue + oneOffTotal + priorYearsHistorical

  // Setup fee counts toward Retainer YTD in the year of clientStartDate—
  // surface it as its own stat when applicable.
  const startDate = clientStartDate ? new Date(clientStartDate) : null
  const setupFeeApplies =
    !!startDate && !isNaN(startDate.getTime()) && startDate.getFullYear() === now.getFullYear() && setupFee > 0

  if (totalRevenue === 0 && monthlyRetainer === 0 && setupFee === 0) return null

  const retainerLabel = activeMonthlyCommission > 0 ? 'Net Monthly Retainer' : 'Monthly Retainer'
  // Subtext: existing commission line, plus a share note when < 100%.
  const subtextParts: string[] = []
  if (activeMonthlyCommission > 0) {
    subtextParts.push(
      `${formatCurrency(monthlyRetainer)} gross − ${formatCurrency(activeMonthlyCommission)} commission`,
    )
  }
  if (shareLessThanFull) {
    subtextParts.push(`${revenueSharePercent}% share applied`)
  }
  const retainerSubtext = subtextParts.length > 0 ? subtextParts.join(' • ') : null

  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        padding: '12px 0 16px',
        borderBottom: '1px solid var(--theme-border-color)',
        marginBottom: 12,
        flexWrap: 'wrap',
      }}
    >
      <StatBox
        label={retainerLabel}
        value={formatCurrency(netRetainer)}
        subtext={retainerSubtext}
      />
      {activeMonthlyCommission > 0 && (
        <StatBox
          label="Active Commissions"
          value={`− ${formatCurrency(activeMonthlyCommission)}/mo`}
        />
      )}
      {setupFeeApplies && (
        <StatBox
          label="Setup Fee (in Retainer YTD)"
          value={formatCurrency(setupFee * share)}
        />
      )}
      <StatBox label="One-Off Billings (YTD)" value={formatCurrency(oneOffTotal)} />
      <StatBox label="Total Revenue to Date" value={formatCurrency(totalRevenue)} highlight />
      {clientStartDate && (
        <StatBox
          label="Client Since"
          value={new Date(clientStartDate).toLocaleDateString('en-AU', {
            month: 'short',
            year: 'numeric',
          })}
        />
      )}
    </div>
  )
}

function StatBox({
  label,
  value,
  highlight,
  subtext,
}: {
  label: string
  value: string
  highlight?: boolean
  subtext?: string | null
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--theme-elevation-400)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: highlight ? 20 : 16,
          fontWeight: 700,
          color: highlight ? '#6366f1' : 'var(--theme-elevation-800)',
        }}
      >
        {value}
      </span>
      {subtext && (
        <span
          style={{
            fontSize: 10,
            color: 'var(--theme-elevation-400)',
            fontWeight: 500,
          }}
        >
          {subtext}
        </span>
      )}
    </div>
  )
}

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export default ClientBillingSummary
