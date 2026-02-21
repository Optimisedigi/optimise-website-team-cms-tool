'use client'

import { useDocumentInfo } from '@payloadcms/ui'

const ViewClientBlogPostsButton = () => {
  const { id } = useDocumentInfo()

  if (!id) return null

  const href = `/admin/collections/blog-posts?where[client][equals]=${id}`

  return (
    <div style={{ marginBottom: 20 }}>
      <a
        href={href}
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
        View Blog Posts &#8599;
      </a>
    </div>
  )
}

export default ViewClientBlogPostsButton
