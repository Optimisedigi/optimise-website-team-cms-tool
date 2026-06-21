'use client'

import { useDocumentInfo, useFormFields } from '@payloadcms/ui'
import { useEffect, useState } from 'react'
import { matchesPattern } from '@/lib/nkl-routing'

export default function NegativeKeywordCampaignSelect() {
  const { initialData } = useDocumentInfo()
  const data = initialData as any

  const formScope = useFormFields(([fields]) => fields.scope?.value)
  const formCampaignRegex = useFormFields(([fields]) => fields.campaignRegex?.value)

  const clientId = typeof data?.client === 'object' ? data?.client?.id : data?.client
  const scope = String(formScope || data?.scope || '')
  const campaignRegex = String(formCampaignRegex || data?.campaignRegex || '')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewedCampaigns, setPreviewedCampaigns] = useState<string[] | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Only show after the list is saved and linked to a client.
  if (!mounted || !data?.id) return null
  if (!clientId) return null
  if (scope !== 'account' && scope !== 'campaign') return null

  const savedCampaigns: string[] = (data?.campaigns || []).map((c: any) => c.campaignName).filter(Boolean)
  const currentCampaigns = previewedCampaigns ?? savedCampaigns

  const fetchAndSync = async () => {
    if (!data?.id) return
    if (!campaignRegex.trim()) {
      setError('No regex set — the list will sync to Google Ads but will not be auto-attached to campaigns.')
      return
    }
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

      const activeCampaigns: Array<{ name: string }> = json.campaigns || []

      // Match active campaigns against the pattern via the shared routing helper.
      // Supports plain text (e.g. "Brand") or regex (e.g. ".*Brand.*").
      const matched = activeCampaigns
        .filter((c) => matchesPattern(c.name, campaignRegex))
        .map((c) => c.name)

      // Auto-save matched campaigns so the list-view Campaigns snapshot reflects
      // the latest preview, including a valid 0-campaign result.
      await fetch(`/api/negative-keyword-lists/${data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaigns: matched.map((name) => ({ campaignName: name })),
        }),
      })

      if (matched.length === 0) {
        setPreviewedCampaigns([])
        setError(`No active campaigns matched the pattern "${campaignRegex}". ${activeCampaigns.length} active campaigns found in the account.`)
        setLoading(false)
        return
      }

      window.location.reload()
    } catch {
      setError('Failed to fetch campaigns')
      setLoading(false)
    }
  }

  return (
    <div className="negative-keyword-admin-panel" style={{
      position: 'relative',
      zIndex: 1,
      isolation: 'isolate',
      padding: '14px 16px',
      background: '#fff',
      border: '1px solid #d7dce3',
      borderRadius: 8,
      marginBottom: 16,
      fontSize: 14,
      color: '#1f2937',
      opacity: 1,
      filter: 'none',
      WebkitFilter: 'none',
      boxShadow: '0 1px 2px rgba(16, 24, 40, 0.04)',
    }}>
      <p style={{ margin: '0 0 10px', fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
        Preview which active campaigns this list will apply to when the Google Ads sync script runs.
        This does not push anything to Google Ads — it just checks which active campaign names match your regex.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={fetchAndSync}
          disabled={loading || !campaignRegex.trim()}
          style={{
            padding: '5px 12px',
            borderRadius: 4,
            border: '1px solid var(--theme-elevation-200)',
            background: 'var(--theme-elevation-100)',
            color: 'inherit',
            fontSize: 12,
            cursor: loading || !campaignRegex.trim() ? 'default' : 'pointer',
            opacity: loading || !campaignRegex.trim() ? 0.6 : 1,
          }}
        >
          {loading ? 'Checking...' : 'Preview Matching Campaigns'}
        </button>
        {campaignRegex.trim() && currentCampaigns.length > 0 && (
          <span style={{ fontSize: 12, color: 'var(--theme-elevation-400)' }}>
            {currentCampaigns.length} campaign{currentCampaigns.length !== 1 ? 's' : ''} will be targeted
          </span>
        )}
      </div>

      {campaignRegex.trim() && currentCampaigns.length > 0 && (
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
          ? `Matching campaigns against: ${campaignRegex}`
          : 'No regex set — the list will sync, but it will not be auto-attached to campaigns.'}
      </div>
      <div style={{ fontSize: 11, color: 'var(--theme-elevation-400)', marginTop: 4, fontStyle: 'italic' }}>
        Save the document first if you&apos;ve changed the regex, then preview.
      </div>
      <div style={{ fontSize: 11, color: 'var(--theme-elevation-400)', marginTop: 4, fontStyle: 'italic' }}>
        Available for account-level and campaign-level lists; campaign matching is controlled by the regex and active Google Ads campaigns.
      </div>
    </div>
  )
}
