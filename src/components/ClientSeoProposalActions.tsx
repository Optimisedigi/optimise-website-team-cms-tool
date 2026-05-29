'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useEffect, useState } from 'react'
import { CopySeoProposalEmailButton } from './CopySeoProposalEmailButton'
import type { SeoProposalEmailReport } from '@/lib/seo-proposal-email'

/**
 * SEO Audit Proposal tab actions for the Client AND Client Proposal docs:
 * fetches the latest completed run for that doc and renders "View SEO Audit
 * Proposal" + "Copy Email" side by side — mirroring the buttons on the record.
 * The report isn't part of the host form, so we fetch it from
 * /api/seo-audit-proposals/latest (?clientId= or ?proposalId=).
 */
type LatestRun = {
  found: boolean
  id?: number
  reportSlug?: string | null
  status?: string | null
  websiteUrl?: string | null
  report?: SeoProposalEmailReport | null
}

const ClientSeoProposalActions = () => {
  const { id, collectionSlug } = useDocumentInfo()
  const [run, setRun] = useState<LatestRun | null>(null)
  const [loading, setLoading] = useState(false)

  // Same component serves the Client doc and the Client Proposal doc.
  const queryKey = collectionSlug === 'client-proposals' ? 'proposalId' : 'clientId'

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    fetch(`/api/seo-audit-proposals/latest?${queryKey}=${id}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: LatestRun | null) => {
        if (!cancelled) setRun(data)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id, queryKey])

  if (!id) return null
  if (loading) return <div style={{ marginBottom: 16, fontSize: 13, color: '#94a3b8' }}>Loading latest SEO Audit Proposal…</div>
  if (!run || !run.found || !run.id) {
    return (
      <div style={{ marginBottom: 16, fontSize: 13, color: '#94a3b8' }}>
        No SEO Audit Proposal linked yet. Run one above to create the linked record.
      </div>
    )
  }

  const isCompleted = run.status === 'completed'
  const href = `/seo-audit-proposals/${run.reportSlug || run.id}/v2`
  const adminHref = `/admin/collections/seo-audit-proposals/${run.id}`

  return (
    <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 13, color: '#94a3b8' }}>
        Latest linked SEO Audit Proposal: <strong>{run.status || 'pending'}</strong>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <a
          href={adminHref}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            background: '#334155',
            color: '#fff',
            borderRadius: 8,
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Open SEO Audit Proposal record
        </a>
        {isCompleted && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 20px',
              background: '#22c55e',
              color: '#fff',
              borderRadius: 8,
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            View SEO Audit Proposal &#8599;
          </a>
        )}
      </div>
      {isCompleted ? (
        <CopySeoProposalEmailButton
          report={run.report ?? null}
          websiteUrl={run.websiteUrl ?? null}
        />
      ) : (
        <div style={{ fontSize: 13, color: '#94a3b8' }}>
          View and Copy Email appear after the proposal run completes.
        </div>
      )}
    </div>
  )
}

export default ClientSeoProposalActions
