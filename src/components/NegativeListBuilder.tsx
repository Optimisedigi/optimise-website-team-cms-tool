'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState, useCallback, useEffect, useMemo } from 'react'

// ─── Types ───

interface NegativeKeyword {
  phrase: string
  matchType: 'PHRASE' | 'EXACT'
  totalSpend?: number
  totalClicks?: number
  totalImpressions?: number
  campaignCount?: number
  reason?: string
  originalCampaign?: string
  removed?: boolean        // removed by agency during team review
  clientRemoved?: boolean  // removed by client during client review
}

interface NegativeCategory {
  name: string
  totalWaste?: number
  approved?: boolean
  keywords: NegativeKeyword[]
}

interface CampaignNegativeGroup {
  campaignName: string
  approved?: boolean
  keywords: NegativeKeyword[]
}

interface BrandVariation {
  term: string
  spend: number
  clicks: number
  conversions: number
}

interface DetectedBrand {
  seedBrand: string
  totalSearchTerms: number
  totalSpend: number
  totalConversions: number
  variations: BrandVariation[]
}

interface NLBData {
  status?: string
  generatedAt?: string
  totalSearchTermsAnalyzed?: number
  dateRangeStart?: string
  dateRangeEnd?: string
  totalWasteIdentified?: number
  existingNegativeCount?: number
  universalNegatives?: NegativeCategory[]
  accountWideNegatives?: NegativeCategory[]
  campaignSpecificNegatives?: CampaignNegativeGroup[]
  detectedBrandTerms?: DetectedBrand[]
  teamReviewedAt?: string
  teamReviewedBy?: string
  teamNotes?: string
  clientSharedAt?: string
  clientSharedTo?: string[]
  clientApprovedAt?: string
  clientNotes?: string
}

// ─── Styles ───

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

const btnStyle = (variant: 'primary' | 'success' | 'danger' | 'secondary' = 'primary', disabled = false): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 16px',
  borderRadius: 6,
  border: 'none',
  fontWeight: 600,
  fontSize: 13,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
  background: variant === 'primary' ? '#2563eb' : variant === 'success' ? '#16a34a' : variant === 'danger' ? '#dc2626' : '#6b7280',
  color: '#fff',
})

const sectionHeader: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  marginBottom: 12,
  marginTop: 20,
  borderBottom: '2px solid #e2e8f0',
  paddingBottom: 6,
}

const statusColors: Record<string, string> = {
  generated: 'blue',
  team_review: 'amber',
  team_approved: 'green',
  client_review: 'amber',
  client_approved: 'green',
  applied: 'green',
  failed: 'red',
}

const statusLabels: Record<string, string> = {
  generated: 'Generated',
  team_review: 'Team Reviewing',
  team_approved: 'Team Approved',
  client_review: 'Client Reviewing',
  client_approved: 'Client Approved',
  applied: 'Applied',
  failed: 'Failed',
}

// ─── Helper Components ───

function StatusBadge({ status }: { status?: string }) {
  if (!status) return null
  return <span style={badge(statusColors[status] || 'gray')}>{statusLabels[status] || status}</span>
}

function SummaryCard({ data }: { data: NLBData }) {
  if (!data?.totalSearchTermsAnalyzed) return null
  return (
    <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
      <div>
        <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Terms Analyzed</div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{data.totalSearchTermsAnalyzed.toLocaleString()}</div>
      </div>
      <div>
        <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Total Waste</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#dc2626' }}>${(data.totalWasteIdentified ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
      </div>
      <div>
        <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Date Range</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{data.dateRangeStart} to {data.dateRangeEnd}</div>
      </div>
      <div>
        <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Existing Negatives</div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{data.existingNegativeCount ?? 0}</div>
      </div>
    </div>
  )
}

interface MoveDestination {
  label: string
  tier: 'universal' | 'accountWide' | 'campaign'
  catIndex: number
}

function KeywordTable({
  keywords,
  showReason,
  editable,
  onToggleKeyword,
  onBulkAction,
  onChangeMatchType,
  onChangePhrase,
  onMoveKeyword,
  onAddKeyword,
  moveDestinations,
  removedField,
}: {
  keywords: NegativeKeyword[]
  showReason?: boolean
  editable?: boolean
  onToggleKeyword?: (kwIndex: number) => void
  onBulkAction?: (action: 'selectAll' | 'unselectAll') => void
  onChangeMatchType?: (kwIndex: number, matchType: 'PHRASE' | 'EXACT') => void
  onChangePhrase?: (kwIndex: number, phrase: string) => void
  onMoveKeyword?: (kwIndex: number, dest: MoveDestination) => void
  onAddKeyword?: (phrase: string, matchType: 'PHRASE' | 'EXACT') => void
  moveDestinations?: MoveDestination[]
  removedField?: 'removed' | 'clientRemoved'
}) {
  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [addPhrase, setAddPhrase] = useState('')
  const [addMatchType, setAddMatchType] = useState<'PHRASE' | 'EXACT'>('EXACT')

  const field = removedField || 'removed'
  const hasKeywords = keywords?.length > 0
  const filtered = search && hasKeywords
    ? keywords.filter(kw => kw.phrase.toLowerCase().includes(search.toLowerCase()))
    : (keywords || [])

  const removedCount = hasKeywords ? keywords.filter(kw => kw[field]).length : 0
  const keptCount = (keywords?.length || 0) - removedCount
  const displayLimit = 50
  const displayed = showAll ? filtered : filtered.slice(0, displayLimit)
  const hasMore = filtered.length > displayLimit && !showAll

  const smallBtn: React.CSSProperties = {
    padding: '2px 8px', borderRadius: 4, border: '1px solid #e2e8f0',
    background: '#fff', fontSize: 11, cursor: 'pointer', color: '#475569',
  }

  const handleAdd = () => {
    const phrase = addPhrase.trim()
    if (!phrase || !onAddKeyword) return
    onAddKeyword(phrase, addMatchType)
    setAddPhrase('')
  }

  return (
    <div>
      {/* Search + stats + bulk actions bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        {hasKeywords && (
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search keywords..."
            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 12, width: 200 }}
          />
        )}
        <span style={{ fontSize: 11, color: '#64748b' }}>
          {keptCount} kept / {removedCount} removed / {keywords?.length || 0} total
        </span>
        {editable && onBulkAction && hasKeywords && (
          <>
            <button type="button" onClick={() => onBulkAction('selectAll')} style={smallBtn}>Select All</button>
            <button type="button" onClick={() => onBulkAction('unselectAll')} style={{ ...smallBtn, color: '#dc2626' }}>Unselect All</button>
          </>
        )}
      </div>

      {hasKeywords && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#f8fafc' }}>
              {editable && <th style={{ width: 30, padding: '6px 4px' }}></th>}
              <th style={{ textAlign: 'left', padding: '6px 8px', color: '#64748b', fontWeight: 600 }}>Keyword</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: '#64748b', fontWeight: 600, width: 80 }}>Match</th>
              {showReason ? (
                <th style={{ textAlign: 'left', padding: '6px 8px', color: '#64748b', fontWeight: 600 }}>Reason</th>
              ) : (
                <>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: '#64748b', fontWeight: 600, width: 80 }}>Spend</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: '#64748b', fontWeight: 600, width: 60 }}>Clicks</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: '#64748b', fontWeight: 600, width: 60 }}>Impr.</th>
                </>
              )}
              {editable && moveDestinations && <th style={{ width: 130, padding: '6px 4px', color: '#64748b', fontWeight: 600, fontSize: 11 }}>Move to</th>}
            </tr>
          </thead>
          <tbody>
            {displayed.map((kw, displayIdx) => {
              const origIdx = search ? keywords.indexOf(kw) : displayIdx
              const isRemoved = !!kw[field]

              return (
                <tr
                  key={origIdx}
                  style={{
                    borderBottom: '1px solid #f1f5f9',
                    opacity: isRemoved ? 0.4 : 1,
                    textDecoration: isRemoved ? 'line-through' : 'none',
                    background: isRemoved ? '#fef2f2' : 'transparent',
                  }}
                >
                  {editable && (
                    <td style={{ padding: '4px 4px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={!isRemoved}
                        onChange={() => onToggleKeyword?.(origIdx)}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                  )}
                  <td style={{ padding: '4px 8px' }}>
                    {editable && onChangePhrase ? (
                      <input
                        type="text"
                        value={kw.phrase}
                        onChange={e => onChangePhrase(origIdx, e.target.value)}
                        style={{
                          width: '100%', padding: '2px 4px', fontFamily: 'monospace', fontSize: 11,
                          border: '1px solid #e2e8f0', borderRadius: 3, outline: 'none',
                          textDecoration: isRemoved ? 'line-through' : 'none',
                          background: isRemoved ? '#fef2f2' : '#fff',
                        }}
                      />
                    ) : (
                      <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{kw.phrase}</span>
                    )}
                  </td>
                  <td style={{ padding: '4px 8px' }}>
                    {editable && onChangeMatchType ? (
                      <select
                        value={kw.matchType}
                        onChange={e => onChangeMatchType(origIdx, e.target.value as 'PHRASE' | 'EXACT')}
                        style={{ fontSize: 11, padding: '1px 2px', border: '1px solid #e2e8f0', borderRadius: 3, cursor: 'pointer', background: '#fff' }}
                      >
                        <option value="EXACT">EXACT</option>
                        <option value="PHRASE">PHRASE</option>
                      </select>
                    ) : (
                      kw.matchType
                    )}
                  </td>
                  {showReason ? (
                    <td style={{ padding: '4px 8px', color: '#64748b', fontSize: 11 }}>{kw.reason}</td>
                  ) : (
                    <>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>{kw.totalSpend != null ? `$${kw.totalSpend.toFixed(2)}` : '-'}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>{kw.totalClicks ?? '-'}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>{kw.totalImpressions ?? '-'}</td>
                    </>
                  )}
                  {editable && moveDestinations && (
                    <td style={{ padding: '4px 4px' }}>
                      <select
                        value=""
                        onChange={e => {
                          const idx = parseInt(e.target.value)
                          if (!isNaN(idx) && moveDestinations[idx]) {
                            onMoveKeyword?.(origIdx, moveDestinations[idx])
                          }
                        }}
                        style={{ fontSize: 10, padding: '1px 2px', border: '1px solid #e2e8f0', borderRadius: 3, cursor: 'pointer', width: '100%', color: '#64748b' }}
                      >
                        <option value="">Move to...</option>
                        {moveDestinations.map((d, di) => (
                          <option key={di} value={di}>{d.label}</option>
                        ))}
                      </select>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          style={{ marginTop: 6, background: 'none', border: '1px solid #e2e8f0', borderRadius: 4, padding: '4px 12px', fontSize: 12, color: '#2563eb', cursor: 'pointer' }}
        >
          Show all {filtered.length} keywords
        </button>
      )}
      {showAll && filtered.length > displayLimit && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          style={{ marginTop: 6, background: 'none', border: '1px solid #e2e8f0', borderRadius: 4, padding: '4px 12px', fontSize: 12, color: '#64748b', cursor: 'pointer' }}
        >
          Collapse to {displayLimit}
        </button>
      )}

      {/* Add keyword row */}
      {editable && onAddKeyword && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px solid #e2e8f0' }}>
          <input
            type="text"
            value={addPhrase}
            onChange={e => setAddPhrase(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="Add negative keyword..."
            style={{ flex: 1, maxWidth: 300, padding: '4px 8px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 12, fontFamily: 'monospace' }}
          />
          <select
            value={addMatchType}
            onChange={e => setAddMatchType(e.target.value as 'PHRASE' | 'EXACT')}
            style={{ fontSize: 11, padding: '4px 4px', border: '1px solid #e2e8f0', borderRadius: 4 }}
          >
            <option value="EXACT">EXACT</option>
            <option value="PHRASE">PHRASE</option>
          </select>
          <button type="button" onClick={handleAdd} disabled={!addPhrase.trim()} style={smallBtn}>
            + Add
          </button>
        </div>
      )}
    </div>
  )
}

function CategorySection({
  title,
  categories,
  showReason,
  editable,
  removedField,
  onToggleKeyword,
  onBulkAction,
  onChangeMatchType,
  onChangePhrase,
  onMoveKeyword,
  onAddKeyword,
  getMoveDestinations,
}: {
  title: string
  categories: (NegativeCategory | CampaignNegativeGroup)[]
  showReason?: boolean
  editable?: boolean
  removedField?: 'removed' | 'clientRemoved'
  onToggleKeyword?: (catIndex: number, kwIndex: number) => void
  onBulkAction?: (catIndex: number, action: 'selectAll' | 'unselectAll') => void
  onChangeMatchType?: (catIndex: number, kwIndex: number, matchType: 'PHRASE' | 'EXACT') => void
  onChangePhrase?: (catIndex: number, kwIndex: number, phrase: string) => void
  onMoveKeyword?: (catIndex: number, kwIndex: number, dest: MoveDestination) => void
  onAddKeyword?: (catIndex: number, phrase: string, matchType: 'PHRASE' | 'EXACT') => void
  getMoveDestinations?: (currentTier: string, currentCatIndex: number) => MoveDestination[]
}) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  if (!categories?.length) return null

  const field = removedField || 'removed'
  const tierName = title.includes('Universal') ? 'universal' : title.includes('Account') ? 'accountWide' : 'campaign'

  return (
    <div>
      <h4 style={sectionHeader}>{title}</h4>
      {categories.map((cat, i) => {
        const name = 'name' in cat ? cat.name : (cat as CampaignNegativeGroup).campaignName
        const waste = 'totalWaste' in cat ? cat.totalWaste : null
        const allKw = cat.keywords || []
        const keptCount = allKw.filter(kw => !kw[field]).length
        const totalCount = allKw.length

        return (
          <div key={i} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <button
                  type="button"
                  onClick={() => setExpanded(prev => ({ ...prev, [i]: !prev[i] }))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, padding: 0, color: '#1e293b' }}
                >
                  {expanded[i] ? '[-]' : '[+]'} {name}
                </button>
                <span style={{ marginLeft: 8, fontSize: 12, color: '#64748b' }}>
                  {keptCount}/{totalCount} keywords kept
                  {waste != null ? ` | $${waste.toFixed(2)} waste` : ''}
                </span>
              </div>
              {keptCount < totalCount && (
                <span style={badge('amber')}>{totalCount - keptCount} removed</span>
              )}
            </div>
            {expanded[i] && (
              <div style={{ marginTop: 8 }}>
                <KeywordTable
                  keywords={allKw}
                  showReason={showReason}
                  editable={editable}
                  removedField={removedField}
                  onToggleKeyword={editable ? (kwIdx) => onToggleKeyword?.(i, kwIdx) : undefined}
                  onBulkAction={editable ? (action) => onBulkAction?.(i, action) : undefined}
                  onChangeMatchType={editable ? (kwIdx, mt) => onChangeMatchType?.(i, kwIdx, mt) : undefined}
                  onChangePhrase={editable ? (kwIdx, phrase) => onChangePhrase?.(i, kwIdx, phrase) : undefined}
                  onMoveKeyword={editable ? (kwIdx, dest) => onMoveKeyword?.(i, kwIdx, dest) : undefined}
                  onAddKeyword={editable ? (phrase, mt) => onAddKeyword?.(i, phrase, mt) : undefined}
                  moveDestinations={editable && getMoveDestinations ? getMoveDestinations(tierName, i) : undefined}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Component ───

const NegativeListBuilder = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()

  const [nlbData, setNlbData] = useState<NLBData | null>(null)
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [teamNotes, setTeamNotes] = useState('')
  const [clientEmails, setClientEmails] = useState('')
  const [clientMessage, setClientMessage] = useState('')
  const [importResult, setImportResult] = useState<{ created: string[], skipped: string[], merged: string[] } | null>(null)
  const [docSlug, setDocSlug] = useState<string | null>(null)
  const [docPin, setDocPin] = useState<string | null>(null)
  const [proposalCampaigns, setProposalCampaigns] = useState<string[]>([])
  const [existingNKLs, setExistingNKLs] = useState<{ id: string; name: string; scope: string; keywordCount: number }[]>([])
  const [selectedNKLTarget, setSelectedNKLTarget] = useState<string>('create_new')
  const [newListName, setNewListName] = useState('')
  const [clientIdForNKL, setClientIdForNKL] = useState<string | null>(null)

  // Load existing data by fetching the document directly
  useEffect(() => {
    if (!id) return
    fetch(`/api/google-ads-audits/${id}?depth=0`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(doc => {
        if (doc?.negativeListBuilder && typeof doc.negativeListBuilder === 'object') {
          const nlbDoc = doc.negativeListBuilder
          setNlbData(nlbDoc as NLBData)
          if (nlbDoc.teamNotes) setTeamNotes(nlbDoc.teamNotes)
        }
        if (doc?.slug) setDocSlug(doc.slug)
        if (doc?.presentationPin) setDocPin(doc.presentationPin)
        // Extract campaign names from proposal and existing campaign-specific negatives
        const campaigns = new Set<string>()
        const proposal = doc?.campaignProposal
        if (proposal?.proposedCampaigns) {
          for (const c of proposal.proposedCampaigns) {
            if (c.name) campaigns.add(c.name)
          }
        }
        const nlbDoc2 = doc?.negativeListBuilder
        if (nlbDoc2?.campaignSpecificNegatives) {
          for (const g of nlbDoc2.campaignSpecificNegatives) {
            if (g.campaignName) campaigns.add(g.campaignName)
          }
        }
        setProposalCampaigns(Array.from(campaigns))
        // Store client ID for NKL fetching
        if (doc?.client) {
          const cid = typeof doc.client === 'object' ? doc.client.id : doc.client
          setClientIdForNKL(cid)
        }
      })
      .catch(() => {})
  }, [id])

  // Fetch existing NKL records for this client
  useEffect(() => {
    if (!clientIdForNKL) return
    fetch(`/api/negative-keyword-lists?where[client][equals]=${clientIdForNKL}&sort=-updatedAt&limit=100&depth=0`, {
      credentials: 'include',
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.docs) {
          setExistingNKLs(data.docs.map((d: any) => ({
            id: d.id,
            name: d.name,
            scope: d.scope,
            keywordCount: d.keywordCount || 0,
          })))
        }
      })
      .catch(() => {})
  }, [clientIdForNKL])

  const clearMessages = () => { setMessage(null); setError(null) }

  const callApi = useCallback(async (action: string, body: Record<string, unknown> = {}) => {
    clearMessages()
    setActionLoading(action)
    try {
      const res = await fetch(`/api/google-ads-audits/${id}/negative-list-builder/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || `Failed (${res.status})`)
        return null
      }
      return data
    } catch {
      setError('Network error')
      return null
    } finally {
      setActionLoading(null)
    }
  }, [id])

  // ── Generate ──
  const handleGenerate = async () => {
    setLoading(true)
    clearMessages()
    const data = await callApi('generate')
    setLoading(false)
    if (data?.negativeListBuilder) {
      setNlbData(data.negativeListBuilder)
      setMessage('Negative list generated. Refresh the page to persist data.')
    } else if (data?.status === 'running') {
      setMessage('Generation started. This takes 1-3 minutes. Refresh the page when done.')
    }
  }

  // ── Team Review ──
  const handleTeamReview = async () => {
    const data = await callApi('team-review', {
      reviewedBy: 'Team',
      notes: teamNotes,
      universalNegatives: nlbData?.universalNegatives,
      accountWideNegatives: nlbData?.accountWideNegatives,
      campaignSpecificNegatives: nlbData?.campaignSpecificNegatives,
    })
    if (data?.negativeListBuilder) {
      setNlbData(data.negativeListBuilder)
      setMessage('Team review submitted. Removed keywords are tracked.')
      setDirty(false)
    }
  }

  // ── Save Edits (persist without advancing status) ──
  const handleSaveEdits = async () => {
    const data = await callApi('save-edits', {
      universalNegatives: nlbData?.universalNegatives,
      accountWideNegatives: nlbData?.accountWideNegatives,
      campaignSpecificNegatives: nlbData?.campaignSpecificNegatives,
    })
    if (data?.negativeListBuilder) {
      setNlbData(data.negativeListBuilder)
      setMessage('Changes saved.')
      setDirty(false)
    }
  }

  // ── Client Share ──
  const handleClientShare = async () => {
    if (!clientEmails.trim()) {
      setError('Enter at least one email address')
      return
    }
    const emails = clientEmails.split(',').map(e => e.trim()).filter(Boolean)
    const data = await callApi('client-share', {
      recipientEmails: emails,
      message: clientMessage,
    })
    if (data?.negativeListBuilder) {
      setNlbData(data.negativeListBuilder)
      setMessage(`Sent to ${emails.join(', ')}`)
    }
  }

  // ── Mark Client Approved ──
  const handleClientApproved = async () => {
    const data = await callApi('client-approve')
    if (data?.negativeListBuilder) {
      setNlbData(data.negativeListBuilder)
      setMessage('Marked as client approved.')
    }
  }

  // ── Import to CMS Negative Keyword Lists (auto-create new lists) ──
  const handleImportToCms = async () => {
    clearMessages()
    setActionLoading('import')
    setImportResult(null)
    try {
      const res = await fetch(`/api/google-ads-audits/${id}/negative-list-builder/import-to-cms`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || `Failed (${res.status})`)
        return
      }
      setImportResult(data)
      if (data.created?.length) {
        setMessage(`Imported ${data.created.length} list(s) to CMS Negative Keyword Lists.`)
      } else if (data.skipped?.length) {
        setMessage('All lists already exist in CMS (skipped duplicates).')
      }
      // Refresh existing NKL list
      if (clientIdForNKL) {
        fetch(`/api/negative-keyword-lists?where[client][equals]=${clientIdForNKL}&sort=-updatedAt&limit=100&depth=0`, {
          credentials: 'include',
        })
          .then(r => r.ok ? r.json() : null)
          .then(d => {
            if (d?.docs) {
              setExistingNKLs(d.docs.map((doc: any) => ({
                id: doc.id, name: doc.name, scope: doc.scope, keywordCount: doc.keywordCount || 0,
              })))
            }
          })
          .catch(() => {})
      }
    } catch {
      setError('Network error')
    } finally {
      setActionLoading(null)
    }
  }

  // ── Merge into an existing NKL list ──
  const handleMergeToExisting = async (targetListId: string) => {
    if (!nlbData) return
    clearMessages()
    setActionLoading('merge')
    setImportResult(null)
    try {
      // Gather all non-removed keywords from all tiers
      const allKeywords: { keyword: string; matchType: 'phrase' | 'exact' }[] = []
      const tiers = [
        ...(nlbData.universalNegatives || []),
        ...(nlbData.accountWideNegatives || []),
        ...(nlbData.campaignSpecificNegatives || []),
      ]
      for (const cat of tiers) {
        for (const kw of (cat.keywords || [])) {
          if (!kw.removed && !kw.clientRemoved) {
            allKeywords.push({
              keyword: kw.phrase,
              matchType: kw.matchType === 'PHRASE' ? 'phrase' : 'exact',
            })
          }
        }
      }

      if (allKeywords.length === 0) {
        setError('No keywords to merge (all removed)')
        return
      }

      // Fetch the target list
      const listRes = await fetch(`/api/negative-keyword-lists/${targetListId}?depth=0`, {
        credentials: 'include',
      })
      if (!listRes.ok) {
        setError('Failed to fetch target list')
        return
      }
      const targetList = await listRes.json()
      const existingKeywords: { keyword: string; matchType: string; flaggedForRemoval?: boolean }[] = targetList.keywords || []

      // Merge: add only keywords that don't already exist
      const existingSet = new Set(existingKeywords.map((k: any) => `${k.keyword.toLowerCase()}|${k.matchType}`))
      let addedCount = 0
      for (const kw of allKeywords) {
        const key = `${kw.keyword.toLowerCase()}|${kw.matchType}`
        if (!existingSet.has(key)) {
          existingKeywords.push({ ...kw, flaggedForRemoval: false })
          existingSet.add(key)
          addedCount++
        }
      }

      // Update the list
      const updateRes = await fetch(`/api/negative-keyword-lists/${targetListId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ keywords: existingKeywords }),
      })
      if (!updateRes.ok) {
        const errData = await updateRes.json().catch(() => ({}))
        setError(errData.errors?.[0]?.message || `Failed to update list (${updateRes.status})`)
        return
      }

      const targetName = targetList.name || 'list'
      setImportResult({
        created: addedCount > 0 ? [`${addedCount} keywords merged into "${targetName}"`] : [],
        skipped: addedCount === 0 ? [`All keywords already exist in "${targetName}"`] : [],
        merged: [`${targetName}`],
      })
      setMessage(addedCount > 0
        ? `Merged ${addedCount} new keyword(s) into "${targetName}" (${allKeywords.length - addedCount} duplicates skipped).`
        : `All keywords already exist in "${targetName}".`
      )

      // Refresh existing NKL list
      if (clientIdForNKL) {
        fetch(`/api/negative-keyword-lists?where[client][equals]=${clientIdForNKL}&sort=-updatedAt&limit=100&depth=0`, {
          credentials: 'include',
        })
          .then(r => r.ok ? r.json() : null)
          .then(d => {
            if (d?.docs) {
              setExistingNKLs(d.docs.map((doc: any) => ({
                id: doc.id, name: doc.name, scope: doc.scope, keywordCount: doc.keywordCount || 0,
              })))
            }
          })
          .catch(() => {})
      }
    } catch {
      setError('Network error')
    } finally {
      setActionLoading(null)
    }
  }

  // ── Create new NKL from builder keywords ──
  const handleCreateNewList = async () => {
    if (!nlbData || !clientIdForNKL) return
    const listName = newListName.trim()
    if (!listName) {
      setError('Enter a name for the new list')
      return
    }
    clearMessages()
    setActionLoading('create-new')
    setImportResult(null)
    try {
      // Gather all non-removed keywords
      const allKeywords: { keyword: string; matchType: 'phrase' | 'exact'; flaggedForRemoval: boolean }[] = []
      const tiers = [
        ...(nlbData.universalNegatives || []),
        ...(nlbData.accountWideNegatives || []),
        ...(nlbData.campaignSpecificNegatives || []),
      ]
      for (const cat of tiers) {
        for (const kw of (cat.keywords || [])) {
          if (!kw.removed && !kw.clientRemoved) {
            allKeywords.push({
              keyword: kw.phrase,
              matchType: kw.matchType === 'PHRASE' ? 'phrase' : 'exact',
              flaggedForRemoval: false,
            })
          }
        }
      }

      if (allKeywords.length === 0) {
        setError('No keywords to add (all removed)')
        return
      }

      // Deduplicate
      const seen = new Set<string>()
      const uniqueKeywords = allKeywords.filter(kw => {
        const key = `${kw.keyword.toLowerCase()}|${kw.matchType}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      const createRes = await fetch('/api/negative-keyword-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          client: clientIdForNKL,
          name: listName,
          scope: 'account',
          campaignRegex: '.*',
          keywords: uniqueKeywords,
          isActive: true,
        }),
      })
      if (!createRes.ok) {
        const errData = await createRes.json().catch(() => ({}))
        setError(errData.errors?.[0]?.message || `Failed to create list (${createRes.status})`)
        return
      }

      setImportResult({
        created: [`"${listName}" with ${uniqueKeywords.length} keywords`],
        skipped: [],
        merged: [],
      })
      setMessage(`Created "${listName}" with ${uniqueKeywords.length} keywords.`)
      setNewListName('')

      // Refresh existing NKL list
      fetch(`/api/negative-keyword-lists?where[client][equals]=${clientIdForNKL}&sort=-updatedAt&limit=100&depth=0`, {
        credentials: 'include',
      })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d?.docs) {
            setExistingNKLs(d.docs.map((doc: any) => ({
              id: doc.id, name: doc.name, scope: doc.scope, keywordCount: doc.keywordCount || 0,
            })))
          }
        })
        .catch(() => {})
    } catch {
      setError('Network error')
    } finally {
      setActionLoading(null)
    }
  }

  // ── Toggle keyword removal (team review phase) ──
  const toggleKeyword = (
    tier: 'universal' | 'accountWide' | 'campaign',
    catIndex: number,
    kwIndex: number,
    field: 'removed' | 'clientRemoved' = 'removed'
  ) => {
    if (!nlbData) return
    const key = tier === 'universal' ? 'universalNegatives' : tier === 'accountWide' ? 'accountWideNegatives' : 'campaignSpecificNegatives'
    const categories = nlbData[key]
    if (!categories) return

    const updated = [...categories]
    const cat = { ...updated[catIndex] }
    const kws = [...cat.keywords]
    kws[kwIndex] = { ...kws[kwIndex], [field]: !kws[kwIndex][field] }
    cat.keywords = kws
    updated[catIndex] = cat
    setNlbData({ ...nlbData, [key]: updated })
    setDirty(true)
  }

  // ── Bulk select/unselect all keywords in a category ──
  const bulkAction = (
    tier: 'universal' | 'accountWide' | 'campaign',
    catIndex: number,
    action: 'selectAll' | 'unselectAll',
    field: 'removed' | 'clientRemoved' = 'removed'
  ) => {
    if (!nlbData) return
    const key = tier === 'universal' ? 'universalNegatives' : tier === 'accountWide' ? 'accountWideNegatives' : 'campaignSpecificNegatives'
    const categories = nlbData[key]
    if (!categories) return

    const updated = [...categories]
    const cat = { ...updated[catIndex] }
    cat.keywords = cat.keywords.map(kw => ({ ...kw, [field]: action === 'unselectAll' }))
    updated[catIndex] = cat
    setNlbData({ ...nlbData, [key]: updated })
    setDirty(true)
  }

  // ── Change keyword phrase ──
  const changePhrase = (
    tier: 'universal' | 'accountWide' | 'campaign',
    catIndex: number,
    kwIndex: number,
    phrase: string
  ) => {
    if (!nlbData) return
    const key = tier === 'universal' ? 'universalNegatives' : tier === 'accountWide' ? 'accountWideNegatives' : 'campaignSpecificNegatives'
    const categories = nlbData[key]
    if (!categories) return

    const updated = [...categories]
    const cat = { ...updated[catIndex] }
    const kws = [...cat.keywords]
    kws[kwIndex] = { ...kws[kwIndex], phrase }
    cat.keywords = kws
    updated[catIndex] = cat
    setNlbData({ ...nlbData, [key]: updated })
    setDirty(true)
  }

  // ── Change match type ──
  const changeMatchType = (
    tier: 'universal' | 'accountWide' | 'campaign',
    catIndex: number,
    kwIndex: number,
    matchType: 'PHRASE' | 'EXACT'
  ) => {
    if (!nlbData) return
    const key = tier === 'universal' ? 'universalNegatives' : tier === 'accountWide' ? 'accountWideNegatives' : 'campaignSpecificNegatives'
    const categories = nlbData[key]
    if (!categories) return

    const updated = [...categories]
    const cat = { ...updated[catIndex] }
    const kws = [...cat.keywords]
    kws[kwIndex] = { ...kws[kwIndex], matchType }
    cat.keywords = kws
    updated[catIndex] = cat
    setNlbData({ ...nlbData, [key]: updated })
    setDirty(true)
  }

  // ── Add a keyword to a category ──
  const addKeyword = (
    tier: 'universal' | 'accountWide' | 'campaign',
    catIndex: number,
    phrase: string,
    matchType: 'PHRASE' | 'EXACT'
  ) => {
    if (!nlbData) return
    const key = tier === 'universal' ? 'universalNegatives' : tier === 'accountWide' ? 'accountWideNegatives' : 'campaignSpecificNegatives'
    const categories = nlbData[key]
    if (!categories) return

    const updated = [...categories]
    const cat = { ...updated[catIndex] }
    // Check for duplicates
    if (cat.keywords.some(kw => kw.phrase.toLowerCase() === phrase.toLowerCase())) return
    cat.keywords = [...cat.keywords, { phrase, matchType }]
    updated[catIndex] = cat
    setNlbData({ ...nlbData, [key]: updated })
    setDirty(true)
  }

  // ── Move a keyword to Account-Wide or a specific Campaign ──
  const moveKeyword = (
    fromTier: 'universal' | 'accountWide' | 'campaign',
    fromCatIndex: number,
    kwIndex: number,
    dest: MoveDestination
  ) => {
    if (!nlbData) return
    const fromKey = fromTier === 'universal' ? 'universalNegatives' : fromTier === 'accountWide' ? 'accountWideNegatives' : 'campaignSpecificNegatives'
    const fromCats = nlbData[fromKey]
    if (!fromCats) return

    // Remove from source
    const updatedFrom = [...fromCats]
    const fromCat = { ...updatedFrom[fromCatIndex] }
    const kw = fromCat.keywords[kwIndex]
    fromCat.keywords = fromCat.keywords.filter((_, i) => i !== kwIndex)
    updatedFrom[fromCatIndex] = fromCat

    const update: Partial<NLBData> = { [fromKey]: updatedFrom }

    if (dest.tier === 'accountWide') {
      // Move to first account-wide category (or create "General" if empty)
      const awCats = fromKey === 'accountWideNegatives' ? updatedFrom as NegativeCategory[] : [...(nlbData.accountWideNegatives || [])]
      if (awCats.length === 0) {
        awCats.push({ name: 'General', keywords: [] })
      }
      const targetCat = { ...awCats[0] }
      targetCat.keywords = [...targetCat.keywords, { ...kw, removed: false, clientRemoved: false }]
      awCats[0] = targetCat
      if (fromKey !== 'accountWideNegatives') {
        update.accountWideNegatives = awCats
      }
    } else if (dest.tier === 'campaign') {
      // Move to a campaign group (create if doesn't exist)
      const csCats = fromKey === 'campaignSpecificNegatives' ? updatedFrom as CampaignNegativeGroup[] : [...(nlbData.campaignSpecificNegatives || [])]
      let targetIdx = dest.catIndex
      if (targetIdx < 0 || targetIdx >= csCats.length) {
        // Find the campaign name from the dest label
        const campName = dest.label.replace('Campaign: ', '')
        csCats.push({ campaignName: campName, keywords: [] })
        targetIdx = csCats.length - 1
      }
      const targetGroup = { ...csCats[targetIdx] }
      targetGroup.keywords = [...targetGroup.keywords, { ...kw, removed: false, clientRemoved: false }]
      csCats[targetIdx] = targetGroup
      if (fromKey !== 'campaignSpecificNegatives') {
        update.campaignSpecificNegatives = csCats
      }
    }

    setNlbData({ ...nlbData, ...update })
    setDirty(true)
  }

  // ── Build move destinations: Account-Wide + each campaign from proposal ──
  const getMoveDestinations = (currentTier: string, _currentCatIndex: number): MoveDestination[] => {
    const dests: MoveDestination[] = []

    // Always offer "Account-Wide" unless we're already in account-wide/universal
    if (currentTier === 'campaign') {
      dests.push({ label: 'Account-Wide Negatives', tier: 'accountWide', catIndex: 0 })
    }

    // All campaigns from the proposal + existing campaign-specific groups
    const allCampaigns = new Set<string>()
    for (const name of proposalCampaigns) allCampaigns.add(name)
    for (const g of (nlbData?.campaignSpecificNegatives || [])) {
      if (g.campaignName) allCampaigns.add(g.campaignName)
    }

    for (const name of allCampaigns) {
      // Find existing campaign group index, or -1 to create new
      const existingIdx = (nlbData?.campaignSpecificNegatives || []).findIndex(g => g.campaignName === name)
      dests.push({ label: `Campaign: ${name}`, tier: 'campaign', catIndex: existingIdx })
    }

    return dests
  }

  if (!id) return null

  const status = nlbData?.status
  const hasData = !!nlbData?.totalSearchTermsAnalyzed || !!(nlbData?.universalNegatives?.length) || !!(nlbData?.accountWideNegatives?.length)
  const canTeamReview = status === 'generated' || status === 'team_review'
  const canClientShare = status === 'team_approved'
  const canClientApprove = status === 'client_review'

  const customerId = fields?.customerId?.value as string | undefined
  const hasCampaignProposal = !!fields?.campaignProposal?.value

  // Summary stats for review
  const totalKept = useMemo(() => {
    if (!nlbData) return 0
    const count = (cats: { keywords: NegativeKeyword[] }[] | undefined, field: 'removed' | 'clientRemoved') =>
      (cats || []).reduce((n, c) => n + c.keywords.filter(kw => !kw.removed && !kw[field]).length, 0)
    return count(nlbData.universalNegatives, 'removed') +
      count(nlbData.accountWideNegatives, 'removed') +
      count(nlbData.campaignSpecificNegatives, 'removed')
  }, [nlbData])

  return (
    <div style={{ maxWidth: 960 }}>
      {/* ── Initial Campaign Build Note ── */}
      <div style={{ ...card, background: '#eff6ff', borderColor: '#bfdbfe', marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: '#1e40af', lineHeight: 1.6 }}>
          <strong>Initial Campaign Build Tool</strong> — This is a one-off negative keyword analysis for new campaign setup.
          It sweeps 3 years of search term history to identify wasted spend and builds a comprehensive negative keyword list
          that can be imported into the client&apos;s ongoing Negative Keyword Lists for daily Google Ads sync.
        </p>
      </div>

      {/* ── Section 1: Generate ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading || !customerId?.trim()}
          style={btnStyle('primary', loading || !customerId?.trim())}
        >
          {loading ? 'Generating...' : hasData ? 'Re-Generate Negative List' : 'Generate Negative List'}
        </button>
        <StatusBadge status={status} />
        {!customerId?.trim() && (
          <span style={{ fontSize: 12, color: '#94a3b8' }}>Set Customer ID first</span>
        )}
        {!hasCampaignProposal && customerId?.trim() && (
          <span style={{ fontSize: 12, color: '#f59e0b' }}>No campaign proposal yet (campaign-specific negatives will be skipped)</span>
        )}
      </div>

      {message && <p style={{ fontSize: 13, color: '#16a34a', marginBottom: 8 }}>{message}</p>}
      {error && <p style={{ fontSize: 13, color: '#dc2626', marginBottom: 8 }}>{error}</p>}

      {!hasData && !loading && (
        <div style={card}>
          <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
            Generate a negative keyword list to sweep 3 years of search term history and identify wasted spend.
            The tool categorizes waste into three tiers: universal negatives, account-wide negatives, and campaign-specific negatives.
          </p>
          <p style={{ color: '#94a3b8', fontSize: 12, margin: '8px 0 0' }}>
            A term is flagged as waste if it has zero conversions over 3 years, spent $5+ or had 3+ clicks,
            isn't already a negative, isn't a brand term, and isn't relevant to the campaign proposal.
          </p>
        </div>
      )}

      {/* ── Summary ── */}
      {hasData && nlbData && <SummaryCard data={nlbData} />}

      {/* ── View / Share link ── */}
      {hasData && docSlug && (
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: '#f5f3ff', borderColor: '#c4b5fd' }}>
          <a
            href={`/negative-keyword-build/${docSlug}`}
            target="_blank"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#7c3aed', color: '#fff', borderRadius: 6, fontWeight: 600, fontSize: 13, textDecoration: 'none' }}
          >
            Open Client Review Page
          </a>
          <span style={{ fontSize: 12, color: '#64748b' }}>
            <code style={{ fontSize: 11 }}>/negative-keyword-build/{docSlug}</code>
            {docPin && <> &middot; PIN: <strong>{docPin}</strong></>}
          </span>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>
            Toggle "Published" above to make accessible
          </span>
        </div>
      )}

      {/* ── Import to CMS ── */}
      {hasData && (status === 'team_approved' || status === 'client_review' || status === 'client_approved' || status === 'applied') && (
        <div style={{
          ...card,
          background: status === 'client_approved' ? '#ecfdf5' : '#f0fdf4',
          borderColor: status === 'client_approved' ? '#6ee7b7' : '#bbf7d0',
          ...(status === 'client_approved' ? { borderWidth: 2, padding: 20 } : {}),
        }}>
          {status === 'client_approved' && (
            <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#065f46' }}>
              ✓ Client has approved — ready to import to their Negative Keyword Lists
            </p>
          )}

          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#475569' }}>
            Push keywords to{' '}
            <a href="/admin/collections/negative-keyword-lists" target="_blank" style={{ color: '#2563eb' }}>Negative Keyword Lists</a>{' '}
            for daily Google Ads sync. Only keywords not marked as removed are included.
          </p>

          {/* Auto-create (original import) */}
          <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #d1fae5' }}>
            <button
              type="button"
              onClick={handleImportToCms}
              disabled={actionLoading === 'import'}
              style={btnStyle('success', actionLoading === 'import')}
            >
              {actionLoading === 'import' ? 'Importing...' : 'Auto-Create Lists (Universal + Account + Campaign)'}
            </button>
            <span style={{ marginLeft: 8, fontSize: 11, color: '#64748b' }}>
              Creates separate lists per tier, skips if name already exists
            </span>
          </div>

          {/* Merge into existing or create custom */}
          {clientIdForNKL && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#065f46', marginBottom: 8 }}>
                Or push all keywords to a specific list:
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                <select
                  value={selectedNKLTarget}
                  onChange={e => setSelectedNKLTarget(e.target.value)}
                  style={{
                    padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0',
                    fontSize: 13, minWidth: 280, background: '#fff',
                  }}
                >
                  <option value="create_new">➕ Create New List</option>
                  {existingNKLs.length > 0 && (
                    <optgroup label="Existing Lists">
                      {existingNKLs.map(nkl => (
                        <option key={nkl.id} value={nkl.id}>
                          {nkl.name} ({nkl.keywordCount} keywords, {nkl.scope})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>

                {selectedNKLTarget === 'create_new' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="text"
                      value={newListName}
                      onChange={e => setNewListName(e.target.value)}
                      placeholder="New list name..."
                      style={{
                        padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0',
                        fontSize: 13, width: 220,
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleCreateNewList}
                      disabled={actionLoading === 'create-new' || !newListName.trim()}
                      style={btnStyle('primary', actionLoading === 'create-new' || !newListName.trim())}
                    >
                      {actionLoading === 'create-new' ? 'Creating...' : 'Create & Add Keywords'}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleMergeToExisting(selectedNKLTarget)}
                    disabled={actionLoading === 'merge'}
                    style={btnStyle('primary', actionLoading === 'merge')}
                  >
                    {actionLoading === 'merge' ? 'Merging...' : 'Merge Keywords Into List'}
                  </button>
                )}
              </div>
            </div>
          )}

          {!clientIdForNKL && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#f59e0b' }}>
              Link a client in the sidebar to enable pushing to specific lists.
            </p>
          )}

          {importResult && (
            <div style={{ marginTop: 8, fontSize: 12 }}>
              {importResult.created.length > 0 && (
                <div style={{ color: '#16a34a' }}>Created: {importResult.created.join(', ')}</div>
              )}
              {importResult.skipped.length > 0 && (
                <div style={{ color: '#92400e' }}>Skipped (already exist): {importResult.skipped.join(', ')}</div>
              )}
              {importResult.merged?.length > 0 && (
                <div style={{ color: '#16a34a' }}>Merged into: {importResult.merged.join(', ')}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Section 2: Brand Term Detection ── */}
      {nlbData?.detectedBrandTerms && nlbData.detectedBrandTerms.length > 0 && (
        <div>
          <h4 style={sectionHeader}>Brand Term Detection</h4>
          {nlbData.detectedBrandTerms.map((brand, i) => (
            <div key={i} style={card}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
                {brand.seedBrand}
                <span style={{ fontWeight: 400, color: '#64748b', marginLeft: 8, fontSize: 12 }}>
                  {brand.totalSearchTerms} terms | ${brand.totalSpend.toFixed(2)} spend | {brand.totalConversions} conversions
                </span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ textAlign: 'left', padding: '4px 8px', color: '#64748b' }}>Variation</th>
                    <th style={{ textAlign: 'right', padding: '4px 8px', color: '#64748b' }}>Spend</th>
                    <th style={{ textAlign: 'right', padding: '4px 8px', color: '#64748b' }}>Clicks</th>
                    <th style={{ textAlign: 'right', padding: '4px 8px', color: '#64748b' }}>Conversions</th>
                  </tr>
                </thead>
                <tbody>
                  {brand.variations.map((v, j) => (
                    <tr key={j} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '4px 8px', fontFamily: 'monospace' }}>{v.term}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>${v.spend.toFixed(2)}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>{v.clicks}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>{v.conversions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* ── Section 3: Team Review ── */}
      {hasData && (
        <div>
          {canTeamReview && (
            <div style={{ ...card, background: '#eff6ff', borderColor: '#bfdbfe', marginTop: 16 }}>
              <p style={{ margin: 0, fontSize: 13, color: '#1e40af' }}>
                <strong>Agency Review:</strong> Expand each category and uncheck keywords you want to remove.
                The client will see what you kept in the next phase. {totalKept} keywords currently kept.
              </p>
            </div>
          )}

          <CategorySection
            title="Tier 1: Universal Negatives"
            categories={nlbData?.universalNegatives || []}
            editable={canTeamReview}
            removedField="removed"
            onToggleKeyword={(catIdx, kwIdx) => toggleKeyword('universal', catIdx, kwIdx)}
            onBulkAction={(catIdx, action) => bulkAction('universal', catIdx, action)}
            onChangeMatchType={(catIdx, kwIdx, mt) => changeMatchType('universal', catIdx, kwIdx, mt)}
            onChangePhrase={(catIdx, kwIdx, phrase) => changePhrase('universal', catIdx, kwIdx, phrase)}
            onMoveKeyword={(catIdx, kwIdx, dest) => moveKeyword('universal', catIdx, kwIdx, dest)}
            onAddKeyword={(catIdx, phrase, mt) => addKeyword('universal', catIdx, phrase, mt)}
            getMoveDestinations={getMoveDestinations}
          />
          <CategorySection
            title="Tier 2: Account-Wide Negatives"
            categories={nlbData?.accountWideNegatives || []}
            editable={canTeamReview}
            removedField="removed"
            onToggleKeyword={(catIdx, kwIdx) => toggleKeyword('accountWide', catIdx, kwIdx)}
            onBulkAction={(catIdx, action) => bulkAction('accountWide', catIdx, action)}
            onChangeMatchType={(catIdx, kwIdx, mt) => changeMatchType('accountWide', catIdx, kwIdx, mt)}
            onChangePhrase={(catIdx, kwIdx, phrase) => changePhrase('accountWide', catIdx, kwIdx, phrase)}
            onMoveKeyword={(catIdx, kwIdx, dest) => moveKeyword('accountWide', catIdx, kwIdx, dest)}
            onAddKeyword={(catIdx, phrase, mt) => addKeyword('accountWide', catIdx, phrase, mt)}
            getMoveDestinations={getMoveDestinations}
          />
          <CategorySection
            title="Tier 3: Campaign-Specific Negatives"
            categories={nlbData?.campaignSpecificNegatives || []}
            showReason
            editable={canTeamReview}
            removedField="removed"
            onToggleKeyword={(catIdx, kwIdx) => toggleKeyword('campaign', catIdx, kwIdx)}
            onBulkAction={(catIdx, action) => bulkAction('campaign', catIdx, action)}
            onChangeMatchType={(catIdx, kwIdx, mt) => changeMatchType('campaign', catIdx, kwIdx, mt)}
            onChangePhrase={(catIdx, kwIdx, phrase) => changePhrase('campaign', catIdx, kwIdx, phrase)}
            onMoveKeyword={(catIdx, kwIdx, dest) => moveKeyword('campaign', catIdx, kwIdx, dest)}
            onAddKeyword={(catIdx, phrase, mt) => addKeyword('campaign', catIdx, phrase, mt)}
            getMoveDestinations={getMoveDestinations}
          />

          {canTeamReview && (
            <div style={{ marginTop: 16 }}>
              <textarea
                value={teamNotes}
                onChange={e => setTeamNotes(e.target.value)}
                placeholder="Team review notes (optional)"
                rows={3}
                style={{ width: '100%', maxWidth: 500, padding: 8, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, marginBottom: 8 }}
              />
              <br />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleSaveEdits}
                  disabled={actionLoading === 'save-edits'}
                  style={{
                    ...btnStyle(dirty ? 'primary' : 'secondary', actionLoading === 'save-edits'),
                    ...(dirty ? { boxShadow: '0 0 0 2px #93c5fd' } : {}),
                  }}
                >
                  {actionLoading === 'save-edits' ? 'Saving...' : dirty ? '● Save Changes' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={handleTeamReview}
                  disabled={actionLoading === 'team-review'}
                  style={btnStyle('success', actionLoading === 'team-review')}
                >
                  {actionLoading === 'team-review' ? 'Submitting...' : `Submit Team Review (${totalKept} keywords kept)`}
                </button>
              </div>
            </div>
          )}

          {nlbData?.teamReviewedAt && (
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
              Reviewed by {nlbData.teamReviewedBy} on {new Date(nlbData.teamReviewedAt).toLocaleDateString()}
              {nlbData.teamNotes && ` — ${nlbData.teamNotes}`}
            </p>
          )}
        </div>
      )}

      {/* ── Section 4: Client Share ── */}
      {(canClientShare || status === 'client_review' || canClientApprove || status === 'client_approved' || status === 'applied') && (
        <div>
          <h4 style={sectionHeader}>Client Review</h4>

          {canClientShare && (
            <div style={card}>
              <p style={{ margin: '0 0 8px', fontSize: 13, color: '#475569' }}>
                Send the agency-reviewed negative list to the client. They will see only the keywords you kept
                and can flag any they disagree with.
              </p>
              <input
                type="text"
                value={clientEmails}
                onChange={e => setClientEmails(e.target.value)}
                placeholder="Client email(s), comma-separated"
                style={{ width: '100%', maxWidth: 400, padding: 8, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, marginBottom: 8 }}
              />
              <br />
              <textarea
                value={clientMessage}
                onChange={e => setClientMessage(e.target.value)}
                placeholder="Optional message to include in the email"
                rows={2}
                style={{ width: '100%', maxWidth: 400, padding: 8, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, marginBottom: 8 }}
              />
              <br />
              <button
                type="button"
                onClick={handleClientShare}
                disabled={actionLoading === 'client-share'}
                style={btnStyle('primary', actionLoading === 'client-share')}
              >
                {actionLoading === 'client-share' ? 'Sending...' : 'Send to Client'}
              </button>
            </div>
          )}

          {nlbData?.clientSharedAt && (
            <p style={{ fontSize: 12, color: '#64748b' }}>
              Sent to {nlbData.clientSharedTo?.join(', ')} on {new Date(nlbData.clientSharedAt).toLocaleDateString()}
            </p>
          )}

          {canClientApprove && (
            <button
              type="button"
              onClick={handleClientApproved}
              disabled={actionLoading === 'client-approve'}
              style={{ ...btnStyle('success', actionLoading === 'client-approve'), marginTop: 8 }}
            >
              {actionLoading === 'client-approve' ? 'Marking...' : 'Mark Client Approved'}
            </button>
          )}

          {nlbData?.clientApprovedAt && (
            <p style={{ fontSize: 12, color: '#16a34a' }}>
              Client approved on {new Date(nlbData.clientApprovedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default NegativeListBuilder
