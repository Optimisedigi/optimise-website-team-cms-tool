'use client'

import { useDocumentInfo } from '@payloadcms/ui'

const DownloadMarkdownButton = () => {
  const { id } = useDocumentInfo()

  if (!id) return null

  return (
    <div style={{ marginBottom: 20 }}>
      <a
        href={`/api/audit-markdown?id=${id}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 20px',
          background: '#3b82f6',
          color: '#fff',
          borderRadius: 8,
          textDecoration: 'none',
          fontWeight: 600,
          fontSize: 14,
        }}
      >
        Download Markdown &#8595;
      </a>
    </div>
  )
}

export default DownloadMarkdownButton
