'use client'

import { useState, useCallback } from 'react'
import type { NegativeKeywordData } from './NegativeKeywordPinGate'

type Keyword = NegativeKeywordData['accountWideKeywords'][number]['keywords'][number]
type Category = NegativeKeywordData['accountWideKeywords'][number]
type CampaignGroup = NegativeKeywordData['campaignSpecificKeywords'][number]

export default function NegativeKeywordEditorContent({
  data,
  pin,
}: {
  data: NegativeKeywordData
  pin: string
}) {
  const [accountWide, setAccountWide] = useState<Category[]>(data.accountWideKeywords || [])
  const [campaigns, setCampaigns] = useState<CampaignGroup[]>(data.campaignSpecificKeywords || [])
  const [clientNotes, setClientNotes] = useState(data.clientNotes || '')
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({})

  const toggleExpand = (key: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const totalAccountWideKept = accountWide.reduce((n, c) => n + c.keywords.filter(kw => !kw.clientRemoved).length, 0)
  const totalCampaignKept = campaigns.reduce((n, g) => n + g.keywords.filter(kw => !kw.clientRemoved).length, 0)

  // ── Account-wide keyword mutations ──

  const updateAccountWideKeyword = useCallback((catIdx: number, kwIdx: number, field: string, value: string | boolean) => {
    setAccountWide(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      if (next[catIdx]?.keywords[kwIdx]) {
        if (field === 'phrase') {
          next[catIdx].keywords[kwIdx].originalPhrase = next[catIdx].keywords[kwIdx].originalPhrase || next[catIdx].keywords[kwIdx].phrase
        }
        next[catIdx].keywords[kwIdx][field] = value
      }
      return next
    })
  }, [])

  const removeAccountWideKeyword = useCallback((catIdx: number, kwIdx: number) => {
    updateAccountWideKeyword(catIdx, kwIdx, 'clientRemoved', true)
  }, [updateAccountWideKeyword])

  const restoreAccountWideKeyword = useCallback((catIdx: number, kwIdx: number) => {
    updateAccountWideKeyword(catIdx, kwIdx, 'clientRemoved', false)
  }, [updateAccountWideKeyword])

  const addAccountWideKeyword = useCallback((catIdx: number, phrase: string, matchType: 'PHRASE' | 'EXACT') => {
    setAccountWide(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      if (next[catIdx]) {
        if (next[catIdx].keywords.some((kw: any) => kw.phrase.toLowerCase() === phrase.toLowerCase())) return prev
        next[catIdx].keywords.push({ phrase, matchType, sourceSection: 'accountWide', sourceCategoryName: next[catIdx].name })
      }
      return next
    })
  }, [])

  const moveAccountWideToCampaign = useCallback((catIdx: number, kwIdx: number, campaignIdx: number) => {
    setAccountWide(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const kw = next[catIdx]?.keywords[kwIdx]
      if (!kw) return prev
      next[catIdx].keywords.splice(kwIdx, 1)
      setCampaigns(cprev => {
        const cnext = JSON.parse(JSON.stringify(cprev))
        if (cnext[campaignIdx]) {
          cnext[campaignIdx].keywords.push({ phrase: kw.phrase, matchType: kw.matchType, reason: `Moved from ${next[catIdx].name}` })
        }
        return cnext
      })
      return next
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

  const moveCampaignToAccountWide = useCallback((groupIdx: number, kwIdx: number, catIdx: number) => {
    setCampaigns(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const kw = next[groupIdx]?.keywords[kwIdx]
      if (!kw) return prev
      next[groupIdx].keywords.splice(kwIdx, 1)
      setAccountWide(aprev => {
        const anext = JSON.parse(JSON.stringify(aprev))
        if (anext[catIdx]) {
          anext[catIdx].keywords.push({
            phrase: kw.phrase,
            matchType: kw.matchType,
            sourceSection: 'accountWide',
            sourceCategoryName: anext[catIdx].name,
          })
        }
        return anext
      })
      return next
    })
  }, [])

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
      // Save first
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
      // Then submit
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
              {totalAccountWideKept} account-wide + {totalCampaignKept} campaign-specific keywords kept.
              Edit keywords, change match types, or add new negatives.
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
        {/* Summary */}
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

        {/* ── Section 1: Account-Wide Negatives ── */}
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#334155', margin: '0 0 4px', paddingBottom: 8, borderBottom: '2px solid #e2e8f0' }}>
          Account-Wide Negatives
        </h2>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
          These keywords will be blocked across all campaigns in the account.
        </p>

        {accountWide.map((cat, catIdx) => {
          const catKey = `aw-${catIdx}`
          const isExpanded = expandedCats.has(catKey)
          const search = searchTerms[catKey] || ''
          const kept = cat.keywords.filter(kw => !kw.clientRemoved).length

          return (
            <div key={catIdx} style={{ marginBottom: 12, background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <div
                style={{ padding: '12px 16px', background: '#f9fafb', borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onClick={() => toggleExpand(catKey)}
              >
                <div>
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#1e293b' }}>{cat.name}</span>
                  <span style={{ marginLeft: 12, fontSize: 12, color: '#64748b' }}>
                    {kept}/{cat.keywords.length} keywords
                    {cat.totalWaste ? ` | $${cat.totalWaste.toFixed(2)} waste` : ''}
                  </span>
                </div>
                <span style={{ fontSize: 14, color: '#9ca3af' }}>{isExpanded ? '\u25B2' : '\u25BC'}</span>
              </div>

              {isExpanded && (
                <div style={{ padding: 16 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <input type="text" value={search} onChange={e => setSearchTerms(p => ({ ...p, [catKey]: e.target.value }))}
                      placeholder="Search..." style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 12, width: 200 }} />
                    <span style={{ fontSize: 11, color: '#64748b', lineHeight: '28px' }}>{kept} kept / {cat.keywords.length - kept} removed</span>
                  </div>

                  <KeywordRows
                    keywords={cat.keywords}
                    search={search}
                    onUpdate={(kwIdx, field, val) => updateAccountWideKeyword(catIdx, kwIdx, field, val)}
                    onRemove={(kwIdx) => removeAccountWideKeyword(catIdx, kwIdx)}
                    onRestore={(kwIdx) => restoreAccountWideKeyword(catIdx, kwIdx)}
                    moveLabel="Move to Campaign"
                    moveOptions={campaigns.map((g, gi) => ({ label: g.campaignName, value: gi }))}
                    onMove={(kwIdx, destIdx) => moveAccountWideToCampaign(catIdx, kwIdx, destIdx)}
                    onAdd={(phrase, mt) => addAccountWideKeyword(catIdx, phrase, mt)}
                  />
                </div>
              )}
            </div>
          )
        })}

        {/* ── Section 2: Campaign-Specific Negatives ── */}
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#334155', margin: '32px 0 4px', paddingBottom: 8, borderBottom: '2px solid #e2e8f0' }}>
          Campaign-Specific Negatives
        </h2>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
          These keywords are blocked only in the specific campaign listed. They prevent cross-campaign bleed.
        </p>

        {campaigns.map((group, groupIdx) => {
          const groupKey = `cs-${groupIdx}`
          const isExpanded = expandedCats.has(groupKey)
          const search = searchTerms[groupKey] || ''
          const kept = group.keywords.filter(kw => !kw.clientRemoved).length

          return (
            <div key={groupIdx} style={{ marginBottom: 12, background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <div
                style={{ padding: '12px 16px', background: '#f9fafb', borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onClick={() => toggleExpand(groupKey)}
              >
                <div>
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#1e293b' }}>{group.campaignName}</span>
                  <span style={{ marginLeft: 12, fontSize: 12, color: '#64748b' }}>{kept}/{group.keywords.length} keywords</span>
                </div>
                <span style={{ fontSize: 14, color: '#9ca3af' }}>{isExpanded ? '\u25B2' : '\u25BC'}</span>
              </div>

              {isExpanded && (
                <div style={{ padding: 16 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <input type="text" value={search} onChange={e => setSearchTerms(p => ({ ...p, [groupKey]: e.target.value }))}
                      placeholder="Search..." style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 12, width: 200 }} />
                    <span style={{ fontSize: 11, color: '#64748b', lineHeight: '28px' }}>{kept} kept / {group.keywords.length - kept} removed</span>
                  </div>

                  <KeywordRows
                    keywords={group.keywords}
                    search={search}
                    showReason
                    onUpdate={(kwIdx, field, val) => updateCampaignKeyword(groupIdx, kwIdx, field, val)}
                    onRemove={(kwIdx) => removeCampaignKeyword(groupIdx, kwIdx)}
                    onRestore={(kwIdx) => restoreCampaignKeyword(groupIdx, kwIdx)}
                    moveLabel="Move to Account-Wide"
                    moveOptions={accountWide.map((c, ci) => ({ label: c.name, value: ci }))}
                    onMove={(kwIdx, destIdx) => moveCampaignToAccountWide(groupIdx, kwIdx, destIdx)}
                    onAdd={(phrase, mt) => addCampaignKeyword(groupIdx, phrase, mt)}
                  />
                </div>
              )}
            </div>
          )
        })}

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
      </div>
    </div>
  )
}

// ── Reusable keyword rows component ──

function KeywordRows({
  keywords,
  search,
  showReason,
  onUpdate,
  onRemove,
  onRestore,
  moveLabel,
  moveOptions,
  onMove,
  onAdd,
}: {
  keywords: any[]
  search: string
  showReason?: boolean
  onUpdate: (kwIdx: number, field: string, value: string | boolean) => void
  onRemove: (kwIdx: number) => void
  onRestore: (kwIdx: number) => void
  moveLabel: string
  moveOptions: { label: string; value: number }[]
  onMove: (kwIdx: number, destIdx: number) => void
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
            {showReason && kw.reason && (
              <span style={{ fontSize: 10, color: '#94a3b8', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={kw.reason}>
                {kw.reason}
              </span>
            )}
            {!isRemoved && moveOptions.length > 0 && (
              <select
                value=""
                onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) onMove(origIdx, v) }}
                style={{ fontSize: 10, padding: '4px 2px', border: '1px solid #e2e8f0', borderRadius: 4, color: '#64748b', width: 100 }}
              >
                <option value="">{moveLabel}</option>
                {moveOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            )}
            {isRemoved ? (
              <button type="button" onClick={() => onRestore(origIdx)}
                style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, color: '#059669', cursor: 'pointer', padding: '2px 8px', whiteSpace: 'nowrap' }}>
                Restore
              </button>
            ) : (
              <button type="button" onClick={() => onRemove(origIdx)}
                style={{ background: 'none', border: 'none', fontSize: 16, color: '#d1d5db', cursor: 'pointer', padding: '0 4px' }} title="Remove">
                x
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
