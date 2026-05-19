'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState } from 'react'

/**
 * AI Visibility ad-hoc run, fired from a ClientProposal.
 *
 * Wires to /api/proposals/[id]/run-ai-visibility which proxies the request
 * to Growth Tools. Requires `ga4PropertyId` on the proposal because the
 * snapshot is pulled from GA4 referral data. On success, the proposal's
 * `latestAiVisibilitySnapshot` is populated and a link to the snapshot is
 * shown below the button.
 */
const RunAiVisibilityFromProposalButton = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [snapshotLink, setSnapshotLink] = useState<string | null>(null)

  if (!id) return null

  const ga4PropertyId = fields?.ga4PropertyId?.value as string | undefined
  const websiteUrl = fields?.websiteUrl?.value as string | undefined
  const enabled = fields?.['aiVisibility.enabled']?.value as boolean | undefined

  const hasGa4 = !!ga4PropertyId?.trim()
  const hasUrl = !!websiteUrl?.trim()
  const canRun = hasGa4 && hasUrl && !!enabled

  const handleClick = async () => {
    setLoading(true)
    setError(null)
    setSnapshotLink(null)

    try {
      const res = await fetch(`/api/proposals/${id}/run-ai-visibility`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(
          data?.error || `Failed to run AI Visibility (${res.status})`,
        )
      }

      const data = await res.json()
      const snapshotId = data?.snapshotId
      if (snapshotId) {
        setSnapshotLink(`/admin/collections/ai-visibility-snapshots/${snapshotId}`)
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  let disabledReason: string | null = null
  if (!hasUrl) disabledReason = 'Enter the Prospect website URL first.'
  else if (!hasGa4) disabledReason = 'Enter the GA4 property ID on the Prospect tab first.'
  else if (!enabled) disabledReason = 'Enable AI Visibility tracking above first.'

  return (
    <div style={{ marginBottom: 20 }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading || !canRun}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 20px',
          background: loading ? '#6b7280' : !canRun ? '#9ca3af' : '#2563eb',
          color: '#fff',
          borderRadius: 8,
          border: 'none',
          fontWeight: 600,
          fontSize: 14,
          cursor: loading || !canRun ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Running AI Visibility…' : 'Run AI Visibility'}
      </button>

      {disabledReason && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#9ca3af' }}>{disabledReason}</p>
      )}

      {snapshotLink && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#16a34a' }}>
          Snapshot created.{' '}
          <a href={snapshotLink} style={{ color: '#2563eb', textDecoration: 'underline' }}>
            View snapshot →
          </a>
        </p>
      )}

      {error && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#dc2626' }}>{error}</p>
      )}
    </div>
  )
}

export default RunAiVisibilityFromProposalButton
