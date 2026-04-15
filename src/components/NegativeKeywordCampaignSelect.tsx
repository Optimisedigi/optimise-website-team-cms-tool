'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useState } from 'react'

export default function NegativeKeywordCampaignSelect() {
  const { initialData } = useDocumentInfo()
  const data = initialData as any

  const clientId = typeof data?.client === 'object' ? data?.client?.id : data?.client
  const scope = data?.scope
  const campaignRegex = data?.campaignRegex || ''

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Only show for campaign/ad_group scope
  if (scope !== 'campaign' && scope !== 'ad_group') return null
  if (!clientId) return null

  const currentCampaigns: string[] = (data?.campaigns || []).map((c: any) => c.campaignName).filter(Boolean)

  const fetchAndSync = async () => {
    if (!data?.id) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/negative-keyword-lists/campaigns?clientId=${clientId}`)
      const json = await res.json()
      if (!json.ok) {
        setError(json.note || json.error || 'Failed to fetch campaigns')
        setLoading(false)
        return
      }

      const allCampaigns: Array<{ name: string }> = json.campaigns || []

      // Match campaigns against the pattern
      // Supports plain text (e.g. "Brand") or regex (e.g. ".*Brand.*")
      let matched: string[]
      if (campaignRegex) {
        let regexStr = campaignRegex.trim()
        // If plain text (only letters, numbers, spaces, hyphens, underscores), wrap in .*text.*
        if (/^[a-zA-Z0-9 _-]+$/.test(regexStr)) {
          regexStr = `.*${regexStr}.*`
        }
        try {
          const pattern = new RegExp(regexStr, 'i')
          matched = allCampaigns.filter((c) => pattern.test(c.name)).map((c) => c.name)
        } catch {
          // Still invalid — try as plain substring match
          const lower = campaignRegex.toLowerCase()
          matched = allCampaigns.filter((c) => c.name.toLowerCase().includes(lower)).map((c) => c.name)
        }
      } else {
        // No pattern — save all campaigns
        matched = allCampaigns.map((c) => c.name)
      }

      if (matched.length === 0) {
        setError(`No campaigns matched the pattern "${campaignRegex}". ${allCampaigns.length} campaigns found in the account.`)
        setLoading(false)
        return
      }

      // Auto-save matched campaigns
      await fetch(`/api/negative-keyword-lists/${data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaigns: matched.map((name) => ({ campaignName: name })),
        }),
      })

      window.location.reload()
    } catch {
      setError('Failed to fetch campaigns')
      setLoading(false)
    }
  }

  return (
    <div style={{
      padding: '12px 14px',
      background: 'var(--theme-elevation-50)',
      border: '1px solid var(--theme-elevation-150)',
      borderRadius: 6,
      marginBottom: 12,
      fontSize: 13,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={fetchAndSync}
          disabled={loading}
          style={{
            padding: '5px 12px',
            borderRadius: 4,
            border: '1px solid var(--theme-elevation-200)',
            background: 'var(--theme-elevation-100)',
            color: 'inherit',
            fontSize: 12,
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Syncing campaigns...' : 'Sync Campaigns from Google Ads'}
        </button>
        {currentCampaigns.length > 0 && (
          <span style={{ fontSize: 12, color: 'var(--theme-elevation-400)' }}>
            {currentCampaigns.length} campaign{currentCampaigns.length !== 1 ? 's' : ''} linked
          </span>
        )}
      </div>

      {currentCampaigns.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
          {currentCampaigns.map((name) => (
            <span
              key={name}
              style={{
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 11,
                background: '#eff6ff',
                color: '#1d4ed8',
                border: '1px solid #bfdbfe',
              }}
            >
              {name}
            </span>
          ))}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: '#b45309', marginTop: 6 }}>{error}</div>
      )}

      <div style={{ fontSize: 11, color: 'var(--theme-elevation-400)', marginTop: 6 }}>
        {campaignRegex
          ? `Matches campaigns against pattern: ${campaignRegex}`
          : 'No regex set — will sync all campaigns. Set a Regex above to filter.'}
      </div>
    </div>
  )
}
