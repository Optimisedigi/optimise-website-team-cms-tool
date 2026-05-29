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
  if (!run || !run.found || run.status !== 'completed') {
    return (
      <div style={{ marginBottom: 16, fontSize: 13, color: '#94a3b8' }}>
        No completed SEO Audit Proposal yet — run one above to enable View &amp; Copy Email.
      </div>
    )
  }

  const href = `/seo-audit-proposals/${run.reportSlug || run.id}/v2`

  return (
    <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
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
      </div>
      <CopySeoProposalEmailButton
        report={run.report ?? null}
        websiteUrl={run.websiteUrl ?? null}
      />
    </div>
  )
}

export default ClientSeoProposalActions
