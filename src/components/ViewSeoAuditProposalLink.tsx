'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'

/**
 * Shows a "View SEO Audit Proposal" button when the record's run is complete.
 * Only meaningful on the seo-audit-proposals record itself (where status +
 * reportSlug live on the form).
 */
const ViewSeoAuditProposalLink = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const status = fields?.status?.value as string | undefined
  const reportSlug = fields?.reportSlug?.value as string | undefined

  if (!id || status !== 'completed') return null

  const href = `/seo-audit-proposals/${reportSlug || id}/v2`

  return (
    <div style={{ marginBottom: 20 }}>
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
  )
}

export default ViewSeoAuditProposalLink
