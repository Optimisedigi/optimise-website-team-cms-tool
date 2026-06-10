'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState, useRef, useCallback, useEffect } from 'react'

const RunSiteHealthButton = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [loading, setLoading] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stage, setStage] = useState('')
  const [percent, setPercent] = useState(0)
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
        const res = await fetch(`/api/site-health-reports/${id}/audit-status`, {
          credentials: 'include',
        })
        if (!res.ok) return
        const data = await res.json()

        if (data.stage) setStage(data.stage)
        if (typeof data.percent === 'number') setPercent(data.percent)

        if (data.status === 'completed') {
          stopPolling()
          setLoading(false)
          setPercent(100)
          setStage('Complete')
          setMessage('Health audit completed. Refresh the page to see results.')
        } else if (data.status === 'failed') {
          stopPolling()
          setLoading(false)
          setPercent(100)
          setStage('Failed')
          setError(data.error || 'Audit failed')
        }
      } catch {
        // Network hiccup — keep polling
      }
    }, 5000)
  }, [id, stopPolling])

  useEffect(() => () => stopPolling(), [stopPolling])

  if (!id) return null

  const siteUrl = fields?.siteUrl?.value as string | undefined
  const hasSiteUrl = !!siteUrl?.trim()
  const auditStatus = fields?.auditStatus?.value as string | undefined
  const isRunning = auditStatus === 'running' || loading

  const handleClick = async () => {
    if (!hasSiteUrl) return
    setLoading(true)
    setError(null)
    setMessage(null)
    setStage('Starting...')
    setPercent(0)

    try {
      const res = await fetch(`/api/site-health-reports/${id}/run`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || `Request failed (${res.status})`)
      }

      startPolling()
    } catch (err: any) {
      setLoading(false)
      setError(err.message || 'Something went wrong')
    }
  }

  return (
    // `position: relative; z-index: 1` gives this field its own stacking context
    // so the app-header's and floating save bar's `backdrop-filter: blur()` layers
    // don't sample and blur it — a Chromium backdrop-filter artifact that otherwise
    // blurs in-flow content sitting between those two blurred sticky layers.
    <div style={{ marginTop: 6, marginBottom: 20, position: 'relative', zIndex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {/* How This Works (Team Guide) */}
        <div
          style={{
            flex: '1 1 340px',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            overflow: 'hidden',
            background: '#f9fafb',
          }}
        >
          <button
            type="button"
            onClick={() => setShowHelp(!showHelp)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              color: '#374151',
            }}
          >
            <span>{'\uD83D\uDCD6'} How This Works (Team Guide)</span>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>{showHelp ? 'Hide' : 'Show'}</span>
          </button>
          {showHelp && (
            <div style={{ padding: '0 14px 14px', fontSize: 13, lineHeight: 1.6, color: '#4b5563' }}>
              <p style={{ margin: '0 0 8px' }}>
                <strong>Overview:</strong> Site Health Reports crawl a client&apos;s website to find SEO issues — like an Ahrefs site audit but built into the CMS. The report checks every page for technical SEO problems (broken links, missing titles, slow pages, redirect chains, etc.) and gives a health score.
              </p>

              <p style={{ margin: '0 0 4px', fontWeight: 600 }}>Step-by-Step:</p>
              <ol style={{ margin: '0 0 8px', paddingLeft: 18 }}>
                <li><strong>Create a report</strong> — Go to Site Health Reports {'>'} Create New. Select the client and enter their website URL.</li>
                <li><strong>Click &quot;Run Health Audit&quot;</strong> — This sends the site URL to Growth Tools, which crawls up to 200 pages (configurable per client).</li>
                <li><strong>Wait for results</strong> — The crawl takes 1-5 minutes depending on site size. A progress bar shows the current stage. You can leave the page and come back.</li>
                <li><strong>Review the report</strong> — Once complete, refresh the page. The report view shows: health score, issues by severity (critical/warning/notice), issues by category, and a per-page breakdown.</li>
                <li><strong>Compare month-over-month</strong> — If a previous report exists for the same client, the report auto-generates a comparison showing score change, new issues, and fixed issues.</li>
              </ol>

              <p style={{ margin: '0 0 4px', fontWeight: 600 }}>Automated vs Manual:</p>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 12,
                  marginBottom: 8,
                }}
              >
                <thead>
                  <tr style={{ borderBottom: '2px solid #d1d5db' }}>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Action</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>How</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '4px 8px' }}>Creating a report</td>
                    <td style={{ padding: '4px 8px' }}><strong>Manual</strong> — you create a new report record and click Run</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '4px 8px' }}>Running the crawl</td>
                    <td style={{ padding: '4px 8px' }}><strong>Automated</strong> — Growth Tools crawls the site and returns results</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '4px 8px' }}>Monthly re-runs</td>
                    <td style={{ padding: '4px 8px' }}><strong>Automated</strong> — a cron job (<code>/api/site-health/cron</code>) runs monthly for clients with SEO automation enabled</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '4px 8px' }}>Reviewing results</td>
                    <td style={{ padding: '4px 8px' }}><strong>Manual</strong> — you review the report and decide on fixes</td>
                  </tr>
                </tbody>
              </table>

              <p style={{ margin: '0 0 4px', fontWeight: 600 }}>Prerequisites:</p>
              <ul style={{ margin: '0 0 8px', paddingLeft: 18 }}>
                <li>Client record exists in the CMS</li>
                <li>Website URL is entered on the report</li>
                <li>For automated monthly runs: client needs <code>seoAuto.enabled</code> turned on</li>
              </ul>

              <p style={{ margin: '8px 0 0', fontSize: 12, color: '#6b7280' }}>
                💡 <strong>Tip:</strong> GSC data (indexed pages, not-indexed pages, clicks, impressions) is automatically included if the client has Google Search Console connected.
              </p>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleClick}
          disabled={isRunning || !hasSiteUrl}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '10px 20px',
            minHeight: 40,
            background: isRunning ? '#6b7280' : !hasSiteUrl ? '#9ca3af' : '#059669',
            color: '#fff',
            borderRadius: 8,
            border: 'none',
            fontWeight: 600,
            fontSize: 14,
            cursor: isRunning || !hasSiteUrl ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {isRunning ? 'Running Health Audit...' : 'Run Health Audit'}
        </button>
      </div>

      {!hasSiteUrl && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#9ca3af' }}>
          Enter a Site URL first.
        </p>
      )}

      {isRunning && (
        <div style={{ marginTop: 12 }}>
          <div style={{
            height: 6,
            background: '#e5e7eb',
            borderRadius: 3,
            overflow: 'hidden',
            maxWidth: 400,
          }}>
            <div style={{
              height: '100%',
              width: `${percent}%`,
              background: '#059669',
              borderRadius: 3,
              transition: 'width 0.5s ease',
            }} />
          </div>
          {stage && (
            <p style={{ marginTop: 6, fontSize: 13, color: '#6b7280' }}>
              {stage} ({percent}%)
            </p>
          )}
        </div>
      )}

      {error && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#dc2626' }}>{error}</p>
      )}

      {message && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#059669', fontWeight: 500 }}>{message}</p>
      )}
    </div>
  )
}

export default RunSiteHealthButton
