'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState, useRef, useCallback, useEffect } from 'react'

const GenerateAdCopyButtonInner = () => {
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
        const res = await fetch(`/api/google-ads-audits/${id}/ad-copy-status`, { credentials: 'include' })
        if (!res.ok) return
        const data = await res.json()

        if (data.status === 'generating') {
          setStage('Generating ad copy via AI (this may take 1-2 minutes)...')
        } else if (data.status === 'generated') {
          stopPolling()
          setLoading(false)
          setStage('')
          setMessage('Ad copy generated successfully. Refresh the page to see results.')
        } else if (data.status === 'draft') {
          // Reverted to draft = generation failed
          stopPolling()
          setLoading(false)
          setStage('')
          setError('Ad copy generation failed. Check server logs.')
        }
      } catch {
        // Network hiccup — keep polling
      }
    }, 5000)
  }, [id, stopPolling])

  useEffect(() => () => stopPolling(), [stopPolling])

  if (!id) return null

  const proposalStatus = fields?.campaignProposalStatus?.value as string | undefined
  const adCopyStatus = fields?.adCopyStatus?.value as string | undefined
  const hasAdCopy = !!fields?.generatedAdCopy?.value
  const generatedAt = fields?.adCopyGeneratedAt?.value as string | undefined

  const isApproved = proposalStatus === 'approved'
  const isGenerating = loading || adCopyStatus === 'generating'

  const formattedDate = generatedAt
    ? new Date(generatedAt).toLocaleString('en-AU', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : null

  const handleClick = async () => {
    setLoading(true)
    setMessage(null)
    setError(null)
    setStage('Starting ad copy generation...')

    try {
      const res = await fetch(`/api/google-ads-audits/${id}/generate-ad-copy`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!res.ok) {
        let errorMsg = `Failed (${res.status})`
        try {
          const data = await res.json()
          if (data.error) errorMsg = data.error
        } catch { /* not JSON */ }
        setError(errorMsg)
        setLoading(false)
        return
      }

      setStage('Generating ad copy via AI (this may take 1-2 minutes)...')
      startPolling()
    } catch {
      setError('Network error. Check your connection and try again.')
      setLoading(false)
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      {/* How This Works (Team Guide) */}
      <div style={{ marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setShowHelp((v) => !v)}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            color: '#6b7280',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span style={{ display: 'inline-block', transform: showHelp ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>▶</span>
          How This Works (Team Guide)
        </button>

        {showHelp && (
          <div
            style={{
              marginTop: 8,
              padding: 16,
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              fontSize: 13,
              lineHeight: 1.6,
              color: '#374151',
            }}
          >
            <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Overview</p>
            <p style={{ margin: '0 0 12px' }}>
              This generates Google Ads responsive search ad (RSA) copy for every campaign and ad group
              in the approved campaign proposal. AI writes headlines (max 30 chars) and descriptions
              (max 90 chars) tailored to each ad group&apos;s keywords and landing page.
            </p>

            <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Step-by-Step</p>
            <ol style={{ margin: '0 0 12px', paddingLeft: 20 }}>
              <li style={{ marginBottom: 4 }}>
                <strong>Approve the campaign proposal first</strong> — Go to the Campaign Proposal tab
                and make sure the proposal status is &quot;Approved&quot;. Ad copy can only be generated
                from an approved proposal.
              </li>
              <li style={{ marginBottom: 4 }}>
                <strong>Add brand headlines</strong> (optional) — Enter brand-specific headlines in the
                field above (one per line, max 30 chars each). These get included in every ad group.
                E.g. &quot;Call Us Today&quot;, &quot;Since 1985&quot;.
              </li>
              <li style={{ marginBottom: 4 }}>
                <strong>Click &quot;Generate Ad Copy&quot;</strong> — AI generates headlines and
                descriptions for each ad group. This takes 1-2 minutes.
              </li>
              <li style={{ marginBottom: 4 }}>
                <strong>Review and edit</strong> — The Ad Copy Editor below shows a Google Ads preview
                mock for each ad group. Click any headline or description to edit it inline.
              </li>
              <li style={{ marginBottom: 4 }}>
                <strong>Publish for client review</strong> (optional) — Toggle &quot;Ad Copy
                Published&quot; and share the presentation link (from Overview tab) with the client.
                They can view the ad copy and leave comments using their PIN.
              </li>
              <li style={{ marginBottom: 4 }}>
                <strong>Build campaigns</strong> — Once ad copy is finalized, go to the Build tab to
                push everything (campaigns, keywords, and ad copy) to Google Ads.
              </li>
            </ol>

            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                marginBottom: 12,
                fontSize: 13,
              }}
            >
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>Action</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>How</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '6px 8px' }}>Generating ad copy</td>
                  <td style={{ padding: '6px 8px' }}><strong>Automated</strong> — AI generates all headlines and descriptions</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '6px 8px' }}>Editing ad copy</td>
                  <td style={{ padding: '6px 8px' }}><strong>Manual</strong> — you review and tweak in the editor</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '6px 8px' }}>Client review</td>
                  <td style={{ padding: '6px 8px' }}><strong>Self-service</strong> — client views and comments via PIN-protected link</td>
                </tr>
                <tr>
                  <td style={{ padding: '6px 8px' }}>Pushing to Google Ads</td>
                  <td style={{ padding: '6px 8px' }}><strong>Manual</strong> — you click Build in the Build tab</td>
                </tr>
              </tbody>
            </table>

            <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
              <strong>Tip:</strong> You can regenerate ad copy at any time — it replaces the previous
              version. Edit inline before building to Google Ads.
            </p>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={handleClick}
          disabled={!isApproved || isGenerating}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            background: isGenerating ? '#6b7280' : !isApproved ? '#9ca3af' : '#7c3aed',
            color: '#fff',
            borderRadius: 8,
            border: 'none',
            fontWeight: 600,
            fontSize: 14,
            cursor: !isApproved || isGenerating ? 'not-allowed' : 'pointer',
          }}
        >
          {isGenerating
            ? 'Generating Ad Copy...'
            : hasAdCopy
              ? 'Regenerate Ad Copy'
              : 'Generate Ad Copy'}
        </button>

        {hasAdCopy && formattedDate && (
          <span style={{ fontSize: 12, color: '#6b7280' }}>Last generated: {formattedDate}</span>
        )}
      </div>

      {!isApproved && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#9ca3af' }}>
          Approve a campaign proposal first before generating ad copy.
        </p>
      )}

      {isGenerating && (
        <div style={{ marginTop: 12 }}>
          <div style={{ width: '100%', maxWidth: 400, height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
            <div
              style={{
                width: '60%', height: '100%',
                background: 'linear-gradient(90deg, #7c3aed, #a78bfa)',
                borderRadius: 4, animation: 'pulse 2s infinite',
              }}
            />
          </div>
          <p style={{ marginTop: 6, fontSize: 13, color: '#6b7280' }}>{stage}</p>
          <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }`}</style>
        </div>
      )}

      {message && <p style={{ marginTop: 8, fontSize: 13, color: '#16a34a' }}>{message}</p>}
      {error && <p style={{ marginTop: 8, fontSize: 13, color: '#dc2626' }}>{error}</p>}
    </div>
  )
}

const GenerateAdCopyButton = () => {
  const [renderError, setRenderError] = useState<string | null>(null)

  if (renderError) {
    return (
      <div style={{ padding: 12, background: '#fee2e2', borderRadius: 6, fontSize: 13, color: '#991b1b' }}>
        Generate Ad Copy error: {renderError}
      </div>
    )
  }

  try {
    return <GenerateAdCopyButtonInner />
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!renderError) setRenderError(msg)
    return (
      <div style={{ padding: 12, background: '#fee2e2', borderRadius: 6, fontSize: 13, color: '#991b1b' }}>
        Generate Ad Copy error: {msg}
      </div>
    )
  }
}

export default GenerateAdCopyButton
