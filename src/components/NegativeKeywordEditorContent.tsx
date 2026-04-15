'use client'

import { useState, useCallback, useMemo } from 'react'
import type { NegativeKeywordData } from './NegativeKeywordPinGate'

type AccountWideKeyword = NegativeKeywordData['accountWideKeywords'][number]
type CampaignGroup = NegativeKeywordData['campaignSpecificKeywords'][number]
type ExistingNKL = NegativeKeywordData['existingNegativeKeywordLists'][number]

const MATCH_COLORS: Record<string, { bg: string; color: string }> = {
  exact: { bg: '#dcfce7', color: '#166534' },
  phrase: { bg: '#dbeafe', color: '#1e40af' },
  broad: { bg: '#fef3c7', color: '#92400e' },
  EXACT: { bg: '#dcfce7', color: '#166534' },
  PHRASE: { bg: '#dbeafe', color: '#1e40af' },
}

const SCOPE_LABELS: Record<string, string> = {
  account: 'Account Level',
  campaign: 'Campaign Level',
  ad_group: 'Ad Group Level',
}

export default function NegativeKeywordEditorContent({
  data,
  pin,
}: {
  data: NegativeKeywordData
  pin: string
}) {
  const [activeTab, setActiveTab] = useState<'current' | 'proposed'>('proposed')
  const [accountWide, setAccountWide] = useState<AccountWideKeyword[]>(data.accountWideKeywords || [])
  const [campaigns, setCampaigns] = useState<CampaignGroup[]>(data.campaignSpecificKeywords || [])
  const [clientNotes, setClientNotes] = useState(data.clientNotes || '')
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [campaignSearchTerms, setCampaignSearchTerms] = useState<Record<string, string>>({})
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set())

  const totalAccountWideKept = accountWide.filter(kw => !kw.clientRemoved).length
  const totalCampaignKept = campaigns.reduce((n, g) => n + g.keywords.filter(kw => !kw.clientRemoved).length, 0)

  // ── Account-wide keyword mutations (flat array) ──

  const updateAccountWideKeyword = useCallback((kwIdx: number, field: string, value: string | boolean) => {
    setAccountWide(prev => {
      const next = [...prev]
      const kw = { ...next[kwIdx] }
      if (field === 'phrase') {
        (kw as any).originalPhrase = (kw as any).originalPhrase || kw.phrase
      }
      ;(kw as any)[field] = value
      next[kwIdx] = kw
      return next
    })
  }, [])

  const removeAccountWideKeyword = useCallback((kwIdx: number) => {
    updateAccountWideKeyword(kwIdx, 'clientRemoved', true)
  }, [updateAccountWideKeyword])

  const restoreAccountWideKeyword = useCallback((kwIdx: number) => {
    updateAccountWideKeyword(kwIdx, 'clientRemoved', false)
  }, [updateAccountWideKeyword])

  const addAccountWideKeyword = useCallback((phrase: string, matchType: 'PHRASE' | 'EXACT') => {
    setAccountWide(prev => {
      if (prev.some(kw => kw.phrase.toLowerCase() === phrase.toLowerCase())) return prev
      return [...prev, { phrase, matchType, sourceSection: 'accountWide', sourceCategoryName: 'Manually Added' }]
    })
  }, [])

  // ── Campaign keyword mutations ──

  const updateCampaignKeyword = useCallback((groupIdx: number, kwIdx: number, field: string, value: string | boolean) => {
    setCampaigns(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      if (next[groupIdx]?.keywords[kwIdx]) {
        if (field === 'phrase') {
          next[groupIdx].keywords[kwIdx].originalPhrase = next[groupIdx].keywords[kwIdx].originalPhrase || next[groupIdx].keywords[kwIdx].phrase
        }
        next[groupIdx].keywords[kwIdx][field] = value
      }
      return next
    })
  }, [])

  const removeCampaignKeyword = useCallback((groupIdx: number, kwIdx: number) => {
    updateCampaignKeyword(groupIdx, kwIdx, 'clientRemoved', true)
  }, [updateCampaignKeyword])

  const restoreCampaignKeyword = useCallback((groupIdx: number, kwIdx: number) => {
    updateCampaignKeyword(groupIdx, kwIdx, 'clientRemoved', false)
  }, [updateCampaignKeyword])

  const addCampaignKeyword = useCallback((groupIdx: number, phrase: string, matchType: 'PHRASE' | 'EXACT') => {
    setCampaigns(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      if (next[groupIdx]) {
        if (next[groupIdx].keywords.some((kw: any) => kw.phrase.toLowerCase() === phrase.toLowerCase())) return prev
        next[groupIdx].keywords.push({ phrase, matchType, reason: 'Manually added' })
      }
      return next
    })
  }, [])

  const toggleCampaign = (key: string) => {
    setExpandedCampaigns(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // ── Save / Submit ──

  const handleSave = useCallback(async () => {
    setSaving(true)
    setSaveMsg(null)
    try {
      const res = await fetch('/api/negative-keyword-build-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: data.slug, pin, action: 'save-edits',
          accountWideKeywords: accountWide,
          campaignSpecificKeywords: campaigns,
          clientNotes,
        }),
      })
      setSaveMsg(res.ok ? 'Changes saved.' : `Error: ${((await res.json().catch(() => ({}))).error || 'Failed')}`)
    } catch { setSaveMsg('Error: Network failure') }
    setSaving(false)
  }, [accountWide, campaigns, clientNotes, data.slug, pin])

  const handleSubmit = useCallback(async () => {
    setSubmitting(true)
    setSaveMsg(null)
    try {
      await fetch('/api/negative-keyword-build-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: data.slug, pin, action: 'save-edits',
          accountWideKeywords: accountWide,
          campaignSpecificKeywords: campaigns,
          clientNotes,
        }),
      })
      const res = await fetch('/api/negative-keyword-build-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: data.slug, pin, action: 'submit-approval', clientNotes }),
      })
      if (res.ok) {
        setSubmitted(true)
      } else {
        setSaveMsg(`Error: ${((await res.json().catch(() => ({}))).error || 'Failed')}`)
      }
    } catch { setSaveMsg('Error: Network failure') }
    setSubmitting(false)
  }, [accountWide, campaigns, clientNotes, data.slug, pin])

  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <div style={{ textAlign: 'center', maxWidth: 480, padding: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#10003;</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1e293b', margin: '0 0 8px' }}>Negative Keywords Approved</h1>
          <p style={{ fontSize: 15, color: '#64748b', lineHeight: 1.6 }}>
            Your changes to the negative keyword list for <strong>{data.businessName}</strong> have been saved and submitted. The Optimise Digital team will apply these to your Google Ads account.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Sticky header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '16px 24px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1e293b' }}>Negative Keyword Review: {data.businessName}</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
              {totalAccountWideKept} account-wide + {totalCampaignKept} campaign-specific keywords kept
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {saveMsg && <span style={{ fontSize: 12, color: saveMsg.startsWith('Error') ? '#dc2626' : '#059669' }}>{saveMsg}</span>}
            <button type="button" onClick={handleSave} disabled={saving}
              style={{ padding: '10px 20px', fontSize: 14, fontWeight: 600, background: saving ? '#6b7280' : '#64748b', color: '#fff', border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            <button type="button" onClick={handleSubmit} disabled={submitting}
              style={{ padding: '10px 20px', fontSize: 14, fontWeight: 600, background: submitting ? '#6b7280' : '#059669', color: '#fff', border: 'none', borderRadius: 8, cursor: submitting ? 'not-allowed' : 'pointer' }}>
              {submitting ? 'Submitting...' : 'Submit for Approval'}
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 24px 60px' }}>
        {/* Summary Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Terms Analyzed</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{(data.totalSearchTermsAnalyzed || 0).toLocaleString()}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Total Waste</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#dc2626' }}>${(data.totalWasteIdentified || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Date Range</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{data.dateRangeStart} to {data.dateRangeEnd}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Existing Negatives</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{data.existingNegativeCount || 0}</div>
          </div>
        </div>

        {/* Tab Bar */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e2e8f0', marginBottom: 24 }}>
          <button
            type="button"
            onClick={() => setActiveTab('proposed')}
            style={{
              padding: '12px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              background: 'none', border: 'none', borderBottom: activeTab === 'proposed' ? '2px solid #2563eb' : '2px solid transparent',
              color: activeTab === 'proposed' ? '#2563eb' : '#64748b',
              marginBottom: -2,
            }}
          >
            Proposed Changes
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('current')}
            style={{
              padding: '12px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              background: 'none', border: 'none', borderBottom: activeTab === 'current' ? '2px solid #2563eb' : '2px solid transparent',
              color: activeTab === 'current' ? '#2563eb' : '#64748b',
              marginBottom: -2,
            }}
          >
            Current Setup
            {(data.existingNegativeKeywordLists || []).length > 0 && (
              <span style={{ marginLeft: 8, fontSize: 11, background: '#e2e8f0', color: '#475569', padding: '2px 8px', borderRadius: 10 }}>
                {data.existingNegativeKeywordLists.length}
              </span>
            )}
          </button>
        </div>

        {/* ═══ Current Setup Tab ═══ */}
        {activeTab === 'current' && (
          <CurrentSetupTab lists={data.existingNegativeKeywordLists || []} />
        )}

        {/* ═══ Proposed Changes Tab ═══ */}
        {activeTab === 'proposed' && (
          <>
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '14px 18px', marginBottom: 24 }}>
              <p style={{ margin: 0, fontSize: 14, color: '#1e40af', lineHeight: 1.6 }}>
                The following negative keywords have been identified for your account. Please review and approve. You can remove keywords you disagree with, edit match types, or add new ones.
              </p>
            </div>

            {/* ── Account-Wide Negatives (Flat Table) ── */}
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#334155', margin: '0 0 4px', paddingBottom: 8, borderBottom: '2px solid #e2e8f0' }}>
              Account-Wide Negatives
            </h2>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
              These keywords will be blocked across all campaigns in the account.
            </p>

            <FlatKeywordTable
              keywords={accountWide}
              search={searchTerm}
              onSearchChange={setSearchTerm}
              onUpdate={updateAccountWideKeyword}
              onRemove={removeAccountWideKeyword}
              onRestore={restoreAccountWideKeyword}
              onAdd={addAccountWideKeyword}
              showSpend
            />

            {/* ── Campaign-Specific Negatives ── */}
            {campaigns.length > 0 && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#334155', margin: '32px 0 4px', paddingBottom: 8, borderBottom: '2px solid #e2e8f0' }}>
                  Campaign-Specific Negatives
                </h2>
                <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
                  These keywords are blocked only in the specific campaign listed. They prevent cross-campaign bleed.
                </p>

                {campaigns.map((group, groupIdx) => {
                  const groupKey = `cs-${groupIdx}`
                  const isExpanded = expandedCampaigns.has(groupKey)
                  const search = campaignSearchTerms[groupKey] || ''
                  const kept = group.keywords.filter(kw => !kw.clientRemoved).length

                  return (
                    <div key={groupIdx} style={{ marginBottom: 12, background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                      <div
                        style={{ padding: '12px 16px', background: '#f9fafb', borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                        onClick={() => toggleCampaign(groupKey)}
                      >
                        <div>
                          <span style={{ fontSize: 15, fontWeight: 600, color: '#1e293b' }}>{group.campaignName}</span>
                          <span style={{ marginLeft: 12, fontSize: 12, color: '#64748b' }}>{kept}/{group.keywords.length} keywords</span>
                        </div>
                        <span style={{ fontSize: 14, color: '#9ca3af' }}>{isExpanded ? '\u25B2' : '\u25BC'}</span>
                      </div>

                      {isExpanded && (
                        <div style={{ padding: 16 }}>
                          <CampaignKeywordRows
                            keywords={group.keywords}
                            search={search}
                            onSearchChange={(val) => setCampaignSearchTerms(p => ({ ...p, [groupKey]: val }))}
                            onUpdate={(kwIdx, field, val) => updateCampaignKeyword(groupIdx, kwIdx, field, val)}
                            onRemove={(kwIdx) => removeCampaignKeyword(groupIdx, kwIdx)}
                            onRestore={(kwIdx) => restoreCampaignKeyword(groupIdx, kwIdx)}
                            onAdd={(phrase, mt) => addCampaignKeyword(groupIdx, phrase, mt)}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </>
            )}

            {/* Client Notes */}
            <div style={{ marginTop: 32 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#334155', margin: '0 0 8px' }}>Notes</h3>
              <textarea
                value={clientNotes}
                onChange={e => setClientNotes(e.target.value)}
                placeholder="Add any notes or comments about the negative keyword list..."
                rows={4}
                style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Current Setup Tab ──

function CurrentSetupTab({ lists }: { lists: ExistingNKL[] }) {
  if (lists.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 24px', color: '#64748b' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
        <p style={{ fontSize: 15, margin: 0 }}>No existing negative keyword lists found for this account.</p>
        <p style={{ fontSize: 13, margin: '8px 0 0', color: '#94a3b8' }}>Check the &quot;Proposed Changes&quot; tab to review the recommended additions.</p>
      </div>
    )
  }

  const activeLists = lists.filter(l => l.isActive)
  const inactiveLists = lists.filter(l => !l.isActive)
  const totalKeywords = lists.reduce((n, l) => n + l.keywords.length, 0)

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: '#64748b' }}>
          <strong style={{ color: '#1e293b' }}>{lists.length}</strong> lists · <strong style={{ color: '#1e293b' }}>{totalKeywords}</strong> total keywords · <strong style={{ color: '#059669' }}>{activeLists.length}</strong> active
          {inactiveLists.length > 0 && <> · <strong style={{ color: '#94a3b8' }}>{inactiveLists.length}</strong> inactive</>}
        </span>
      </div>

      {lists.map((list, idx) => (
        <NKLCard key={idx} list={list} />
      ))}
    </div>
  )
}

// ── NKL Card (single existing list) ──

function NKLCard({ list }: { list: ExistingNKL }) {
  const [expanded, setExpanded] = useState(false)
  const scopeLabel = SCOPE_LABELS[list.scope] || list.scope

  return (
    <div style={{ marginBottom: 12, background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden', opacity: list.isActive ? 1 : 0.6 }}>
      <div
        style={{ padding: '14px 18px', background: '#f9fafb', borderBottom: expanded ? '1px solid #e2e8f0' : 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#1e293b' }}>{list.name}</span>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
            background: list.scope === 'account' ? '#eff6ff' : list.scope === 'campaign' ? '#fef3c7' : '#f3e8ff',
            color: list.scope === 'account' ? '#1e40af' : list.scope === 'campaign' ? '#92400e' : '#6b21a8',
          }}>
            {scopeLabel}
          </span>
          {!list.isActive && (
            <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 4, background: '#f1f5f9', color: '#94a3b8' }}>Inactive</span>
          )}
          <span style={{ fontSize: 12, color: '#64748b' }}>{list.keywords.length} keywords</span>
          {list.campaigns.length > 0 && (
            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              ({list.campaigns.map(c => c.campaignName).join(', ')})
            </span>
          )}
        </div>
        <span style={{ fontSize: 14, color: '#9ca3af' }}>{expanded ? '\u25B2' : '\u25BC'}</span>
      </div>

      {expanded && (
        <div style={{ padding: 0 }}>
          {list.keywords.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No keywords in this list.</div>
          ) : (
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0 }}>
                    <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Keyword</th>
                    <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', width: 100 }}>Match Type</th>
                  </tr>
                </thead>
                <tbody>
                  {list.keywords.map((kw, i) => {
                    const mc = MATCH_COLORS[kw.matchType] || MATCH_COLORS.exact
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '6px 16px', fontFamily: 'monospace', fontSize: 13 }}>{kw.keyword}</td>
                        <td style={{ padding: '6px 16px' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: mc.bg, color: mc.color }}>
                            {kw.matchType}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Flat Keyword Table (for account-wide proposed changes) ──

function FlatKeywordTable({
  keywords,
  search,
  onSearchChange,
  onUpdate,
  onRemove,
  onRestore,
  onAdd,
  showSpend,
}: {
  keywords: AccountWideKeyword[]
  search: string
  onSearchChange: (val: string) => void
  onUpdate: (kwIdx: number, field: string, value: string | boolean) => void
  onRemove: (kwIdx: number) => void
  onRestore: (kwIdx: number) => void
  onAdd: (phrase: string, matchType: 'PHRASE' | 'EXACT') => void
  showSpend?: boolean
}) {
  const [showAll, setShowAll] = useState(false)
  const [addPhrase, setAddPhrase] = useState('')
  const [addMatchType, setAddMatchType] = useState<'PHRASE' | 'EXACT'>('EXACT')

  const kept = keywords.filter(kw => !kw.clientRemoved).length
  const removed = keywords.length - kept

  const filtered = useMemo(() => {
    if (!search) return keywords.map((kw, i) => ({ kw, origIdx: i }))
    const q = search.toLowerCase()
    return keywords.map((kw, i) => ({ kw, origIdx: i })).filter(({ kw }) => kw.phrase.toLowerCase().includes(q))
  }, [keywords, search])

  const displayLimit = 100
  const displayed = showAll ? filtered : filtered.slice(0, displayLimit)
  const hasMore = filtered.length > displayLimit && !showAll

  const handleAdd = () => {
    const phrase = addPhrase.trim()
    if (!phrase) return
    onAdd(phrase, addMatchType)
    setAddPhrase('')
  }

  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 16 }}>
      {/* Toolbar */}
      <div style={{ padding: '12px 16px', background: '#f9fafb', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search keywords..."
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, width: 220 }}
        />
        <span style={{ fontSize: 12, color: '#64748b' }}>
          {kept} kept · {removed} removed · {keywords.length} total
        </span>
      </div>

      {/* Table */}
      <div style={{ maxHeight: 600, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 1 }}>
              <th style={thStyle}>Keyword</th>
              <th style={{ ...thStyle, width: 90 }}>Match Type</th>
              {showSpend && <th style={{ ...thStyle, width: 80, textAlign: 'right' }}>Spend</th>}
              {showSpend && <th style={{ ...thStyle, width: 70, textAlign: 'right' }}>Clicks</th>}
              <th style={{ ...thStyle, width: 80, textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayed.length === 0 ? (
              <tr>
                <td colSpan={showSpend ? 5 : 3} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
                  {keywords.length === 0 ? 'No keywords.' : 'No keywords match the search.'}
                </td>
              </tr>
            ) : displayed.map(({ kw, origIdx }) => {
              const isRemoved = !!kw.clientRemoved
              return (
                <tr key={origIdx} style={{ borderBottom: '1px solid #f1f5f9', background: isRemoved ? '#fef2f2' : 'transparent', opacity: isRemoved ? 0.5 : 1 }}>
                  <td style={tdStyle}>
                    <input
                      type="text"
                      value={kw.phrase}
                      onChange={e => onUpdate(origIdx, 'phrase', e.target.value)}
                      disabled={isRemoved}
                      style={{
                        width: '100%', padding: '4px 6px', fontSize: 13, fontFamily: 'monospace',
                        border: '1px solid transparent', borderRadius: 4, outline: 'none',
                        textDecoration: isRemoved ? 'line-through' : 'none',
                        background: 'transparent', boxSizing: 'border-box',
                      }}
                      onFocus={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#fff' }}
                      onBlur={e => { e.target.style.borderColor = 'transparent'; e.target.style.background = 'transparent' }}
                    />
                  </td>
                  <td style={tdStyle}>
                    <select
                      value={kw.matchType}
                      onChange={e => onUpdate(origIdx, 'matchType', e.target.value)}
                      disabled={isRemoved}
                      style={{ fontSize: 11, padding: '4px 6px', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff', width: '100%' }}
                    >
                      <option value="EXACT">EXACT</option>
                      <option value="PHRASE">PHRASE</option>
                    </select>
                  </td>
                  {showSpend && (
                    <td style={{ ...tdStyle, textAlign: 'right', fontSize: 12, color: '#64748b' }}>
                      {kw.totalSpend != null ? `$${kw.totalSpend.toFixed(2)}` : '—'}
                    </td>
                  )}
                  {showSpend && (
                    <td style={{ ...tdStyle, textAlign: 'right', fontSize: 12, color: '#64748b' }}>
                      {kw.totalClicks != null ? kw.totalClicks.toLocaleString() : '—'}
                    </td>
                  )}
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    {isRemoved ? (
                      <button type="button" onClick={() => onRestore(origIdx)}
                        style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, color: '#059669', cursor: 'pointer', padding: '2px 10px', whiteSpace: 'nowrap' }}>
                        Restore
                      </button>
                    ) : (
                      <button type="button" onClick={() => onRemove(origIdx)}
                        style={{ background: 'none', border: 'none', fontSize: 16, color: '#d1d5db', cursor: 'pointer', padding: '0 4px' }} title="Remove">
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div style={{ padding: '8px 16px', borderTop: '1px solid #f1f5f9' }}>
          <button type="button" onClick={() => setShowAll(true)}
            style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 4, padding: '4px 12px', fontSize: 12, color: '#2563eb', cursor: 'pointer' }}>
            Show all {filtered.length} keywords
          </button>
        </div>
      )}
      {showAll && filtered.length > displayLimit && (
        <div style={{ padding: '8px 16px', borderTop: '1px solid #f1f5f9' }}>
          <button type="button" onClick={() => setShowAll(false)}
            style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 4, padding: '4px 12px', fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
            Collapse
          </button>
        </div>
      )}

      {/* Add keyword */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderTop: '1px solid #e2e8f0', background: '#f9fafb' }}>
        <input
          type="text"
          value={addPhrase}
          onChange={e => setAddPhrase(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="Add negative keyword..."
          style={{ flex: 1, maxWidth: 300, padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'monospace' }}
        />
        <select value={addMatchType} onChange={e => setAddMatchType(e.target.value as 'PHRASE' | 'EXACT')}
          style={{ fontSize: 12, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6 }}>
          <option value="EXACT">EXACT</option>
          <option value="PHRASE">PHRASE</option>
        </select>
        <button type="button" onClick={handleAdd} disabled={!addPhrase.trim()}
          style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', fontSize: 13, cursor: addPhrase.trim() ? 'pointer' : 'not-allowed', color: '#475569', fontWeight: 500 }}>
          + Add
        </button>
      </div>
    </div>
  )
}

// ── Campaign Keyword Rows (for campaign-specific section) ──

function CampaignKeywordRows({
  keywords,
  search,
  onSearchChange,
  onUpdate,
  onRemove,
  onRestore,
  onAdd,
}: {
  keywords: any[]
  search: string
  onSearchChange: (val: string) => void
  onUpdate: (kwIdx: number, field: string, value: string | boolean) => void
  onRemove: (kwIdx: number) => void
  onRestore: (kwIdx: number) => void
  onAdd: (phrase: string, matchType: 'PHRASE' | 'EXACT') => void
}) {
  const [showAll, setShowAll] = useState(false)
  const [addPhrase, setAddPhrase] = useState('')
  const [addMatchType, setAddMatchType] = useState<'PHRASE' | 'EXACT'>('EXACT')

  const filtered = search
    ? keywords.map((kw, i) => ({ kw, origIdx: i })).filter(({ kw }) => kw.phrase.toLowerCase().includes(search.toLowerCase()))
    : keywords.map((kw, i) => ({ kw, origIdx: i }))

  const displayLimit = 50
  const displayed = showAll ? filtered : filtered.slice(0, displayLimit)
  const hasMore = filtered.length > displayLimit && !showAll

  const handleAdd = () => {
    const phrase = addPhrase.trim()
    if (!phrase) return
    onAdd(phrase, addMatchType)
    setAddPhrase('')
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <input type="text" value={search} onChange={e => onSearchChange(e.target.value)}
          placeholder="Search..." style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 12, width: 200 }} />
        <span style={{ fontSize: 11, color: '#64748b', lineHeight: '28px' }}>
          {keywords.filter(kw => !kw.clientRemoved).length} kept / {keywords.filter(kw => kw.clientRemoved).length} removed
        </span>
      </div>

      {displayed.map(({ kw, origIdx }) => {
        const isRemoved = !!kw.clientRemoved
        return (
          <div
            key={origIdx}
            style={{
              display: 'flex', gap: 6, alignItems: 'center', padding: '6px 0',
              borderBottom: '1px solid #f1f5f9',
              opacity: isRemoved ? 0.4 : 1,
              background: isRemoved ? '#fef2f2' : 'transparent',
            }}
          >
            <input
              type="text"
              value={kw.phrase}
              onChange={e => onUpdate(origIdx, 'phrase', e.target.value)}
              disabled={isRemoved}
              style={{
                flex: 1, padding: '6px 8px', fontSize: 13, fontFamily: 'monospace',
                border: '1px solid #e2e8f0', borderRadius: 4, outline: 'none',
                textDecoration: isRemoved ? 'line-through' : 'none',
                background: isRemoved ? '#fef2f2' : '#fff',
                minWidth: 0,
              }}
            />
            <select
              value={kw.matchType}
              onChange={e => onUpdate(origIdx, 'matchType', e.target.value)}
              disabled={isRemoved}
              style={{ fontSize: 11, padding: '6px 4px', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff', width: 72 }}
            >
              <option value="EXACT">EXACT</option>
              <option value="PHRASE">PHRASE</option>
            </select>
            {kw.reason && (
              <span style={{ fontSize: 10, color: '#94a3b8', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={kw.reason}>
                {kw.reason}
              </span>
            )}
            {isRemoved ? (
              <button type="button" onClick={() => onRestore(origIdx)}
                style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, color: '#059669', cursor: 'pointer', padding: '2px 8px', whiteSpace: 'nowrap' }}>
                Restore
              </button>
            ) : (
              <button type="button" onClick={() => onRemove(origIdx)}
                style={{ background: 'none', border: 'none', fontSize: 16, color: '#d1d5db', cursor: 'pointer', padding: '0 4px' }} title="Remove">
                ✕
              </button>
            )}
          </div>
        )
      })}

      {hasMore && (
        <button type="button" onClick={() => setShowAll(true)}
          style={{ marginTop: 6, background: 'none', border: '1px solid #e2e8f0', borderRadius: 4, padding: '4px 12px', fontSize: 12, color: '#2563eb', cursor: 'pointer' }}>
          Show all {filtered.length} keywords
        </button>
      )}
      {showAll && filtered.length > displayLimit && (
        <button type="button" onClick={() => setShowAll(false)}
          style={{ marginTop: 6, background: 'none', border: '1px solid #e2e8f0', borderRadius: 4, padding: '4px 12px', fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
          Collapse
        </button>
      )}

      {/* Add keyword */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px solid #e2e8f0' }}>
        <input
          type="text"
          value={addPhrase}
          onChange={e => setAddPhrase(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="Add negative keyword..."
          style={{ flex: 1, maxWidth: 300, padding: '6px 8px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 12, fontFamily: 'monospace' }}
        />
        <select value={addMatchType} onChange={e => setAddMatchType(e.target.value as 'PHRASE' | 'EXACT')}
          style={{ fontSize: 11, padding: '6px 4px', border: '1px solid #e2e8f0', borderRadius: 4 }}>
          <option value="EXACT">EXACT</option>
          <option value="PHRASE">PHRASE</option>
        </select>
        <button type="button" onClick={handleAdd} disabled={!addPhrase.trim()}
          style={{ padding: '4px 12px', borderRadius: 4, border: '1px solid #e2e8f0', background: '#fff', fontSize: 12, cursor: addPhrase.trim() ? 'pointer' : 'not-allowed', color: '#475569' }}>
          + Add
        </button>
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '8px 16px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  userSelect: 'none',
}

const tdStyle: React.CSSProperties = {
  padding: '4px 16px',
}
