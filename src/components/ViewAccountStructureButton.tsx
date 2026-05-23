'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState, useEffect } from 'react'

/**
 * Payload admin field shown inside the Clients collection > Google Ads tab.
 *
 * Renders a "View Account Structure" deep-link to the frontend page at
 * `/client/[slug]/google-ads/account-structure`, which proxies to the live
 * Google Ads searchStream endpoint on growth-tools.
 *
 * Visible only when the document has both a slug and a Google Ads Customer ID
 * — without those the destination page returns 404.
 */
const ViewAccountStructureButton = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [showHelp, setShowHelp] = useState(false)
  const [clientSlug, setClientSlug] = useState<string | null>(null)

  // Direct slug (on Clients collection) OR relationship-based slug (on
  // Google Ads Audits collection, which has a `client` relationship).
  const clientRelId = fields?.client?.value as string | number | undefined
  const directSlug = (fields?.slug?.value as string | undefined) ?? undefined
  const googleAdsCustomerId = fields?.googleAdsCustomerId?.value as string | undefined

  useEffect(() => {
    if (directSlug || !clientRelId) return
    fetch(`/api/clients/${clientRelId}?depth=0&select[slug]=true&select[googleAdsCustomerId]=true`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.slug) setClientSlug(data.slug)
      })
      .catch(() => {})
  }, [directSlug, clientRelId])

  if (!id) return null

  const resolvedSlug = directSlug || clientSlug
  if (!resolvedSlug) return null

  // Without a Customer ID the destination page 404s — hide the button so
  // the team isn't tempted to click into a broken state.
  if (!googleAdsCustomerId) return null

  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          marginBottom: 16,
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          overflow: 'hidden',
          background: '#f9fafb',
        }}
      >
        <button
          type="button"
          onClick={() => setShowHelp(!showHelp)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            color: '#374151',
          }}
        >
          <span>📖 How this works</span>
          <span style={{ fontSize: 11, color: '#9ca3af' }}>{showHelp ? 'Hide' : 'Show'}</span>
        </button>
        {showHelp && (
          <div style={{ padding: '0 14px 14px', fontSize: 13, lineHeight: 1.6, color: '#4b5563' }}>
            <p style={{ margin: '0 0 8px' }}>
              <strong>What it does:</strong> Opens a Figma-style horizontal visual of this client&apos;s
              Google Ads account — campaigns → ad groups → keywords with spend, conversions, and CPA.
              Click a campaign to expand its ad groups; click an ad group to see its top keywords and
              landing pages.
            </p>
            <p style={{ margin: '0 0 8px' }}><strong>Prerequisites:</strong></p>
            <ul style={{ margin: '0 0 8px', paddingLeft: 18 }}>
              <li>Client must have a slug (auto-generated from name).</li>
              <li>Client must have a Google Ads Customer ID configured (set above).</li>
              <li>Optimise Digital MCC must have access to the customer.</li>
            </ul>
            <p style={{ margin: '0 0 0', fontSize: 12, color: '#6b7280' }}>
              💡 <strong>Tip:</strong> Use the date-range picker at the top right of the page to
              compare spend across periods (default: last 30 days).
            </p>
          </div>
        )}
      </div>

      <a
        href={`/client/${resolvedSlug}/google-ads/account-structure`}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 20px',
          background: '#7c3aed',
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
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
        View Account Structure
      </a>
    </div>
  )
}

export default ViewAccountStructureButton
