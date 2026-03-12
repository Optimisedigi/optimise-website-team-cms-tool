'use client'

import { useAllFormFields } from '@payloadcms/ui'
import { useState, useCallback } from 'react'

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

const priorityBadge = (priority: string): React.CSSProperties => {
  switch (priority) {
    case 'high':
      return { ...badgeBase, background: '#fee2e2', color: '#991b1b' }
    case 'medium':
      return { ...badgeBase, background: '#fef3c7', color: '#92400e' }
    case 'low':
      return { ...badgeBase, background: '#dcfce7', color: '#166534' }
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

type Tab = 'detailed' | 'summary' | 'email'

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const CampaignProposalPreviewInner = () => {
  const [fields] = useAllFormFields()
  const [activeTab, setActiveTab] = useState<Tab>('detailed')

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

  // CSV Export
  const handleExportCSV = useCallback(() => {
    if (!proposal) return

    const rows: string[][] = []

    // Headers
    if (proposal.structureComparison && proposal.structureComparison.length > 0) {
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
    } else {
      rows.push(['Campaign', 'Type', 'Ad Group', 'Monthly Volume', 'Landing Page', 'LP Status'])
      for (const campaign of proposal.proposedCampaigns) {
        for (const ag of campaign.adGroups) {
          rows.push([
            campaign.name,
            campaign.campaignType,
            ag.name,
            String(ag.totalMonthlyVolume),
            ag.landingPage.url || '(create)',
            ag.landingPage.status,
          ])
        }
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
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #e5e7eb', marginBottom: 16 }}>
        <button type="button" style={tabStyle(activeTab === 'detailed')} onClick={() => setActiveTab('detailed')}>
          Detailed Analysis
        </button>
        <button type="button" style={tabStyle(activeTab === 'summary')} onClick={() => setActiveTab('summary')}>
          Client Summary
        </button>
        <button type="button" style={tabStyle(activeTab === 'email')} onClick={() => setActiveTab('email')}>
          Email Preview
        </button>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={handleExportCSV}
          style={{
            padding: '6px 14px',
            background: '#059669',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Export CSV
        </button>
      </div>

      {activeTab === 'detailed' && <DetailedView proposal={proposal} />}
      {activeTab === 'summary' && <SummaryView proposal={proposal} />}
      {activeTab === 'email' && <EmailView emailHtml={emailHtml} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// View 1: Detailed Analysis
// ---------------------------------------------------------------------------

function DetailedView({ proposal }: { proposal: CampaignProposalData }) {
  return (
    <div style={styles.body}>
      {/* Discovered Pages */}
      {proposal.discoveredPages.length > 0 && (
        <section>
          <h4 style={styles.sectionHeader}>Discovered Pages ({proposal.discoveredPages.length})</h4>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>URL</th>
                <th style={styles.th}>Page Type</th>
                <th style={styles.th}>H1</th>
              </tr>
            </thead>
            <tbody>
              {proposal.discoveredPages.map((page, i) => (
                <tr key={i}>
                  <td style={i % 2 === 0 ? styles.td : styles.tdEven}>
                    <a href={page.url} target="_blank" rel="noopener noreferrer" style={styles.link}>
                      {page.url.replace(/^https?:\/\//, '').slice(0, 60)}
                    </a>
                  </td>
                  <td style={i % 2 === 0 ? styles.td : styles.tdEven}>
                    <span style={{ ...badgeBase, background: '#f1f5f9', color: '#475569' }}>{page.pageType}</span>
                  </td>
                  <td style={i % 2 === 0 ? styles.td : styles.tdEven}>{page.h1 || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Proposed Campaign Structure */}
      <section style={{ marginTop: 20 }}>
        <h4 style={styles.sectionHeader}>Proposed Campaign Structure</h4>
        {proposal.proposedCampaigns.map((campaign, ci) => (
          <div
            key={ci}
            style={{
              marginBottom: 16,
              padding: 12,
              background: '#fff',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <strong style={{ fontSize: 14 }}>{campaign.name}</strong>
              <span style={typeBadge(campaign.campaignType)}>{campaign.campaignType}</span>
              <span style={styles.muted}>({fmt(campaign.totalMonthlyVolume)} vol/mo)</span>
            </div>

            {campaign.adGroups.map((ag, agi) => (
              <div key={agi} style={{ marginLeft: 16, marginBottom: 10, paddingLeft: 12, borderLeft: '2px solid #e5e7eb' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 13 }}>{ag.name}</strong>
                  <span style={styles.muted}>{fmt(ag.totalMonthlyVolume)} vol/mo</span>
                  <span style={statusBadge(ag.landingPage.status)}>{ag.landingPage.status}</span>
                  {ag.landingPage.url && (
                    <a href={ag.landingPage.url} target="_blank" rel="noopener noreferrer" style={{ ...styles.link, fontSize: 12 }}>
                      {ag.landingPage.url.replace(/^https?:\/\//, '').slice(0, 50)}
                    </a>
                  )}
                </div>

                {ag.keywords.length > 0 && (
                  <details style={{ marginTop: 6 }}>
                    <summary style={{ cursor: 'pointer', fontSize: 12, color: '#6b7280' }}>
                      {ag.keywords.length} keywords
                    </summary>
                    <table style={{ ...styles.table, marginTop: 4 }}>
                      <thead>
                        <tr>
                          <th style={{ ...styles.th, fontSize: 11 }}>Keyword</th>
                          <th style={{ ...styles.th, fontSize: 11 }}>Match</th>
                          <th style={{ ...styles.th, fontSize: 11 }}>Vol/mo</th>
                          <th style={{ ...styles.th, fontSize: 11 }}>Competition</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ag.keywords.map((kw, ki) => (
                          <tr key={ki}>
                            <td style={styles.td}>{kw.text}</td>
                            <td style={styles.td}>
                              <span style={{ ...badgeBase, background: '#f1f5f9', color: '#475569' }}>{kw.matchType}</span>
                            </td>
                            <td style={styles.td}>{fmt(kw.monthlySearchVolume)}</td>
                            <td style={styles.td}>{kw.competition}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                )}
              </div>
            ))}
          </div>
        ))}
      </section>

      {/* Priority Ranking */}
      {proposal.priorityRanking && proposal.priorityRanking.length > 0 && (
        <section style={{ marginTop: 20 }}>
          <h4 style={styles.sectionHeader}>Priority Ranking</h4>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Priority</th>
                <th style={styles.th}>Campaign</th>
                <th style={styles.th}>Ad Group</th>
                <th style={styles.th}>Volume</th>
                <th style={styles.th}>LP Status</th>
              </tr>
            </thead>
            <tbody>
              {proposal.priorityRanking
                .sort((a, b) => b.monthlyVolume - a.monthlyVolume)
                .map((item, i) => (
                  <tr key={i}>
                    <td style={i % 2 === 0 ? styles.td : styles.tdEven}>
                      <span style={priorityBadge(item.priority)}>{item.priority}</span>
                    </td>
                    <td style={i % 2 === 0 ? styles.td : styles.tdEven}>{item.campaignName}</td>
                    <td style={i % 2 === 0 ? styles.td : styles.tdEven}>{item.adGroupName}</td>
                    <td style={i % 2 === 0 ? styles.td : styles.tdEven}>{fmt(item.monthlyVolume)}</td>
                    <td style={i % 2 === 0 ? styles.td : styles.tdEven}>
                      <span style={statusBadge(item.landingPageStatus)}>{item.landingPageStatus}</span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Landing Page Gaps */}
      {(proposal.landingPagesToCreate.length > 0 || proposal.landingPagesToImprove.length > 0) && (
        <section style={{ marginTop: 20 }}>
          <h4 style={styles.sectionHeader}>Landing Page Gaps</h4>

          {proposal.landingPagesToCreate.length > 0 && (
            <>
              <h5 style={{ fontSize: 13, fontWeight: 600, color: '#991b1b', margin: '8px 0' }}>
                Pages to Create ({proposal.landingPagesToCreate.length})
              </h5>
              {proposal.landingPagesToCreate.map((lp, i) => (
                <div
                  key={i}
                  style={{
                    padding: 10,
                    marginBottom: 8,
                    background: '#fff',
                    borderRadius: 6,
                    border: '1px solid #fecaca',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 13 }}>{lp.suggestedPath}</strong>
                    <span style={priorityBadge(lp.priority)}>{lp.priority}</span>
                    <span style={styles.muted}>{fmt(lp.monthlyVolume)} vol/mo</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                    Keywords: {lp.targetKeywords.join(', ')}
                  </div>
                </div>
              ))}
            </>
          )}

          {proposal.landingPagesToImprove.length > 0 && (
            <>
              <h5 style={{ fontSize: 13, fontWeight: 600, color: '#92400e', margin: '12px 0 8px' }}>
                Pages to Improve ({proposal.landingPagesToImprove.length})
              </h5>
              {proposal.landingPagesToImprove.map((lp, i) => (
                <div
                  key={i}
                  style={{
                    padding: 10,
                    marginBottom: 8,
                    background: '#fff',
                    borderRadius: 6,
                    border: '1px solid #fde68a',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <a href={lp.url} target="_blank" rel="noopener noreferrer" style={styles.link}>
                      {lp.url.replace(/^https?:\/\//, '').slice(0, 60)}
                    </a>
                    <span style={{ ...badgeBase, background: '#fef3c7', color: '#92400e' }}>
                      CRO: {lp.croScore}/100
                    </span>
                  </div>
                  {lp.issues.length > 0 && (
                    <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: 12, color: '#6b7280' }}>
                      {lp.issues.map((issue, j) => (
                        <li key={j}>{issue}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </>
          )}
        </section>
      )}

      {/* Before vs After Comparison */}
      {proposal.structureComparison && proposal.structureComparison.length > 0 && (
        <section style={{ marginTop: 20 }}>
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
                        {row.currentCampaign && <div><strong>{row.currentCampaign}</strong></div>}
                        {row.currentAdGroup && <div>{row.currentAdGroup}</div>}
                        {row.currentLandingPage && (
                          <div style={{ color: '#6b7280', fontSize: 11 }}>{row.currentLandingPage}</div>
                        )}
                      </div>
                    </td>
                    <td style={{ ...styles.td, textAlign: 'center', fontSize: 16, color: '#9ca3af' }}>&#8594;</td>
                    <td style={i % 2 === 0 ? styles.td : styles.tdEven}>
                      <div style={{ fontSize: 12 }}>
                        {row.proposedCampaign && <div><strong>{row.proposedCampaign}</strong></div>}
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
          <h4 style={styles.sectionHeader}>Mismatch Analysis</h4>

          {proposal.mismatchAnalysis.servicesNotAdvertised.length > 0 && (
            <>
              <h5 style={{ fontSize: 13, fontWeight: 600, margin: '8px 0', color: '#991b1b' }}>
                Services Not Advertised
              </h5>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Page</th>
                    <th style={styles.th}>Title</th>
                    <th style={styles.th}>Est. Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {proposal.mismatchAnalysis.servicesNotAdvertised.map((s, i) => (
                    <tr key={i}>
                      <td style={styles.td}>
                        <a href={s.pageUrl} target="_blank" rel="noopener noreferrer" style={styles.link}>
                          {s.pageUrl.replace(/^https?:\/\//, '').slice(0, 50)}
                        </a>
                      </td>
                      <td style={styles.td}>{s.pageTitle}</td>
                      <td style={styles.td}>{fmt(s.estimatedVolume)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {proposal.mismatchAnalysis.adGroupsWithBadLandingPages.length > 0 && (
            <>
              <h5 style={{ fontSize: 13, fontWeight: 600, margin: '12px 0 8px', color: '#92400e' }}>
                Bad Landing Pages
              </h5>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Ad Group</th>
                    <th style={styles.th}>Campaign</th>
                    <th style={styles.th}>URL</th>
                    <th style={styles.th}>Issue</th>
                  </tr>
                </thead>
                <tbody>
                  {proposal.mismatchAnalysis.adGroupsWithBadLandingPages.map((a, i) => (
                    <tr key={i}>
                      <td style={styles.td}>{a.adGroupName}</td>
                      <td style={styles.td}>{a.campaignName}</td>
                      <td style={styles.td} title={a.currentUrl}>
                        {a.currentUrl.slice(0, 40)}
                      </td>
                      <td style={styles.td}>{a.issue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {proposal.mismatchAnalysis.brandGenericMixed.length > 0 && (
            <>
              <h5 style={{ fontSize: 13, fontWeight: 600, margin: '12px 0 8px', color: '#92400e' }}>
                Brand/Generic Mixed Campaigns
              </h5>
              {proposal.mismatchAnalysis.brandGenericMixed.map((m, i) => (
                <div key={i} style={{ padding: 8, marginBottom: 6, background: '#fef3c7', borderRadius: 6, fontSize: 12 }}>
                  <strong>{m.campaignName}</strong>
                  <div>Brand: {m.brandKeywords.join(', ')}</div>
                  <div>Generic: {m.genericKeywords.join(', ')}</div>
                </div>
              ))}
            </>
          )}
        </section>
      )}

      {/* Competitor Landscape */}
      {proposal.competitors.length > 0 && (
        <section style={{ marginTop: 20 }}>
          <h4 style={styles.sectionHeader}>Competitor Landscape</h4>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Domain</th>
                <th style={styles.th}>Overlapping KWs</th>
                <th style={styles.th}>Avg Position</th>
                <th style={styles.th}>Running Ads</th>
                <th style={styles.th}>Ad Count</th>
              </tr>
            </thead>
            <tbody>
              {proposal.competitors.map((c, i) => (
                <tr key={i}>
                  <td style={i % 2 === 0 ? styles.td : styles.tdEven}>{c.domain}</td>
                  <td style={i % 2 === 0 ? styles.td : styles.tdEven}>{c.overlappingKeywords}</td>
                  <td style={i % 2 === 0 ? styles.td : styles.tdEven}>{c.averagePosition.toFixed(1)}</td>
                  <td style={i % 2 === 0 ? styles.td : styles.tdEven}>
                    <span style={c.isRunningAds ? statusBadge('exists') : statusBadge('')}>
                      {c.isRunningAds ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td style={i % 2 === 0 ? styles.td : styles.tdEven}>{c.adCopyCount ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// View 2: Client Summary
// ---------------------------------------------------------------------------

function SummaryView({ proposal }: { proposal: CampaignProposalData }) {
  const totalVolume = proposal.proposedCampaigns.reduce((s, c) => s + c.totalMonthlyVolume, 0)
  const totalAdGroups = proposal.proposedCampaigns.reduce((s, c) => s + c.adGroups.length, 0)
  const topPriorities = (proposal.priorityRanking || [])
    .sort((a, b) => b.monthlyVolume - a.monthlyVolume)
    .slice(0, 5)

  const generatedDate = proposal.createdAt
    ? new Date(proposal.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  return (
    <div style={{ background: '#fff', padding: 24, borderRadius: 8, color: '#1e293b', lineHeight: 1.7, fontSize: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => window.print()}
          style={{
            padding: '6px 14px',
            background: '#374151',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
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

      {/* Executive Summary */}
      <section style={{ marginBottom: 20 }}>
        <h4 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>Executive Summary</h4>
        <p style={{ margin: 0 }}>
          {proposal.discoveredPages.length} service pages analysed.{' '}
          {fmt(totalVolume)} monthly searches across {totalAdGroups} keyword themes.{' '}
          {proposal.landingPagesToCreate.length > 0
            ? `${proposal.landingPagesToCreate.length} page${proposal.landingPagesToCreate.length !== 1 ? 's' : ''} to create`
            : 'No new pages needed'}
          {proposal.landingPagesToImprove.length > 0
            ? `, ${proposal.landingPagesToImprove.length} to improve`
            : ''}.
        </p>
      </section>

      {/* Proposed Structure */}
      <section style={{ marginBottom: 20 }}>
        <h4 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>Proposed Structure</h4>
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
            {proposal.proposedCampaigns.flatMap((campaign) =>
              campaign.adGroups.map((ag, agi) => (
                <tr key={`${campaign.name}-${agi}`}>
                  <td style={styles.td}>{agi === 0 ? campaign.name : ''}</td>
                  <td style={styles.td}>{ag.name}</td>
                  <td style={styles.td}>{fmt(ag.totalMonthlyVolume)}</td>
                  <td style={styles.td}>
                    {ag.landingPage.url
                      ? ag.landingPage.url.replace(/^https?:\/\//, '').slice(0, 40)
                      : '(create)'}
                  </td>
                  <td style={styles.td}>
                    <span style={statusBadge(ag.landingPage.status)}>{ag.landingPage.status}</span>
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </section>

      {/* Top 5 Priorities */}
      {topPriorities.length > 0 && (
        <section style={{ marginBottom: 20 }}>
          <h4 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>Top {topPriorities.length} Priorities</h4>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            {topPriorities.map((item, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                <strong>{item.adGroupName}</strong> ({item.campaignName}) -- {fmt(item.monthlyVolume)} searches/mo
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Landing Page Recommendations */}
      {(proposal.landingPagesToCreate.length > 0 || proposal.landingPagesToImprove.length > 0) && (
        <section style={{ marginBottom: 20 }}>
          <h4 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>Landing Page Recommendations</h4>

          {proposal.landingPagesToCreate.length > 0 && (
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

          {proposal.landingPagesToImprove.length > 0 && (
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
// View 3: Email Preview
// ---------------------------------------------------------------------------

function EmailView({ emailHtml }: { emailHtml?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    if (!emailHtml) return
    try {
      await navigator.clipboard.writeText(emailHtml)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
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
      <div style={{ color: '#9ca3af', fontSize: 13, padding: 16 }}>
        No email HTML generated yet.
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          type="button"
          onClick={handleCopy}
          style={{
            padding: '6px 14px',
            background: copied ? '#16a34a' : '#374151',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
        >
          {copied ? 'Copied!' : 'Copy HTML'}
        </button>
      </div>
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
