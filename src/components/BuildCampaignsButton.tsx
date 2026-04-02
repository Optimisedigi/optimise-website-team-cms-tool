'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState, useRef, useCallback, useEffect } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdCopySet {
  headlines: string[]
  descriptions: string[]
}

// campaignName → adGroupName → { headlines, descriptions }
type AdCopyMap = Record<string, Record<string, AdCopySet>>

interface CampaignSummary {
  name: string
  campaignType: string
  adGroupCount: number
  keywordCount: number
  adGroups: { name: string; keywordCount: number; landingPage: string | null }[]
}

// ---------------------------------------------------------------------------
// Inner component (uses hooks)
// ---------------------------------------------------------------------------

const BuildCampaignsButtonInner = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stage, setStage] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [adCopy, setAdCopy] = useState<AdCopyMap>({})
  const [expandedAg, setExpandedAg] = useState<string | null>(null)
  const [buildResult, setBuildResult] = useState<any>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const startPolling = useCallback(() => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/google-ads-audits/${id}/campaign-build-status`, {
          credentials: 'include',
        })
        if (!res.ok) return
        const data = await res.json()

        if (data.status === 'building') {
          setStage('Building campaigns in Google Ads...')
        } else if (data.status === 'completed') {
          stopPolling()
          setLoading(false)
          setStage('')
          const r = data.result
          setBuildResult(r)
          const parts = []
          if (r?.campaignsMerged) parts.push(`${r.campaignsMerged} merged`)
          if (r?.campaignsCreated) parts.push(`${r.campaignsCreated} created`)
          if (r?.campaignsRenamed) parts.push(`${r.campaignsRenamed} renamed`)
          if (r?.adGroupsMerged) parts.push(`${r.adGroupsMerged} ad groups merged`)
          if (r?.adGroupsCreated) parts.push(`${r.adGroupsCreated} ad groups created`)
          if (r?.adGroupsPaused) parts.push(`${r.adGroupsPaused} ad groups paused`)
          if (r?.keywordsAdded) parts.push(`${r.keywordsAdded} keywords added`)
          setMessage(`Build complete: ${parts.join(', ')}.`)
        } else if (data.status === 'failed' || data.status === 'partial_failure') {
          stopPolling()
          setLoading(false)
          setStage('')
          setError(data.error || 'Campaign build failed. Check server logs.')
        }
      } catch {
        // Network hiccup — keep polling
      }
    }, 5000)
  }, [id, stopPolling])

  useEffect(() => () => stopPolling(), [stopPolling])

  if (!id) return null

  const customerId = fields?.customerId?.value as string | undefined
  const businessName = fields?.businessName?.value as string | undefined
  const proposalStatus = fields?.campaignProposalStatus?.value as string | undefined
  const buildStatus = fields?.campaignBuildStatus?.value as string | undefined
  const proposalRaw = fields?.campaignProposal?.value
  const savedAdCopy = fields?.generatedAdCopy?.value

  // Parse proposal
  let proposedCampaigns: any[] = []
  if (proposalRaw) {
    const data = typeof proposalRaw === 'string' ? JSON.parse(proposalRaw) : proposalRaw
    proposedCampaigns = data?.proposedCampaigns || []
  }

  const isApproved = proposalStatus === 'approved'
  const hasCampaigns = proposedCampaigns.length > 0
  const isBuilding = loading || buildStatus === 'building'
  const isBuilt = buildStatus === 'completed'

  // Build campaign summaries for the modal
  const campaignSummaries: CampaignSummary[] = proposedCampaigns.map((c: any) => ({
    name: c.name,
    campaignType: c.campaignType || 'generic',
    adGroupCount: c.adGroups?.length || 0,
    keywordCount: (c.adGroups || []).reduce((s: number, ag: any) => s + (ag.keywords?.length || 0), 0),
    adGroups: (c.adGroups || []).map((ag: any) => ({
      name: ag.name,
      keywordCount: ag.keywords?.length || 0,
      landingPage: ag.landingPage?.url || null,
    })),
  }))

  const totalCampaigns = campaignSummaries.length
  const totalAdGroups = campaignSummaries.reduce((s, c) => s + c.adGroupCount, 0)
  const totalKeywords = campaignSummaries.reduce((s, c) => s + c.keywordCount, 0)

  // Load saved ad copy when modal opens
  const handleOpenModal = useCallback(() => {
    if (savedAdCopy && typeof savedAdCopy === 'object') {
      setAdCopy(savedAdCopy as AdCopyMap)
    }
    setConfirmed(false)
    setShowModal(true)
  }, [savedAdCopy])

  // Update a single headline or description
  const updateCopy = useCallback(
    (campName: string, agName: string, field: 'headlines' | 'descriptions', index: number, value: string) => {
      setAdCopy((prev) => {
        const next = { ...prev }
        if (!next[campName]) next[campName] = {}
        if (!next[campName][agName]) next[campName][agName] = { headlines: [], descriptions: [] }
        const arr = [...(next[campName][agName][field] || [])]
        arr[index] = value
        next[campName] = { ...next[campName], [agName]: { ...next[campName][agName], [field]: arr } }
        return next
      })
    },
    [],
  )

  const handleBuild = async () => {
    setShowModal(false)
    setLoading(true)
    setMessage(null)
    setError(null)
    setStage('Sending build request...')

    try {
      const res = await fetch(`/api/google-ads-audits/${id}/build-campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          confirmedCustomerId: customerId,
          adCopy,
        }),
      })

      if (!res.ok) {
        let errorMsg = `Failed (${res.status})`
        try {
          const data = await res.json()
          if (data.error) errorMsg = data.error
        } catch {
          // not JSON
        }
        setError(errorMsg)
        setLoading(false)
        return
      }

      setStage('Building campaigns in Google Ads (this may take a few minutes)...')
      startPolling()
    } catch {
      setError('Network error. Check your connection and try again.')
      setLoading(false)
    }
  }

  // Don't render if proposal isn't approved or no campaigns
  if (!isApproved || !hasCampaigns) {
    return null
  }

  return (
    <div style={{ marginBottom: 20, marginTop: 16 }}>
      {/* Main button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={handleOpenModal}
          disabled={isBuilding}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            background: isBuilding ? '#6b7280' : isBuilt ? '#059669' : '#dc2626',
            color: '#fff',
            borderRadius: 8,
            border: 'none',
            fontWeight: 600,
            fontSize: 14,
            cursor: isBuilding ? 'not-allowed' : 'pointer',
          }}
        >
          {isBuilding
            ? 'Building Campaigns...'
            : isBuilt
              ? 'Rebuild Campaigns in Google Ads'
              : 'Build Campaigns in Google Ads'}
        </button>

        {isBuilt && (
          <span style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>
            Campaigns built successfully
          </span>
        )}
      </div>

      {/* Progress */}
      {isBuilding && (
        <div style={{ marginTop: 12 }}>
          <div style={{ width: '100%', maxWidth: 400, height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
            <div
              style={{
                width: '60%',
                height: '100%',
                background: 'linear-gradient(90deg, #dc2626, #f87171)',
                borderRadius: 4,
                animation: 'pulse 2s infinite',
              }}
            />
          </div>
          <p style={{ marginTop: 6, fontSize: 13, color: '#6b7280' }}>{stage}</p>
          <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }`}</style>
        </div>
      )}

      {message && <p style={{ marginTop: 8, fontSize: 13, color: '#059669' }}>{message}</p>}
      {error && <p style={{ marginTop: 8, fontSize: 13, color: '#dc2626' }}>{error}</p>}

      {/* Detailed build report */}
      {buildResult?.actions?.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }}>
            Build Report ({buildResult.actions.length} actions)
          </summary>
          <div style={{ marginTop: 8, padding: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, maxHeight: 400, overflow: 'auto' }}>
            {/* Campaign summary */}
            {buildResult.campaigns?.map((c: any, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13 }}>
                <span style={{
                  display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                  background: c.success ? '#22c55e' : '#ef4444',
                }} />
                <strong>{c.name}</strong>
                <span style={{ color: '#64748b' }}>
                  {c.action === 'merged' && c.mergedFrom ? `merged from "${c.mergedFrom}"` : c.action === 'created' ? 'new' : 'up to date'}
                </span>
                <span style={{ color: '#9ca3af' }}>
                  ({c.adGroupCount} ad groups, {c.keywordCount} keywords)
                </span>
              </div>
            ))}

            {/* Action log */}
            <div style={{ marginTop: 10, borderTop: '1px solid #e2e8f0', paddingTop: 10 }}>
              {buildResult.actions.map((action: string, i: number) => (
                <div key={i} style={{
                  fontSize: 12, color: '#475569', lineHeight: 1.6,
                  paddingLeft: action.startsWith('  ') ? 16 : 0,
                }}>
                  {action}
                </div>
              ))}
            </div>

            {buildResult.errors?.length > 0 && (
              <div style={{ marginTop: 10, borderTop: '1px solid #fecaca', paddingTop: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#dc2626', marginBottom: 4 }}>Errors:</div>
                {buildResult.errors.map((e: string, i: number) => (
                  <div key={i} style={{ fontSize: 12, color: '#dc2626' }}>{e}</div>
                ))}
              </div>
            )}
          </div>
        </details>
      )}

      {/* Confirmation Modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              width: '90%',
              maxWidth: 800,
              maxHeight: '85vh',
              overflow: 'auto',
              padding: 24,
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: '#1e293b' }}>
              Build Campaigns in Google Ads
            </h2>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b' }}>
              All campaigns will be created as <strong>PAUSED</strong>. Review the structure below before confirming.
            </p>

            {/* Warning banner */}
            <div
              style={{
                padding: '12px 16px',
                background: '#fef3c7',
                border: '1px solid #fbbf24',
                borderRadius: 8,
                marginBottom: 16,
                fontSize: 13,
                color: '#92400e',
              }}
            >
              This will create real campaigns in the Google Ads account <strong>{customerId}</strong>.
              Double-check the customer ID before proceeding.
            </div>

            {/* Summary stats */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              {[
                { label: 'Campaigns', value: totalCampaigns },
                { label: 'Ad Groups', value: totalAdGroups },
                { label: 'Keywords', value: totalKeywords },
              ].map((s) => (
                <div
                  key={s.label}
                  style={{
                    flex: '1 1 100px',
                    background: '#f1f5f9',
                    borderRadius: 8,
                    padding: '10px 16px',
                    textAlign: 'center',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b' }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Campaign list with ad copy */}
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: '#334155', margin: '0 0 8px' }}>
                Campaign Structure
              </h3>
              {campaignSummaries.map((camp) => (
                <div
                  key={camp.name}
                  style={{
                    marginBottom: 8,
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      padding: '10px 14px',
                      background: camp.campaignType === 'brand' ? '#eff6ff' : '#f0fdf4',
                      borderBottom: '1px solid #e2e8f0',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{camp.name}</span>
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 11,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: camp.campaignType === 'brand' ? '#dbeafe' : '#dcfce7',
                          color: camp.campaignType === 'brand' ? '#1d4ed8' : '#15803d',
                        }}
                      >
                        {camp.campaignType}
                      </span>
                      <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 6px', borderRadius: 4, background: '#fee2e2', color: '#991b1b' }}>
                        PAUSED
                      </span>
                    </div>
                    <span style={{ fontSize: 12, color: '#64748b' }}>
                      {camp.adGroupCount} ad groups, {camp.keywordCount} keywords
                    </span>
                  </div>

                  {/* Ad groups */}
                  {camp.adGroups.map((ag) => {
                    const agKey = `${camp.name}::${ag.name}`
                    const isExpanded = expandedAg === agKey
                    const copy = adCopy[camp.name]?.[ag.name] || { headlines: [], descriptions: [] }

                    return (
                      <div key={ag.name} style={{ borderTop: '1px solid #f1f5f9' }}>
                        <div
                          style={{
                            padding: '8px 14px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            cursor: 'pointer',
                            background: isExpanded ? '#fafafa' : '#fff',
                          }}
                          onClick={() => setExpandedAg(isExpanded ? null : agKey)}
                        >
                          <div>
                            <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>{ag.name}</span>
                            <span style={{ marginLeft: 8, fontSize: 11, color: '#9ca3af' }}>
                              {ag.keywordCount} keywords
                            </span>
                            {ag.landingPage && (
                              <span style={{ marginLeft: 8, fontSize: 11, color: '#6366f1' }}>
                                {ag.landingPage.replace(/^https?:\/\//, '').slice(0, 40)}
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: 11, color: '#9ca3af' }}>
                            {copy.headlines.length > 0 ? `${copy.headlines.length}h ${copy.descriptions.length}d` : 'No ad copy'}
                            {' '}{isExpanded ? '\u25B2' : '\u25BC'}
                          </span>
                        </div>

                        {/* Expanded ad copy editor */}
                        {isExpanded && (
                          <div style={{ padding: '8px 14px 12px', background: '#fafafa' }}>
                            <div style={{ marginBottom: 8 }}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                                Headlines (max 30 chars each)
                              </div>
                              {(copy.headlines.length > 0 ? copy.headlines : ['', '', '']).map((h, i) => (
                                <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 3, alignItems: 'center' }}>
                                  <input
                                    type="text"
                                    value={h}
                                    maxLength={30}
                                    onChange={(e) => updateCopy(camp.name, ag.name, 'headlines', i, e.target.value)}
                                    style={{
                                      flex: 1,
                                      padding: '4px 8px',
                                      fontSize: 12,
                                      border: `1px solid ${h.length > 30 ? '#ef4444' : '#d1d5db'}`,
                                      borderRadius: 4,
                                    }}
                                    placeholder={`Headline ${i + 1}`}
                                  />
                                  <span style={{ fontSize: 10, color: h.length > 30 ? '#ef4444' : '#9ca3af', minWidth: 30 }}>
                                    {h.length}/30
                                  </span>
                                </div>
                              ))}
                            </div>
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                                Descriptions (max 90 chars each)
                              </div>
                              {(copy.descriptions.length > 0 ? copy.descriptions : ['', '']).map((d, i) => (
                                <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 3, alignItems: 'center' }}>
                                  <input
                                    type="text"
                                    value={d}
                                    maxLength={90}
                                    onChange={(e) => updateCopy(camp.name, ag.name, 'descriptions', i, e.target.value)}
                                    style={{
                                      flex: 1,
                                      padding: '4px 8px',
                                      fontSize: 12,
                                      border: `1px solid ${d.length > 90 ? '#ef4444' : '#d1d5db'}`,
                                      borderRadius: 4,
                                    }}
                                    placeholder={`Description ${i + 1}`}
                                  />
                                  <span style={{ fontSize: 10, color: d.length > 90 ? '#ef4444' : '#9ca3af', minWidth: 30 }}>
                                    {d.length}/90
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>

            {/* Client confirmation */}
            <div
              style={{
                padding: 16,
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 8,
                marginBottom: 16,
              }}
            >
              <label
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}
                onClick={() => setConfirmed(!confirmed)}
              >
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  style={{ marginTop: 2, width: 18, height: 18, accentColor: '#dc2626', cursor: 'pointer' }}
                />
                <span style={{ fontSize: 13, color: '#991b1b', lineHeight: 1.5 }}>
                  I confirm these campaigns should be built in the Google Ads account for{' '}
                  <strong>{businessName || 'this client'}</strong> (Customer ID: <strong>{customerId}</strong>).
                  All campaigns will be created as PAUSED.
                </span>
              </label>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={{
                  padding: '8px 16px',
                  fontSize: 13,
                  fontWeight: 500,
                  background: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                  cursor: 'pointer',
                  color: '#475569',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBuild}
                disabled={!confirmed}
                style={{
                  padding: '8px 20px',
                  fontSize: 13,
                  fontWeight: 600,
                  background: confirmed ? '#dc2626' : '#9ca3af',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  cursor: confirmed ? 'pointer' : 'not-allowed',
                }}
              >
                Confirm & Build (All Paused)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Wrapper with error boundary
// ---------------------------------------------------------------------------

const BuildCampaignsButton = () => {
  const [renderError, setRenderError] = useState<string | null>(null)

  if (renderError) {
    return (
      <div style={{ padding: 12, background: '#fee2e2', borderRadius: 6, fontSize: 13, color: '#991b1b' }}>
        Build Campaigns error: {renderError}
      </div>
    )
  }

  try {
    return <BuildCampaignsButtonInner />
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!renderError) setRenderError(msg)
    return (
      <div style={{ padding: 12, background: '#fee2e2', borderRadius: 6, fontSize: 13, color: '#991b1b' }}>
        Build Campaigns error: {msg}
      </div>
    )
  }
}

export default BuildCampaignsButton
