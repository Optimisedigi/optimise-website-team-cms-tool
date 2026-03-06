'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState, useEffect } from 'react'

const ViewGoogleDashboardButton = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [clientSlug, setClientSlug] = useState<string | null>(null)

  // Direct slug from Clients collection
  const slug = fields?.slug?.value as string | undefined

  // Client relationship ID from Google Ads Audit collection
  const clientRelId = fields?.client?.value as string | number | undefined

  // Fetch client slug when on a Google Ads Audit with a linked client
  useEffect(() => {
    if (slug || !clientRelId) return

    fetch(`/api/clients/${clientRelId}?depth=0&select[slug]=true`, {
      credentials: 'include',
    })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.slug) setClientSlug(data.slug)
      })
      .catch(() => {})
  }, [slug, clientRelId])

  if (!id) return null

  const resolvedSlug = slug || clientSlug

  // Need either a slug or a client relationship to show anything
  const googleAdsCustomerId = fields?.googleAdsCustomerId?.value as string | undefined
  if (!resolvedSlug && !googleAdsCustomerId && !clientRelId) return null

  if (resolvedSlug) {
    return (
      <div style={{ marginBottom: 20 }}>
        <a
          href={`/google-dashboard/${resolvedSlug}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            background: '#2563eb',
            color: '#fff',
            borderRadius: 8,
            border: 'none',
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
            textDecoration: 'none',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          View Google Ads Dashboard
        </a>
      </div>
    )
  }

  return null
}

export default ViewGoogleDashboardButton
