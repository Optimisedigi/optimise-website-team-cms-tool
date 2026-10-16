'use client'

import { useCallback, useEffect, useState } from 'react'
import { senderLabel } from '../lib/mail/client-email-alerts'
import { cmsMailThreadPath } from '../lib/mail/drafts'

/**
 * Dashboard "Unread client emails" panel (under GA4 Sessions by Channel).
 *
 * Lists unread inbox emails from clients (senders on a client's website or
 * contact domains, plus senders starred as clients in Mail), via
 * GET /api/mail/client-unread (live Gmail, metadata only). Users
 * without the Mail feature see nothing; Gmail not connected shows a connect
 * link. Each row opens the thread in Mail.
 */

interface UnreadClientEmail {
  threadId: string
  from: string
  subject: string
  date: string
  messageCount: number
}

interface ClientUnreadResponse {
  clientSenderCount: number
  emails: UnreadClientEmail[]
  more: boolean
}

type CardState =
  | { status: 'loading' }
  | { status: 'hidden' }
  | { status: 'error'; message: string; connectUrl?: string }
  | { status: 'ready'; data: ClientUnreadResponse }

const GMAIL_SETUP_ERRORS = new Set(['gmail-not-connected', 'scope-insufficient'])

function isClientUnreadResponse(value: unknown): value is ClientUnreadResponse {
  const v = value as Partial<ClientUnreadResponse> | null
  return Boolean(v) && typeof v?.clientSenderCount === 'number' && Array.isArray(v?.emails)
}

function shortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
  }
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

async function loadClientUnread(signal: AbortSignal): Promise<CardState> {
  const res = await fetch('/api/mail/client-unread', { credentials: 'include', signal })
  const body = (await res.json().catch(() => null)) as
    | (Partial<ClientUnreadResponse> & { error?: string; reason?: string; connectUrl?: string })
    | null
  if (res.ok) {
    return isClientUnreadResponse(body)
      ? { status: 'ready', data: body }
      : { status: 'error', message: 'Unexpected response from Mail.' }
  }
  if (body?.error && GMAIL_SETUP_ERRORS.has(body.error)) {
    return {
      status: 'error',
      message: body.reason || 'Connect Gmail to see unread client emails.',
      connectUrl: body.connectUrl,
    }
  }
  // Not logged in or no Mail feature: this panel is not for this user.
  if (res.status === 401 || res.status === 403) return { status: 'hidden' }
  return { status: 'error', message: body?.error || `Could not load unread client emails (${res.status}).` }
}

const mutedText = { color: 'var(--theme-elevation-400)', fontSize: 13, margin: 0 } as const
const headLink = { fontSize: 12, color: 'var(--theme-elevation-500)', textDecoration: 'none' } as const

export default function ClientUnreadMailCard() {
  const [state, setState] = useState<CardState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading' })
    loadClientUnread(controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setState(next)
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error', message: 'Could not load unread client emails.' })
      })
    return () => controller.abort()
  }, [attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  if (state.status === 'hidden') return null

  const emails = state.status === 'ready' ? state.data.emails : []

  return (
    <section
      className={`od-box${state.status === 'loading' ? ' od-box--muted' : ''}`}
      aria-label="Unread client emails"
      aria-busy={state.status === 'loading'}
    >
      <div className="od-box__head">
        <div>
          <span className="od-box__eyebrow">Mail</span>
          <span className="od-box__title">Unread client emails</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {state.status === 'ready' && emails.length > 0 ? (
            <span className="od-box__badge">
              {emails.length}
              {state.data.more ? '+' : ''} unread
            </span>
          ) : null}
          <a href="/admin/mail" style={headLink}>
            Open Mail &rarr;
          </a>
        </div>
      </div>
      <div className="od-box__body od-card-pad">
        {state.status === 'loading' ? (
          <p style={mutedText}>Loading unread client emails...</p>
        ) : state.status === 'error' ? (
          <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <p style={{ ...mutedText, color: 'var(--theme-error-500, #dc2626)' }}>{state.message}</p>
            {state.connectUrl ? (
              <a href={state.connectUrl} style={{ ...headLink, textDecoration: 'underline' }}>
                Connect Gmail
              </a>
            ) : (
              <button type="button" className="od-costs__head-toggle" onClick={retry}>
                Retry
              </button>
            )}
          </div>
        ) : state.data.clientSenderCount === 0 ? (
          <p style={mutedText}>
            No client senders yet. Add a Website URL to a client, or open an email in{' '}
            <a href="/admin/mail" style={{ color: 'inherit', textDecoration: 'underline' }}>
              Mail
            </a>{' '}
            and click ☆ Mark as client.
          </p>
        ) : emails.length === 0 ? (
          <p style={mutedText}>No unread emails from clients.</p>
        ) : (
          <ul className="od-processes__list" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 12 }}>
            {emails.map((email) => (
              <li key={email.threadId}>
                <a href={cmsMailThreadPath(email.threadId)} className="od-processes__item">
                  <div className="od-processes__row" style={{ marginBottom: 2 }}>
                    <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {senderLabel(email.from) || 'Unknown sender'}
                    </b>
                    <span style={{ flexShrink: 0, color: '#8b95a3' }}>{shortDate(email.date)}</span>
                  </div>
                  <div
                    className="od-processes__meta"
                    style={{ marginTop: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {email.subject || '(no subject)'}
                    {email.messageCount > 1 ? ` (${email.messageCount})` : ''}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
        {state.status === 'ready' && state.data.more ? (
          <p style={{ ...mutedText, fontSize: 12, marginTop: 12 }}>
            More unread client emails in{' '}
            <a href="/admin/mail" style={{ color: 'inherit', textDecoration: 'underline' }}>
              Mail
            </a>
            .
          </p>
        ) : null}
      </div>
    </section>
  )
}
