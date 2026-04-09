'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState, useRef, useCallback, useEffect } from 'react'

const DeployAdCopyButtonInner = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stage, setStage] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [deployResult, setDeployResult] = useState<any>(null)
  const [adLabel, setAdLabel] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const adCopyStatus = fields?.adCopyStatus?.value as string | undefined
  const customerId = fields?.customerId?.value as string | undefined
  const businessName = fields?.businessName?.value as string | undefined
  const deployStatus = fields?.adCopyDeployStatus?.value as string | undefined
  const isApproved = adCopyStatus === 'approved'
  const alreadyDeployed = deployStatus === 'completed'

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => () => stopPolling(), [stopPolling])

  const startPolling = useCallback(() => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/google-ads-audits/${id}/ad-copy-deploy-status`, {
          credentials: 'include',
        })
        if (!res.ok) return
        const data = await res.json()

        if (data.status === 'deploying') {
          setStage('Deploying ad copy to Google Ads...')
        } else if (data.status === 'completed') {
          stopPolling()
          setLoading(false)
          setStage('')
          setDeployResult(data.result)
          const r = data.result || {}
          const parts = []
          if (r.adsCreated) parts.push(`${r.adsCreated} ads created`)
          if (r.adGroupsMatched) parts.push(`${r.adGroupsMatched} ad groups matched`)
          if (r.adGroupsSkipped) parts.push(`${r.adGroupsSkipped} ad groups skipped`)
          setMessage(`Deploy complete: ${parts.join(', ') || 'Success'}.`)
        } else if (data.status === 'failed') {
          stopPolling()
          setLoading(false)
          setStage('')
          setError(data.error || 'Deploy failed')
        } else if (data.status === 'mismatched') {
          stopPolling()
          setLoading(false)
          setStage('')
          setDeployResult(data.result)
          setError('Some campaigns or ad groups do not exist in the Google Ads account. Review the mismatches below before retrying.')
        }
      } catch {
        // Polling error, will retry
      }
    }, 5000)
  }, [id, stopPolling])

  // Generate default label on first open
  const defaultLabel = `OD RSA ${new Date().toISOString().slice(0, 10)}`
  const handleOpenConfirm = () => {
    if (!adLabel) setAdLabel(defaultLabel)
    setShowConfirm(true)
  }

  const handleDeploy = async () => {
    setShowConfirm(false)
    setLoading(true)
    setError(null)
    setMessage(null)
    setDeployResult(null)
    setStage('Sending ad copy to Google Ads...')

    try {
      const res = await fetch(`/api/google-ads-audits/${id}/deploy-ad-copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ confirmedCustomerId: customerId, adLabel: adLabel || defaultLabel, adStatus: 'ENABLED' }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as any).error || `Failed (${res.status})`)
        setLoading(false)
        setStage('')
        return
      }

      startPolling()
    } catch {
      setError('Network error')
      setLoading(false)
      setStage('')
    }
  }

  // Check if there's an existing deploy in progress on mount
  useEffect(() => {
    if (deployStatus === 'deploying') {
      setLoading(true)
      setStage('Deploying ad copy to Google Ads...')
      startPolling()
    }
  }, [deployStatus, startPolling])

  if (!isApproved && !alreadyDeployed) {
    return (
      <div style={{ padding: 14, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
        <div style={{ fontSize: 13, color: '#9ca3af' }}>
          Ad copy must be approved by the client before deploying to Google Ads.
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: 14, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#1e293b' }}>Deploy Ad Copy to Google Ads</h4>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
            Creates responsive search ads in existing campaigns and ad groups. Ads go live immediately with a label for easy filtering.
          </p>
        </div>
      </div>

      {/* Deploy button */}
      <button
        type="button"
        onClick={handleOpenConfirm}
        disabled={loading || alreadyDeployed}
        style={{
          padding: '10px 20px', fontSize: 13, fontWeight: 600,
          background: loading ? '#6b7280' : alreadyDeployed ? '#059669' : '#7c3aed',
          color: '#fff', border: 'none', borderRadius: 6,
          cursor: loading || alreadyDeployed ? 'not-allowed' : 'pointer',
          width: '100%',
        }}
      >
        {loading
          ? stage || 'Deploying...'
          : alreadyDeployed
            ? 'Ad Copy Deployed'
            : 'Deploy Ad Copy to Google Ads'
        }
      </button>

      {/* Confirmation modal */}
      {showConfirm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 480, width: '90%' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Confirm Ad Copy Deployment</h3>
            <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.6, margin: '0 0 8px' }}>
              This will create responsive search ads in the Google Ads account using the approved ad copy. Ads will go <strong>live immediately</strong>.
            </p>
            <div style={{ padding: 10, background: '#fef3c7', borderRadius: 6, fontSize: 13, color: '#92400e', marginBottom: 12 }}>
              <strong>Customer ID:</strong> {customerId || 'Not set'}
            </div>

            {/* Label input */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
                Ad Label (for filtering in Google Ads Editor)
              </label>
              <input
                type="text"
                value={adLabel}
                onChange={(e) => setAdLabel(e.target.value)}
                placeholder={defaultLabel}
                style={{
                  width: '100%', padding: '8px 10px', fontSize: 13,
                  border: '1px solid #d1d5db', borderRadius: 6, outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <p style={{ fontSize: 11, color: '#64748b', margin: '4px 0 0' }}>
                This label will be applied to all created ads so you can filter them in Google Ads Editor.
              </p>
            </div>

            <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, margin: '0 0 16px' }}>
              If any campaigns or ad groups in the ad copy don't match existing ones in the account, the deployment will pause and show you the mismatches.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowConfirm(false)}
                style={{ padding: '8px 16px', fontSize: 13, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="button" onClick={handleDeploy}
                style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                Deploy Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      {error && (
        <div style={{ marginTop: 10, padding: 10, background: '#fee2e2', borderRadius: 6, fontSize: 12, color: '#991b1b' }}>
          {error}
        </div>
      )}
      {message && !error && (
        <div style={{ marginTop: 10, padding: 10, background: '#d1fae5', borderRadius: 6, fontSize: 12, color: '#065f46' }}>
          {message}
        </div>
      )}

      {/* Mismatch details */}
      {deployResult?.mismatches && deployResult.mismatches.length > 0 && (
        <div style={{ marginTop: 10, padding: 10, background: '#fef3c7', borderRadius: 6, border: '1px solid #fde68a' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 6 }}>
            Mismatched Campaigns/Ad Groups ({deployResult.mismatches.length})
          </div>
          {deployResult.mismatches.map((m: any, i: number) => (
            <div key={i} style={{ fontSize: 12, color: '#78350f', marginBottom: 4, paddingLeft: 8, borderLeft: '2px solid #fbbf24' }}>
              <strong>{m.campaignName}</strong> &rarr; {m.adGroupName}
              <span style={{ marginLeft: 6, fontSize: 11, color: '#a16207' }}>({m.reason || 'not found in account'})</span>
            </div>
          ))}
        </div>
      )}

      {/* Per-ad-group results */}
      {deployResult && !deployResult.mismatches?.length && deployResult.campaigns && (() => {
        const succeeded = (deployResult.campaigns || []).filter((c: any) => c.success)
        const failed = (deployResult.campaigns || []).filter((c: any) => !c.success)
        return (
          <div style={{ marginTop: 10 }}>
            {failed.length > 0 && (
              <div style={{ marginBottom: 10, padding: 10, background: '#fee2e2', borderRadius: 6, border: '1px solid #fecaca' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#991b1b', marginBottom: 6 }}>
                  Failed ({failed.length})
                </div>
                {failed.map((c: any, i: number) => (
                  <div key={i} style={{ fontSize: 12, marginBottom: 6, paddingLeft: 8, borderLeft: '2px solid #ef4444' }}>
                    <div style={{ color: '#991b1b', fontWeight: 500 }}>{c.campaignName} &rarr; {c.adGroupName}</div>
                    <div style={{ color: '#b91c1c', marginTop: 2, fontSize: 11, lineHeight: 1.4 }}>{c.error || 'Unknown error'}</div>
                  </div>
                ))}
              </div>
            )}
            {succeeded.length > 0 && (
              <div style={{ padding: 10, background: '#f0fdf4', borderRadius: 6, border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#065f46', marginBottom: 6 }}>
                  Created ({succeeded.length})
                </div>
                {succeeded.map((c: any, i: number) => (
                  <div key={i} style={{ fontSize: 12, color: '#065f46', marginBottom: 3, paddingLeft: 8, borderLeft: '2px solid #22c55e' }}>
                    {c.campaignName} &rarr; {c.adGroupName}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}

const DeployAdCopyButton = () => {
  try {
    return <DeployAdCopyButtonInner />
  } catch {
    return null
  }
}

export default DeployAdCopyButton
