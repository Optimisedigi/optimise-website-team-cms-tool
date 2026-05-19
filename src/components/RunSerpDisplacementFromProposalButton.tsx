'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState } from 'react'

/**
 * SERP Displacement ad-hoc run, fired from a ClientProposal.
 *
 * Wires to /api/proposals/[id]/run-serp-displacement which proxies the
 * request to Growth Tools. On success, the proposal's
 * `latestSerpDisplacementSnapshot` is populated and a link to the snapshot
 * record is shown below the button.
 *
 * Mirrors RunGoogleAdsAuditFromProposalButton's shape so the three
 * "run from proposal" buttons look and behave identically.
 */
const RunSerpDisplacementFromProposalButton = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [snapshotLink, setSnapshotLink] = useState<string | null>(null)

  if (!id) return null

  const websiteUrl = fields?.websiteUrl?.value as string | undefined
  const targetLocation = fields?.targetLocation?.value as string | undefined
  const enabled = fields?.['serpMonitor.enabled']?.value as boolean | undefined

  const hasUrl = !!websiteUrl?.trim()
  const hasLocation = !!targetLocation?.trim()
  const canRun = hasUrl && hasLocation && !!enabled

  const handleClick = async () => {
    setLoading(true)
    setError(null)
    setSnapshotLink(null)

    try {
      const res = await fetch(`/api/proposals/${id}/run-serp-displacement`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(
          data?.error || `Failed to run SERP Displacement (${res.status})`,
        )
      }

      const data = await res.json()
      const snapshotId = data?.snapshotId
      if (snapshotId) {
        setSnapshotLink(`/admin/collections/serp-displacement-snapshots/${snapshotId}`)
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  let disabledReason: string | null = null
  if (!hasUrl) disabledReason = 'Enter the Prospect website URL first.'
  else if (!hasLocation) disabledReason = 'Pick a target location on the Audit Inputs tab.'
  else if (!enabled) disabledReason = 'Enable SERP Displacement monitoring above first.'

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
        {loading ? 'Running SERP snapshot…' : 'Run SERP Displacement'}
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

export default RunSerpDisplacementFromProposalButton
