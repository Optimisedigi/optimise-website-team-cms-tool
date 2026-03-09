'use client'

import type { DefaultCellComponentProps } from 'payload'

/**
 * Custom cell for the Billing Summary column in the clients list view.
 * Calculates total revenue to date: retainer revenue + historical revenue + one-off projects.
 */
function BillingSummaryCell({ rowData }: DefaultCellComponentProps) {
  if (rowData?.isAgency) return null

  const monthlyRetainer = Number(rowData?.monthlyRetainer) || 0
  const historicalRevenue = Number(rowData?.historicalRevenue) || 0
  const clientStartDate = rowData?.clientStartDate as string | null
  const oneOffProjects = Array.isArray(rowData?.oneOffProjects) ? rowData.oneOffProjects : []
  const retainerHistory = Array.isArray(rowData?.retainerHistory) ? rowData.retainerHistory : []

  // Calculate one-off totals
  const oneOffTotal = oneOffProjects.reduce(
    (sum: number, p: any) => sum + (Number(p?.amount) || 0),
    0,
  )

  // Calculate retainer revenue to date
  let retainerRevenue = 0
  if (monthlyRetainer > 0) {
    const now = new Date()

    if (clientStartDate) {
      const sortedHistory = [...retainerHistory]
        .filter((h: any) => h?.effectiveDate && h?.amount != null)
        .sort(
          (a: any, b: any) =>
            new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime(),
        )

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
      retainerRevenue = monthlyRetainer
    }
  }

  const totalRevenue = retainerRevenue + oneOffTotal + historicalRevenue

  if (totalRevenue === 0) return <span style={{ color: 'var(--theme-elevation-400)' }}>--</span>

  return (
    <span style={{ fontWeight: 600, color: '#6366f1' }}>
      ${totalRevenue.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
    </span>
  )
}

function monthsBetween(start: Date, end: Date): number {
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
  return Math.max(0, months)
}

export default BillingSummaryCell
