'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState, useEffect } from 'react'

/**
 * Button on the Client Google Ads tab that links to the Negative List Builder
 * tab on the linked Google Ads audit doc.
 */
const OpenNegativeListBuilderButton = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [auditId, setAuditId] = useState<string | null>(null)
  const [auditName, setAuditName] = useState<string | null>(null)
  const [nlbStatus, setNlbStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return

    // Find the most recent Google Ads audit linked to this client
    fetch(`/api/google-ads-audits?where[client][equals]=${id}&sort=-createdAt&limit=1&depth=0`, {
      credentials: 'include',
    })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.docs?.[0]) {
          const audit = data.docs[0]
          setAuditId(audit.id)
          setAuditName(audit.businessName)
          if (audit.negativeListBuilder?.status) {
            setNlbStatus(audit.negativeListBuilder.status)
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  if (!id) return null

  const customerId = fields?.googleAdsCustomerId?.value as string | undefined

  if (loading) {
    return (
      <div style={{ marginBottom: 16, fontSize: 13, color: '#94a3b8' }}>
        Loading negative list builder...
      </div>
    )
  }

  if (!auditId) {
    return (
      <div style={{ marginBottom: 16, padding: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#64748b' }}>
        No Google Ads audit linked to this client yet. Create one first to use the Negative List Builder.
      </div>
    )
  }

  const statusLabels: Record<string, string> = {
    generated: 'Generated',
    team_review: 'Team Reviewing',
    team_approved: 'Team Approved',
    client_review: 'Client Reviewing',
    client_approved: 'Client Approved',
    applied: 'Applied',
    failed: 'Failed',
  }

  const statusColors: Record<string, string> = {
    generated: '#dbeafe',
    team_review: '#fef3c7',
    team_approved: '#dcfce7',
    client_review: '#fef3c7',
    client_approved: '#dcfce7',
    applied: '#dcfce7',
    failed: '#fee2e2',
  }

  // Link to the audit doc — tab index 7 is the Negative List Builder tab (0-indexed)
  const href = `/admin/collections/google-ads-audits/${auditId}#tab-8`

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <a
          href={href}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            background: '#7c3aed',
            color: '#fff',
            borderRadius: 6,
            fontWeight: 600,
            fontSize: 13,
            textDecoration: 'none',
            cursor: 'pointer',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          Open Negative List Builder
        </a>
        {nlbStatus && (
          <span style={{
            display: 'inline-block',
            padding: '2px 10px',
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 600,
            background: statusColors[nlbStatus] || '#f1f5f9',
            color: '#475569',
          }}>
            {statusLabels[nlbStatus] || nlbStatus}
          </span>
        )}
        {auditName && (
          <span style={{ fontSize: 12, color: '#94a3b8' }}>
            on {auditName}
          </span>
        )}
      </div>
      {!customerId && (
        <p style={{ marginTop: 6, fontSize: 12, color: '#f59e0b' }}>
          Set a Google Ads Customer ID on this client to use the builder.
        </p>
      )}
    </div>
  )
}

export default OpenNegativeListBuilderButton
