'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

type Process = {
  id: string
  processTitle: string
  overallStatus: string
  retainerType?: string
  lastSharedAt?: string
  sharedCount?: number
  phases?: Array<{
    steps?: Array<{ stepStatus?: string }>
  }>
}

const retainerLabels: Record<string, string> = {
  google_ads_only: 'Google Ads',
  meta_ads_only: 'Meta Ads',
  seo_only: 'SEO',
  website_build_only: 'Website Build',
  website_seo: 'Website + SEO',
  website_seo_google_ads: 'Website + SEO + Ads',
  full_integration: 'Full Integration',
  ai_automations: 'AI Automations',
  custom: 'Custom',
}

const statusColors: Record<string, { bg: string; color: string }> = {
  not_started: { bg: '#e5e7eb', color: '#374151' },
  in_progress: { bg: '#dbeafe', color: '#1d4ed8' },
  on_hold: { bg: '#fef3c7', color: '#92400e' },
  completed: { bg: '#d1fae5', color: '#065f46' },
  cancelled: { bg: '#fee2e2', color: '#991b1b' },
}

const statusLabels: Record<string, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

function calcCompletion(process: Process): number {
  const phases = process.phases || []
  let total = 0
  let done = 0
  for (const phase of phases) {
    for (const step of phase.steps || []) {
      total++
      if (step.stepStatus === 'completed' || step.stepStatus === 'skipped') done++
    }
  }
  return total === 0 ? 0 : Math.round((done / total) * 100)
}

const LinkedProcesses = () => {
  const { id, collectionSlug } = useDocumentInfo()
  const [processes, setProcesses] = useState<Process[]>([])
  const [loading, setLoading] = useState(true)

  const fieldName = collectionSlug === 'sales-leads' ? 'salesLead' : 'client'

  useEffect(() => {
    if (!id) return
    fetch(
      `/api/client-processes?where[${fieldName}][equals]=${id}&depth=0&limit=10&sort=-updatedAt`,
      { credentials: 'include' },
    )
      .then((res) => res.json())
      .then((data) => setProcesses(data.docs ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id, fieldName])

  if (!id) return null

  if (loading) {
    return <p style={{ color: 'var(--theme-elevation-500)', fontSize: 14 }}>Loading processes…</p>
  }

  if (processes.length === 0) {
    return (
      <p style={{ color: 'var(--theme-elevation-500)', fontSize: 14, marginBottom: 8 }}>
        No active processes
      </p>
    )
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--theme-elevation-600)', marginBottom: 10 }}>
        Linked Processes ({processes.length})
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {processes.map((proc) => {
          const pct = calcCompletion(proc)
          const status = statusColors[proc.overallStatus] || statusColors.not_started

          return (
            <a
              key={proc.id}
              href={`/admin/collections/client-processes/${proc.id}`}
              style={{
                display: 'block',
                padding: '10px 14px',
                background: '#fff',
                border: '1px solid var(--theme-elevation-150, #e5e7eb)',
                borderRadius: 6,
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: '#3b82f6' }}>
                    {proc.processTitle || 'Untitled'}
                  </span>
                  {proc.retainerType && (
                    <span style={{ fontSize: 10, color: '#6b7280', background: '#f3f4f6', padding: '1px 6px', borderRadius: 4 }}>
                      {retainerLabels[proc.retainerType] || proc.retainerType}
                    </span>
                  )}
                </div>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    color: status.color,
                    background: status.bg,
                    textTransform: 'capitalize',
                  }}
                >
                  {statusLabels[proc.overallStatus] || proc.overallStatus}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    flex: 1,
                    height: 6,
                    background: '#e5e7eb',
                    borderRadius: 3,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      background: pct === 100 ? '#22c55e' : '#3b82f6',
                      borderRadius: 3,
                      transition: 'width 0.3s',
                    }}
                  />
                </div>
                <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>
                  {pct}%
                </span>
              </div>
              {proc.lastSharedAt && (
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                  Last shared{' '}
                  {new Date(proc.lastSharedAt).toLocaleDateString('en-AU', {
                    day: 'numeric',
                    month: 'short',
                  })}
                  {proc.sharedCount ? ` (${proc.sharedCount}x)` : ''}
                </div>
              )}
            </a>
          )
        })}
      </div>
    </div>
  )
}

export default LinkedProcesses
