'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useEffect, useState } from 'react'
import GoogleAdsBudgetManagement from './GoogleAdsBudgetManagement'

/**
 * Embeds the Budget Management UI on the Clients > Google Ads tab.
 *
 * The underlying GoogleAdsBudgetManagement component is audit-scoped — every
 * API call uses an audit ID, and budgets are persisted on the
 * google-ads-campaign-budgets collection keyed by audit. This wrapper finds
 * the latest audit linked to the current client and feeds its ID through.
 *
 * Edge cases:
 *  - Client has no Google Ads audit yet → show a hint to run one.
 *  - Multiple audits → use the most recent (sort=-createdAt).
 *  - Client has a googleAdsCustomerId but no audit yet → still prompt to run
 *    an audit, since budget storage requires the audit record.
 */
const ClientBudgetManagementInline = () => {
  const { id: clientId } = useDocumentInfo()
  const [auditId, setAuditId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasNoAudit, setHasNoAudit] = useState(false)

  useEffect(() => {
    if (!clientId) return
    let cancelled = false

    const fetchLatestAudit = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/google-ads-audits?where[client][equals]=${clientId}&limit=1&sort=-createdAt&depth=0`,
          { credentials: 'include' },
        )
        if (!res.ok) throw new Error(`Failed to load audits (${res.status})`)
        const data = await res.json()
        const latest = data?.docs?.[0]
        if (!cancelled) {
          if (latest?.id) {
            setAuditId(latest.id)
            setHasNoAudit(false)
          } else {
            setHasNoAudit(true)
            setAuditId(null)
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load audits')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchLatestAudit()
    return () => {
      cancelled = true
    }
  }, [clientId])

  if (!clientId) return null

  if (loading) {
    return (
      <div
        style={{
          padding: '12px 0',
          fontSize: 13,
          color: 'var(--theme-elevation-500)',
        }}
      >
        Loading Budget Management…
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          padding: 12,
          background: 'var(--theme-error-100)',
          color: 'var(--theme-error-800)',
          border: '1px solid var(--theme-error-300)',
          borderRadius: 4,
          fontSize: 13,
        }}
      >
        Budget Management error: {error}
      </div>
    )
  }

  if (hasNoAudit || !auditId) {
    return (
      <div
        style={{
          padding: 16,
          background: 'var(--theme-elevation-50)',
          border: '1px dashed var(--theme-elevation-200)',
          borderRadius: 6,
          fontSize: 13,
          color: 'var(--theme-elevation-700)',
        }}
      >
        <strong>Budget Management</strong>
        <p style={{ margin: '6px 0 0', color: 'var(--theme-elevation-600)' }}>
          Run a Google Ads audit for this client first. Budget Management is
          scoped to a specific audit — once you have one, the latest audit&apos;s
          budget data will appear here.
        </p>
      </div>
    )
  }

  return <GoogleAdsBudgetManagement auditId={auditId} />
}

export default ClientBudgetManagementInline
