'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type ProposalKeyword = { text: string; monthlySearchVolume: number }

function extractKeywords(campaignProposal: any): ProposalKeyword[] {
  const keywordMap = new Map<string, ProposalKeyword>()
  const campaigns = Array.isArray(campaignProposal?.proposedCampaigns) ? campaignProposal.proposedCampaigns : []

  for (const campaign of campaigns) {
    const adGroups = Array.isArray(campaign?.adGroups) ? campaign.adGroups : []
    for (const adGroup of adGroups) {
      const topKeywords = Array.isArray(adGroup?.topKeywords) ? adGroup.topKeywords : []
      for (const keyword of topKeywords) {
        const text = typeof keyword?.text === 'string' ? keyword.text.trim() : ''
        const monthlySearchVolume = Number(keyword?.volume ?? keyword?.monthlySearchVolume ?? 0)
        if (!text || !Number.isFinite(monthlySearchVolume)) continue
        const key = text.toLowerCase()
        const existing = keywordMap.get(key)
        if (!existing || monthlySearchVolume > existing.monthlySearchVolume) {
          keywordMap.set(key, { text, monthlySearchVolume })
        }
      }
    }
  }

  return Array.from(keywordMap.values()).sort((a, b) => b.monthlySearchVolume - a.monthlySearchVolume)
}

const RunProposalCompetitorWorkflowButton = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stage, setStage] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const campaignProposal = fields?.campaignProposal?.value as any
  const status = fields?.campaignProposalCompetitorStatus?.value as string | undefined
  const manualCompetitors = Array.isArray(fields?.campaignProposalManualCompetitors?.value)
    ? fields.campaignProposalManualCompetitors.value
    : []
  const generatedAt = fields?.campaignProposalCompetitorsGeneratedAt?.value as string | undefined
  const storedCompetitors = Array.isArray(fields?.campaignProposalCompetitors?.value)
    ? fields.campaignProposalCompetitors.value
    : []
  const keywords = useMemo(() => extractKeywords(campaignProposal), [campaignProposal])
  const topSamples = keywords.slice(0, 5)

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
        const res = await fetch(`/api/google-ads-audits/${id}/proposal-competitors-status`, { credentials: 'include' })
        if (!res.ok) return
        const data = await res.json()

        if (data.status === 'running') {
          setStage('Fetching monthly visits for stored competitors...')
        } else if (data.status === 'completed') {
          stopPolling()
          setLoading(false)
          setStage('Complete')
          setMessage(`Updated monthly visits for ${data.competitorCount ?? 0} competitors. Refresh the page to see results.`)
        } else if (data.status === 'failed') {
          stopPolling()
          setLoading(false)
          setStage('Failed')
          setError(data.error || 'Competitor workflow failed. Check server logs.')
        }
      } catch {
        // Keep polling through network hiccups.
      }
    }, 5000)
  }, [id, stopPolling])

  useEffect(() => () => stopPolling(), [stopPolling])

  if (!id) return null

  const disabled = loading || !campaignProposal || storedCompetitors.length === 0
  const formattedDate = generatedAt
    ? new Date(generatedAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null

  const handleClick = async () => {
    setLoading(true)
    setMessage(null)
    setError(null)
    setStage('Starting...')

    try {
      const res = await fetch(`/api/google-ads-audits/${id}/run-proposal-competitors`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!res.ok) {
        let errorMsg = `Failed (${res.status})`
        try {
          const data = await res.json()
          if (data.error) errorMsg = data.error
        } catch {}
        setError(errorMsg)
        setLoading(false)
        return
      }

      setStage('Queued -- fetching monthly visits for stored competitors...')
      startPolling()
    } catch {
      setError('Network error -- check your connection and try again.')
      setLoading(false)
    }
  }

  return (
    <div style={{ marginBottom: 20, padding: 16, border: '1px solid #dbeafe', borderRadius: 8, background: '#eff6ff' }}>
      <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#1e3a8a' }}>Competitor monthly visits</h3>
      <p style={{ margin: '0 0 8px', fontSize: 13, color: '#1e40af' }}>
        Uses stored proposal competitors and fetches monthly visits only. It does not re-run competitor discovery.
      </p>

      <div style={{ fontSize: 13, color: '#334155', marginBottom: 12 }}>
        <div><strong>Stored competitors:</strong> {storedCompetitors.length}</div>
        <div><strong>Proposal keywords:</strong> {keywords.length}</div>
        <div><strong>Manual domains:</strong> {manualCompetitors.length}</div>
        {formattedDate && <div><strong>Last generated:</strong> {formattedDate}</div>}
        {status && <div><strong>Status:</strong> {status}</div>}
        {topSamples.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <strong>Top samples:</strong> {topSamples.map((kw) => `${kw.text} (${kw.monthlySearchVolume.toLocaleString('en-AU')})`).join(', ')}
          </div>
        )}
      </div>

      {!campaignProposal && <p style={{ color: '#b45309', fontSize: 13 }}>Generate a campaign proposal first.</p>}
      {!!campaignProposal && storedCompetitors.length === 0 && <p style={{ color: '#b45309', fontSize: 13 }}>No stored proposal competitors found yet. Run competitor discovery first.</p>}

      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        style={{
          padding: '10px 16px',
          borderRadius: 6,
          border: 'none',
          background: disabled ? '#94a3b8' : '#2563eb',
          color: 'white',
          fontWeight: 600,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Fetching monthly visits...' : 'Fetch monthly visits for stored competitors'}
      </button>

      {stage && <p style={{ margin: '8px 0 0', fontSize: 13, color: '#1e40af' }}>{stage}</p>}
      {message && <p style={{ margin: '8px 0 0', fontSize: 13, color: '#166534' }}>{message}</p>}
      {error && <p style={{ margin: '8px 0 0', fontSize: 13, color: '#b91c1c' }}>{error}</p>}
    </div>
  )
}

export default RunProposalCompetitorWorkflowButton
