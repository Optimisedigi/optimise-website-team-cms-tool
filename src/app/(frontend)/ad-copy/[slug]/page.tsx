'use client'

import { useParams } from 'next/navigation'
import AdCopyPinGate from '@/components/AdCopyPinGate'
import { useState, useCallback } from 'react'

function AdPreviewMock({ headlines, descriptions, url }: { headlines: string[]; descriptions: string[]; url: string }) {
  const displayUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '')
  return (
    <div style={{ padding: 16, background: '#fff', border: '1px solid #dadce0', borderRadius: 8, maxWidth: 600, marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: '#202124', marginBottom: 2 }}>Sponsored</div>
      <div style={{ fontSize: 13, color: '#1a73e8', marginBottom: 4 }}>{displayUrl}</div>
      <div style={{ fontSize: 18, color: '#1a0dab', marginBottom: 6, lineHeight: 1.3, fontWeight: 400 }}>
        {headlines.filter(Boolean).slice(0, 3).join(' | ')}
      </div>
      <div style={{ fontSize: 14, color: '#4d5156', lineHeight: 1.6 }}>
        {descriptions.filter(Boolean).slice(0, 2).join(' ')}
      </div>
    </div>
  )
}

type AdCopyMap = Record<string, Record<string, { headlines: string[]; descriptions: string[] }>>

function AdCopyEditorContent({
  data, pin,
}: {
  data: {
    businessName: string; slug: string;
    adCopy: AdCopyMap;
    comments: any[];
    landingPages: Record<string, Record<string, string>>;
  };
  pin: string;
}) {
  const [adCopy, setAdCopy] = useState<AdCopyMap>(data.adCopy || {})
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [expandedAg, setExpandedAg] = useState<string | null>(null)

  const campaigns = Object.entries(adCopy)
  const totalAdGroups = campaigns.reduce((s, [, ags]) => s + Object.keys(ags).length, 0)

  // Check if any headline/description is over limit
  const hasErrors = campaigns.some(([, ags]) =>
    Object.values(ags).some(copy =>
      copy.headlines.some(h => h.length > 30) || copy.descriptions.some(d => d.length > 90)
    )
  )

  const updateHeadline = useCallback((camp: string, ag: string, index: number, value: string) => {
    setAdCopy(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      if (next[camp]?.[ag]) next[camp][ag].headlines[index] = value
      return next
    })
  }, [])

  const updateDescription = useCallback((camp: string, ag: string, index: number, value: string) => {
    setAdCopy(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      if (next[camp]?.[ag]) next[camp][ag].descriptions[index] = value
      return next
    })
  }, [])

  const deleteHeadline = useCallback((camp: string, ag: string, index: number) => {
    setAdCopy(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      if (next[camp]?.[ag]) next[camp][ag].headlines.splice(index, 1)
      return next
    })
  }, [])

  const deleteDescription = useCallback((camp: string, ag: string, index: number) => {
    setAdCopy(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      if (next[camp]?.[ag]) next[camp][ag].descriptions.splice(index, 1)
      return next
    })
  }, [])

  const handleSave = useCallback(async () => {
    if (hasErrors) return
    setSaving(true)
    setSaveMsg(null)

    try {
      const res = await fetch('/api/ad-copy-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: data.slug,
          pin,
          action: 'save-edits',
          adCopy,
        }),
      })

      if (res.ok) {
        setSaveMsg('Changes saved successfully.')
      } else {
        const err = await res.json().catch(() => ({}))
        setSaveMsg(`Error: ${(err as any).error || 'Failed to save'}`)
      }
    } catch {
      setSaveMsg('Error: Network failure')
    }
    setSaving(false)
  }, [adCopy, data.slug, pin, hasErrors])

  const handleSubmitForApproval = useCallback(async () => {
    if (hasErrors) return
    setSubmitting(true)
    setSaveMsg(null)

    try {
      // Save edits first
      await fetch('/api/ad-copy-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: data.slug, pin, action: 'save-edits', adCopy }),
      })

      // Then submit for approval
      const res = await fetch('/api/ad-copy-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: data.slug, pin, action: 'submit-approval' }),
      })

      if (res.ok) {
        setSubmitted(true)
        setSaveMsg('Ad copy submitted for approval. The team will review your changes.')
      } else {
        const err = await res.json().catch(() => ({}))
        setSaveMsg(`Error: ${(err as any).error || 'Failed to submit'}`)
      }
    } catch {
      setSaveMsg('Error: Network failure')
    }
    setSubmitting(false)
  }, [adCopy, data.slug, pin, hasErrors])

  if (submitted) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f8fafc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}>
        <div style={{ textAlign: 'center', maxWidth: 480, padding: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1e293b', margin: '0 0 8px' }}>
            Ad Copy Submitted
          </h1>
          <p style={{ fontSize: 15, color: '#64748b', lineHeight: 1.6 }}>
            Your changes to the ad copy for <strong>{data.businessName}</strong> have been saved and submitted for approval. The Optimise Digital team will review and finalise the ad copy.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#f8fafc',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '20px 24px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1e293b' }}>
              Ad Copy Review: {data.businessName}
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
              {campaigns.length} campaigns, {totalAdGroups} ad groups. Edit headlines and descriptions directly, then save.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {saveMsg && (
              <span style={{ fontSize: 12, color: saveMsg.startsWith('Error') ? '#dc2626' : '#059669' }}>
                {saveMsg}
              </span>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || hasErrors}
              style={{
                padding: '10px 20px', fontSize: 14, fontWeight: 600,
                background: saving ? '#6b7280' : hasErrors ? '#9ca3af' : '#64748b',
                color: '#fff', border: 'none', borderRadius: 8,
                cursor: saving || hasErrors ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            <button
              type="button"
              onClick={handleSubmitForApproval}
              disabled={submitting || hasErrors}
              style={{
                padding: '10px 20px', fontSize: 14, fontWeight: 600,
                background: submitting ? '#6b7280' : hasErrors ? '#9ca3af' : '#059669',
                color: '#fff', border: 'none', borderRadius: 8,
                cursor: submitting || hasErrors ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Submitting...' : 'Submit for Approval'}
            </button>
          </div>
        </div>
        {hasErrors && (
          <div style={{ maxWidth: 900, margin: '8px auto 0', fontSize: 12, color: '#dc2626' }}>
            Some headlines or descriptions exceed character limits. Fix them before saving.
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 24px 60px' }}>
        {campaigns.map(([campName, adGroups]) => (
          <div key={campName} style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#334155', margin: '0 0 12px', paddingBottom: 8, borderBottom: '2px solid #e2e8f0' }}>
              {campName}
            </h2>

            {Object.entries(adGroups).map(([agName, copy]) => {
              const agKey = `${campName}::${agName}`
              const isExpanded = expandedAg === agKey
              const landingPage = data.landingPages?.[campName]?.[agName] || ''

              return (
                <div key={agName} style={{ marginBottom: 16, background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                  {/* Ad group header */}
                  <div
                    style={{ padding: '12px 16px', background: '#f9fafb', borderBottom: '1px solid #e2e8f0', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onClick={() => setExpandedAg(isExpanded ? null : agKey)}
                  >
                    <div>
                      <span style={{ fontSize: 15, fontWeight: 600, color: '#1e293b' }}>{agName}</span>
                      <span style={{ marginLeft: 12, fontSize: 12, color: '#64748b' }}>
                        {copy.headlines.length}h {copy.descriptions.length}d
                      </span>
                      {landingPage && (
                        <span style={{ marginLeft: 12, fontSize: 11, color: '#6366f1' }}>
                          {landingPage.replace(/^https?:\/\//, '').slice(0, 50)}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 14, color: '#9ca3af' }}>{isExpanded ? '\u25B2' : '\u25BC'}</span>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: 16 }}>
                      {/* Google Ads Mock */}
                      <AdPreviewMock headlines={copy.headlines} descriptions={copy.descriptions} url={landingPage} />

                      {/* Headlines */}
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                          Headlines (max 30 characters)
                        </div>
                        {copy.headlines.map((h, i) => {
                          const overLimit = h.length > 30
                          return (
                            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                              <span style={{ fontSize: 12, color: '#9ca3af', minWidth: 22 }}>{i + 1}.</span>
                              <input
                                type="text"
                                value={h}
                                onChange={(e) => updateHeadline(campName, agName, i, e.target.value)}
                                maxLength={30}
                                style={{
                                  flex: 1, padding: '8px 10px', fontSize: 14,
                                  border: `1px solid ${overLimit ? '#ef4444' : '#d1d5db'}`,
                                  borderRadius: 6, outline: 'none',
                                  background: overLimit ? '#fef2f2' : '#fff',
                                }}
                              />
                              <span style={{ fontSize: 11, color: overLimit ? '#ef4444' : '#9ca3af', minWidth: 38, textAlign: 'right' }}>
                                {h.length}/30
                              </span>
                              <button
                                type="button"
                                onClick={() => deleteHeadline(campName, agName, i)}
                                style={{
                                  background: 'none', border: 'none', fontSize: 16,
                                  color: '#d1d5db', cursor: 'pointer', padding: '0 4px',
                                }}
                                title="Remove headline"
                              >
                                x
                              </button>
                            </div>
                          )
                        })}
                        {copy.headlines.length < 3 && (
                          <div style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>
                            Minimum 3 headlines required ({copy.headlines.length} currently)
                          </div>
                        )}
                      </div>

                      {/* Descriptions */}
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                          Descriptions (max 90 characters)
                        </div>
                        {copy.descriptions.map((d, i) => {
                          const overLimit = d.length > 90
                          return (
                            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                              <span style={{ fontSize: 12, color: '#9ca3af', minWidth: 22 }}>{i + 1}.</span>
                              <input
                                type="text"
                                value={d}
                                onChange={(e) => updateDescription(campName, agName, i, e.target.value)}
                                maxLength={90}
                                style={{
                                  flex: 1, padding: '8px 10px', fontSize: 14,
                                  border: `1px solid ${overLimit ? '#ef4444' : '#d1d5db'}`,
                                  borderRadius: 6, outline: 'none',
                                  background: overLimit ? '#fef2f2' : '#fff',
                                }}
                              />
                              <span style={{ fontSize: 11, color: overLimit ? '#ef4444' : '#9ca3af', minWidth: 38, textAlign: 'right' }}>
                                {d.length}/90
                              </span>
                              <button
                                type="button"
                                onClick={() => deleteDescription(campName, agName, i)}
                                style={{
                                  background: 'none', border: 'none', fontSize: 16,
                                  color: '#d1d5db', cursor: 'pointer', padding: '0 4px',
                                }}
                                title="Remove description"
                              >
                                x
                              </button>
                            </div>
                          )
                        })}
                        {copy.descriptions.length < 2 && (
                          <div style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>
                            Minimum 2 descriptions required ({copy.descriptions.length} currently)
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AdCopyPreviewPage() {
  const params = useParams()
  const slug = params?.slug as string

  if (!slug) return <div>Not found</div>

  return (
    <AdCopyPinGate slug={slug}>
      {(data, pin) => <AdCopyEditorContent data={data} pin={pin} />}
    </AdCopyPinGate>
  )
}
