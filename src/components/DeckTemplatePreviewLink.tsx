'use client'

import { useFormFields } from '@payloadcms/ui'

const DeckTemplatePreviewLink = () => {
  const slug = useFormFields(([fields]) => {
    const v = fields?.templateSlug?.value
    return typeof v === 'string' ? v : ''
  })

  if (!slug) {
    return (
      <div style={{ marginBottom: '1rem' }}>
        <em style={{ color: '#888', fontSize: 13 }}>
          Save with a templateSlug to enable preview.
        </em>
      </div>
    )
  }

  const href = `/partners/_preview/${encodeURIComponent(slug)}`

  return (
    <div style={{ marginBottom: '1rem' }}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-block',
          padding: '0.5rem 1rem',
          background: '#2563eb',
          color: 'white',
          borderRadius: 6,
          textDecoration: 'none',
          fontWeight: 600,
          fontSize: 14,
        }}
      >
        Preview template →
      </a>
      <p style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
        Opens the template at {href} with the sample payload. Admin-only.
      </p>
    </div>
  )
}

export default DeckTemplatePreviewLink
