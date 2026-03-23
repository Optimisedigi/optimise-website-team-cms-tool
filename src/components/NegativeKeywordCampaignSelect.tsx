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
  const [saving, setSaving] = useState(false)

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

  // Get currently selected campaign names from the campaigns array
  const currentCampaigns: string[] = (data?.campaigns || []).map((c: any) => c.campaignName).filter(Boolean)
  const currentAdGroup = data?.adGroupName || ''

  const toggleCampaign = async (name: string) => {
    if (!data?.id) return
    setSaving(true)
    const updated = currentCampaigns.includes(name)
      ? currentCampaigns.filter((c) => c !== name)
      : [...currentCampaigns, name]

    try {
      await fetch(`/api/negative-keyword-lists/${data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaigns: updated.map((c) => ({ campaignName: c })),
        }),
      })
      window.location.reload()
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  // Get ad groups for all selected campaigns
  const selectedAdGroups = campaigns
    .filter((c) => currentCampaigns.includes(c.name))
    .flatMap((c) => c.adGroups || [])

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
        {saving && <span style={{ fontSize: 12, color: 'var(--theme-elevation-400)' }}>Saving...</span>}
      </div>

      {error && (
        <div style={{ fontSize: 12, color: '#b45309', marginTop: 6 }}>{error}</div>
      )}

      {campaigns.length > 0 && (
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--theme-elevation-500)', display: 'block', marginBottom: 4 }}>
            Select campaigns (click to toggle)
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
            {campaigns.map((c) => {
              const selected = currentCampaigns.includes(c.name)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCampaign(c.name)}
                  disabled={saving}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 4,
                    border: `1px solid ${selected ? '#2563eb' : 'var(--theme-elevation-200)'}`,
                    background: selected ? '#eff6ff' : 'var(--theme-elevation-0)',
                    color: selected ? '#1d4ed8' : 'inherit',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontWeight: selected ? 600 : 400,
                  }}
                >
                  {selected ? '\u2713 ' : ''}{c.name}
                </button>
              )
            })}
          </div>
          {currentCampaigns.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--theme-elevation-400)', marginTop: 4 }}>
              {currentCampaigns.length} campaign{currentCampaigns.length !== 1 ? 's' : ''} selected
            </div>
          )}
        </div>
      )}

      {scope === 'ad_group' && selectedAdGroups.length > 0 && (
        <div style={{ marginTop: 8 }}>
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
            {selectedAdGroups.map((ag) => (
              <option key={ag.id} value={ag.name}>{ag.name}</option>
            ))}
          </select>
        </div>
      )}

      {fetched && campaigns.length === 0 && !error && (
        <div style={{ fontSize: 12, color: 'var(--theme-elevation-400)', marginTop: 6 }}>
          No campaigns found. You can type campaign names manually below.
        </div>
      )}
    </div>
  )
}
