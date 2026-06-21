'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useState, useEffect } from 'react'

interface NKLRecord {
  id: string
  name: string
  scope: 'account' | 'campaign' | 'ad_group'
  keywordCount: number
  isActive: boolean
  campaignName?: string
  campaigns?: { campaignName: string }[]
  campaignCount?: number
  campaignRegex?: string
  updatedAt: string
}

const card: React.CSSProperties = {
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  padding: 16,
  marginBottom: 12,
}

const badge = (color: string): React.CSSProperties => ({
  display: 'inline-block',
  padding: '2px 10px',
  borderRadius: 12,
  fontSize: 12,
  fontWeight: 600,
  background: color === 'green' ? '#dcfce7' : color === 'blue' ? '#dbeafe' : color === 'amber' ? '#fef3c7' : color === 'red' ? '#fee2e2' : '#f1f5f9',
  color: color === 'green' ? '#166534' : color === 'blue' ? '#1e40af' : color === 'amber' ? '#92400e' : color === 'red' ? '#991b1b' : '#475569',
})

const GoogleAdsNegativeKeywordLists = () => {
  const { id } = useDocumentInfo()

  const [lists, setLists] = useState<NKLRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const [openCampaignLists, setOpenCampaignLists] = useState<Record<string, boolean>>({})

  // Get client ID from the audit's sidebar relationship
  useEffect(() => {
    if (!id) return
    fetch(`/api/google-ads-audits/${id}?depth=0`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(doc => {
        if (doc?.client) {
          const cid = typeof doc.client === 'object' ? doc.client.id : doc.client
          setClientId(cid)
        }
      })
      .catch(() => {})
  }, [id])

  // Fetch NKL records for this client
  useEffect(() => {
    if (!clientId) {
      setLoading(false)
      return
    }
    setLoading(true)
    fetch(`/api/negative-keyword-lists?where[client][equals]=${clientId}&sort=-updatedAt&limit=100&depth=0`, {
      credentials: 'include',
    })
      .then(res => {
        if (!res.ok) throw new Error(`Failed (${res.status})`)
        return res.json()
      })
      .then(data => {
        setLists(data.docs || [])
      })
      .catch(err => {
        setError(err.message || 'Failed to load lists')
      })
      .finally(() => setLoading(false))
  }, [clientId])

  if (!id) return null

  if (!clientId && !loading) {
    return (
      <div style={{ maxWidth: 960 }}>
        <div style={{ ...card, background: '#fef3c7', borderColor: '#fcd34d' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#92400e' }}>
            <strong>No client linked.</strong> Link a client in the sidebar to view their Negative Keyword Lists.
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 960, padding: 16 }}>
        <p style={{ fontSize: 13, color: '#94a3b8' }}>Loading negative keyword lists...</p>
      </div>
    )
  }

  const scopeLabels: Record<string, string> = {
    account: 'Account',
    campaign: 'Campaign',
    ad_group: 'Ad Group',
  }

  const totalKeywords = lists.reduce((sum, l) => sum + (l.keywordCount || 0), 0)
  const activeLists = lists.filter(l => l.isActive)

  return (
    <div style={{ maxWidth: 960 }}>
      {/* Info banner */}
      <div style={{ ...card, background: '#eff6ff', borderColor: '#bfdbfe', marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: '#1e40af', lineHeight: 1.6 }}>
          <strong>Negative Keyword Lists</strong> — These are the live negative keyword lists synced to Google Ads for this client.
          Lists can be created from the Negative List Builder or manually via the{' '}
          <a href="/admin/collections/negative-keyword-lists" target="_blank" style={{ color: '#2563eb' }}>
            Negative Keyword Lists
          </a>{' '}
          collection.
        </p>
      </div>

      {error && (
        <div style={{ ...card, background: '#fee2e2', borderColor: '#fca5a5' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#991b1b' }}>{error}</p>
        </div>
      )}

      {/* Summary */}
      <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Total Lists</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{lists.length}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Active Lists</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#16a34a' }}>{activeLists.length}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Total Keywords</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{totalKeywords.toLocaleString()}</div>
        </div>
      </div>

      {/* Create new button */}
      <div style={{ marginBottom: 16 }}>
        <a
          href={`/admin/collections/negative-keyword-lists/create?client=${clientId}`}
          target="_blank"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            background: '#2563eb',
            color: '#fff',
            borderRadius: 6,
            fontWeight: 600,
            fontSize: 13,
            textDecoration: 'none',
            cursor: 'pointer',
          }}
        >
          + Create New List
        </a>
      </div>

      {/* List cards */}
      {lists.length === 0 && (
        <div style={card}>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            No negative keyword lists found for this client. Use the Negative List Builder to generate and import lists,
            or create one manually.
          </p>
        </div>
      )}

      {lists.map(list => {
        const campaignNames = Array.from(new Set(list.campaigns?.map(c => c.campaignName).filter(Boolean) || []))
        const activeCampaignCount = campaignNames.length
        const showCampaigns = activeCampaignCount > 0 && campaignNames.length > 0
        const campaignsOpen = Boolean(openCampaignLists[list.id])
        const scopeDetail = list.scope === 'account' && list.campaignRegex
          ? `Regex: ${list.campaignRegex}`
          : null

        return (
          <div
            key={list.id}
            style={{
              ...card,
              opacity: list.isActive ? 1 : 0.6,
              borderLeft: `4px solid ${list.isActive ? '#16a34a' : '#94a3b8'}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <a
                  href={`/admin/collections/negative-keyword-lists/${list.id}`}
                  target="_blank"
                  style={{ fontWeight: 600, fontSize: 14, color: '#1e293b', textDecoration: 'none' }}
                >
                  {list.name}
                  <svg
                    width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 6, verticalAlign: 'middle' }}
                  >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <span style={badge(list.isActive ? 'green' : 'gray')}>
                    {list.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <span style={badge('blue')}>{scopeLabels[list.scope] || list.scope}</span>
                  <span style={badge('gray')}>{list.keywordCount || 0} keywords</span>
                  <span style={badge('gray')}>{activeCampaignCount} active campaign{activeCampaignCount === 1 ? '' : 's'}</span>
                </div>
                {scopeDetail && (
                  <div style={{ marginTop: 4, fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>
                    {scopeDetail}
                  </div>
                )}
                {showCampaigns && (
                  <div style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={() => setOpenCampaignLists(prev => ({ ...prev, [list.id]: !prev[list.id] }))}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '4px 8px',
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        background: '#fff',
                        color: '#475569',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <span aria-hidden="true">{campaignsOpen ? '▾' : '▸'}</span>
                      {campaignsOpen ? 'Hide active campaigns' : 'Show active campaigns'}
                    </button>
                    {campaignsOpen && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {campaignNames.map(name => (
                          <span
                            key={name}
                            style={{
                              padding: '3px 8px',
                              borderRadius: 6,
                              fontSize: 11,
                              lineHeight: 1.4,
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
                  </div>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'right', whiteSpace: 'nowrap' }}>
                Updated {new Date(list.updatedAt).toLocaleDateString()}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default GoogleAdsNegativeKeywordLists
