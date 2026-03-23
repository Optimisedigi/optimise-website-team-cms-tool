'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useState } from 'react'

interface Campaign {
  name: string
  id: string
  status: string
  adGroups?: Array<{ name: string; id: string }>
}

export default function NegativeKeywordCampaignSelect() {
  const { initialData } = useDocumentInfo()
  const data = initialData as any

  const clientId = typeof data?.client === 'object' ? data?.client?.id : data?.client
  const scope = data?.scope

  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchCampaigns = async () => {
    if (!clientId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/negative-keyword-lists/campaigns?clientId=${clientId}`)
      const json = await res.json()
      if (json.ok) {
        setCampaigns(json.campaigns || [])
        if (json.note) setError(json.note)
      } else {
        setError(json.error || 'Failed to fetch campaigns')
      }
    } catch {
      setError('Failed to fetch campaigns')
    } finally {
      setLoading(false)
      setFetched(true)
    }
  }

  // Only show for campaign/ad_group scope
  if (scope !== 'campaign' && scope !== 'ad_group') return null

  if (!clientId) {
    return (
      <div style={{ fontSize: 12, color: 'var(--theme-elevation-400)', marginBottom: 12 }}>
        Select a client to load campaigns from Google Ads.
      </div>
    )
  }

  const currentCampaign = data?.campaignName || ''
  const currentAdGroup = data?.adGroupName || ''
  const selectedCampaign = campaigns.find((c) => c.name === currentCampaign)
  const adGroups = selectedCampaign?.adGroups || []

  return (
    <div style={{
      padding: '12px 14px',
      background: 'var(--theme-elevation-50)',
      border: '1px solid var(--theme-elevation-150)',
      borderRadius: 6,
      marginBottom: 12,
      fontSize: 13,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: campaigns.length > 0 ? 8 : 0 }}>
        <strong style={{ fontSize: 13 }}>Load from Google Ads</strong>
        <button
          type="button"
          onClick={fetchCampaigns}
          disabled={loading}
          style={{
            padding: '3px 10px',
            borderRadius: 4,
            border: '1px solid var(--theme-elevation-200)',
            background: 'var(--theme-elevation-100)',
            color: 'inherit',
            fontSize: 12,
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Loading...' : fetched ? 'Refresh' : 'Fetch Campaigns'}
        </button>
      </div>

      {error && (
        <div style={{ fontSize: 12, color: '#b45309', marginTop: 6 }}>{error}</div>
      )}

      {campaigns.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--theme-elevation-500)', display: 'block', marginBottom: 2 }}>
              Campaign
            </label>
            <select
              value={currentCampaign}
              onChange={(e) => {
                if (data?.id) {
                  fetch(`/api/negative-keyword-lists/${data.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ campaignName: e.target.value }),
                  }).then(() => window.location.reload())
                }
              }}
              style={{
                width: '100%',
                padding: '6px 8px',
                border: '1px solid var(--theme-elevation-200)',
                borderRadius: 4,
                fontSize: 13,
                background: 'var(--theme-input-bg, var(--theme-elevation-0))',
                color: 'inherit',
              }}
            >
              <option value="">Select a campaign...</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.name}>{c.name} ({c.status})</option>
              ))}
            </select>
          </div>

          {scope === 'ad_group' && adGroups.length > 0 && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--theme-elevation-500)', display: 'block', marginBottom: 2 }}>
                Ad Group
              </label>
              <select
                value={currentAdGroup}
                onChange={(e) => {
                  if (data?.id) {
                    fetch(`/api/negative-keyword-lists/${data.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ adGroupName: e.target.value }),
                    }).then(() => window.location.reload())
                  }
                }}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  border: '1px solid var(--theme-elevation-200)',
                  borderRadius: 4,
                  fontSize: 13,
                  background: 'var(--theme-input-bg, var(--theme-elevation-0))',
                  color: 'inherit',
                }}
              >
                <option value="">Select an ad group...</option>
                {adGroups.map((ag) => (
                  <option key={ag.id} value={ag.name}>{ag.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {fetched && campaigns.length === 0 && !error && (
        <div style={{ fontSize: 12, color: 'var(--theme-elevation-400)', marginTop: 6 }}>
          No campaigns found. You can type the campaign name manually below.
        </div>
      )}
    </div>
  )
}
