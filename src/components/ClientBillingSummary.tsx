'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

type ClientBillingData = {
  monthlyRetainer: number
  historicalRevenue: number
  clientStartDate: string | null
  oneOffProjects: Array<{ amount: number; date: string }>
  retainerHistory: Array<{ amount: number; previousAmount: number; effectiveDate: string }>
  isAgency: boolean
}

/**
 * Billing summary displayed above the tabs on the client edit page.
 * Shows monthly retainer, one-off billings total, and total revenue to date.
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
          isAgency: !!doc.isAgency,
        })
      })
      .catch(() => {})
  }, [id])

  if (!id || !data || data.isAgency) return null

  const { monthlyRetainer, historicalRevenue, clientStartDate, oneOffProjects, retainerHistory } = data

  // Calculate one-off totals
  const oneOffTotal = oneOffProjects.reduce((sum, p) => sum + (Number(p?.amount) || 0), 0)

  // Calculate retainer revenue to date
  let retainerRevenue = 0
  if (monthlyRetainer > 0) {
    const now = new Date()

    if (clientStartDate) {
      const sortedHistory = [...retainerHistory]
        .filter((h) => h?.effectiveDate && h?.amount != null)
        .sort((a, b) => new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime())

      const start = new Date(clientStartDate)

      if (sortedHistory.length > 0) {
        let periodStart = start
        for (const entry of sortedHistory) {
          const changeDate = new Date(entry.effectiveDate)
          if (changeDate > periodStart) {
            const months = monthsBetween(periodStart, changeDate)
            retainerRevenue += months * (Number(entry.previousAmount) || 0)
            periodStart = changeDate
          }
        }
        const months = monthsBetween(periodStart, now)
        retainerRevenue += months * monthlyRetainer
      } else {
        const months = monthsBetween(start, now)
        retainerRevenue = months * monthlyRetainer
      }
    } else {
      // No start date: count current month only
      retainerRevenue = monthlyRetainer
    }
  }

  const totalRevenue = retainerRevenue + oneOffTotal + historicalRevenue

  if (totalRevenue === 0 && monthlyRetainer === 0) return null

  return (
    <div style={{
      display: 'flex',
      gap: 16,
      padding: '12px 0 16px',
      borderBottom: '1px solid var(--theme-border-color)',
      marginBottom: 12,
      flexWrap: 'wrap',
    }}>
      <StatBox label="Monthly Retainer" value={formatCurrency(monthlyRetainer)} />
      <StatBox label="One-Off Billings" value={formatCurrency(oneOffTotal)} />
      <StatBox label="Total Revenue to Date" value={formatCurrency(totalRevenue)} highlight />
      {clientStartDate && (
        <StatBox label="Client Since" value={new Date(clientStartDate).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })} />
      )}
    </div>
  )
}

function StatBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
    }}>
      <span style={{
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        color: 'var(--theme-elevation-400)',
      }}>
        {label}
      </span>
      <span style={{
        fontSize: highlight ? 20 : 16,
        fontWeight: 700,
        color: highlight ? '#6366f1' : 'var(--theme-elevation-800)',
      }}>
        {value}
      </span>
    </div>
  )
}

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function monthsBetween(start: Date, end: Date): number {
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
  return Math.max(0, months)
}

export default ClientBillingSummary
