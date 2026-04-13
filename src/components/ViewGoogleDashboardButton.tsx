'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState, useEffect } from 'react'

const ViewGoogleDashboardButton = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [clientSlug, setClientSlug] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)

  // Client relationship ID from Google Ads Audit collection
  const clientRelId = fields?.client?.value as string | number | undefined

  // Check if we're on a Clients collection (has slug but no client relationship field)
  const isClientCollection = !!(fields?.slug?.value) && !clientRelId
  const directSlug = isClientCollection ? (fields?.slug?.value as string) : undefined

  // Fetch client slug when on a Google Ads Audit with a linked client
  useEffect(() => {
    if (directSlug || !clientRelId) return

    fetch(`/api/clients/${clientRelId}?depth=0&select[slug]=true`, {
      credentials: 'include',
    })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.slug) setClientSlug(data.slug)
      })
      .catch(() => {})
  }, [directSlug, clientRelId])

  if (!id) return null

  const resolvedSlug = directSlug || clientSlug

  // Need either a slug or a client relationship to show anything
  const googleAdsCustomerId = fields?.googleAdsCustomerId?.value as string | undefined
  if (!resolvedSlug && !googleAdsCustomerId && !clientRelId) return null

  if (resolvedSlug) {
    return (
      <div style={{ marginBottom: 20 }}>
        {/* How it works */}
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
            <span>{'\uD83D\uDCD6'} How this works</span>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>{showHelp ? 'Hide' : 'Show'}</span>
          </button>
          {showHelp && (
            <div style={{ padding: '0 14px 14px', fontSize: 13, lineHeight: 1.6, color: '#4b5563' }}>
              <p style={{ margin: '0 0 8px' }}>
                <strong>What it does:</strong> Opens the Google Ads performance dashboard for this client in a new tab. The dashboard shows campaign metrics, quality scores, and trends over time.
              </p>
              <p style={{ margin: '0 0 8px' }}><strong>Prerequisites:</strong></p>
              <ul style={{ margin: '0 0 8px', paddingLeft: 18 }}>
                <li>The client must have a slug (auto-generated from name).</li>
                <li>Google Ads dashboard must be enabled in the &quot;Google Ads Automations&quot; section above.</li>
                <li>The client must have a Google Ads Customer ID configured.</li>
              </ul>
              <p style={{ margin: '0 0 8px' }}>
                <strong>What you&apos;ll see:</strong> The dashboard page at <code>/google-dashboard/{'{slug}'}</code> showing live Google Ads data including campaign performance, quality score snapshots, spend tracking, and conversion metrics.
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 12, color: '#6b7280' }}>
                💡 <strong>Tip:</strong> This dashboard can be shared with clients via a PIN-protected link or embedded in client reports.
              </p>
            </div>
          )}
        </div>

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
