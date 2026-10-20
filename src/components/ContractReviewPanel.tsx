'use client'

import { useAllFormFields, useDocumentInfo } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'

type ReviewComment = {
  id: number | string
  quote?: string | null
  section?: string | null
  comment?: string | null
  authorName?: string | null
  emailedAt?: string | null
  resolved?: boolean | null
  createdAt?: string | null
}

function formatWhen(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
}

const card: React.CSSProperties = {
  padding: '14px 16px',
  border: '1px solid var(--theme-elevation-150, #e2e8f0)',
  borderRadius: 6,
  background: 'var(--theme-elevation-0, #fff)',
}
const primaryBtn = (busy: boolean): React.CSSProperties => ({
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 600,
  border: 'none',
  borderRadius: 4,
  background: busy ? '#6b7280' : '#1b4332',
  color: '#fff',
  cursor: busy ? 'not-allowed' : 'pointer',
})
const secondaryBtn: React.CSSProperties = {
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 600,
  border: '1px solid #d1d5db',
  borderRadius: 4,
  background: '#fff',
  color: '#334155',
  cursor: 'pointer',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
}
const muted: React.CSSProperties = { margin: '6px 0 0', fontSize: 12, color: '#64748b' }

/**
 * Draft Review tab: create/email the account manager's review link and read
 * the inline comments they leave on the draft.
 */
const ContractReviewPanel = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()

  const status = fields?.['status']?.value as string | undefined
  const managerName = (fields?.['accountManagerName']?.value as string | undefined) || ''
  const managerEmail = (fields?.['accountManagerEmail']?.value as string | undefined) || ''
  const savedToken = fields?.['reviewToken']?.value as string | undefined
  const savedExpires = fields?.['reviewTokenExpiresAt']?.value as string | undefined

  const [reviewUrl, setReviewUrl] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [busy, setBusy] = useState<'create' | 'email' | 'regenerate' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const [comments, setComments] = useState<ReviewComment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentsError, setCommentsError] = useState<string | null>(null)

  // Show the saved link on load (the token lives in a hidden field).
  useEffect(() => {
    if (savedToken && !reviewUrl && typeof window !== 'undefined') {
      setReviewUrl(`${window.location.origin}/contracts/review/${savedToken}`)
      setExpiresAt(savedExpires ?? null)
    }
  }, [savedToken, savedExpires, reviewUrl])

  const loadComments = useCallback(async () => {
    if (!id) return
    setCommentsLoading(true)
    setCommentsError(null)
    try {
      const res = await fetch(
        `/api/contract-review-comments?where[contract][equals]=${encodeURIComponent(String(id))}&sort=createdAt&limit=200&depth=0`,
        { credentials: 'include' },
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data?.errors?.[0]?.message || 'Failed to load comments')
      setComments(Array.isArray(data.docs) ? data.docs : [])
    } catch (e) {
      setCommentsError(e instanceof Error ? e.message : 'Failed to load comments')
    } finally {
      setCommentsLoading(false)
    }
  }, [id])

  useEffect(() => {
    void loadComments()
  }, [loadComments])

  if (!id) {
    return <p style={muted}>Save the contract first, then you can send it to the account manager for review.</p>
  }

  const expiry = expiresAt ? new Date(expiresAt) : null
  const linkLive = Boolean(reviewUrl) && expiry != null && expiry > new Date()
  const isDraft = status === 'draft'

  const callReviewLink = async (mode: 'create' | 'email' | 'regenerate') => {
    if (busy) return
    if (mode === 'regenerate' && !window.confirm('Create a new link? The current review link will stop working.')) return
    setBusy(mode)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch(`/api/contracts/${id}/review-link`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerate: mode === 'regenerate', email: mode === 'email' }),
      })
      const data = await res.json()
      if (data.reviewUrl) {
        setReviewUrl(data.reviewUrl)
        setExpiresAt(data.expiresAt ?? null)
      }
      if (!res.ok) throw new Error(data.error || 'Failed to create the review link')
      setMessage(
        mode === 'email'
          ? `Review link emailed to ${data.sentTo}.`
          : mode === 'regenerate'
            ? 'New review link created. The old one no longer works.'
            : 'Review link created.',
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create the review link')
    } finally {
      setBusy(null)
    }
  }

  const copy = async () => {
    if (!reviewUrl) return
    try {
      await navigator.clipboard.writeText(reviewUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Couldn’t copy automatically. Select the link and copy it.')
    }
  }

  const toggleResolved = async (comment: ReviewComment) => {
    const next = !comment.resolved
    setComments((prev) => prev.map((c) => (c.id === comment.id ? { ...c, resolved: next } : c)))
    const res = await fetch(`/api/contract-review-comments/${encodeURIComponent(String(comment.id))}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolved: next }),
    }).catch(() => null)
    if (!res || !res.ok) {
      setComments((prev) => prev.map((c) => (c.id === comment.id ? { ...c, resolved: !next } : c)))
      setCommentsError('Couldn’t update that comment.')
    }
  }

  const unsent = comments.filter((c) => !c.emailedAt).length

  return (
    <div style={{ display: 'grid', gap: 16, marginBottom: 24 }}>
      <div style={card}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
          Review contact:{' '}
          {managerEmail ? (
            <span style={{ fontWeight: 400 }}>
              {managerName ? `${managerName} <${managerEmail}>` : managerEmail}
            </span>
          ) : (
            <span style={{ fontWeight: 400, color: '#b45309' }}>
              none yet — add an Account Manager in the Contract Details tab and save.
            </span>
          )}
        </p>

        {!isDraft && (
          <p style={{ ...muted, color: '#b45309' }}>
            Review links only work while the contract is a draft. Comments already left are kept below.
          </p>
        )}

        {isDraft && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {!linkLive && (
              <button type="button" onClick={() => callReviewLink('create')} disabled={busy !== null} style={primaryBtn(busy === 'create')}>
                {busy === 'create' ? 'Creating…' : 'Create review link'}
              </button>
            )}
            <button
              type="button"
              onClick={() => callReviewLink('email')}
              disabled={busy !== null || !managerEmail}
              style={primaryBtn(busy === 'email' || !managerEmail)}
              title={managerEmail ? undefined : 'Add and save an Account Manager email first'}
            >
              {busy === 'email' ? 'Sending…' : managerEmail ? `Email link to ${managerEmail}` : 'Email link'}
            </button>
            {linkLive && (
              <button type="button" onClick={() => callReviewLink('regenerate')} disabled={busy !== null} style={secondaryBtn}>
                {busy === 'regenerate' ? 'Creating…' : 'Regenerate link'}
              </button>
            )}
          </div>
        )}

        {reviewUrl && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                readOnly
                value={reviewUrl}
                aria-label="Review link"
                onFocus={(e) => e.target.select()}
                style={{ flex: 1, minWidth: 0, padding: '8px 10px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 4 }}
              />
              <button type="button" onClick={copy} style={secondaryBtn}>{copied ? 'Copied' : 'Copy'}</button>
              <a href={reviewUrl} target="_blank" rel="noopener noreferrer" style={secondaryBtn}>Open</a>
            </div>
            <p style={muted}>
              {expiry && !Number.isNaN(expiry.getTime())
                ? linkLive
                  ? `Active until ${formatWhen(expiresAt)}. Opening it shows the draft with every comment highlighted.`
                  : `Expired on ${formatWhen(expiresAt)}.`
                : null}
            </p>
          </div>
        )}

        {message && <p style={{ ...muted, color: '#059669', fontWeight: 600 }}>{message}</p>}
        {error && <p style={{ ...muted, color: '#dc2626' }}>{error}</p>}
      </div>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
            Comments ({comments.length})
            {unsent > 0 && (
              <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: '#b45309' }}>
                {unsent} not sent by the reviewer yet
              </span>
            )}
          </p>
          <button type="button" onClick={() => void loadComments()} disabled={commentsLoading} style={secondaryBtn}>
            {commentsLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
        {commentsError && <p style={{ ...muted, color: '#dc2626' }}>{commentsError}</p>}
        {!commentsLoading && comments.length === 0 && !commentsError && (
          <p style={muted}>No comments yet.</p>
        )}
        <ol style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 12 }}>
          {comments.map((c) => (
            <li
              key={String(c.id)}
              style={{ paddingTop: 12, borderTop: '1px solid #eef1ee', opacity: c.resolved ? 0.55 : 1 }}
            >
              {c.section && (
                <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#64748b' }}>
                  {c.section}
                </p>
              )}
              <p style={{ margin: '0 0 6px', padding: '6px 10px', borderLeft: '3px solid #ca8a04', background: '#fefce8', fontSize: 13, fontStyle: 'italic', color: '#475569' }}>
                “{c.quote}”
              </p>
              <p style={{ margin: 0, fontSize: 14, whiteSpace: 'pre-wrap' }}>{c.comment}</p>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 6, fontSize: 12, color: '#64748b', flexWrap: 'wrap' }}>
                <span>
                  {c.authorName || 'Reviewer'} · {formatWhen(c.createdAt)}
                  {c.emailedAt ? ' · emailed' : ' · not sent yet'}
                </span>
                <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={Boolean(c.resolved)} onChange={() => void toggleResolved(c)} />
                  Resolved
                </label>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

export default ContractReviewPanel
