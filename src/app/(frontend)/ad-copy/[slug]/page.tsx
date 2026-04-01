'use client'

import { useParams } from 'next/navigation'
import AdCopyPinGate from '@/components/AdCopyPinGate'
import { useState, useCallback } from 'react'

type Comment = {
  id: string
  campaignName: string
  adGroupName: string
  lineType?: 'headline' | 'description' | null
  lineIndex?: number | null
  author: string
  text: string
  createdAt: string
}

function AdPreviewMock({ headlines, descriptions, url }: { headlines: string[]; descriptions: string[]; url: string }) {
  const displayUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '')
  return (
    <div style={{ padding: 16, background: '#fff', border: '1px solid #dadce0', borderRadius: 8, maxWidth: 600, marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: '#202124', marginBottom: 2 }}>Sponsored</div>
      <div style={{ fontSize: 13, color: '#1a73e8', marginBottom: 4 }}>{displayUrl}</div>
      <div style={{ fontSize: 18, color: '#1a0dab', marginBottom: 6, lineHeight: 1.3, fontWeight: 400 }}>
        {headlines.slice(0, 3).join(' | ')}
      </div>
      <div style={{ fontSize: 14, color: '#4d5156', lineHeight: 1.6 }}>
        {descriptions.slice(0, 2).join(' ')}
      </div>
    </div>
  )
}

function CommentForm({
  slug, pin, campaignName, adGroupName, lineType, lineIndex, onSubmit,
}: {
  slug: string; pin: string; campaignName: string; adGroupName: string;
  lineType?: 'headline' | 'description'; lineIndex?: number;
  onSubmit: (comment: Comment) => void;
}) {
  const [author, setAuthor] = useState('')
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!author.trim() || !text.trim()) return
    setSubmitting(true)

    try {
      const res = await fetch('/api/ad-copy-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, pin, campaignName, adGroupName, lineType, lineIndex, author: author.trim(), text: text.trim() }),
      })
      if (res.ok) {
        const { comment } = await res.json()
        onSubmit(comment)
        setText('')
      }
    } catch { /* network error */ }
    setSubmitting(false)
  }, [slug, pin, campaignName, adGroupName, lineType, lineIndex, author, text, onSubmit])

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <input
        type="text"
        value={author}
        onChange={(e) => setAuthor(e.target.value)}
        placeholder="Your name"
        style={{ padding: '6px 10px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 6, width: 120 }}
      />
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={lineType ? `Comment on ${lineType} #${(lineIndex ?? 0) + 1}...` : 'Leave a comment...'}
        style={{ flex: 1, minWidth: 200, padding: '6px 10px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 6 }}
      />
      <button
        type="submit"
        disabled={submitting || !author.trim() || !text.trim()}
        style={{
          padding: '6px 14px', fontSize: 13, fontWeight: 600,
          background: submitting ? '#9ca3af' : '#7c3aed', color: '#fff',
          border: 'none', borderRadius: 6,
          cursor: submitting ? 'not-allowed' : 'pointer',
        }}
      >
        {submitting ? '...' : 'Send'}
      </button>
    </form>
  )
}

function AdCopyPreviewContent({
  data, pin,
}: {
  data: {
    businessName: string; slug: string;
    adCopy: Record<string, Record<string, { headlines: string[]; descriptions: string[] }>>;
    comments: Comment[];
    landingPages: Record<string, Record<string, string>>;
  };
  pin: string;
}) {
  const [comments, setComments] = useState<Comment[]>(data.comments || [])
  const [commentingOn, setCommentingOn] = useState<string | null>(null)

  const addComment = useCallback((comment: Comment) => {
    setComments((prev) => [...prev, comment])
  }, [])

  const getComments = (campName: string, agName: string) =>
    comments.filter((c) => c.campaignName === campName && c.adGroupName === agName)

  const campaigns = Object.entries(data.adCopy)
  const totalAdGroups = campaigns.reduce((s, [, ags]) => s + Object.keys(ags).length, 0)

  return (
    <div style={{
      minHeight: '100vh', background: '#f8fafc',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '20px 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1e293b' }}>
            Ad Copy Preview: {data.businessName}
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: '#64748b' }}>
            {campaigns.length} campaigns, {totalAdGroups} ad groups. Click on any headline or description to leave a comment.
          </p>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 24px 60px' }}>
        {campaigns.map(([campName, adGroups]) => (
          <div key={campName} style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#334155', margin: '0 0 12px', paddingBottom: 8, borderBottom: '2px solid #e2e8f0' }}>
              {campName}
            </h2>

            {Object.entries(adGroups).map(([agName, copy]) => {
              const agComments = getComments(campName, agName)
              const landingPage = data.landingPages?.[campName]?.[agName] || ''

              return (
                <div key={agName} style={{ marginBottom: 24, background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                  {/* Ad group header */}
                  <div style={{ padding: '12px 16px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: '#1e293b' }}>{agName}</span>
                    {landingPage && (
                      <span style={{ marginLeft: 12, fontSize: 12, color: '#6366f1' }}>
                        {landingPage.replace(/^https?:\/\//, '').slice(0, 50)}
                      </span>
                    )}
                  </div>

                  <div style={{ padding: 16 }}>
                    {/* Google Ads Mock */}
                    <AdPreviewMock headlines={copy.headlines || []} descriptions={copy.descriptions || []} url={landingPage} />

                    {/* Headlines */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Headlines</div>
                      {(copy.headlines || []).map((h, i) => {
                        const commentKey = `${campName}::${agName}::headline::${i}`
                        const lineComments = comments.filter(
                          (c) => c.campaignName === campName && c.adGroupName === agName && c.lineType === 'headline' && c.lineIndex === i
                        )

                        return (
                          <div key={i} style={{ marginBottom: 4 }}>
                            <div
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                                background: '#f8fafc', borderRadius: 6, cursor: 'pointer',
                                border: commentingOn === commentKey ? '1px solid #7c3aed' : '1px solid transparent',
                              }}
                              onClick={() => setCommentingOn(commentingOn === commentKey ? null : commentKey)}
                            >
                              <span style={{ fontSize: 12, color: '#9ca3af', minWidth: 20 }}>{i + 1}.</span>
                              <span style={{ fontSize: 14, color: '#1e293b', flex: 1 }}>{h}</span>
                              <span style={{ fontSize: 11, color: '#9ca3af' }}>{h.length}/30</span>
                              {lineComments.length > 0 && (
                                <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 8, background: '#fef3c7', color: '#92400e' }}>
                                  {lineComments.length}
                                </span>
                              )}
                              <span style={{ fontSize: 12, color: '#9ca3af' }}>💬</span>
                            </div>
                            {lineComments.map((c) => (
                              <div key={c.id} style={{ marginLeft: 30, padding: '4px 10px', fontSize: 12, color: '#78350f', background: '#fffbeb', borderRadius: 4, marginTop: 2 }}>
                                <strong>{c.author}:</strong> {c.text}
                              </div>
                            ))}
                            {commentingOn === commentKey && (
                              <div style={{ marginLeft: 30, marginTop: 4 }}>
                                <CommentForm
                                  slug={data.slug} pin={pin} campaignName={campName} adGroupName={agName}
                                  lineType="headline" lineIndex={i} onSubmit={addComment}
                                />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* Descriptions */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Descriptions</div>
                      {(copy.descriptions || []).map((d, i) => {
                        const commentKey = `${campName}::${agName}::description::${i}`
                        const lineComments = comments.filter(
                          (c) => c.campaignName === campName && c.adGroupName === agName && c.lineType === 'description' && c.lineIndex === i
                        )

                        return (
                          <div key={i} style={{ marginBottom: 4 }}>
                            <div
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                                background: '#f8fafc', borderRadius: 6, cursor: 'pointer',
                                border: commentingOn === commentKey ? '1px solid #7c3aed' : '1px solid transparent',
                              }}
                              onClick={() => setCommentingOn(commentingOn === commentKey ? null : commentKey)}
                            >
                              <span style={{ fontSize: 12, color: '#9ca3af', minWidth: 20 }}>{i + 1}.</span>
                              <span style={{ fontSize: 14, color: '#1e293b', flex: 1 }}>{d}</span>
                              <span style={{ fontSize: 11, color: '#9ca3af' }}>{d.length}/90</span>
                              {lineComments.length > 0 && (
                                <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 8, background: '#fef3c7', color: '#92400e' }}>
                                  {lineComments.length}
                                </span>
                              )}
                              <span style={{ fontSize: 12, color: '#9ca3af' }}>💬</span>
                            </div>
                            {lineComments.map((c) => (
                              <div key={c.id} style={{ marginLeft: 30, padding: '4px 10px', fontSize: 12, color: '#78350f', background: '#fffbeb', borderRadius: 4, marginTop: 2 }}>
                                <strong>{c.author}:</strong> {c.text}
                              </div>
                            ))}
                            {commentingOn === commentKey && (
                              <div style={{ marginLeft: 30, marginTop: 4 }}>
                                <CommentForm
                                  slug={data.slug} pin={pin} campaignName={campName} adGroupName={agName}
                                  lineType="description" lineIndex={i} onSubmit={addComment}
                                />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* General comment */}
                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>General Comment</div>
                      {agComments.filter((c) => !c.lineType).map((c) => (
                        <div key={c.id} style={{ padding: '6px 10px', fontSize: 13, color: '#78350f', background: '#fffbeb', borderRadius: 6, marginBottom: 4 }}>
                          <strong>{c.author}</strong>
                          <span style={{ color: '#a16207', marginLeft: 8, fontSize: 11 }}>
                            {new Date(c.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                          </span>
                          <div style={{ marginTop: 2 }}>{c.text}</div>
                        </div>
                      ))}
                      <CommentForm
                        slug={data.slug} pin={pin} campaignName={campName} adGroupName={agName}
                        onSubmit={addComment}
                      />
                    </div>
                  </div>
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
      {(data, pin) => <AdCopyPreviewContent data={data} pin={pin} />}
    </AdCopyPinGate>
  )
}
