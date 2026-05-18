'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useEffect, useState } from 'react'
import {
  monthlyCommissionForDate,
  netMonthlyRetainer,
  oneOffsYTD,
  retainerRevenueYTD,
  type ReferralCommission,
  type RetainerHistoryEntry,
  type OneOffProject,
} from '@/lib/client-revenue'

type ClientBillingData = {
  monthlyRetainer: number
  historicalRevenue: number
  clientStartDate: string | null
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
          historicalRevenue: doc.historicalRevenue ?? 0,
          clientStartDate: doc.clientStartDate ?? null,
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
    historicalRevenue,
    clientStartDate,
    oneOffProjects,
    retainerHistory,
    referralCommissions,
  } = data

  const now = new Date()
  const activeMonthlyCommission = monthlyCommissionForDate(
    referralCommissions,
    monthlyRetainer,
    now,
  )
  const netRetainer = netMonthlyRetainer(monthlyRetainer, referralCommissions, now)
  const retainerRevenue = retainerRevenueYTD(
    {
      monthlyRetainer,
      clientStartDate,
      retainerHistory,
      referralCommissions,
    },
    now,
  )
  const oneOffTotal = oneOffsYTD(oneOffProjects, now)
  const totalRevenue = retainerRevenue + oneOffTotal + historicalRevenue

  if (totalRevenue === 0 && monthlyRetainer === 0) return null

  const retainerLabel = activeMonthlyCommission > 0 ? 'Net Monthly Retainer' : 'Monthly Retainer'
  const retainerSubtext =
    activeMonthlyCommission > 0
      ? `${formatCurrency(monthlyRetainer)} gross − ${formatCurrency(activeMonthlyCommission)} commission`
      : null

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
