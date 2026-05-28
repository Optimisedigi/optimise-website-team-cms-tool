'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState, useRef, useCallback, useEffect } from 'react'

const STEPS = [
  {
    title: '1. Website Crawl',
    desc: 'Crawls up to 30 pages, identifies service/product pages, extracts seed phrases from headings and content.',
  },
  {
    title: '2. Google Ads Account Review',
    desc: 'If a Customer ID is linked, fetches existing campaigns, ad groups, keywords, and landing pages to compare against.',
  },
  {
    title: '3. Keyword Research',
    desc: 'For each discovered page, queries Google Ads Keyword Planner for keyword ideas and search volumes. Uses AI to split large keyword sets into tighter ad groups.',
  },
  {
    title: '4. Campaign Structure',
    desc: 'Builds a brand campaign (exact-match brand terms) and generic campaigns (~7 ad groups each, phrase-match keywords, 1 landing page per group).',
  },
  {
    title: '5. Competitor Intelligence',
    desc: 'Runs SERP queries for top keywords to identify competing domains. Checks Meta Ad Library for active advertisers.',
  },
  {
    title: '6. Landing Page Assessment',
    desc: 'Scores existing landing pages for CRO quality. Identifies pages that need to be created or improved.',
  },
  {
    title: '7. Mismatch Analysis',
    desc: 'Compares proposed structure against the existing account to find services not advertised, bad landing pages, and brand/generic keyword mixing.',
  },
]

const RunCampaignProposalButtonInner = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stage, setStage] = useState('')
  const [showHelp, setShowHelp] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const startPolling = useCallback(() => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/google-ads-audits/${id}/campaign-proposal-status`, {
          credentials: 'include',
        })
        if (!res.ok) return
        const data = await res.json()

        if (data.status === 'running') {
          setStage('Generating proposal (this takes 5-10 minutes)...')
        } else if (data.status === 'completed') {
          stopPolling()
          setLoading(false)
          setStage('Complete')
          setMessage('Campaign proposal generated. Refresh the page to see results.')
        } else if (data.status === 'failed') {
          stopPolling()
          setLoading(false)
          setStage('Failed')
          setError(data.error || 'Campaign proposal generation failed. Check server logs.')
        }
      } catch {
        // Network hiccup -- keep polling
      }
    }, 5000) // Longer interval since this takes a while
  }, [id, stopPolling])

  useEffect(() => () => stopPolling(), [stopPolling])

  if (!id) return null

  const websiteUrl = fields?.websiteUrl?.value as string | undefined
  const businessName = fields?.businessName?.value as string | undefined
  const proposalStatus = fields?.campaignProposalStatus?.value as string | undefined
  const hasProposal = !!fields?.campaignProposal?.value
  const proposalGeneratedAt = fields?.campaignProposalGeneratedAt?.value as string | undefined
  const proposalEmailHtml = fields?.campaignProposalEmailHtml?.value as string | undefined

  const isRunning = loading
  const isStuck = proposalStatus === 'running' && !loading

  const missingFields: string[] = []
  if (!websiteUrl?.trim()) missingFields.push('Website URL')
  if (!businessName?.trim()) missingFields.push('Business Name')

  const handleClick = async () => {
    setLoading(true)
    setMessage(null)
    setError(null)
    setStage('Starting...')

    try {
      const res = await fetch(`/api/google-ads-audits/${id}/run-campaign-proposal`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!res.ok) {
        let errorMsg = `Failed (${res.status})`
        try {
          const data = await res.json()
          if (data.error) errorMsg = data.error
        } catch {
          // Response wasn't JSON (e.g. HTML error page)
        }
        setError(errorMsg)
        setLoading(false)
        return
      }

      setStage('Queued -- crawling website, researching keywords...')
      startPolling()
    } catch (err) {
      setError('Network error -- check your connection and try again.')
      setLoading(false)
    }
  }

  const formattedDate = proposalGeneratedAt
    ? new Date(proposalGeneratedAt).toLocaleString('en-AU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  const automatedVsManual = [
    { action: 'Website crawl & keyword research', how: 'Automated', detail: 'the engine crawls up to 30 pages and queries Keyword Planner' },
    { action: 'Campaign structure generation', how: 'Automated', detail: 'AI builds campaigns, ad groups, and keyword assignments' },
    { action: 'Competitor analysis', how: 'Automated', detail: 'SERP queries and Meta Ad Library checks' },
    { action: 'Reviewing the proposal', how: 'Manual', detail: 'you review the structure and landing page assignments' },
    { action: 'Approving the proposal', how: 'Manual', detail: 'you set the status to Approved' },
    { action: 'Pushing to Google Ads', how: 'Manual', detail: 'you click Build in the Build tab' },
  ]

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Collapsible How It Works guide */}
      <div
        style={{
          background: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          overflow: 'hidden',
          marginBottom: 16,
        }}
      >
        <button
          type="button"
          onClick={() => setShowHelp((v) => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            padding: '10px 16px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            color: '#374151',
          }}
        >
          <span>How it works</span>
          <span style={{ fontSize: 12, color: '#6b7280', transform: showHelp ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
            ▼
          </span>
        </button>

        {showHelp && (
          <div style={{ padding: '0 16px 16px', fontSize: 13, color: '#374151', lineHeight: 1.7 }}>
            {/* Overview */}
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: '#111827' }}>Overview</h4>
              <p style={{ margin: 0 }}>
                The Campaign Proposal engine crawls the client&apos;s website, researches keywords, and builds a complete Google Ads campaign structure — campaigns, ad groups, keyword lists, and landing page assignments. It takes 5–10 minutes to run and produces a ready-to-review proposal.
              </p>
            </div>

            {/* Step-by-step */}
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: '#111827' }}>Step-by-Step</h4>
              <ol style={{ margin: 0, paddingLeft: 20 }}>
                <li><strong>Fill in the basics</strong> — Make sure the Business Name and Website URL are set (on the Google Ads audit record).</li>
                <li><strong>Link Google Ads</strong> (optional) — If the client has an existing Google Ads account, set the Customer ID. The engine will compare the proposed structure against the existing account.</li>
                <li><strong>Click &quot;Generate Campaign Proposal&quot;</strong> — The engine runs 7 steps (see below). Takes 5–10 minutes. You can leave the page and come back.</li>
                <li><strong>Review the proposal</strong> — Once complete, refresh the page. The proposal summary shows campaigns, ad groups, keywords, and competitors found.</li>
                <li><strong>Check the Preview tab</strong> — The Campaign Proposal Preview tab shows the full breakdown: campaign structure, keyword lists, negative keywords, landing page assessments, and competitor analysis.</li>
                <li><strong>Approve the proposal</strong> — Set the Campaign Proposal Status to &quot;Approved&quot; when you&apos;re happy with the structure. This unlocks Ad Copy generation.</li>
                <li><strong>Build to Google Ads</strong> — After ad copy is generated and reviewed, go to the Build tab to push everything live.</li>
              </ol>
            </div>

            {/* The 7 Engine Steps */}
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: '#111827' }}>The 7 Engine Steps</h4>
              <ol style={{ margin: 0, paddingLeft: 20 }}>
                {STEPS.map((s) => (
                  <li key={s.title} style={{ marginBottom: 4 }}>
                    <strong>{s.title}</strong> — {s.desc}
                  </li>
                ))}
              </ol>
            </div>

            {/* Geo campaign splits */}
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: '#111827' }}>Geo Campaign Splits</h4>
              <p style={{ margin: '0 0 8px' }}>
                Use geo splits when an existing account has state or city intent that should be isolated, e.g. a live NSW campaign that should keep running while a new Sydney campaign is created for Sydney-specific searches.
              </p>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                <li><strong>Existing campaigns stay live</strong> — we do not pause existing campaigns or ad groups because they hold account history and learning.</li>
                <li><strong>New geo campaigns start paused</strong> — OptiMate/CMS-created campaigns, ad groups, ads, and keywords are built paused for review.</li>
                <li><strong>Parent isolation is reviewed</strong> — parent campaigns can receive negative locations and negative keywords, such as excluding Sydney from NSW and adding phrase negative &quot;sydney&quot;.</li>
                <li><strong>Labels are mandatory</strong> — new entities should carry <code>Created by Optimise Digital</code> plus a pending activation/batch label so they can be reviewed and activated safely later.</li>
                <li><strong>Match types stay controlled</strong> — exact match is the default; phrase match requires review; broad match is not used in these builds.</li>
              </ul>
            </div>

            {/* OptiMate prompt guidance */}
            <div style={{ marginBottom: 16, padding: 12, background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8 }}>
              <h4 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: '#312e81' }}>Prompting OptiMate for Geo Reviews</h4>
              <p style={{ margin: '0 0 8px' }}>
                Ask OptiMate to review the account first, then queue a proposal only if there is evidence. Do not ask it to activate geo splits directly yet.
              </p>
              <div style={{ marginBottom: 8 }}>
                <strong>Example prompt:</strong>
                <pre style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', background: '#fff', border: '1px solid #c7d2fe', borderRadius: 6, padding: 10, fontSize: 12, lineHeight: 1.5 }}>
{`Review this account for deeper geo-targeting opportunities over the last 30-90 days. Look for city/state search terms, near-me searches, overlapping geo campaigns, missing negative locations, and missing negative keywords. If there is a clear opportunity, propose a geo campaign split for human review only. Keep existing campaigns live, create any new geo campaign paused, preserve keyword-level CPCs, use exact match by default, and include Created by Optimise Digital plus pending activation labels.`}
                </pre>
              </div>
              <p style={{ margin: 0, color: '#4338ca' }}>
                After the proposal is approved, Growth Tools can build the new geo campaign batch paused. A separate activation workflow should enable only the labelled batch after human review.
              </p>
            </div>

            {/* Automated vs Manual */}
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#111827' }}>Automated vs Manual</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #d1d5db' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>Action</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>How</th>
                  </tr>
                </thead>
                <tbody>
                  {automatedVsManual.map((row) => (
                    <tr key={row.action} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '6px 8px' }}>{row.action}</td>
                      <td style={{ padding: '6px 8px' }}><strong>{row.how}</strong> — {row.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Prerequisites */}
            <div>
              <h4 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: '#111827' }}>Prerequisites</h4>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                <li>Business Name is set</li>
                <li>Website URL is set</li>
                <li>For account comparison: Google Ads Customer ID is linked</li>
                <li>For building: Campaign proposal must be Approved and ad copy must be generated</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={handleClick}
          disabled={isRunning || missingFields.length > 0}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            background: isRunning
              ? '#6b7280'
              : missingFields.length > 0
                ? '#9ca3af'
                : '#7c3aed',
            color: '#fff',
            borderRadius: 8,
            border: 'none',
            fontWeight: 600,
            fontSize: 14,
            cursor: isRunning || missingFields.length > 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {isRunning
            ? 'Generating Proposal...'
            : hasProposal
              ? 'Regenerate Campaign Proposal'
              : 'Generate Campaign Proposal'}
        </button>

        {hasProposal && formattedDate && (
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            Last generated: {formattedDate}
          </span>
        )}
      </div>

      {missingFields.length > 0 && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#9ca3af' }}>
          Fill in {missingFields.join(', ')} before generating a proposal.
        </p>
      )}

      {isStuck && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#f59e0b' }}>
          Previous proposal generation appears stuck. You can safely re-run.
        </p>
      )}

      {isRunning && (
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              width: '100%',
              maxWidth: 400,
              height: 8,
              background: '#e5e7eb',
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: '60%',
                height: '100%',
                background: 'linear-gradient(90deg, #7c3aed, #a78bfa)',
                borderRadius: 4,
                animation: 'pulse 2s infinite',
              }}
            />
          </div>
          <p style={{ marginTop: 6, fontSize: 13, color: '#6b7280' }}>
            {stage || 'Starting...'}
          </p>
          <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }`}</style>
        </div>
      )}

      {message && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#16a34a' }}>{message}</p>
      )}

      {error && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#dc2626' }}>{error}</p>
      )}

      {/* Proposal summary when available */}
      {hasProposal && !isRunning && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            background: '#f5f3ff',
            borderRadius: 8,
            border: '1px solid #ddd6fe',
          }}
        >
          <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: '#5b21b6' }}>
            Proposal Summary
          </h4>
          <ProposalSummary data={fields?.campaignProposal?.value} />
        </div>
      )}

      {/* Email preview */}
      {proposalEmailHtml && !isRunning && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }}>
            Email Preview
          </summary>
          <div
            style={{
              marginTop: 8,
              border: '1px solid #e2e8f0',
              borderRadius: 4,
              background: '#fff',
              maxHeight: 500,
              overflow: 'auto',
            }}
          >
            <iframe
              srcDoc={proposalEmailHtml}
              style={{ width: '100%', height: 500, border: 'none' }}
              title="Campaign proposal email preview"
              sandbox=""
            />
          </div>
        </details>
      )}
    </div>
  )
}

function ProposalSummary({ data }: { data: unknown }) {
  if (!data || typeof data !== 'object') return null

  const proposal = data as Record<string, any>
  const campaigns = proposal.proposedCampaigns || []
  const competitors = proposal.competitors || []
  const pagesToCreate = proposal.landingPagesToCreate || []
  const pagesToImprove = proposal.landingPagesToImprove || []
  const discoveredPages = proposal.discoveredPages || []

  const totalAdGroups = campaigns.reduce(
    (sum: number, c: any) => sum + (c.adGroups?.length || 0),
    0,
  )
  const totalKeywords = campaigns.reduce(
    (sum: number, c: any) =>
      sum + (c.adGroups || []).reduce((s: number, ag: any) => s + (ag.keywords?.length || 0), 0),
    0,
  )
  const totalVolume = campaigns.reduce(
    (sum: number, c: any) => sum + (c.totalMonthlyVolume || 0),
    0,
  )

  return (
    <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
        <Stat label="Pages Crawled" value={discoveredPages.length} />
        <Stat label="Campaigns" value={campaigns.length} />
        <Stat label="Ad Groups" value={totalAdGroups} />
        <Stat label="Keywords" value={totalKeywords} />
        <Stat label="Monthly Volume" value={totalVolume.toLocaleString()} />
        <Stat label="Competitors" value={competitors.length} />
      </div>
      {(pagesToCreate.length > 0 || pagesToImprove.length > 0) && (
        <p style={{ marginTop: 8, fontSize: 12, color: '#7c3aed' }}>
          {pagesToCreate.length > 0 && `${pagesToCreate.length} landing page(s) to create`}
          {pagesToCreate.length > 0 && pagesToImprove.length > 0 && ' | '}
          {pagesToImprove.length > 0 && `${pagesToImprove.length} page(s) to improve`}
        </p>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ textAlign: 'center', padding: '8px 4px', background: '#ede9fe', borderRadius: 6 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#5b21b6' }}>{value}</div>
      <div style={{ fontSize: 11, color: '#6b7280' }}>{label}</div>
    </div>
  )
}

const RunCampaignProposalButton = () => {
  const [renderError, setRenderError] = useState<string | null>(null)

  if (renderError) {
    return (
      <div style={{ padding: 12, background: '#fee2e2', borderRadius: 6, fontSize: 13, color: '#991b1b' }}>
        Campaign Proposal Button error: {renderError}
      </div>
    )
  }

  try {
    return <RunCampaignProposalButtonInner />
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!renderError) setRenderError(msg)
    return (
      <div style={{ padding: 12, background: '#fee2e2', borderRadius: 6, fontSize: 13, color: '#991b1b' }}>
        Campaign Proposal Button error: {msg}
      </div>
    )
  }
}

export default RunCampaignProposalButton
