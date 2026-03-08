'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState, useEffect, useRef, useCallback } from 'react'

interface AuditResult {
  status: string
  summary?: {
    gtmLoaded: boolean
    ga4Configured: boolean
    eventsDetected: number
    issuesCount: number
    gtmContainerIds: string
    measurementIds: string
    consentModeDetected: boolean
  }
  issues?: Array<{
    severity: string
    category: string
    message: string
    fix: string
    autoFixable: boolean
    fixed: boolean
  }>
  events?: Array<{
    name: string
    measurementId: string
  }>
  missingEvents?: string[]
  canAutoFix?: boolean
  error?: string
}

const CheckTagSetupButton = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [loading, setLoading] = useState(false)
  const [polling, setPolling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AuditResult | null>(null)
  const [auditLink, setAuditLink] = useState<string | null>(null)
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  if (!id) return null

  const websiteUrl = fields?.websiteUrl?.value as string | undefined
  const websiteType = fields?.websiteType?.value as string | undefined
  const hasUrl = !!websiteUrl?.trim()

  const pollForResult = useCallback(async (auditId: string) => {
    try {
      const res = await fetch(`/api/tag-setup-audits/${auditId}`, {
        credentials: 'include',
      })
      if (!res.ok) return

      const audit = await res.json()

      if (audit.status && audit.status !== 'running' && audit.status !== 'pending') {
        setResult(audit)
        setPolling(false)
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
      }
    } catch {
      // Retry on next poll
    }
  }, [])

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
      }
    }
  }, [])

  const handleClick = async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    setAuditLink(null)

    try {
      const res = await fetch(`/api/clients/${id}/check-tag-setup`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || `Failed to start audit (${res.status})`)
      }

      const data = await res.json()
      const auditId = data.auditId

      setAuditLink(`/admin/collections/tag-setup-audits/${auditId}`)
      setPolling(true)

      // Poll for results every 3 seconds
      pollRef.current = setInterval(() => pollForResult(auditId), 3000)

      // Also do initial poll after 5 seconds (typical completion time)
      setTimeout(() => pollForResult(auditId), 5000)
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const statusColors: Record<string, string> = {
    healthy: '#16a34a',
    warnings: '#d97706',
    critical_issues: '#dc2626',
    not_configured: '#dc2626',
    error: '#dc2626',
    pending: '#6b7280',
    running: '#2563eb',
  }

  const statusLabels: Record<string, string> = {
    healthy: 'Healthy - All Good',
    warnings: 'Warnings Found',
    critical_issues: 'Critical Issues',
    not_configured: 'Not Configured',
    error: 'Error',
  }

  const severityColors: Record<string, string> = {
    critical: '#dc2626',
    warning: '#d97706',
    info: '#2563eb',
  }

  const severityIcons: Record<string, string> = {
    critical: '\u274C',
    warning: '\u26A0\uFE0F',
    info: '\u2139\uFE0F',
  }

  const isBuiltByUs = websiteType === 'built_by_us'
  const [showHelp, setShowHelp] = useState(false)

  return (
    <div style={{ marginBottom: 24 }}>
      {/* How it works */}
      <div
        style={{
          marginBottom: 16,
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
          <span>{'\uD83D\uDCD6'} How this works</span>
          <span style={{ fontSize: 11, color: '#9ca3af' }}>{showHelp ? 'Hide' : 'Show'}</span>
        </button>
        {showHelp && (
          <div style={{ padding: '0 14px 14px', fontSize: 13, lineHeight: 1.6, color: '#4b5563' }}>
            <p style={{ margin: '0 0 8px' }}>
              This tool visits the client's website with a real browser, checks whether Google Tag Manager and GA4 are installed correctly, and reports what's working and what's not.
            </p>
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              <li><strong>Set the fields below</strong> (optional but recommended): enter the client's GA4 Measurement ID, GTM Container ID, and any events you expect to see (e.g. purchase, generate_lead).</li>
              <li><strong>Press "Check Tag Setup"</strong>. A stealth browser loads the website URL from the Business tab, scrolls the page, and intercepts all GA4 network calls.</li>
              <li><strong>Results appear inline</strong> in about 15-30 seconds: GTM status, GA4 status, which events are firing, which are missing, and any configuration issues.</li>
              <li><strong>Each issue includes fix instructions</strong> tailored to the client's platform (Shopify, WordPress, etc.). If the site was built by us, issues are tagged as auto-fixable.</li>
            </ol>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#6b7280' }}>
              Every check is saved to the Tag Setup Audits collection so you can track improvements over time.
            </p>
          </div>
        )}
      </div>

      {/* Button */}
      <button
        type="button"
        onClick={handleClick}
        disabled={loading || polling || !hasUrl}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 20px',
          background: loading || polling ? '#6b7280' : !hasUrl ? '#9ca3af' : '#7c3aed',
          color: '#fff',
          borderRadius: 8,
          border: 'none',
          fontWeight: 600,
          fontSize: 14,
          cursor: loading || polling || !hasUrl ? 'not-allowed' : 'pointer',
        }}
      >
        {loading || polling ? 'Checking Tag Setup...' : 'Check Tag Setup'}
      </button>

      {!hasUrl && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#9ca3af' }}>
          Enter a website URL first (Business tab).
        </p>
      )}

      {polling && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#2563eb' }}>
          Scanning website for GA4 and GTM tags... This takes about 15-30 seconds.
        </p>
      )}

      {/* Results */}
      {result && (
        <div style={{ marginTop: 16, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          {/* Status Header */}
          <div
            style={{
              padding: '12px 16px',
              background: statusColors[result.status] || '#6b7280',
              color: '#fff',
              fontWeight: 600,
              fontSize: 15,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>{statusLabels[result.status] || result.status}</span>
            {result.canAutoFix && result.status !== 'healthy' && (
              <span
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 12,
                }}
              >
                Built by us - can fix directly
              </span>
            )}
          </div>

          {/* Summary */}
          {result.summary && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>GTM</div>
                  <div style={{ fontWeight: 600, color: result.summary.gtmLoaded ? '#16a34a' : '#dc2626' }}>
                    {result.summary.gtmLoaded ? 'Loaded' : 'Not Found'}
                  </div>
                  {result.summary.gtmContainerIds && (
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{result.summary.gtmContainerIds}</div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>GA4</div>
                  <div style={{ fontWeight: 600, color: result.summary.ga4Configured ? '#16a34a' : '#dc2626' }}>
                    {result.summary.ga4Configured ? 'Configured' : 'Not Found'}
                  </div>
                  {result.summary.measurementIds && (
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{result.summary.measurementIds}</div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>Events</div>
                  <div style={{ fontWeight: 600 }}>{result.summary.eventsDetected} detected</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>Consent Mode</div>
                  <div style={{ fontWeight: 600 }}>
                    {result.summary.consentModeDetected ? 'Detected' : 'Not Found'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Events List */}
          {result.events && result.events.length > 0 && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Events Firing</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {result.events.map((ev, i) => (
                  <span
                    key={i}
                    style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      borderRadius: 4,
                      fontSize: 12,
                      color: '#166534',
                    }}
                  >
                    {ev.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Missing Events */}
          {result.missingEvents && result.missingEvents.length > 0 && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#dc2626' }}>
                Missing Expected Events
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {result.missingEvents.map((ev, i) => (
                  <span
                    key={i}
                    style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: 4,
                      fontSize: 12,
                      color: '#991b1b',
                    }}
                  >
                    {ev}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Issues with Fix Instructions */}
          {result.issues && result.issues.length > 0 && (
            <div style={{ padding: '12px 16px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                Issues ({result.issues.length})
              </div>
              {result.issues.map((issue, i) => (
                <div
                  key={i}
                  style={{
                    padding: '10px 12px',
                    marginBottom: 8,
                    borderRadius: 6,
                    border: `1px solid ${issue.severity === 'critical' ? '#fecaca' : '#fde68a'}`,
                    background: issue.severity === 'critical' ? '#fef2f2' : '#fffbeb',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>
                      {severityIcons[issue.severity] || '\u2139\uFE0F'}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                        {issue.message}
                        {issue.autoFixable && isBuiltByUs && (
                          <span
                            style={{
                              marginLeft: 8,
                              padding: '1px 6px',
                              background: '#dbeafe',
                              color: '#1e40af',
                              borderRadius: 3,
                              fontSize: 11,
                              fontWeight: 500,
                            }}
                          >
                            Auto-fixable
                          </span>
                        )}
                      </div>
                      {issue.fix && (
                        <div
                          style={{
                            fontSize: 12,
                            color: '#374151',
                            lineHeight: 1.5,
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          <strong>How to fix:</strong> {issue.fix}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {result.error && (
            <div style={{ padding: '12px 16px', color: '#dc2626', fontSize: 13 }}>
              Error: {result.error}
            </div>
          )}
        </div>
      )}

      {/* Link to full audit record */}
      {auditLink && !polling && (
        <p style={{ marginTop: 8, fontSize: 13 }}>
          <a href={auditLink} style={{ color: '#2563eb', textDecoration: 'underline' }}>
            View full audit record
          </a>
        </p>
      )}

      {/* Error */}
      {error && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#dc2626' }}>{error}</p>
      )}
    </div>
  )
}

export default CheckTagSetupButton
