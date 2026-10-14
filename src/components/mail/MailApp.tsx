'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styles from './MailApp.module.css'

/**
 * CMS Mail view. Inbox list → reading pane → AI composer.
 *
 * Model calls happen only on explicit clicks ("Write with AI", "Summarise"),
 * each sending at most the one selected email id. Nothing is sent until the
 * user clicks Send. Client matching/storage happen server-side in plain code.
 */

export interface MailClientOption {
  id: number
  name: string
}

interface ThreadRow {
  threadId: string
  messageId: string
  from: string
  subject: string
  snippet: string
  date: string
  unread: boolean
  messageCount: number
  client: { id: number; name: string } | null
}

interface ThreadMessage {
  messageId: string
  threadId: string
  from: string
  to: string
  cc: string
  subject: string
  date: string
  body: string
  unread: boolean
  stored: { id: number; clientId: number; clientName: string } | null
  match: { id: number; name: string; matchedOn: string } | null
}

interface Composer {
  mode: 'reply' | 'new'
  replyTo: ThreadMessage | null
  to: string
  cc: string
  subject: string
  instruction: string
  body: string
  busy: '' | 'ai' | 'send' | 'draft'
  note: string
}

interface ApiError {
  error?: string
  reason?: string
  connectUrl?: string
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })
  const data = (await res.json().catch(() => ({}))) as T & ApiError
  if (!res.ok) {
    const err = new Error(data.reason || data.error || `Request failed (${res.status})`) as Error & { connectUrl?: string }
    err.connectUrl = data.connectUrl
    throw err
  }
  return data
}

function senderName(from: string): string {
  const match = from.match(/^\s*"?([^"<]*?)"?\s*<[^>]+>/)
  return (match?.[1] || from.replace(/<.*>/, '')).trim() || from
}

function senderAddress(from: string): string {
  return from.match(/<([^>]+)>/)?.[1] ?? from.trim()
}

function shortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
  }
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) })
}

function longDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
}

function replySubject(subject: string): string {
  return /^re\s*:/i.test(subject) ? subject : `Re: ${subject || '(no subject)'}`
}

export default function MailApp({ clients }: { clients: MailClientOption[] }) {
  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [account, setAccount] = useState('')
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [error, setError] = useState<{ message: string; connectUrl?: string } | null>(null)
  const [syncNote, setSyncNote] = useState('')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [threadLoading, setThreadLoading] = useState(false)
  const [threadError, setThreadError] = useState('')
  const [actionNote, setActionNote] = useState('')

  const [composer, setComposer] = useState<Composer | null>(null)
  const [summary, setSummary] = useState<{ email: ThreadMessage; text: string; model: string; busy: boolean; note: string } | null>(null)
  const [assignClientId, setAssignClientId] = useState('')
  const threadRequest = useRef(0)

  const showError = useCallback((err: unknown) => {
    const e = err as Error & { connectUrl?: string }
    setError({ message: e.message || 'Something went wrong.', connectUrl: e.connectUrl })
  }, [])

  const loadInbox = useCallback(
    async (opts: { append?: boolean; pageToken?: string | null; q?: string } = {}) => {
      setListLoading(true)
      try {
        const params = new URLSearchParams()
        if (opts.pageToken) params.set('pageToken', opts.pageToken)
        if (opts.q) params.set('q', opts.q)
        const data = await api<{ threads: ThreadRow[]; nextPageToken: string | null; account: string }>(
          `/api/mail/inbox?${params.toString()}`,
        )
        setAccount(data.account)
        setThreads((current) => (opts.append ? [...current, ...data.threads] : data.threads))
        setNextPageToken(data.nextPageToken)
        setError(null)
      } catch (err) {
        showError(err)
      } finally {
        setListLoading(false)
      }
    },
    [showError],
  )

  const runSync = useCallback(async () => {
    setSyncNote('Syncing…')
    try {
      const result = await api<{ stored: number; checked: number; mode: string }>('/api/mail/sync', { method: 'POST' })
      setSyncNote(
        result.stored > 0
          ? `Linked ${result.stored} new email${result.stored === 1 ? '' : 's'} to clients`
          : 'Up to date',
      )
    } catch (err) {
      setSyncNote('')
      showError(err)
    }
  }, [showError])

  const refresh = useCallback(async () => {
    await Promise.all([runSync(), loadInbox({ q: query })])
  }, [loadInbox, query, runSync])

  // Sync on open.
  useEffect(() => {
    void runSync()
    void loadInbox()
  }, [runSync, loadInbox])

  const openThread = useCallback(
    async (thread: ThreadRow) => {
      const request = ++threadRequest.current
      setSelectedThreadId(thread.threadId)
      setComposer(null)
      setSummary(null)
      setActionNote('')
      setThreadError('')
      setThreadLoading(true)
      setAssignClientId('')
      try {
        const data = await api<{ messages: ThreadMessage[] }>(`/api/mail/thread/${encodeURIComponent(thread.threadId)}`)
        if (request !== threadRequest.current) return
        setMessages(data.messages)
        if (thread.unread) {
          setThreads((current) => current.map((row) => (row.threadId === thread.threadId ? { ...row, unread: false } : row)))
          api('/api/mail/modify', { method: 'POST', body: JSON.stringify({ threadId: thread.threadId, action: 'read' }) }).catch(
            (err) => setActionNote((err as Error).message),
          )
        }
      } catch (err) {
        if (request === threadRequest.current) setThreadError((err as Error).message)
      } finally {
        if (request === threadRequest.current) setThreadLoading(false)
      }
    },
    [],
  )

  const selectedThread = useMemo(() => threads.find((t) => t.threadId === selectedThreadId) ?? null, [threads, selectedThreadId])
  const latest = messages[messages.length - 1] ?? null

  async function modify(action: 'archive' | 'read' | 'unread') {
    if (!selectedThreadId) return
    setActionNote('')
    try {
      await api('/api/mail/modify', { method: 'POST', body: JSON.stringify({ threadId: selectedThreadId, action }) })
      if (action === 'archive') {
        setThreads((current) => current.filter((row) => row.threadId !== selectedThreadId))
        setSelectedThreadId(null)
        setMessages([])
        setComposer(null)
      } else {
        setThreads((current) =>
          current.map((row) => (row.threadId === selectedThreadId ? { ...row, unread: action === 'unread' } : row)),
        )
        setActionNote(action === 'unread' ? 'Marked unread' : 'Marked read')
      }
    } catch (err) {
      setActionNote((err as Error).message)
    }
  }

  function startReply(message: ThreadMessage) {
    setSummary(null)
    setComposer({
      mode: 'reply',
      replyTo: message,
      to: senderAddress(message.from),
      cc: '',
      subject: replySubject(message.subject),
      instruction: '',
      body: '',
      busy: '',
      note: '',
    })
  }

  function startNew() {
    setSummary(null)
    setComposer({ mode: 'new', replyTo: null, to: '', cc: '', subject: '', instruction: '', body: '', busy: '', note: '' })
  }

  async function writeWithAi() {
    if (!composer) return
    if (composer.mode === 'new' && !composer.instruction.trim()) {
      setComposer({ ...composer, note: 'Write an instruction first.' })
      return
    }
    setComposer({ ...composer, busy: 'ai', note: '' })
    try {
      const body =
        composer.mode === 'reply'
          ? { action: 'reply', gmailMessageId: composer.replyTo?.messageId, instruction: composer.instruction }
          : { action: 'draft', instruction: composer.instruction }
      const data = await api<{ text: string }>('/api/mail/ai', { method: 'POST', body: JSON.stringify(body) })
      setComposer((current) => (current ? { ...current, body: data.text, busy: '', note: 'Draft ready. Edit it, then Send or Save as draft.' } : current))
    } catch (err) {
      setComposer((current) => (current ? { ...current, busy: '', note: (err as Error).message } : current))
    }
  }

  async function send() {
    if (!composer || !composer.body.trim()) return
    setComposer({ ...composer, busy: 'send', note: '' })
    try {
      const data = await api<{ client: { name: string } | null }>('/api/mail/send', {
        method: 'POST',
        body: JSON.stringify({
          to: composer.to,
          cc: composer.cc,
          subject: composer.subject,
          body: composer.body,
          replyToMessageId: composer.replyTo?.messageId ?? '',
        }),
      })
      setComposer(null)
      setActionNote(data.client ? `Sent. Saved to ${data.client.name}'s emails.` : 'Sent.')
      const thread = selectedThread
      if (thread && composer.mode === 'reply') void openThread(thread)
    } catch (err) {
      setComposer((current) => (current ? { ...current, busy: '', note: (err as Error).message } : current))
    }
  }

  async function saveDraft() {
    if (!composer || !composer.body.trim()) return
    setComposer({ ...composer, busy: 'draft', note: '' })
    try {
      await api('/api/gmail/draft', {
        method: 'POST',
        body: JSON.stringify({
          to: composer.to,
          subject: composer.subject,
          body: composer.body,
          ...(composer.replyTo ? { replyToMessageId: composer.replyTo.messageId } : {}),
        }),
      })
      setComposer((current) => (current ? { ...current, busy: '', note: 'Saved to Gmail Drafts.' } : current))
    } catch (err) {
      setComposer((current) => (current ? { ...current, busy: '', note: (err as Error).message } : current))
    }
  }

  async function assign(message: ThreadMessage) {
    const clientId = Number(assignClientId)
    if (!clientId) return
    setActionNote('')
    try {
      const result = await api<{ id: number | null }>('/api/mail/assign', {
        method: 'POST',
        body: JSON.stringify({ gmailMessageId: message.messageId, clientId }),
      })
      const name = clients.find((c) => c.id === clientId)?.name ?? ''
      setMessages((current) =>
        current.map((m) =>
          m.messageId === message.messageId && result.id ? { ...m, stored: { id: result.id, clientId, clientName: name } } : m,
        ),
      )
      setActionNote(`Saved to ${name}'s emails.`)
    } catch (err) {
      setActionNote((err as Error).message)
    }
  }

  async function summarise(message: ThreadMessage) {
    if (!message.stored) return
    setComposer(null)
    setSummary({ email: message, text: '', model: '', busy: true, note: '' })
    try {
      const data = await api<{ summary: string; model: string }>('/api/mail/summarise', {
        method: 'POST',
        body: JSON.stringify({ clientEmailId: message.stored.id }),
      })
      setSummary({ email: message, text: data.summary, model: data.model, busy: false, note: '' })
    } catch (err) {
      setSummary({ email: message, text: '', model: '', busy: false, note: (err as Error).message })
    }
  }

  async function confirmSummary() {
    if (!summary?.email.stored || !summary.text.trim()) return
    setSummary({ ...summary, busy: true })
    try {
      await api('/api/mail/summaries', {
        method: 'POST',
        body: JSON.stringify({ clientEmailId: summary.email.stored.id, summary: summary.text, model: summary.model }),
      })
      setActionNote(`Added to ${summary.email.stored.clientName || 'the client'}'s email timeline.`)
      setSummary(null)
    } catch (err) {
      setSummary({ ...summary, busy: false, note: (err as Error).message })
    }
  }

  return (
    <div className={styles.app}>
      <div className={styles.toolbar}>
        <h1 className={styles.title}>Mail</h1>
        {account ? <span className={styles.muted}>{account}</span> : null}
        <form
          className={styles.search}
          onSubmit={(event) => {
            event.preventDefault()
            setQuery(search)
            void loadInbox({ q: search })
          }}
        >
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search inbox" aria-label="Search inbox" />
        </form>
        <span className={styles.muted}>{syncNote}</span>
        <button type="button" className={styles.btn} onClick={() => void refresh()} disabled={listLoading}>
          Refresh
        </button>
        <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={startNew}>
          Draft with AI
        </button>
      </div>

      {error ? (
        <div className={styles.error} role="alert">
          <span>{error.message}</span>
          {error.connectUrl ? (
            <a className={styles.btn} href={error.connectUrl}>
              Reconnect Gmail
            </a>
          ) : null}
          <button type="button" className={styles.linkBtn} onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className={styles.panes}>
        <ul className={styles.list} aria-label="Inbox">
          {threads.map((thread) => (
            <li key={thread.threadId}>
              <button
                type="button"
                className={`${styles.row} ${thread.unread ? styles.unread : ''} ${thread.threadId === selectedThreadId ? styles.selected : ''}`}
                onClick={() => void openThread(thread)}
              >
                <span className={styles.rowTop}>
                  <span className={styles.sender}>
                    {senderName(thread.from)}
                    {thread.messageCount > 1 ? <span className={styles.count}>{thread.messageCount}</span> : null}
                  </span>
                  <span className={styles.date}>{shortDate(thread.date)}</span>
                </span>
                <span className={styles.subject}>{thread.subject || '(no subject)'}</span>
                <span className={styles.snippet}>{thread.snippet}</span>
                {thread.client ? <span className={styles.badge}>{thread.client.name}</span> : null}
              </button>
            </li>
          ))}
          {listLoading ? <li className={styles.empty}>Loading…</li> : null}
          {!listLoading && threads.length === 0 && !error ? <li className={styles.empty}>Inbox is empty.</li> : null}
          {!listLoading && nextPageToken ? (
            <li>
              <button type="button" className={styles.more} onClick={() => void loadInbox({ append: true, pageToken: nextPageToken, q: query })}>
                Load more
              </button>
            </li>
          ) : null}
        </ul>

        <section className={styles.reader} aria-label="Reading pane">
          {composer?.mode === 'new' ? null : !selectedThreadId ? (
            <p className={styles.empty}>Select an email to read it.</p>
          ) : threadLoading ? (
            <p className={styles.empty}>Loading…</p>
          ) : threadError ? (
            <p className={styles.errorText}>{threadError}</p>
          ) : (
            <>
              <div className={styles.readerHead}>
                <h2 className={styles.threadSubject}>{messages[0]?.subject || '(no subject)'}</h2>
                <div className={styles.actions}>
                  {latest ? (
                    <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={() => startReply(latest)}>
                      Reply with AI
                    </button>
                  ) : null}
                  <button type="button" className={styles.btn} onClick={() => void modify('archive')}>
                    Archive
                  </button>
                  {selectedThread?.unread ? (
                    <button type="button" className={styles.btn} onClick={() => void modify('read')}>
                      Mark read
                    </button>
                  ) : (
                    <button type="button" className={styles.btn} onClick={() => void modify('unread')}>
                      Mark unread
                    </button>
                  )}
                </div>
              </div>
              {actionNote ? <p className={styles.note}>{actionNote}</p> : null}

              {messages.map((message) => (
                <article key={message.messageId} className={styles.message}>
                  <header className={styles.messageHead}>
                    <div>
                      <strong>{senderName(message.from)}</strong> <span className={styles.muted}>&lt;{senderAddress(message.from)}&gt;</span>
                      <div className={styles.muted}>
                        To {message.to}
                        {message.cc ? ` · Cc ${message.cc}` : ''}
                      </div>
                    </div>
                    <span className={styles.muted}>{longDate(message.date)}</span>
                  </header>
                  <pre className={styles.body}>{message.body}</pre>
                  <footer className={styles.messageFoot}>
                    <button type="button" className={styles.linkBtn} onClick={() => startReply(message)}>
                      Reply to this email
                    </button>
                    {message.stored ? (
                      <>
                        <span className={styles.badge}>Saved to {message.stored.clientName || 'client'}</span>
                        <button type="button" className={styles.linkBtn} onClick={() => void summarise(message)}>
                          Summarise to timeline
                        </button>
                      </>
                    ) : message.match ? (
                      <span className={styles.muted}>Matches {message.match.name}; saved on next sync</span>
                    ) : (
                      <span className={styles.assign}>
                        <select value={assignClientId} onChange={(e) => setAssignClientId(e.target.value)} aria-label="Assign to client">
                          <option value="">Assign to client…</option>
                          {clients.map((client) => (
                            <option key={client.id} value={client.id}>
                              {client.name}
                            </option>
                          ))}
                        </select>
                        <button type="button" className={styles.linkBtn} disabled={!assignClientId} onClick={() => void assign(message)}>
                          Save
                        </button>
                      </span>
                    )}
                  </footer>
                </article>
              ))}
            </>
          )}

          {summary ? (
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>Summary for {summary.email.stored?.clientName || 'client'} timeline</h3>
              <p className={styles.muted}>The AI saw only this one email. Review and edit before adding.</p>
              {summary.busy && !summary.text ? <p className={styles.muted}>Summarising…</p> : null}
              {summary.text || !summary.busy ? (
                <textarea
                  className={styles.textarea}
                  rows={4}
                  value={summary.text}
                  onChange={(e) => setSummary({ ...summary, text: e.target.value })}
                />
              ) : null}
              {summary.note ? <p className={styles.errorText}>{summary.note}</p> : null}
              <div className={styles.actions}>
                <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={summary.busy || !summary.text.trim()} onClick={() => void confirmSummary()}>
                  Add to timeline
                </button>
                <button type="button" className={styles.btn} onClick={() => setSummary(null)}>
                  Discard
                </button>
              </div>
            </div>
          ) : null}

          {composer ? (
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>
                {composer.mode === 'reply' ? `Reply to ${senderName(composer.replyTo?.from ?? '')}` : 'New email'}
              </h3>
              <label className={styles.field}>
                <span>To</span>
                <input value={composer.to} onChange={(e) => setComposer({ ...composer, to: e.target.value })} />
              </label>
              <label className={styles.field}>
                <span>Cc</span>
                <input value={composer.cc} onChange={(e) => setComposer({ ...composer, cc: e.target.value })} />
              </label>
              <label className={styles.field}>
                <span>Subject</span>
                <input value={composer.subject} onChange={(e) => setComposer({ ...composer, subject: e.target.value })} />
              </label>
              <div className={styles.aiRow}>
                <input
                  className={styles.instruction}
                  value={composer.instruction}
                  onChange={(e) => setComposer({ ...composer, instruction: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void writeWithAi()
                    }
                  }}
                  placeholder={
                    composer.mode === 'reply'
                      ? 'Instruction for the AI, e.g. "reply saying Thursday works, keep it short"'
                      : 'What should the email say?'
                  }
                  aria-label="Instruction for the AI"
                />
                <button type="button" className={styles.btn} onClick={() => void writeWithAi()} disabled={composer.busy !== ''}>
                  {composer.busy === 'ai' ? 'Writing…' : 'Write with AI'}
                </button>
              </div>
              <p className={styles.muted}>
                {composer.mode === 'reply'
                  ? 'The AI sees only the email you are replying to, plus your instruction.'
                  : 'The AI sees only your instruction. No emails are shared.'}
              </p>
              <textarea
                className={styles.textarea}
                rows={12}
                value={composer.body}
                onChange={(e) => setComposer({ ...composer, body: e.target.value })}
                placeholder="Write here, or use Write with AI. Nothing is sent until you click Send."
                aria-label="Email body"
              />
              {composer.note ? <p className={styles.note}>{composer.note}</p> : null}
              <div className={styles.actions}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.primary}`}
                  onClick={() => void send()}
                  disabled={composer.busy !== '' || !composer.body.trim() || !composer.to.trim()}
                >
                  {composer.busy === 'send' ? 'Sending…' : 'Send'}
                </button>
                <button type="button" className={styles.btn} onClick={() => void saveDraft()} disabled={composer.busy !== '' || !composer.body.trim()}>
                  {composer.busy === 'draft' ? 'Saving…' : 'Save as draft'}
                </button>
                <button type="button" className={styles.linkBtn} onClick={() => setComposer(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}
