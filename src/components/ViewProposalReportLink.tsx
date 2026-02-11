'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'

const ViewProposalReportLink = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const slug = fields?.slug?.value as string | undefined
  const auditStatus = fields?.auditStatus?.value as string | undefined

  if (!id || auditStatus !== 'completed') return null

  const href = `/proposals/${slug || id}`

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
        View Proposal Report &#8599;
      </a>
    </div>
  )
}

export default ViewProposalReportLink
