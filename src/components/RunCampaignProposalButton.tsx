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

function HowItWorks() {
  const [show, setShow] = useState(false)

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span
        style={{
          fontSize: 12,
          color: '#7c3aed',
          cursor: 'pointer',
          fontWeight: 600,
          borderBottom: '1px dotted #7c3aed',
        }}
      >
        How it works
      </span>
      {show && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 8,
            width: 420,
            padding: 16,
            background: '#faf5ff',
            border: '1px solid #ddd6fe',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(124,58,237,0.12)',
            zIndex: 1000,
          }}
        >
          <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#5b21b6' }}>
            Campaign Proposal Engine (7 Steps)
          </h4>
          {STEPS.map((s) => (
            <div key={s.title} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#5b21b6' }}>{s.title}</div>
              <div style={{ fontSize: 11, color: '#4b5563', lineHeight: 1.5 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      )}
    </span>
  )
}

const RunCampaignProposalButtonInner = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stage, setStage] = useState('')
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
          setStage('Generating proposal (this takes 2-5 minutes)...')
        } else if (data.status === 'completed') {
          stopPolling()
          setLoading(false)
          setStage('Complete')
          setMessage('Campaign proposal generated. Refresh the page to see results.')
        } else if (data.status === 'failed') {
          stopPolling()
          setLoading(false)
          setStage('Failed')
          setError('Campaign proposal generation failed. Check server logs.')
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

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || `Failed (${res.status})`)
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

  return (
    <div style={{ marginBottom: 20 }}>
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

        <HowItWorks />

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
