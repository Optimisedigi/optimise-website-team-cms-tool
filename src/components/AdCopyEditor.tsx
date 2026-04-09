'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState, useCallback } from 'react'

type AdCopyEntry = { text: string; pinnedPosition?: 1 | 2 | 3 | null }
type AdCopySet = { headlines: (string | AdCopyEntry)[]; descriptions: (string | AdCopyEntry)[] }
type AdCopyMap = Record<string, Record<string, AdCopySet>>
type Comment = {
  id: string
  campaignName: string
  adGroupName: string
  lineType?: 'headline' | 'description'
  lineIndex?: number
  author: string
  text: string
  createdAt: string
}

function getText(item: string | AdCopyEntry): string {
  return typeof item === 'string' ? item : (item?.text ?? '')
}
function getPin(item: string | AdCopyEntry): 1 | 2 | 3 | null {
  return typeof item === 'string' ? null : (item?.pinnedPosition || null)
}

// ---------------------------------------------------------------------------
// Google Ads Preview Mock
// ---------------------------------------------------------------------------

function AdPreview({ headlines, descriptions, url }: { headlines: (string | AdCopyEntry)[]; descriptions: (string | AdCopyEntry)[]; url: string }) {
  const displayUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '')
  return (
    <div style={{ padding: 12, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, maxWidth: 600, marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: '#202124', marginBottom: 2 }}>Sponsored</div>
      <div style={{ fontSize: 12, color: '#1a73e8', marginBottom: 2, fontWeight: 500 }}>{displayUrl}</div>
      <div style={{ fontSize: 16, color: '#1a0dab', marginBottom: 4, lineHeight: 1.3 }}>
        {headlines.slice(0, 3).map(getText).join(' | ')}
      </div>
      <div style={{ fontSize: 13, color: '#4d5156', lineHeight: 1.5 }}>
        {descriptions.slice(0, 2).map(getText).join(' ')}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Editor
// ---------------------------------------------------------------------------

const AdCopyEditorInner = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()

  const adCopyRaw = fields?.generatedAdCopy?.value
  const commentsRaw = fields?.adCopyComments?.value
  const adCopyPublished = fields?.adCopyPublished?.value as boolean | undefined
  const presentationPin = fields?.presentationPin?.value as string | undefined
  const slug = fields?.slug?.value as string | undefined
  const proposalRaw = fields?.campaignProposal?.value

  // Parse ad copy
  let adCopy: AdCopyMap = {}
  if (adCopyRaw && typeof adCopyRaw === 'object') {
    adCopy = adCopyRaw as AdCopyMap
  } else if (typeof adCopyRaw === 'string') {
    try { adCopy = JSON.parse(adCopyRaw) } catch { /* invalid */ }
  }

  // Parse comments
  let comments: Comment[] = []
  if (Array.isArray(commentsRaw)) {
    comments = commentsRaw as Comment[]
  } else if (typeof commentsRaw === 'string') {
    try { comments = JSON.parse(commentsRaw) } catch { /* invalid */ }
  }

  // Parse proposal for landing pages
  let proposalCampaigns: any[] = []
  if (proposalRaw) {
    const data = typeof proposalRaw === 'string' ? JSON.parse(proposalRaw) : proposalRaw
    proposalCampaigns = data?.proposedCampaigns || []
  }

  // Build landing page lookup
  const landingPageMap: Record<string, Record<string, string>> = {}
  for (const camp of proposalCampaigns) {
    if (!landingPageMap[camp.name]) landingPageMap[camp.name] = {}
    for (const ag of camp.adGroups || []) {
      landingPageMap[camp.name][ag.name] = ag.landingPage?.url || ''
    }
  }

  const [editableCopy, setEditableCopy] = useState<AdCopyMap>(adCopy)
  const [expandedAg, setExpandedAg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [publishToggle, setPublishToggle] = useState(!!adCopyPublished)

  const campaignNames = Object.keys(editableCopy)

  if (campaignNames.length === 0) {
    return (
      <div style={{ padding: 16, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', color: '#9ca3af', fontSize: 13 }}>
        No ad copy generated yet. Use the button above to generate ad copy.
      </div>
    )
  }

  const updateCopy = (campName: string, agName: string, field: 'headlines' | 'descriptions', index: number, value: string) => {
    setEditableCopy((prev) => {
      const next = { ...prev }
      if (!next[campName]) next[campName] = {}
      if (!next[campName][agName]) next[campName][agName] = { headlines: [], descriptions: [] }
      const arr = [...(next[campName][agName][field] || [])]
      const existing = arr[index]
      const pin = getPin(existing)
      arr[index] = pin ? { text: value, pinnedPosition: pin } : value
      next[campName] = { ...next[campName], [agName]: { ...next[campName][agName], [field]: arr } }
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveMessage(null)
    try {
      const res = await fetch(`/api/google-ads-audits/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          generatedAdCopy: editableCopy,
          adCopyPublished: publishToggle,
          ...(publishToggle && !adCopyPublished ? { adCopyStatus: 'published', adCopyPublishedAt: new Date().toISOString() } : {}),
        }),
      })
      if (res.ok) {
        setSaveMessage('Saved successfully.')
      } else {
        const err = await res.json().catch(() => ({}))
        setSaveMessage(`Error: ${(err as any).message || res.statusText}`)
      }
    } catch {
      setSaveMessage('Error: Network failure')
    }
    setSaving(false)
  }

  // Count totals
  const totalAdGroups = campaignNames.reduce((s, c) => s + Object.keys(editableCopy[c]).length, 0)
  const totalHeadlines = campaignNames.reduce(
    (s, c) => s + Object.values(editableCopy[c]).reduce((s2, ag) => s2 + (ag.headlines?.length || 0), 0), 0
  )

  const getComments = (campName: string, agName: string) =>
    comments.filter((c) => c.campaignName === campName && c.adGroupName === agName)

  return (
    <div style={{ padding: 16, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
      {/* Header + stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#1e293b' }}>Ad Copy Editor</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
            {campaignNames.length} campaigns, {totalAdGroups} ad groups, {totalHeadlines} headlines
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '8px 16px', fontSize: 13, fontWeight: 600,
              background: saving ? '#6b7280' : '#059669', color: '#fff',
              borderRadius: 6, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving...' : 'Save Ad Copy'}
          </button>
        </div>
      </div>

      {saveMessage && (
        <div style={{
          padding: '6px 12px', marginBottom: 12, borderRadius: 6, fontSize: 12,
          background: saveMessage.startsWith('Error') ? '#fee2e2' : '#ecfdf5',
          color: saveMessage.startsWith('Error') ? '#991b1b' : '#065f46',
        }}>
          {saveMessage}
        </div>
      )}

      {/* Publish controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '10px 14px', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={publishToggle}
            onChange={(e) => setPublishToggle(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: '#2563eb' }}
          />
          <span style={{ fontWeight: 600, color: '#1e40af' }}>Publish Ad Copy Preview</span>
        </label>
        {presentationPin && (
          <span style={{ fontSize: 12, color: '#64748b' }}>
            PIN: <strong>{presentationPin}</strong>
          </span>
        )}
        {slug && publishToggle && (
          <a
            href={`/ad-copy/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12, color: '#2563eb', textDecoration: 'underline', cursor: 'pointer' }}
          >
            Open Preview: /ad-copy/{slug}
          </a>
        )}
      </div>

      {/* Campaign accordion */}
      {campaignNames.map((campName) => (
        <div key={campName} style={{ marginBottom: 12 }}>
          <div style={{
            padding: '10px 14px', background: '#e2e8f0', borderRadius: '8px 8px 0 0',
            fontWeight: 600, fontSize: 14, color: '#334155',
          }}>
            {campName}
            <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: '#64748b' }}>
              {Object.keys(editableCopy[campName]).length} ad groups
            </span>
          </div>

          {Object.entries(editableCopy[campName]).map(([agName, copy]) => {
            const agKey = `${campName}::${agName}`
            const isExpanded = expandedAg === agKey
            const agComments = getComments(campName, agName)
            const landingPage = landingPageMap[campName]?.[agName] || ''

            return (
              <div key={agName} style={{ border: '1px solid #e2e8f0', borderTop: 'none' }}>
                <div
                  style={{
                    padding: '8px 14px', display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', cursor: 'pointer', background: isExpanded ? '#f1f5f9' : '#fff',
                  }}
                  onClick={() => setExpandedAg(isExpanded ? null : agKey)}
                >
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>{agName}</span>
                    <span style={{ marginLeft: 8, fontSize: 11, color: '#9ca3af' }}>
                      {(copy.headlines || []).length}h {(copy.descriptions || []).length}d
                    </span>
                    {agComments.length > 0 && (
                      <span style={{ marginLeft: 8, fontSize: 11, padding: '1px 6px', borderRadius: 10, background: '#fef3c7', color: '#92400e' }}>
                        {agComments.length} comment{agComments.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>{isExpanded ? '\u25B2' : '\u25BC'}</span>
                </div>

                {isExpanded && (
                  <div style={{ padding: '12px 14px', background: '#fafafa' }}>
                    {/* Google Ads Preview */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Google Ads Preview</div>
                      <AdPreview
                        headlines={copy.headlines || []}
                        descriptions={copy.descriptions || []}
                        url={landingPage}
                      />
                    </div>

                    {/* Headlines */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                        Headlines (max 30 chars each)
                      </div>
                      {(copy.headlines || []).map((h, i) => {
                        const text = getText(h)
                        const pin = getPin(h)
                        return (
                          <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 3, alignItems: 'center' }}>
                            <span style={{ fontSize: 11, color: '#9ca3af', minWidth: 20 }}>{i + 1}.</span>
                            <input
                              type="text"
                              value={text}
                              maxLength={30}
                              onChange={(e) => updateCopy(campName, agName, 'headlines', i, e.target.value)}
                              style={{
                                flex: 1, padding: '4px 8px', fontSize: 12,
                                border: `1px solid ${text.length > 30 ? '#ef4444' : '#d1d5db'}`,
                                borderRadius: 4,
                              }}
                            />
                            {pin && (
                              <span style={{ fontSize: 9, fontWeight: 700, color: '#7c3aed', background: '#ede9fe', padding: '1px 5px', borderRadius: 4 }}>
                                Pin {pin}
                              </span>
                            )}
                            <span style={{ fontSize: 10, color: text.length > 30 ? '#ef4444' : '#9ca3af', minWidth: 35 }}>
                              {text.length}/30
                            </span>
                          </div>
                        )
                      })}
                    </div>

                    {/* Descriptions */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                        Descriptions (max 90 chars each)
                      </div>
                      {(copy.descriptions || []).map((d, i) => {
                        const text = getText(d)
                        const pin = getPin(d)
                        return (
                          <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 3, alignItems: 'center' }}>
                            <span style={{ fontSize: 11, color: '#9ca3af', minWidth: 20 }}>{i + 1}.</span>
                            <input
                              type="text"
                              value={text}
                              maxLength={90}
                              onChange={(e) => updateCopy(campName, agName, 'descriptions', i, e.target.value)}
                              style={{
                                flex: 1, padding: '4px 8px', fontSize: 12,
                                border: `1px solid ${text.length > 90 ? '#ef4444' : '#d1d5db'}`,
                                borderRadius: 4,
                              }}
                            />
                            {pin && (
                              <span style={{ fontSize: 9, fontWeight: 700, color: '#7c3aed', background: '#ede9fe', padding: '1px 5px', borderRadius: 4 }}>
                                Pin {pin}
                              </span>
                            )}
                            <span style={{ fontSize: 10, color: text.length > 90 ? '#ef4444' : '#9ca3af', minWidth: 35 }}>
                              {text.length}/90
                            </span>
                          </div>
                        )
                      })}
                    </div>

                    {/* Comments for this ad group */}
                    {agComments.length > 0 && (
                      <div style={{ marginTop: 8, padding: 10, background: '#fef3c7', borderRadius: 6, border: '1px solid #fde68a' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#92400e', marginBottom: 6 }}>
                          Client Comments ({agComments.length})
                        </div>
                        {agComments.map((c) => (
                          <div key={c.id} style={{ marginBottom: 6, fontSize: 12, color: '#78350f' }}>
                            <strong>{c.author}</strong>
                            {c.lineType && (
                              <span style={{ color: '#a16207' }}>
                                {' '}on {c.lineType} #{(c.lineIndex ?? 0) + 1}
                              </span>
                            )}
                            <span style={{ color: '#a16207' }}>
                              {' '}{new Date(c.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                            </span>
                            <div style={{ marginTop: 2 }}>{c.text}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

const AdCopyEditor = () => {
  const [renderError, setRenderError] = useState<string | null>(null)

  if (renderError) {
    return (
      <div style={{ padding: 12, background: '#fee2e2', borderRadius: 6, fontSize: 13, color: '#991b1b' }}>
        Ad Copy Editor error: {renderError}
      </div>
    )
  }

  try {
    return <AdCopyEditorInner />
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!renderError) setRenderError(msg)
    return (
      <div style={{ padding: 12, background: '#fee2e2', borderRadius: 6, fontSize: 13, color: '#991b1b' }}>
        Ad Copy Editor error: {msg}
      </div>
    )
  }
}

export default AdCopyEditor
