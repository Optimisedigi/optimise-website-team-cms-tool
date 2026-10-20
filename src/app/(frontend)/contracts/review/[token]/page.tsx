'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  ContractBodySections,
  ContractDocumentStyles,
  ContractEffectiveDates,
  ContractHeaderAndCover,
  ContractServiceProvider,
  contractFontClassName,
  docStyle,
  hrThickStyle,
  pageStyle,
  type ContractInfo,
} from '../../_shared/contract-document'
import { anchorFromRange, rangeFromAnchor, type ReviewAnchor } from '@/lib/contract-review-anchor'
import {
  REVIEW_COMMENT_MAX_LENGTH,
  REVIEW_QUOTE_MAX_LENGTH,
  type PublicReviewComment,
} from '@/lib/contract-review'

type ReviewContract = ContractInfo & { clientTradingName?: string }

type Floating = { top: number; left: number; anchor: ReviewAnchor }

const HIGHLIGHT = 'review-note'
const HIGHLIGHT_ACTIVE = 'review-note-active'

type HighlightRegistry = {
  set: (name: string, value: unknown) => void
  delete: (name: string) => void
}

/** CSS Custom Highlight API, when the browser has it. */
function highlightApi(): { registry: HighlightRegistry; make: (ranges: Range[]) => unknown } | null {
  if (typeof window === 'undefined') return null
  const css = (window as unknown as { CSS?: { highlights?: HighlightRegistry } }).CSS
  const HighlightCtor = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight
  if (!css?.highlights || !HighlightCtor) return null
  return { registry: css.highlights, make: (ranges) => new HighlightCtor(...ranges) }
}

export default function ContractReviewPage() {
  const params = useParams()
  const token = params?.token as string

  const [contract, setContract] = useState<ReviewContract | null>(null)
  const [comments, setComments] = useState<PublicReviewComment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const rootRef = useRef<HTMLDivElement>(null)
  const [floating, setFloating] = useState<Floating | null>(null)
  const [composing, setComposing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sentMessage, setSentMessage] = useState<string | null>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!token) return
    fetch(`/api/contracts/review/${token}`, { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || 'This review link isn\u2019t valid.')
          return
        }
        setContract(data.contract)
        setComments(Array.isArray(data.comments) ? data.comments : [])
      })
      .catch(() => setError('We couldn\u2019t load this draft. Please try again.'))
      .finally(() => setLoading(false))
  }, [token])

  // Paint saved comments onto the text (no DOM changes; purely visual).
  useLayoutEffect(() => {
    const api = highlightApi()
    const root = rootRef.current
    if (!api || !root || !contract) return
    const ranges: Range[] = []
    let active: Range | null = null
    for (const c of comments) {
      const r = rangeFromAnchor(root, c.quote, c.occurrence)
      if (!r) continue
      ranges.push(r)
      if (c.id === activeId) active = r
    }
    api.registry.set(HIGHLIGHT, api.make(ranges))
    if (active) api.registry.set(HIGHLIGHT_ACTIVE, api.make([active]))
    else api.registry.delete(HIGHLIGHT_ACTIVE)
    return () => {
      api.registry.delete(HIGHLIGHT)
      api.registry.delete(HIGHLIGHT_ACTIVE)
    }
  }, [comments, contract, activeId])

  // Offer the note button whenever text inside the contract is selected.
  useEffect(() => {
    if (!contract) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const onSelection = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        if (composing) return
        const root = rootRef.current
        const sel = window.getSelection()
        if (!root || !sel || sel.rangeCount === 0 || sel.isCollapsed) {
          setFloating(null)
          return
        }
        const range = sel.getRangeAt(0)
        const anchor = anchorFromRange(root, range)
        if (!anchor || anchor.quote.length > REVIEW_QUOTE_MAX_LENGTH) {
          setFloating(null)
          return
        }
        const rect = range.getBoundingClientRect()
        // Sit just below the selection so it never fights the mobile copy/paste callout.
        setFloating({
          top: rect.bottom + window.scrollY + 8,
          left: Math.min(Math.max(rect.left + window.scrollX + rect.width / 2, 60), window.scrollX + window.innerWidth - 60),
          anchor,
        })
      }, 120)
    }
    document.addEventListener('selectionchange', onSelection)
    return () => {
      document.removeEventListener('selectionchange', onSelection)
      if (timer) clearTimeout(timer)
    }
  }, [contract, composing])

  useEffect(() => {
    if (composing) composerRef.current?.focus()
  }, [composing])

  const closeComposer = useCallback(() => {
    setComposing(false)
    setFloating(null)
    setDraft('')
    setActionError(null)
  }, [])

  useEffect(() => {
    if (!composing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeComposer()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [composing, closeComposer])

  const saveComment = async () => {
    if (!floating || !draft.trim() || saving) return
    setSaving(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/contracts/review/${token}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...floating.anchor, comment: draft }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Couldn\u2019t save your note.')
      setComments((prev) => [...prev, data.comment])
      setSentMessage(null)
      window.getSelection()?.removeAllRanges()
      closeComposer()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Couldn\u2019t save your note.')
    } finally {
      setSaving(false)
    }
  }

  const removeComment = async (id: string) => {
    setActionError(null)
    const res = await fetch(`/api/contracts/review/${token}/comments/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (res.ok) {
      setComments((prev) => prev.filter((c) => c.id !== id))
      return
    }
    const data = await res.json().catch(() => ({}))
    setActionError(data.error || 'Couldn\u2019t remove that note.')
  }

  const sendComments = async () => {
    if (sending) return
    setSending(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/contracts/review/${token}/send`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Couldn\u2019t send your notes.')
      setComments((prev) => prev.map((c) => (c.sent ? c : { ...c, sent: true })))
      setSentMessage('Thanks \u2014 your notes have been sent to Optimise Digital.')
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Couldn\u2019t send your notes.')
    } finally {
      setSending(false)
    }
  }

  const focusComment = (c: PublicReviewComment) => {
    setActiveId(c.id)
    const root = rootRef.current
    const r = root ? rangeFromAnchor(root, c.quote, c.occurrence) : null
    const el = r?.startContainer.parentElement
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={{ ...docStyle, textAlign: 'center' }}>
          <p style={{ color: '#666', fontSize: 16 }}>Loading draft...</p>
        </div>
      </div>
    )
  }

  if (error || !contract) {
    return (
      <div style={pageStyle}>
        <div style={{ ...docStyle, textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, color: '#111827', marginBottom: 8 }}>Draft unavailable</h1>
          <p style={{ color: '#666', margin: 0 }}>{error}</p>
        </div>
      </div>
    )
  }

  const clientDisplayName = contract.clientName || ''
  const unsent = comments.filter((c) => !c.sent)
  const clientDetails: Array<[string, string | undefined]> = [
    ['Company name', contract.clientName],
    ['Trading name', contract.clientTradingName],
    ['Contact name', contract.clientContactName],
    ['Position / title', contract.clientTitle],
    ['Email', contract.clientEmail],
    ['Phone', contract.clientPhone],
    ['Website', contract.clientWebsite],
    ['ACN / ABN', contract.clientAcn],
    ['Business address', contract.clientBusinessAddress],
  ]

  return (
    <main className={contractFontClassName} style={{ ...pageStyle, paddingBottom: unsent.length > 0 ? 120 : 40 }}>
      <p className="review-hint">Draft for review &middot; select any text to leave a note</p>

      <article className="signing-doc" style={docStyle}>
        <div ref={rootRef}>
          <ContractHeaderAndCover contract={contract} clientDisplayName={clientDisplayName} />

          <hr style={hrThickStyle} />

          <p style={{ fontSize: 15, margin: '0 0 6px' }}>
            <em><strong>This contract is between:</strong></em>
          </p>
          <dl className="review-client-details">
            {clientDetails
              .filter(([, value]) => value && String(value).trim() !== '')
              .map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>

          <ContractServiceProvider contract={contract} />

          <ContractEffectiveDates contract={contract} />

          <hr style={hrThickStyle} />

          <ContractBodySections contract={contract} />
        </div>

        <hr style={hrThickStyle} />
        <p style={{ fontSize: 13, color: '#68766e', margin: 0 }}>
          Signature details are added when the final contract is sent for signing.
        </p>

        {comments.length > 0 && (
          <section className="review-notes" aria-label="Your notes">
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>Your notes</h2>
            <ol>
              {comments.map((c) => (
                <li key={c.id} className={c.id === activeId ? 'is-active' : undefined}>
                  <button type="button" className="review-note-quote" onClick={() => focusComment(c)}>
                    {c.section && <span className="review-note-section">{c.section}</span>}
                    <span>&ldquo;{c.quote.length > 160 ? `${c.quote.slice(0, 160)}\u2026` : c.quote}&rdquo;</span>
                  </button>
                  <p className="review-note-text">{c.comment}</p>
                  <p className="review-note-meta">
                    {c.sent ? 'Sent' : 'Not sent yet'}
                    {!c.sent && (
                      <>
                        {' \u00b7 '}
                        <button type="button" className="review-link-button" onClick={() => removeComment(c.id)}>
                          Remove
                        </button>
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        )}
      </article>

      {floating && !composing && (
        <button
          type="button"
          className="review-float-button"
          style={{ top: floating.top, left: floating.left }}
          // Keep the text selection alive while the button is pressed.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setComposing(true)}
        >
          Add note
        </button>
      )}

      {floating && composing && (
        <div
          className="review-composer"
          role="dialog"
          aria-label="Add a note"
          style={{ top: floating.top, left: floating.left }}
        >
          <p className="review-composer-quote">
            &ldquo;{floating.anchor.quote.length > 120 ? `${floating.anchor.quote.slice(0, 120)}\u2026` : floating.anchor.quote}&rdquo;
          </p>
          <label htmlFor="review-note-input" className="review-sr-only">Your note</label>
          <textarea
            id="review-note-input"
            ref={composerRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={REVIEW_COMMENT_MAX_LENGTH}
            rows={4}
            placeholder="What would you like changed?"
          />
          {actionError && <p className="review-error" role="alert">{actionError}</p>}
          <div className="review-composer-actions">
            <button type="button" className="review-link-button" onClick={closeComposer}>Cancel</button>
            <button type="button" className="review-primary" onClick={saveComment} disabled={saving || !draft.trim()}>
              {saving ? 'Saving\u2026' : 'Save note'}
            </button>
          </div>
        </div>
      )}

      {(unsent.length > 0 || sentMessage) && (
        <div className="review-send-bar" role="region" aria-label="Send notes">
          {unsent.length > 0 ? (
            <>
              <span>
                {unsent.length} note{unsent.length === 1 ? '' : 's'} not sent yet
              </span>
              <button type="button" className="review-primary" onClick={sendComments} disabled={sending}>
                {sending ? 'Sending\u2026' : 'Send to Optimise Digital'}
              </button>
            </>
          ) : (
            <span role="status">{sentMessage}</span>
          )}
          {!composing && actionError && <span className="review-error" role="alert">{actionError}</span>}
        </div>
      )}

      <ContractDocumentStyles />
      <style>{`
        ::highlight(${HIGHLIGHT}) { background-color: #fef08a; color: inherit; }
        ::highlight(${HIGHLIGHT_ACTIVE}) { background-color: #fbbf24; color: inherit; }
        .review-hint {
          max-width: 900px;
          margin: 0 auto 10px;
          color: #8a968f;
          font-family: var(--contract-sans), sans-serif;
          font-size: 12px;
          text-align: right;
        }
        .review-client-details { margin: 0 0 8px; font-size: 15px; }
        .review-client-details div { display: flex; gap: 8px; margin: 0 0 4px; }
        .review-client-details dt { font-weight: 700; font-family: var(--contract-sans), sans-serif; }
        .review-client-details dt::after { content: ':'; }
        .review-client-details dd { margin: 0; white-space: pre-wrap; }
        .review-float-button,
        .review-composer {
          position: absolute;
          z-index: 20;
          transform: translateX(-50%);
          font-family: var(--contract-sans), sans-serif;
        }
        .review-float-button {
          padding: 6px 12px;
          border: 1px solid #1b4332;
          border-radius: 999px;
          background: #fff;
          color: #1b4332;
          font-size: 12px;
          font-weight: 700;
          box-shadow: 0 6px 18px rgba(27, 44, 35, .18);
          cursor: pointer;
        }
        .review-composer {
          width: min(360px, calc(100vw - 32px));
          padding: 14px;
          border: 1px solid #b9c9bf;
          border-radius: 6px;
          background: #fff;
          box-shadow: 0 14px 44px rgba(27, 44, 35, .22);
        }
        .review-composer-quote {
          margin: 0 0 8px;
          padding: 6px 8px;
          border-left: 3px solid #ca8a04;
          background: #fefce8;
          color: #475569;
          font-size: 12px;
          font-style: italic;
        }
        .review-composer textarea {
          width: 100%;
          box-sizing: border-box;
          padding: 8px 10px;
          border: 1px solid #aebbb3;
          border-radius: 4px;
          font: inherit;
          font-size: 14px;
          resize: vertical;
        }
        .review-composer-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 10px; }
        .review-primary {
          padding: 8px 16px;
          border: none;
          border-radius: 4px;
          background: #1b4332;
          color: #fff;
          font-family: var(--contract-sans), sans-serif;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }
        .review-primary:disabled { opacity: .55; cursor: not-allowed; }
        .review-link-button {
          padding: 0;
          border: none;
          background: none;
          color: #475569;
          font: inherit;
          font-size: 12px;
          text-decoration: underline;
          cursor: pointer;
        }
        .review-error { margin: 8px 0 0; color: #b91c1c; font-size: 13px; }
        .review-notes { margin-top: 32px; padding-top: 20px; border-top: 1px solid #d8ded9; }
        .review-notes ol { margin: 0; padding: 0; list-style: none; }
        .review-notes li { padding: 12px 0; border-bottom: 1px solid #eef1ee; }
        .review-notes li.is-active .review-note-quote { border-left-color: #d97706; }
        .review-note-quote {
          display: block;
          width: 100%;
          padding: 4px 10px;
          border: none;
          border-left: 3px solid #ca8a04;
          background: #fefce8;
          color: #475569;
          font: inherit;
          font-size: 13px;
          font-style: italic;
          text-align: left;
          cursor: pointer;
        }
        .review-note-section {
          display: block;
          color: #68766e;
          font-family: var(--contract-sans), sans-serif;
          font-size: 11px;
          font-style: normal;
          font-weight: 700;
          letter-spacing: .06em;
          text-transform: uppercase;
        }
        .review-note-text { margin: 8px 0 4px; font-size: 14px; white-space: pre-wrap; }
        .review-note-meta { margin: 0; color: #8a968f; font-family: var(--contract-sans), sans-serif; font-size: 12px; }
        .review-send-bar {
          position: fixed;
          left: 50%;
          bottom: max(16px, env(safe-area-inset-bottom));
          z-index: 30;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 12px;
          width: max-content;
          max-width: calc(100vw - 32px);
          padding: 10px 14px;
          border: 1px solid #b9c9bf;
          border-radius: 8px;
          background: #fff;
          box-shadow: 0 10px 30px rgba(27, 44, 35, .18);
          transform: translateX(-50%);
          color: #1b4332;
          font-family: var(--contract-sans), sans-serif;
          font-size: 13px;
          font-weight: 600;
        }
        .review-sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip: rect(0 0 0 0);
          white-space: nowrap;
        }
        .review-float-button:focus-visible,
        .review-primary:focus-visible,
        .review-link-button:focus-visible,
        .review-note-quote:focus-visible,
        .review-composer textarea:focus-visible {
          outline: 3px solid #d4a017;
          outline-offset: 2px;
        }
      `}</style>
    </main>
  )
}
