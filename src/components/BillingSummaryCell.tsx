'use client'

import type { DefaultCellComponentProps } from 'payload'
import { useEffect, useState } from 'react'

/**
 * Custom cell for the Billing Summary column in the clients list view.
 * Fetches full client data to calculate total revenue to date:
 * retainer revenue + historical revenue + one-off projects.
 *
 * We fetch via API because Payload's list view doesn't include array fields
 * (oneOffProjects, retainerHistory) in rowData at depth 0.
 */
function BillingSummaryCell({ rowData }: DefaultCellComponentProps) {
  const [total, setTotal] = useState<number | null>(null)
  const id = rowData?.id

  useEffect(() => {
    if (!id || rowData?.isAgency) return

    fetch(`/api/clients/${id}?depth=0`)
      .then((res) => res.json())
      .then((doc) => {
        const monthlyRetainer = Number(doc.monthlyRetainer) || 0
        const historicalRevenue = Number(doc.historicalRevenue) || 0
        const clientStartDate = doc.clientStartDate as string | null
        const oneOffProjects = Array.isArray(doc.oneOffProjects) ? doc.oneOffProjects : []
        const retainerHistory = Array.isArray(doc.retainerHistory) ? doc.retainerHistory : []

        // One-off totals
        const oneOffTotal = oneOffProjects.reduce(
          (sum: number, p: any) => sum + (Number(p?.amount) || 0),
          0,
        )

        // Retainer revenue to date
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

        setTotal(retainerRevenue + oneOffTotal + historicalRevenue)
      })
      .catch(() => setTotal(0))
  }, [id, rowData?.isAgency])

  if (rowData?.isAgency) return null
  if (total === null) return <span style={{ color: 'var(--theme-elevation-400)' }}>...</span>
  if (total === 0) return <span style={{ color: 'var(--theme-elevation-400)' }}>--</span>

  return (
    <span style={{ fontWeight: 600, color: '#6366f1' }}>
      ${total.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
    </span>
  )
}

function monthsBetween(start: Date, end: Date): number {
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
  return Math.max(0, months)
}

export default BillingSummaryCell
