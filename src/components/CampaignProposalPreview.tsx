'use client'

import { useAllFormFields } from '@payloadcms/ui'
import { useState, useCallback, useMemo } from 'react'

// ---------------------------------------------------------------------------
// Types (mirror the Growth Tools CampaignProposalResults shape)
// ---------------------------------------------------------------------------

interface ProposalKeyword {
  text: string
  matchType: 'PHRASE' | 'EXACT' | 'BROAD'
  monthlySearchVolume: number
  competition: string
  competitionIndex: number
  lowCpcMicros: number
  highCpcMicros: number
}

interface ProposedAdGroup {
  name: string
  theme: string
  keywords: ProposalKeyword[]
  totalMonthlyVolume: number
  landingPage: {
    url: string | null
    status: 'exists' | 'needs-improvement' | 'create'
    croScore?: number
    croIssues?: string[]
  }
  sourcePageUrl: string | null
}

interface ProposedCampaign {
  name: string
  campaignType: 'brand' | 'generic'
  channelType: 'SEARCH'
  campaignCategory?: string
  adGroups: ProposedAdGroup[]
  totalMonthlyVolume: number
}

interface DiscoveredPage {
  url: string
  title: string
  h1: string
  metaDescription: string
  pageType: string
  seedPhrases: string[]
}

interface ProposalCompetitor {
  domain: string
  overlappingKeywords: number
  averagePosition: number
  isRunningAds: boolean
  adCopyCount?: number
}

interface AccountMismatch {
  servicesNotAdvertised: Array<{ pageUrl: string; pageTitle: string; estimatedVolume: number }>
  adGroupsWithBadLandingPages: Array<{ adGroupName: string; campaignName: string; currentUrl: string; issue: string }>
  brandGenericMixed: Array<{ campaignName: string; brandKeywords: string[]; genericKeywords: string[] }>
}

interface LandingPageToCreate {
  suggestedPath: string
  targetService: string
  targetKeywords: string[]
  monthlyVolume: number
  priority: 'high' | 'medium' | 'low'
  reason: string
}

interface LandingPageToImprove {
  url: string
  croScore: number
  issues: string[]
  mappedAdGroups: string[]
}

interface StructureComparisonRow {
  change: 'added' | 'removed' | 'modified' | 'unchanged'
  currentCampaign: string
  currentAdGroup: string
  currentLandingPage: string
  currentMonthlyVolume: number | null
  proposedCampaign: string
  proposedAdGroup: string
  proposedLandingPage: string
  proposedMonthlyVolume: number | null
  notes: string
}

interface PriorityItem {
  campaignName: string
  adGroupName: string
  monthlyVolume: number
  priority: 'high' | 'medium' | 'low'
  landingPageStatus: 'exists' | 'needs-improvement' | 'create'
}

interface CampaignProposalData {
  id: string
  websiteUrl: string
  businessName: string
  customerId?: string
  location: string
  discoveredPages: DiscoveredPage[]
  proposedCampaigns: ProposedCampaign[]
  existingAccountSummary?: {
    totalCampaigns: number
    activeCampaigns: number
    totalAdGroups: number
    totalKeywords: number
    totalSpend: number
    hasBrandGenericSplit: boolean
  }
  mismatchAnalysis?: AccountMismatch
  competitors: ProposalCompetitor[]
  landingPagesToCreate: LandingPageToCreate[]
  landingPagesToImprove: LandingPageToImprove[]
  structureComparison: StructureComparisonRow[]
  priorityRanking: PriorityItem[]
  createdAt: string
}

// Selection state: which campaigns and ad groups are checked
// Key: "c{campaignIdx}" for campaigns, "c{campaignIdx}-ag{adGroupIdx}" for ad groups
type SelectionMap = Record<string, boolean>

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

const styles = {
  container: {
    padding: 16,
    background: '#f8fafc',
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    marginBottom: 20,
  } as React.CSSProperties,
  header: { fontSize: 16, fontWeight: 600, margin: '0 0 12px' } as React.CSSProperties,
  sectionHeader: { fontSize: 15, fontWeight: 600, margin: '16px 0 8px', color: '#1e293b' } as React.CSSProperties,
  body: { fontSize: 13, color: '#374151', lineHeight: 1.6 } as React.CSSProperties,
  muted: { fontSize: 12, color: '#6b7280' } as React.CSSProperties,
  link: { color: '#2563eb', textDecoration: 'none' } as React.CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 } as React.CSSProperties,
  th: {
    padding: '8px 12px',
    borderBottom: '2px solid #e5e7eb',
    textAlign: 'left' as const,
    fontWeight: 600,
    fontSize: 12,
    color: '#6b7280',
    textTransform: 'uppercase' as const,
  } as React.CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid #e5e7eb' } as React.CSSProperties,
  tdEven: { padding: '8px 12px', borderBottom: '1px solid #e5e7eb', background: '#f8fafc' } as React.CSSProperties,
  checkbox: { width: 16, height: 16, cursor: 'pointer', accentColor: '#2563eb' } as React.CSSProperties,
}

const badgeBase: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 600,
}

const statusBadge = (status: string): React.CSSProperties => {
  switch (status) {
    case 'exists':
      return { ...badgeBase, background: '#dcfce7', color: '#166534' }
    case 'needs-improvement':
      return { ...badgeBase, background: '#fef3c7', color: '#92400e' }
    case 'create':
      return { ...badgeBase, background: '#fee2e2', color: '#991b1b' }
    default:
      return { ...badgeBase, background: '#f1f5f9', color: '#475569' }
  }
}

const changeBadge = (change: string): React.CSSProperties => {
  switch (change) {
    case 'added':
      return { ...badgeBase, background: '#dcfce7', color: '#166534' }
    case 'removed':
      return { ...badgeBase, background: '#fee2e2', color: '#991b1b' }
    case 'modified':
      return { ...badgeBase, background: '#fef3c7', color: '#92400e' }
    case 'unchanged':
      return { ...badgeBase, background: '#f1f5f9', color: '#475569' }
    default:
      return { ...badgeBase, background: '#f1f5f9', color: '#475569' }
  }
}

const typeBadge = (type: string): React.CSSProperties => {
  return type === 'brand'
    ? { ...badgeBase, background: '#dbeafe', color: '#1e40af' }
    : { ...badgeBase, background: '#dcfce7', color: '#166534' }
}

function fmt(n: number): string {
  return n.toLocaleString('en-AU')
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

type Tab = 'structure' | 'summary' | 'email'

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 16px',
  border: 'none',
  background: 'transparent',
  borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
  fontWeight: active ? 600 : 400,
  fontSize: 13,
  color: active ? '#2563eb' : '#6b7280',
  cursor: 'pointer',
})

const btnStyle = (color: string): React.CSSProperties => ({
  padding: '6px 14px',
  background: color,
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
})

// ---------------------------------------------------------------------------
// Selection helpers
// ---------------------------------------------------------------------------

function buildInitialSelection(proposal: CampaignProposalData): SelectionMap {
  const sel: SelectionMap = {}
  proposal.proposedCampaigns.forEach((campaign, ci) => {
    sel[`c${ci}`] = true
    campaign.adGroups.forEach((_, agi) => {
      sel[`c${ci}-ag${agi}`] = true
    })
  })
  return sel
}

function getSelectedCampaigns(
  proposal: CampaignProposalData,
  selection: SelectionMap,
): ProposedCampaign[] {
  return proposal.proposedCampaigns
    .map((campaign, ci) => {
      if (!selection[`c${ci}`]) return null
      const selectedAdGroups = campaign.adGroups.filter((_, agi) => selection[`c${ci}-ag${agi}`])
      if (selectedAdGroups.length === 0) return null
      return {
        ...campaign,
        adGroups: selectedAdGroups,
        totalMonthlyVolume: selectedAdGroups.reduce((s, ag) => s + ag.totalMonthlyVolume, 0),
      }
    })
    .filter(Boolean) as ProposedCampaign[]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const CampaignProposalPreviewInner = () => {
  const [fields] = useAllFormFields()
  const [activeTab, setActiveTab] = useState<Tab>('structure')
  const [editableHtml, setEditableHtml] = useState<string | null>(null)

  const proposalRaw = fields?.campaignProposal?.value
  const emailHtml = fields?.campaignProposalEmailHtml?.value as string | undefined

  // Parse proposal data
  let proposal: CampaignProposalData | null = null
  if (proposalRaw && typeof proposalRaw === 'object') {
    proposal = proposalRaw as unknown as CampaignProposalData
  } else if (typeof proposalRaw === 'string') {
    try {
      proposal = JSON.parse(proposalRaw)
    } catch {
      // invalid JSON
    }
  }

  // Selection state
  const [selection, setSelection] = useState<SelectionMap>(() =>
    proposal ? buildInitialSelection(proposal) : {},
  )

  // Initialize editable HTML from email when first available
  const currentHtml = editableHtml ?? emailHtml ?? ''

  // Selected campaigns for summary/email
  const selectedCampaigns = useMemo(
    () => (proposal ? getSelectedCampaigns(proposal, selection) : []),
    [proposal, selection],
  )

  const selectedStats = useMemo(() => {
    const totalCampaigns = selectedCampaigns.length
    const totalAdGroups = selectedCampaigns.reduce((s, c) => s + c.adGroups.length, 0)
    const totalVolume = selectedCampaigns.reduce((s, c) => s + c.totalMonthlyVolume, 0)
    const uniqueLandingPages = new Set(
      selectedCampaigns.flatMap((c) => c.adGroups.map((ag) => ag.landingPage.url).filter(Boolean)),
    ).size
    return { totalCampaigns, totalAdGroups, totalVolume, uniqueLandingPages }
  }, [selectedCampaigns])

  // Toggle handlers
  const toggleCampaign = useCallback(
    (ci: number) => {
      if (!proposal) return
      setSelection((prev) => {
        const next = { ...prev }
        const newVal = !prev[`c${ci}`]
        next[`c${ci}`] = newVal
        proposal!.proposedCampaigns[ci].adGroups.forEach((_, agi) => {
          next[`c${ci}-ag${agi}`] = newVal
        })
        return next
      })
    },
    [proposal],
  )

  const toggleAdGroup = useCallback(
    (ci: number, agi: number) => {
      if (!proposal) return
      setSelection((prev) => {
        const next = { ...prev }
        next[`c${ci}-ag${agi}`] = !prev[`c${ci}-ag${agi}`]
        // Update campaign checkbox: checked if any ad group is checked
        const anyChecked = proposal!.proposedCampaigns[ci].adGroups.some(
          (_, i) => next[`c${ci}-ag${i}`],
        )
        next[`c${ci}`] = anyChecked
        return next
      })
    },
    [proposal],
  )

  // CSV Export - includes all proposed campaigns (not just structureComparison)
  const handleExportCSV = useCallback(() => {
    if (!proposal) return

    const rows: string[][] = []

    // Always include the full proposed structure
    rows.push([
      'Selected',
      'Campaign',
      'Campaign Type',
      'Ad Group',
      'Monthly Volume',
      'Landing Page',
      'LP Status',
      'Keywords',
    ])
    proposal.proposedCampaigns.forEach((campaign, ci) => {
      for (const ag of campaign.adGroups) {
        const isSelected = selection[`c${ci}-ag${campaign.adGroups.indexOf(ag)}`] ? 'Yes' : 'No'
        rows.push([
          isSelected,
          campaign.name,
          campaign.campaignType,
          ag.name,
          String(ag.totalMonthlyVolume),
          ag.landingPage.url || '(create)',
          ag.landingPage.status,
          ag.keywords.map((k) => `${k.text} (${k.monthlySearchVolume})`).join('; '),
        ])
      }
    })

    // If there's a structure comparison, add it as a second section
    if (proposal.structureComparison && proposal.structureComparison.length > 0) {
      rows.push([]) // blank separator
      rows.push(['--- BEFORE vs AFTER COMPARISON ---'])
      rows.push([
        'Change',
        'Current Campaign',
        'Current Ad Group',
        'Current Landing Page',
        'Current Volume',
        'Proposed Campaign',
        'Proposed Ad Group',
        'Proposed Landing Page',
        'Proposed Volume',
        'Notes',
      ])
      for (const row of proposal.structureComparison) {
        rows.push([
          row.change,
          row.currentCampaign,
          row.currentAdGroup,
          row.currentLandingPage,
          row.currentMonthlyVolume != null ? String(row.currentMonthlyVolume) : '',
          row.proposedCampaign,
          row.proposedAdGroup,
          row.proposedLandingPage,
          row.proposedMonthlyVolume != null ? String(row.proposedMonthlyVolume) : '',
          row.notes,
        ])
      }
    }

    const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `campaign-proposal-${(proposal.businessName || 'export').replace(/[^a-z0-9]/gi, '-').slice(0, 40)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [proposal, selection])

  // Export raw JSON
  const handleExportJSON = useCallback(() => {
    if (!proposal) return
    const blob = new Blob([JSON.stringify(proposal, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `campaign-proposal-raw-${(proposal.businessName || 'export').replace(/[^a-z0-9]/gi, '-').slice(0, 40)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [proposal])

  if (!proposal) {
    return (
      <div style={{ ...styles.container, color: '#9ca3af', fontSize: 13 }}>
        No campaign proposal generated yet. Use the button above to generate one.
      </div>
    )
  }

  return (
    <div style={styles.container}>
      {/* Tab bar */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #e5e7eb', marginBottom: 16, flexWrap: 'wrap', gap: 4 }}>
        <button type="button" style={tabStyle(activeTab === 'structure')} onClick={() => setActiveTab('structure')}>
          Campaign Structure
        </button>
        <button type="button" style={tabStyle(activeTab === 'summary')} onClick={() => setActiveTab('summary')}>
          Client Summary
        </button>
        <button type="button" style={tabStyle(activeTab === 'email')} onClick={() => setActiveTab('email')}>
          Email Editor
        </button>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={handleExportCSV} style={btnStyle('#059669')}>
            Export CSV
          </button>
          <button type="button" onClick={handleExportJSON} style={btnStyle('#6366f1')}>
            Export Raw Data
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'Campaigns', value: selectedStats.totalCampaigns },
          { label: 'Ad Groups', value: selectedStats.totalAdGroups },
          { label: 'Monthly Searches', value: fmt(selectedStats.totalVolume) },
          { label: 'Landing Pages', value: selectedStats.uniqueLandingPages },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              flex: '1 1 120px',
              background: '#eff6ff',
              borderRadius: 8,
              padding: '12px 16px',
              textAlign: 'center',
              border: '1px solid #bfdbfe',
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 700, color: '#1e293b' }}>{stat.value}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {activeTab === 'structure' && (
        <StructureView
          proposal={proposal}
          selection={selection}
          toggleCampaign={toggleCampaign}
          toggleAdGroup={toggleAdGroup}
        />
      )}
      {activeTab === 'summary' && <SummaryView proposal={proposal} selectedCampaigns={selectedCampaigns} stats={selectedStats} />}
      {activeTab === 'email' && (
        <EmailEditorView
          emailHtml={currentHtml}
          onHtmlChange={setEditableHtml}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// View 1: Campaign Structure (with checkboxes)
// ---------------------------------------------------------------------------

function StructureView({
  proposal,
  selection,
  toggleCampaign,
  toggleAdGroup,
}: {
  proposal: CampaignProposalData
  selection: SelectionMap
  toggleCampaign: (ci: number) => void
  toggleAdGroup: (ci: number, agi: number) => void
}) {
  return (
    <div style={styles.body}>
      <p style={{ ...styles.muted, marginBottom: 12 }}>
        Use checkboxes to select which campaigns and ad groups to include in the client summary and email.
        Deselected items will be excluded.
      </p>

      {proposal.proposedCampaigns.map((campaign, ci) => {
        const campaignChecked = !!selection[`c${ci}`]
        const checkedCount = campaign.adGroups.filter((_, agi) => selection[`c${ci}-ag${agi}`]).length
        const allChecked = checkedCount === campaign.adGroups.length
        const someChecked = checkedCount > 0 && !allChecked

        return (
          <div
            key={ci}
            style={{
              marginBottom: 16,
              padding: 12,
              background: campaignChecked ? '#fff' : '#f9fafb',
              borderRadius: 8,
              border: `1px solid ${campaignChecked ? '#e2e8f0' : '#e5e7eb'}`,
              opacity: campaignChecked ? 1 : 0.6,
            }}
          >
            {/* Campaign header with checkbox */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={campaignChecked}
                ref={(el) => {
                  if (el) el.indeterminate = someChecked
                }}
                onChange={() => toggleCampaign(ci)}
                style={styles.checkbox}
              />
              <strong style={{ fontSize: 14 }}>{campaign.name}</strong>
              <span style={typeBadge(campaign.campaignType)}>{campaign.campaignType}</span>
              <span style={styles.muted}>
                {checkedCount}/{campaign.adGroups.length} ad groups |{' '}
                {fmt(
                  campaign.adGroups
                    .filter((_, agi) => selection[`c${ci}-ag${agi}`])
                    .reduce((s, ag) => s + ag.totalMonthlyVolume, 0),
                )}{' '}
                vol/mo
              </span>
            </div>

            {/* Ad groups */}
            {campaign.adGroups.map((ag, agi) => {
              const agChecked = !!selection[`c${ci}-ag${agi}`]
              return (
                <div
                  key={agi}
                  style={{
                    marginLeft: 28,
                    marginBottom: 8,
                    paddingLeft: 12,
                    borderLeft: `2px solid ${agChecked ? '#bfdbfe' : '#e5e7eb'}`,
                    opacity: agChecked ? 1 : 0.5,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      type="checkbox"
                      checked={agChecked}
                      onChange={() => toggleAdGroup(ci, agi)}
                      style={styles.checkbox}
                    />
                    <strong style={{ fontSize: 13 }}>{ag.name}</strong>
                    <span style={styles.muted}>{fmt(ag.totalMonthlyVolume)} vol/mo</span>
                    <span style={statusBadge(ag.landingPage.status)}>{ag.landingPage.status}</span>
                    {ag.landingPage.url && (
                      <a
                        href={ag.landingPage.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ ...styles.link, fontSize: 12 }}
                      >
                        {ag.landingPage.url.replace(/^https?:\/\//, '').slice(0, 50)}
                      </a>
                    )}
                  </div>

                  {ag.keywords.length > 0 && (
                    <details style={{ marginTop: 4, marginLeft: 24 }}>
                      <summary style={{ cursor: 'pointer', fontSize: 12, color: '#6b7280' }}>
                        {ag.keywords.length} keywords
                      </summary>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4, lineHeight: 1.8 }}>
                        {ag.keywords
                          .sort((a, b) => b.monthlySearchVolume - a.monthlySearchVolume)
                          .map((kw, ki) => (
                            <span key={ki} style={{ marginRight: 12, whiteSpace: 'nowrap' }}>
                              {kw.text}{' '}
                              <strong style={{ color: '#334155' }}>({fmt(kw.monthlySearchVolume)})</strong>
                              {ki < ag.keywords.length - 1 ? ',' : ''}
                            </span>
                          ))}
                      </div>
                    </details>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}

      {/* Before vs After Comparison */}
      {proposal.structureComparison && proposal.structureComparison.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h4 style={styles.sectionHeader}>Before vs After Comparison</h4>
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Change</th>
                  <th style={styles.th}>Current</th>
                  <th style={styles.th}></th>
                  <th style={styles.th}>Proposed</th>
                  <th style={styles.th}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {proposal.structureComparison.map((row, i) => (
                  <tr key={i}>
                    <td style={i % 2 === 0 ? styles.td : styles.tdEven}>
                      <span style={changeBadge(row.change)}>{row.change}</span>
                    </td>
                    <td style={i % 2 === 0 ? styles.td : styles.tdEven}>
                      <div style={{ fontSize: 12 }}>
                        {row.currentCampaign && (
                          <div>
                            <strong>{row.currentCampaign}</strong>
                          </div>
                        )}
                        {row.currentAdGroup && <div>{row.currentAdGroup}</div>}
                        {row.currentLandingPage && (
                          <div style={{ color: '#6b7280', fontSize: 11 }}>{row.currentLandingPage}</div>
                        )}
                      </div>
                    </td>
                    <td style={{ ...styles.td, textAlign: 'center', fontSize: 16, color: '#9ca3af' }}>&#8594;</td>
                    <td style={i % 2 === 0 ? styles.td : styles.tdEven}>
                      <div style={{ fontSize: 12 }}>
                        {row.proposedCampaign && (
                          <div>
                            <strong>{row.proposedCampaign}</strong>
                          </div>
                        )}
                        {row.proposedAdGroup && <div>{row.proposedAdGroup}</div>}
                        {row.proposedLandingPage && (
                          <div style={{ color: '#6b7280', fontSize: 11 }}>{row.proposedLandingPage}</div>
                        )}
                      </div>
                    </td>
                    <td style={i % 2 === 0 ? styles.td : styles.tdEven}>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>{row.notes}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Mismatch Analysis */}
      {proposal.mismatchAnalysis && (
        <section style={{ marginTop: 20 }}>
          <h4 style={styles.sectionHeader}>Account Mismatch Analysis</h4>

          {(proposal.mismatchAnalysis.servicesNotAdvertised?.length ?? 0) > 0 && (
            <details style={{ marginBottom: 8 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#991b1b' }}>
                Services Not Advertised ({proposal.mismatchAnalysis.servicesNotAdvertised.length})
              </summary>
              <table style={{ ...styles.table, marginTop: 4 }}>
                <thead>
                  <tr>
                    <th style={styles.th}>Page</th>
                    <th style={styles.th}>Est. Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {proposal.mismatchAnalysis.servicesNotAdvertised.map((s, i) => (
                    <tr key={i}>
                      <td style={styles.td}>
                        <a href={s.pageUrl} target="_blank" rel="noopener noreferrer" style={styles.link}>
                          {s.pageTitle}
                        </a>
                      </td>
                      <td style={styles.td}>{fmt(s.estimatedVolume)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}

          {(proposal.mismatchAnalysis.adGroupsWithBadLandingPages?.length ?? 0) > 0 && (
            <details style={{ marginBottom: 8 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#92400e' }}>
                Bad Landing Pages ({proposal.mismatchAnalysis.adGroupsWithBadLandingPages.length})
              </summary>
              <table style={{ ...styles.table, marginTop: 4 }}>
                <thead>
                  <tr>
                    <th style={styles.th}>Ad Group</th>
                    <th style={styles.th}>Campaign</th>
                    <th style={styles.th}>Issue</th>
                  </tr>
                </thead>
                <tbody>
                  {proposal.mismatchAnalysis.adGroupsWithBadLandingPages.map((a, i) => (
                    <tr key={i}>
                      <td style={styles.td}>{a.adGroupName}</td>
                      <td style={styles.td}>{a.campaignName}</td>
                      <td style={styles.td}>{a.issue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}

          {(proposal.mismatchAnalysis.brandGenericMixed?.length ?? 0) > 0 && (
            <details>
              <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#92400e' }}>
                Brand/Generic Mixed ({proposal.mismatchAnalysis.brandGenericMixed.length})
              </summary>
              {proposal.mismatchAnalysis.brandGenericMixed.map((m, i) => (
                <div
                  key={i}
                  style={{ padding: 8, marginTop: 4, background: '#fef3c7', borderRadius: 6, fontSize: 12 }}
                >
                  <strong>{m.campaignName}</strong>
                  <div>Brand: {m.brandKeywords.join(', ')}</div>
                  <div>Generic: {m.genericKeywords.join(', ')}</div>
                </div>
              ))}
            </details>
          )}
        </section>
      )}

      {/* Competitor Landscape */}
      {(proposal.competitors?.length ?? 0) > 0 && (
        <details style={{ marginTop: 20 }}>
          <summary style={{ ...styles.sectionHeader, cursor: 'pointer' }}>
            Competitor Landscape ({proposal.competitors.length})
          </summary>
          <table style={{ ...styles.table, marginTop: 8 }}>
            <thead>
              <tr>
                <th style={styles.th}>Domain</th>
                <th style={styles.th}>Overlapping KWs</th>
                <th style={styles.th}>Avg Position</th>
                <th style={styles.th}>Running Ads</th>
              </tr>
            </thead>
            <tbody>
              {proposal.competitors.map((c, i) => (
                <tr key={i}>
                  <td style={i % 2 === 0 ? styles.td : styles.tdEven}>{c.domain}</td>
                  <td style={i % 2 === 0 ? styles.td : styles.tdEven}>{c.overlappingKeywords}</td>
                  <td style={i % 2 === 0 ? styles.td : styles.tdEven}>{c.averagePosition.toFixed(1)}</td>
                  <td style={i % 2 === 0 ? styles.td : styles.tdEven}>
                    {c.isRunningAds ? 'Yes' : 'No'}
                    {c.adCopyCount ? ` (${c.adCopyCount} ads)` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// View 2: Client Summary (print-friendly, based on selected items)
// ---------------------------------------------------------------------------

function SummaryView({
  proposal,
  selectedCampaigns,
  stats,
}: {
  proposal: CampaignProposalData
  selectedCampaigns: ProposedCampaign[]
  stats: { totalCampaigns: number; totalAdGroups: number; totalVolume: number; uniqueLandingPages: number }
}) {
  const generatedDate = proposal.createdAt
    ? new Date(proposal.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  return (
    <div style={{ background: '#fff', padding: 24, borderRadius: 8, color: '#1e293b', lineHeight: 1.7, fontSize: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button type="button" onClick={() => window.print()} style={btnStyle('#374151')}>
          Print
        </button>
      </div>

      {/* Header */}
      <div style={{ borderBottom: '2px solid #e5e7eb', paddingBottom: 12, marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Campaign Structure Proposal</h3>
        <div style={{ marginTop: 4, color: '#6b7280', fontSize: 13 }}>
          {proposal.businessName} | {proposal.websiteUrl} | {generatedDate}
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Campaigns', value: stats.totalCampaigns },
          { label: 'Ad Groups', value: stats.totalAdGroups },
          { label: 'Monthly Searches', value: fmt(stats.totalVolume) },
          { label: 'Landing Pages', value: stats.uniqueLandingPages },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              flex: '1 1 100px',
              background: '#eff6ff',
              borderRadius: 8,
              padding: '10px 14px',
              textAlign: 'center',
              border: '1px solid #bfdbfe',
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700 }}>{stat.value}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Proposed Structure (only selected items) */}
      <section style={{ marginBottom: 20 }}>
        <h4 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>Proposed Structure</h4>
        {selectedCampaigns.length === 0 ? (
          <p style={{ color: '#9ca3af' }}>No campaigns selected. Go to Campaign Structure tab to select items.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Campaign</th>
                <th style={styles.th}>Ad Group</th>
                <th style={styles.th}>Monthly Searches</th>
                <th style={styles.th}>Landing Page</th>
                <th style={styles.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {selectedCampaigns.flatMap((campaign) =>
                campaign.adGroups.map((ag, agi) => (
                  <tr key={`${campaign.name}-${agi}`}>
                    <td style={styles.td}>{agi === 0 ? campaign.name : ''}</td>
                    <td style={styles.td}>{ag.name}</td>
                    <td style={styles.td}>{fmt(ag.totalMonthlyVolume)}</td>
                    <td style={styles.td}>
                      {ag.landingPage.url ? ag.landingPage.url.replace(/^https?:\/\//, '').slice(0, 40) : '(create)'}
                    </td>
                    <td style={styles.td}>
                      <span style={statusBadge(ag.landingPage.status)}>{ag.landingPage.status}</span>
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        )}
      </section>

      {/* Landing Page Recommendations */}
      {((proposal.landingPagesToCreate?.length ?? 0) > 0 || (proposal.landingPagesToImprove?.length ?? 0) > 0) && (
        <section style={{ marginBottom: 20 }}>
          <h4 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>Landing Page Recommendations</h4>

          {(proposal.landingPagesToCreate?.length ?? 0) > 0 && (
            <>
              <h5 style={{ fontSize: 14, fontWeight: 600, margin: '8px 0', color: '#991b1b' }}>Pages to Create</h5>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {proposal.landingPagesToCreate.map((lp, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    <strong>{lp.suggestedPath}</strong> -- {lp.targetService}, {fmt(lp.monthlyVolume)} vol/mo
                  </li>
                ))}
              </ul>
            </>
          )}

          {(proposal.landingPagesToImprove?.length ?? 0) > 0 && (
            <>
              <h5 style={{ fontSize: 14, fontWeight: 600, margin: '12px 0 8px', color: '#92400e' }}>Pages to Improve</h5>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {proposal.landingPagesToImprove.map((lp, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    <strong>{lp.url.replace(/^https?:\/\//, '')}</strong> -- CRO score {lp.croScore}/100
                    {lp.issues.length > 0 && ` (${lp.issues.join(', ')})`}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// View 3: Email Editor
// ---------------------------------------------------------------------------

function EmailEditorView({
  emailHtml,
  onHtmlChange,
}: {
  emailHtml: string
  onHtmlChange: (html: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const [showSource, setShowSource] = useState(false)

  const handleCopy = useCallback(async () => {
    if (!emailHtml) return
    try {
      await navigator.clipboard.writeText(emailHtml)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = emailHtml
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [emailHtml])

  if (!emailHtml) {
    return (
      <div style={{ color: '#9ca3af', fontSize: 13, padding: 16 }}>No email HTML generated yet.</div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => setShowSource(!showSource)}
            style={btnStyle(showSource ? '#2563eb' : '#64748b')}
          >
            {showSource ? 'Preview' : 'Edit HTML'}
          </button>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          style={btnStyle(copied ? '#16a34a' : '#374151')}
        >
          {copied ? 'Copied!' : 'Copy HTML'}
        </button>
      </div>

      {showSource ? (
        <textarea
          value={emailHtml}
          onChange={(e) => onHtmlChange(e.target.value)}
          style={{
            width: '100%',
            minHeight: 500,
            fontFamily: 'monospace',
            fontSize: 12,
            padding: 12,
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            background: '#1e293b',
            color: '#e2e8f0',
            resize: 'vertical',
            lineHeight: 1.5,
          }}
          spellCheck={false}
        />
      ) : (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <iframe
            srcDoc={emailHtml}
            style={{
              width: '100%',
              maxWidth: 700,
              height: 600,
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              background: '#fff',
            }}
            title="Campaign proposal email preview"
            sandbox=""
          />
        </div>
      )}
    </div>
  )
}

const CampaignProposalPreview = () => {
  const [renderError, setRenderError] = useState<string | null>(null)

  if (renderError) {
    return (
      <div style={{ padding: 12, background: '#fee2e2', borderRadius: 6, fontSize: 13, color: '#991b1b' }}>
        Campaign Proposal Preview error: {renderError}
      </div>
    )
  }

  try {
    return <CampaignProposalPreviewInner />
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!renderError) setRenderError(msg)
    return (
      <div style={{ padding: 12, background: '#fee2e2', borderRadius: 6, fontSize: 13, color: '#991b1b' }}>
        Campaign Proposal Preview error: {msg}
      </div>
    )
  }
}

export default CampaignProposalPreview
