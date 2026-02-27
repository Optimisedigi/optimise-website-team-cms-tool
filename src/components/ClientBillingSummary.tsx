'use client'

import { useDocumentInfo, useFormFields } from '@payloadcms/ui'

/**
 * Billing summary displayed above the tabs on the client edit page.
 * Shows monthly retainer, one-off billings total, and total revenue to date.
 */
function ClientBillingSummary() {
  const { id } = useDocumentInfo()

  const monthlyRetainer = useFormFields(([fields]) => fields.monthlyRetainer?.value as number | undefined) ?? 0
  const historicalRevenue = useFormFields(([fields]) => fields.historicalRevenue?.value as number | undefined) ?? 0
  const clientStartDate = useFormFields(([fields]) => fields.clientStartDate?.value as string | undefined)
  const oneOffProjects = useFormFields(([fields]) => fields.oneOffProjects?.value as any[] | undefined) ?? []
  const retainerHistory = useFormFields(([fields]) => fields.retainerHistory?.value as any[] | undefined) ?? []

  if (!id) return null

  // Calculate one-off totals
  const oneOffTotal = oneOffProjects.reduce((sum: number, p: any) => sum + (Number(p?.amount) || 0), 0)

  // Calculate retainer revenue to date
  let retainerRevenue = 0
  if (clientStartDate && monthlyRetainer > 0) {
    // Build timeline of retainer amounts from history (sorted by effectiveDate desc)
    const sortedHistory = [...retainerHistory]
      .filter((h: any) => h?.effectiveDate && h?.amount != null)
      .sort((a: any, b: any) => new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime())

    const start = new Date(clientStartDate)
    const now = new Date()

    if (sortedHistory.length > 0) {
      // Walk through retainer periods
      let periodStart = start
      for (const entry of sortedHistory) {
        const changeDate = new Date(entry.effectiveDate)
        if (changeDate > periodStart) {
          const months = monthsBetween(periodStart, changeDate)
          retainerRevenue += months * (Number(entry.previousAmount) || 0)
          periodStart = changeDate
        }
      }
      // Current retainer from last change to now
      const months = monthsBetween(periodStart, now)
      retainerRevenue += months * monthlyRetainer
    } else {
      // No history: simple calculation
      const months = monthsBetween(start, now)
      retainerRevenue = months * monthlyRetainer
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
