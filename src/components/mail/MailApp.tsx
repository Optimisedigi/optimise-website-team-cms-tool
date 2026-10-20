'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styles from './MailApp.module.css'
import { useIsMobileViewport, useSwipeBack } from '../../lib/swipe'
import EmailBody from './EmailBody'
import CalendarInviteCard from './CalendarInviteCard'
import type { ThreadInvite } from '../../lib/mail/calendar-invite'
import { browserStorage, clearPrompt, promptKeys } from '../../lib/mail/ai-prompt-store'
import ComposeWindow, { type ComposeContent, type ComposeFile, type ComposeState } from './ComposeWindow'
import { HIDDEN_SENDERS_PREF_KEY, isHiddenSender, normaliseHiddenSender } from '../../lib/mail/hidden-senders'
import {
  CLIENT_SENDERS_PREF_KEY,
  isClientSender,
  matchingClientSenderEntries,
  normaliseClientSender,
} from '../../lib/mail/client-senders'
import { normaliseDomain, SHARED_MAILBOX_DOMAINS } from '../../lib/mail/client-matching'
import { MAIL_DRAFT_QUERY_PARAM, MAIL_THREAD_QUERY_PARAM, isGmailId } from '../../lib/mail/drafts'
import { MAIL_TABS, mailTabLabel, unreadFirst, type MailFolder, type MailTab, type MailTabCounts } from '../../lib/mail/folders'
import ScheduledPanel, { type ScheduledDetail, type ScheduledItem } from './ScheduledPanel'
import AwaitingPanel, { type FollowUpItem } from './AwaitingPanel'
import { addBusinessDays } from '../../lib/mail/schedule-times'
import { MAIL_AUTO_REFRESH_MS, isMailAutoRefreshWindow } from '../../lib/mail/auto-refresh'

/**
 * CMS Mail view. Folder list (Inbox / Sent / Drafts, plus the Scheduled queue) → reading pane (newest
 * message first) → Gmail-style compose window (bottom right) with an
 * OptiMate-style AI refine loop. A Drafts row opens in the compose window.
 *
 * Model calls happen only on explicit clicks ("Write with AI", "Summarise"),
 * each sending at most the one selected email id. Nothing is sent until the
 * user clicks Send. Client matching/storage happen server-side in plain code.
 *
 * `/admin/mail?draft=<gmail message id>` opens that Gmail draft in the compose
 * window (OptiMate links its saved drafts here instead of to Gmail).
 */

export interface MailClientOption {
  id: number
  name: string
}

const COUNTS_REFRESH_MS = 60_000
const FOLDER_LABELS: Record<MailFolder, string> = { inbox: 'Inbox', sent: 'Sent', drafts: 'Drafts' }
const FOLDER_EMPTY: Record<MailFolder, string> = { inbox: 'Inbox is empty.', sent: 'No sent emails.', drafts: 'No drafts.' }

interface ThreadRow {
  threadId: string
  messageId: string
  from: string
  to: string
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
  /** Sanitised HTML document, or '' for plain-text emails. */
  html: string
  unread: boolean
  stored: { id: number; clientId: number; clientName: string } | null
  match: { id: number; name: string; matchedOn: string } | null
}


interface DraftResponse {
  draftId: string
  to: string
  cc: string
  bcc?: string
  signOff?: string
  subject: string
  html: string
  attachments: ComposeFile[]
  threadId: string
  replyTo: { messageId: string; from: string; subject: string } | null
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

/** "Jo Smith <jo@x.com>, sam@y.com" → "Jo Smith, sam@y.com" for Sent/Drafts rows. */
export function recipientNames(to: string): string {
  return to
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((entry) => senderName(entry.trim()))
    .filter(Boolean)
    .join(', ')
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
  const [folder, setFolder] = useState<MailFolder>('inbox')
  // The Scheduled tab shows the send queue instead of a Gmail folder.
  const [showScheduled, setShowScheduled] = useState(false)
  const [scheduled, setScheduled] = useState<ScheduledItem[]>([])
  const [scheduledLoading, setScheduledLoading] = useState(false)
  const [selectedScheduledId, setSelectedScheduledId] = useState<number | null>(null)
  // The Awaiting reply tab lists sent emails with a follow-up reminder (CMS-held).
  const [showAwaiting, setShowAwaiting] = useState(false)
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([])
  const [followUpsLoading, setFollowUpsLoading] = useState(false)
  // A CMS tab (Scheduled / Awaiting reply) is shown instead of a Gmail folder.
  const panelOpen = showScheduled || showAwaiting
  // Badge numbers on the Inbox (unread) and Drafts tabs; null until first loaded.
  const [counts, setCounts] = useState<MailTabCounts | null>(null)
  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [account, setAccount] = useState('')
  // Senders hidden from the inbox list (stored in Payload user preferences; view-only).
  const [hiddenSenders, setHiddenSenders] = useState<string[]>([])
  const [showHiddenPanel, setShowHiddenPanel] = useState(false)
  const [hiddenInput, setHiddenInput] = useState('')
  const [hideChoice, setHideChoice] = useState(false)
  const [lastHidden, setLastHidden] = useState<string | null>(null)
  // Starred client senders: their unread mail shows in the dashboard panel (Payload user preferences).
  const [clientSenders, setClientSenders] = useState<string[]>([])
  const [showClientPanel, setShowClientPanel] = useState(false)
  const [clientInput, setClientInput] = useState('')
  const [starChoice, setStarChoice] = useState(false)
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [error, setError] = useState<{ message: string; connectUrl?: string } | null>(null)
  const [syncNote, setSyncNote] = useState('')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const isMobile = useIsMobileViewport()
  const readerRef = useRef<HTMLElement | null>(null)
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  // Calendar invite in the open thread; shown only while its message is loaded.
  const [threadInvite, setThreadInvite] = useState<ThreadInvite | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)
  const [threadError, setThreadError] = useState('')
  const [actionNote, setActionNote] = useState('')

  const [composer, setComposer] = useState<(ComposeState & { key: number }) | null>(null)
  const [summary, setSummary] = useState<{ email: ThreadMessage; text: string; model: string; busy: boolean; note: string } | null>(null)
  const [assignClientId, setAssignClientId] = useState('')
  // Stored-email cleanup (hidden senders / automated mail): counts first, delete on confirm.
  const [cleanup, setCleanup] = useState<{
    busy: boolean
    hidden: number | null
    automated: number | null
    more: boolean
    note: string
  }>({ busy: false, hidden: null, automated: null, more: false, note: '' })
  // Gmail signature shown in the compose window: '' = none set, null = unknown.
  const [signatureHtml, setSignatureHtml] = useState<string | null>(null)
  const threadRequest = useRef(0)
  const listRequest = useRef(0)
  // True once "Load more" added a page; auto-refresh then waits so the extra rows aren't dropped.
  const listAppended = useRef(false)
  const composeKey = useRef(0)

  const showError = useCallback((err: unknown) => {
    const e = err as Error & { connectUrl?: string }
    setError({ message: e.message || 'Something went wrong.', connectUrl: e.connectUrl })
  }, [])

  // Loads one folder's thread list. `folder` is always passed explicitly so the
  // callback stays stable; a request counter drops replies for a folder the
  // user has already switched away from.
  const loadInbox = useCallback(
    async (opts: { folder: MailFolder; append?: boolean; pageToken?: string | null; q?: string }) => {
      const request = ++listRequest.current
      setListLoading(true)
      try {
        const params = new URLSearchParams()
        params.set('folder', opts.folder)
        if (opts.pageToken) params.set('pageToken', opts.pageToken)
        if (opts.q) params.set('q', opts.q)
        const data = await api<{
          threads: ThreadRow[]
          nextPageToken: string | null
          account: string
          hiddenSenders?: string[]
          clientSenders?: string[]
        }>(
          `/api/mail/inbox?${params.toString()}`,
        )
        if (request !== listRequest.current) return
        setAccount(data.account)
        if (Array.isArray(data.hiddenSenders)) setHiddenSenders(data.hiddenSenders)
        if (Array.isArray(data.clientSenders)) setClientSenders(data.clientSenders)
        // Inbox: unread on top (across loaded pages); other folders keep Gmail's order.
        listAppended.current = Boolean(opts.append)
        setThreads((current) => {
          // Search results are message-based, so a thread can repeat on the next page.
          const seen = new Set(opts.append ? current.map((row) => row.threadId) : [])
          const fresh: ThreadRow[] = []
          for (const row of data.threads) {
            if (seen.has(row.threadId)) continue
            seen.add(row.threadId)
            fresh.push(row)
          }
          const next = opts.append ? [...current, ...fresh] : fresh
          return opts.folder === 'inbox' ? unreadFirst(next) : next
        })
        setNextPageToken(data.nextPageToken)
        setError(null)
      } catch (err) {
        if (request === listRequest.current) showError(err)
      } finally {
        if (request === listRequest.current) setListLoading(false)
      }
    },
    [showError],
  )

  const runSync = useCallback(async () => {
    setSyncNote('Syncing…')
    try {
      const result = await api<{ stored: number; checked: number; mode: string; failed?: number }>('/api/mail/sync', {
        method: 'POST',
      })
      const parts = [
        result.stored > 0 ? `Linked ${result.stored} new email${result.stored === 1 ? '' : 's'} to clients` : 'Up to date',
        result.failed ? `${result.failed} could not be saved` : '',
      ]
      setSyncNote(parts.filter(Boolean).join(' · '))
    } catch (err) {
      setSyncNote('')
      showError(err)
    }
  }, [showError])

  // Tab badges. Failures keep the last numbers; the list itself shows any Gmail error.
  const loadCounts = useCallback(async () => {
    try {
      const data = await api<MailTabCounts>('/api/mail/counts')
      if (typeof data.inboxUnread === 'number' && typeof data.drafts === 'number') {
        setCounts({
          inboxUnread: data.inboxUnread,
          drafts: data.drafts,
          ...(typeof data.scheduled === 'number' ? { scheduled: data.scheduled } : {}),
          ...(typeof data.followUpsDue === 'number' ? { followUpsDue: data.followUpsDue } : {}),
        })
      }
    } catch {
      // Keep the previous counts.
    }
  }, [])

  const loadScheduled = useCallback(async () => {
    setScheduledLoading(true)
    try {
      const data = await api<{ items: ScheduledItem[] }>('/api/mail/schedule')
      setScheduled(data.items)
      // Drop the open email if it left the queue (sent or cancelled).
      setSelectedScheduledId((id) => (id !== null && data.items.some((item) => item.id === id) ? id : null))
      setError(null)
    } catch (err) {
      showError(err)
    } finally {
      setScheduledLoading(false)
    }
  }, [showError])

  const loadFollowUps = useCallback(async () => {
    setFollowUpsLoading(true)
    try {
      const data = await api<{ items: FollowUpItem[] }>('/api/mail/follow-ups')
      setFollowUps(data.items)
      setError(null)
    } catch (err) {
      showError(err)
    } finally {
      setFollowUpsLoading(false)
    }
  }, [showError])

  const refresh = useCallback(async () => {
    await Promise.all([
      runSync(),
      showScheduled ? loadScheduled() : showAwaiting ? loadFollowUps() : loadInbox({ folder, q: query }),
      loadCounts(),
    ])
  }, [folder, loadCounts, loadFollowUps, loadInbox, loadScheduled, query, runSync, showAwaiting, showScheduled])

  // Auto-refresh every 5 minutes on Sydney weekdays 6:30am–6:30pm, only while
  // Mail is on screen. Skips while composing, loading, or after "Load more", so
  // the list never reshuffles mid-task. Refs keep one stable timer.
  const autoRefreshState = useRef({ refresh, composing: false, loading: false })
  autoRefreshState.current = { refresh, composing: composer !== null, loading: listLoading }
  useEffect(() => {
    const timer = window.setInterval(() => {
      const { refresh: run, composing, loading } = autoRefreshState.current
      if (document.visibilityState !== 'visible' || composing || loading || listAppended.current) return
      if (!isMailAutoRefreshWindow(new Date())) return
      void run()
    }, MAIL_AUTO_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [])

  // Sync on open.
  useEffect(() => {
    void runSync()
    void loadInbox({ folder: 'inbox' })
    void loadCounts()
  }, [runSync, loadInbox, loadCounts])

  // Keep the badges current while the tab is open.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadCounts()
    }, COUNTS_REFRESH_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadCounts()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [loadCounts])

  // Switching folders clears the list, the selection and the search; the
  // compose window stays so an in-progress draft is not lost.
  const switchFolder = useCallback(
    (next: MailFolder) => {
      if (next === folder) return
      threadRequest.current++
      setFolder(next)
      setThreads([])
      setNextPageToken(null)
      setSelectedThreadId(null)
      setMessages([])
      setThreadLoading(false)
      setThreadError('')
      setActionNote('')
      setSummary(null)
      setHideChoice(false)
      setStarChoice(false)
      setSearch('')
      setQuery('')
      void loadInbox({ folder: next })
    },
    [folder, loadInbox],
  )

  const selectTab = useCallback(
    (tab: MailTab) => {
      if (tab === 'awaiting') {
        if (showAwaiting) return
        threadRequest.current++
        setShowAwaiting(true)
        setShowScheduled(false)
        setSelectedScheduledId(null)
        setSelectedThreadId(null)
        setMessages([])
        setThreadError('')
        setActionNote('')
        setSummary(null)
        void loadFollowUps()
        void loadCounts()
        return
      }
      if (tab === 'scheduled') {
        if (showScheduled) return
        threadRequest.current++
        setShowAwaiting(false)
        setShowScheduled(true)
        setSelectedScheduledId(null)
        setSelectedThreadId(null)
        setMessages([])
        setThreadError('')
        setActionNote('')
        setSummary(null)
        void loadScheduled()
        return
      }
      setShowScheduled(false)
      setShowAwaiting(false)
      if (tab !== folder) switchFolder(tab)
      else void loadInbox({ folder, q: query })
      void loadCounts()
    },
    [folder, loadCounts, loadFollowUps, loadInbox, loadScheduled, query, showAwaiting, showScheduled, switchFolder],
  )

  const openThread = useCallback(
    async (thread: ThreadRow) => {
      const request = ++threadRequest.current
      setSelectedThreadId(thread.threadId)
      setHideChoice(false)
      setStarChoice(false)
      setComposer(null)
      setSummary(null)
      setActionNote('')
      setThreadError('')
      setThreadLoading(true)
      setAssignClientId('')
      try {
        const data = await api<{ messages: ThreadMessage[]; invite?: ThreadInvite | null }>(
          `/api/mail/thread/${encodeURIComponent(thread.threadId)}`,
        )
        if (request !== threadRequest.current) return
        setMessages(data.messages)
        setThreadInvite(data.invite ?? null)
        if (thread.unread) {
          setThreads((current) => current.map((row) => (row.threadId === thread.threadId ? { ...row, unread: false } : row)))
          api('/api/mail/modify', { method: 'POST', body: JSON.stringify({ threadId: thread.threadId, action: 'read' }) })
            .then(() => loadCounts())
            .catch((err) => setActionNote((err as Error).message))
        }
      } catch (err) {
        if (request === threadRequest.current) setThreadError((err as Error).message)
      } finally {
        if (request === threadRequest.current) setThreadLoading(false)
      }
    },
    [loadCounts],
  )

  useEffect(() => {
    let cancelled = false
    api<{ settingsAccess?: boolean; signatureHtml?: string }>('/api/gmail/status')
      .then((data) => {
        if (!cancelled && data.settingsAccess) setSignatureHtml(typeof data.signatureHtml === 'string' ? data.signatureHtml : '')
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const openDraft = useCallback(
    async (messageId: string) => {
      try {
        const draft = await api<DraftResponse>(`/api/gmail/draft?messageId=${encodeURIComponent(messageId)}`)
        if (draft.replyTo && draft.threadId) {
          void openThread({
            threadId: draft.threadId,
            messageId: draft.replyTo.messageId,
            from: draft.replyTo.from,
            to: '',
            subject: draft.replyTo.subject,
            snippet: '',
            date: '',
            unread: false,
            messageCount: 0,
            client: null,
          })
        }
        setSummary(null)
        setComposer({
          key: ++composeKey.current,
          mode: draft.replyTo ? 'reply' : 'new',
          replyTo: draft.replyTo,
          to: draft.to,
          cc: draft.cc,
          bcc: draft.bcc ?? '',
          ...(draft.signOff !== undefined ? { signOff: draft.signOff } : {}),
          subject: draft.subject,
          html: draft.html,
          attachments: draft.attachments,
          draftId: draft.draftId,
        })
      } catch (err) {
        showError(new Error(`Could not open the draft: ${(err as Error).message}`))
      }
    },
    [openThread, showError],
  )

  // Open a draft linked from OptiMate, then drop the param so a refresh doesn't reopen it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const draftMessageId = params.get(MAIL_DRAFT_QUERY_PARAM)
    if (!draftMessageId) return
    params.delete(MAIL_DRAFT_QUERY_PARAM)
    const rest = params.toString()
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`)
    void openDraft(draftMessageId)
  }, [openDraft])

  // Open a thread linked from the client email alert (`?thread=<id>`), then drop the param.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const threadId = params.get(MAIL_THREAD_QUERY_PARAM)
    if (!threadId) return
    params.delete(MAIL_THREAD_QUERY_PARAM)
    const rest = params.toString()
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`)
    if (!isGmailId(threadId)) return
    void openThread({
      threadId,
      messageId: '',
      from: '',
      to: '',
      subject: '',
      snippet: '',
      date: '',
      unread: true,
      messageCount: 0,
      client: null,
    })
  }, [openThread])

  const selectedThread = useMemo(() => threads.find((t) => t.threadId === selectedThreadId) ?? null, [threads, selectedThreadId])
  const latest = messages[messages.length - 1] ?? null
  const hideTarget = useMemo(() => {
    const own = account.toLowerCase()
    const message = [...messages].reverse().find((m) => senderAddress(m.from).toLowerCase() !== own)
    if (!message) return null
    const address = senderAddress(message.from).toLowerCase()
    const domain = normaliseDomain(address)
    return { address, domain: domain && !SHARED_MAILBOX_DOMAINS.has(domain) ? domain : '' }
  }, [messages, account])
  // Client-sender entries covering the open thread's sender (address or domain).
  const starredEntries = useMemo(
    () => (hideTarget ? matchingClientSenderEntries(hideTarget.address, clientSenders) : []),
    [hideTarget, clientSenders],
  )

  // ── Hidden senders ──
  // Saved to Payload's per-user preferences; the inbox route turns the list
  // into a Gmail search that leaves those senders out. Nothing changes in Gmail.
  async function saveHiddenSenders(next: string[]) {
    await api(`/api/payload-preferences/${HIDDEN_SENDERS_PREF_KEY}`, {
      method: 'POST',
      body: JSON.stringify({ value: { senders: next } }),
    })
    setHiddenSenders(next)
    await loadInbox({ folder, q: query })
  }

  async function hideSender(raw: string) {
    const entry = normaliseHiddenSender(raw)
    if (!entry || hiddenSenders.includes(entry)) return
    const next = [...hiddenSenders, entry]
    setHideChoice(false)
    // Drop matching threads straight away; the reload confirms it.
    setThreads((current) => current.filter((row) => !isHiddenSender(row.from, next)))
    if (selectedThread && isHiddenSender(selectedThread.from, next)) {
      setSelectedThreadId(null)
      setMessages([])
      setComposer(null)
      setSummary(null)
    }
    try {
      await saveHiddenSenders(next)
      setLastHidden(entry)
    } catch (err) {
      setError({ message: `Could not save the hidden sender: ${(err as Error).message}` })
      await loadInbox({ folder, q: query })
    }
  }

  async function unhideSender(entry: string) {
    setLastHidden(null)
    try {
      await saveHiddenSenders(hiddenSenders.filter((item) => item !== entry))
    } catch (err) {
      setError({ message: `Could not update hidden senders: ${(err as Error).message}` })
    }
  }

  // ── Client senders ──
  // Saved to Payload's per-user preferences. Only unread inbox mail from these
  // senders appears in the dashboard's "Unread client emails" panel.
  async function saveClientSenders(next: string[]) {
    const previous = clientSenders
    setClientSenders(next)
    try {
      await api(`/api/payload-preferences/${CLIENT_SENDERS_PREF_KEY}`, {
        method: 'POST',
        body: JSON.stringify({ value: { senders: next } }),
      })
    } catch (err) {
      setClientSenders(previous)
      setError({ message: `Could not update client senders: ${(err as Error).message}` })
    }
  }

  async function starSender(raw: string) {
    const entry = normaliseClientSender(raw)
    setStarChoice(false)
    if (!entry || clientSenders.includes(entry)) return
    await saveClientSenders([...clientSenders, entry])
  }

  async function unstarEntries(entries: string[]) {
    if (entries.length === 0) return
    await saveClientSenders(clientSenders.filter((item) => !entries.includes(item)))
  }

  async function checkCleanup() {
    setCleanup({ busy: true, hidden: null, automated: null, more: false, note: '' })
    try {
      const data = await api<{ hidden: number; automated: number; more: boolean }>('/api/mail/cleanup')
      setCleanup({ busy: false, hidden: data.hidden, automated: data.automated, more: data.more, note: '' })
    } catch (err) {
      setCleanup({ busy: false, hidden: null, automated: null, more: false, note: (err as Error).message })
    }
  }

  async function runCleanup() {
    const categories = [cleanup.hidden ? 'hidden' : '', cleanup.automated ? 'automated' : ''].filter(Boolean)
    if (categories.length === 0) return
    const total = (cleanup.hidden ?? 0) + (cleanup.automated ?? 0)
    if (!window.confirm(`Delete ${total} stored email${total === 1 ? '' : 's'} from the CMS? Gmail is not changed.`)) return
    setCleanup((current) => ({ ...current, busy: true, note: '' }))
    try {
      const data = await api<{ deleted: { hidden: number; automated: number }; more: boolean }>('/api/mail/cleanup', {
        method: 'POST',
        body: JSON.stringify({ categories }),
      })
      const deleted = data.deleted.hidden + data.deleted.automated
      setCleanup({
        busy: false,
        hidden: null,
        automated: null,
        more: false,
        note: `Deleted ${deleted} stored email${deleted === 1 ? '' : 's'}.${data.more ? ' More remain: check again.' : ''}`,
      })
    } catch (err) {
      setCleanup((current) => ({ ...current, busy: false, note: (err as Error).message }))
    }
  }

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
      void loadCounts()
    } catch (err) {
      setActionNote((err as Error).message)
    }
  }

  function startReply(message: ThreadMessage) {
    setSummary(null)
    // Replying to one of our own sent messages goes back to its recipients, not to ourselves.
    const ownMessage = account !== '' && senderAddress(message.from).toLowerCase() === account.toLowerCase()
    setComposer({
      key: ++composeKey.current,
      mode: 'reply',
      replyTo: {
        messageId: message.messageId,
        from: message.from,
        subject: message.subject,
        // Offers "Use client data"; the server re-resolves the client itself.
        client: message.stored
          ? { id: message.stored.clientId, name: message.stored.clientName }
          : message.match
            ? { id: message.match.id, name: message.match.name }
            : null,
      },
      to: ownMessage && message.to ? message.to : senderAddress(message.from),
      cc: '',
      subject: replySubject(message.subject),
      html: '',
      attachments: [],
    })
  }

  function startNew() {
    setSummary(null)
    setComposer({ key: ++composeKey.current, mode: 'new', replyTo: null, to: '', cc: '', subject: '', html: '', attachments: [] })
  }

  // Send is only ever reached from the compose window's Send button.
  async function sendComposed(state: ComposeState, content: ComposeContent) {
    if (state.scheduledId !== undefined) {
      // Save the edits to the queued email, then send that one now: the queue's
      // claim means it can only ever go out once, and a failure leaves it in the queue.
      await saveScheduledEdit(state.scheduledId, state, content, null)
      await api(`/api/mail/schedule/${state.scheduledId}`, { method: 'PATCH', body: JSON.stringify({ action: 'send-now' }) })
      setComposer(null)
      setActionNote('Sent.')
      void loadScheduled()
      void loadCounts()
      return
    }
    const data = await api<{ client: { name: string } | null; draftNote?: string | null; followUpNote?: string | null }>('/api/mail/send', {
      method: 'POST',
      body: JSON.stringify({
        to: state.to,
        cc: state.cc,
        bcc: state.bcc ?? '',
        ...(state.signOff !== undefined ? { signOff: state.signOff } : {}),
        subject: state.subject,
        html: content.html,
        inlineImages: content.inlineImages,
        attachments: content.attachments,
        replyToMessageId: state.replyTo?.messageId ?? '',
        ...(state.draftId ? { draftId: state.draftId } : {}),
        // Business days are counted in this browser's local time.
        ...(state.followUpDays ? { followUpAt: addBusinessDays(new Date(), state.followUpDays).toISOString() } : {}),
      }),
    })
    setComposer(null)
    setActionNote(
      [
        data.client ? `Sent. Saved to ${data.client.name}'s emails.` : 'Sent.',
        state.followUpDays && !data.followUpNote
          ? `You'll be reminded in ${state.followUpDays} business day${state.followUpDays === 1 ? '' : 's'} if there's no reply.`
          : '',
        data.draftNote ?? '',
        data.followUpNote ?? '',
      ]
        .filter(Boolean)
        .join(' '),
    )
    if (showAwaiting) void loadFollowUps()
    const thread = selectedThread
    if (thread && state.mode === 'reply') void openThread(thread)
    // The sent message now belongs in Sent, and a sent draft leaves Drafts.
    if (folder !== 'inbox' && !panelOpen) void loadInbox({ folder, q: query })
    void loadCounts()
  }

  // Queues the email; the server sends it at `when` (Gmail has no scheduled send).
  /** PUT the compose window's edits to a scheduled email; `when` null keeps its time. */
  async function saveScheduledEdit(id: number, state: ComposeState, content: ComposeContent, when: Date | null) {
    await api(`/api/mail/schedule/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        to: state.to,
        cc: state.cc,
        bcc: state.bcc ?? '',
        ...(state.signOff !== undefined ? { signOff: state.signOff } : {}),
        subject: state.subject,
        html: content.html,
        inlineImages: content.inlineImages,
        attachments: content.attachments,
        ...(when ? { scheduledFor: when.toISOString() } : {}),
        followUpDays: state.followUpDays ?? 0,
      }),
    })
  }

  async function scheduleComposed(state: ComposeState, content: ComposeContent, when: Date) {
    if (state.scheduledId !== undefined) {
      await saveScheduledEdit(state.scheduledId, state, content, when)
      setComposer(null)
      setActionNote(`Updated. Sends ${longDate(when.toISOString())}.`)
      void loadScheduled()
      void loadCounts()
      return
    }
    const data = await api<{ draftNote?: string | null }>('/api/mail/schedule', {
      method: 'POST',
      body: JSON.stringify({
        to: state.to,
        cc: state.cc,
        bcc: state.bcc ?? '',
        ...(state.signOff !== undefined ? { signOff: state.signOff } : {}),
        subject: state.subject,
        html: content.html,
        inlineImages: content.inlineImages,
        attachments: content.attachments,
        replyToMessageId: state.replyTo?.messageId ?? '',
        scheduledFor: when.toISOString(),
        ...(state.draftId ? { draftId: state.draftId } : {}),
        ...(state.followUpDays ? { followUpDays: state.followUpDays } : {}),
      }),
    })
    setComposer(null)
    setActionNote([`Scheduled for ${longDate(when.toISOString())}.`, data.draftNote ?? ''].filter(Boolean).join(' '))
    if (showScheduled) void loadScheduled()
    else if (folder === 'drafts') void loadInbox({ folder, q: query })
    void loadCounts()
  }

  async function sendScheduledNow(id: number) {
    try {
      await api(`/api/mail/schedule/${id}`, { method: 'PATCH', body: JSON.stringify({ action: 'send-now' }) })
      setActionNote('Sent.')
    } finally {
      // Sent, or failed and marked so: either way the list changed.
      await loadScheduled()
      void loadCounts()
    }
  }

  async function rescheduleScheduled(id: number, when: Date) {
    await api(`/api/mail/schedule/${id}`, { method: 'PATCH', body: JSON.stringify({ scheduledFor: when.toISOString() }) })
    await loadScheduled()
    void loadCounts()
  }

  async function cancelScheduled(id: number) {
    await api(`/api/mail/schedule/${id}`, { method: 'DELETE' })
    setScheduled((current) => current.filter((item) => item.id !== id))
    setSelectedScheduledId((current) => (current === id ? null : current))
    void loadCounts()
  }

  const loadScheduledDetail = useCallback((id: number) => api<ScheduledDetail>(`/api/mail/schedule/${id}`), [])

  /** Scheduled tab → Edit: open the queued email in the compose window. */
  function editScheduled(detail: ScheduledDetail) {
    setSummary(null)
    const { item } = detail
    setComposer({
      key: ++composeKey.current,
      mode: detail.replyToMessageId ? 'reply' : 'new',
      replyTo: detail.replyToMessageId ? { messageId: detail.replyToMessageId, from: item.to, subject: item.subject } : null,
      to: item.to,
      cc: item.cc,
      bcc: detail.bcc,
      ...(detail.signOff !== undefined ? { signOff: detail.signOff } : {}),
      subject: item.subject,
      html: detail.html,
      attachments: detail.attachments,
      scheduledId: item.id,
      scheduledFor: item.scheduledFor,
      // Keep the reminder exactly as queued (off stays off; no client default).
      followUpDays: detail.followUpDays ?? 0,
    })
  }

  /** Awaiting reply → Draft follow-up: a reply to the sent email with the AI instruction pre-filled. */
  function startFollowUp(item: FollowUpItem) {
    setSummary(null)
    setComposer({
      key: ++composeKey.current,
      mode: 'reply',
      replyTo: {
        messageId: item.sentMessageId,
        from: account,
        subject: item.subject,
        client: item.clientId !== null ? { id: item.clientId, name: item.clientName } : null,
      },
      to: item.to,
      cc: '',
      subject: replySubject(item.subject),
      html: '',
      attachments: [],
      aiPrompt: 'Write a short, polite follow-up nudging for a reply',
    })
  }

  /** Awaiting reply → Open thread: show it in Sent, where the email lives. */
  function openFollowUpThread(item: FollowUpItem) {
    selectTab('sent')
    void openThread({
      threadId: item.threadId,
      messageId: item.sentMessageId,
      from: account,
      to: item.to,
      subject: item.subject,
      snippet: '',
      date: item.sentAt,
      unread: false,
      messageCount: 0,
      client: item.clientId !== null ? { id: item.clientId, name: item.clientName } : null,
    })
  }

  async function snoozeFollowUp(id: number, when: Date) {
    await api(`/api/mail/follow-ups/${id}`, { method: 'PATCH', body: JSON.stringify({ action: 'snooze', remindAt: when.toISOString() }) })
    setActionNote(`Reminder moved to ${longDate(when.toISOString())}.`)
    await loadFollowUps()
    void loadCounts()
  }

  async function dismissFollowUp(id: number) {
    await api(`/api/mail/follow-ups/${id}`, { method: 'PATCH', body: JSON.stringify({ action: 'dismiss' }) })
    setFollowUps((current) => current.filter((item) => item.id !== id))
    void loadCounts()
  }

  async function deleteDraftRow(thread: ThreadRow) {
    if (!window.confirm('Delete this draft?')) return
    try {
      const data = await api<{ draftId?: string }>(`/api/gmail/draft?messageId=${encodeURIComponent(thread.messageId)}`, {
        method: 'DELETE',
      })
      if (data.draftId) clearPrompt(browserStorage(), promptKeys({ mode: 'new', draftId: data.draftId, startedNew: false }))
      setThreads((current) => current.filter((row) => row.threadId !== thread.threadId))
      void loadCounts()
    } catch (err) {
      showError(err)
    }
  }

  async function deleteComposedDraft(draftId: string): Promise<void> {
    await api(`/api/gmail/draft?draftId=${encodeURIComponent(draftId)}`, { method: 'DELETE' })
    if (folder === 'drafts' && !panelOpen) void loadInbox({ folder, q: query })
    void loadCounts()
  }

  async function saveComposedDraft(state: ComposeState, content: ComposeContent): Promise<string | undefined> {
    const data = await api<{ draftId?: string }>('/api/gmail/draft', {
      method: 'POST',
      body: JSON.stringify({
        to: state.to,
        cc: state.cc,
        bcc: state.bcc ?? '',
        ...(state.signOff !== undefined ? { signOff: state.signOff } : {}),
        subject: state.subject,
        html: content.html,
        inlineImages: content.inlineImages,
        attachments: content.attachments,
        ...(state.replyTo ? { replyToMessageId: state.replyTo.messageId } : {}),
        ...(state.draftId ? { draftId: state.draftId } : {}),
      }),
    })
    if (folder === 'drafts' && !panelOpen) void loadInbox({ folder, q: query })
    void loadCounts()
    return data.draftId
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

  // Mobile: the reader slides over the list. Back = close the panel, which also
  // gives the phone's back button / back swipe a history entry to pop.
  const readerOpen = isMobile && (showScheduled ? selectedScheduledId !== null : !!selectedThreadId)
  const closeReader = useCallback(() => {
    setSelectedScheduledId(null)
    threadRequest.current++
    setSelectedThreadId(null)
    setMessages([])
    setThreadLoading(false)
    setThreadError('')
    setSummary(null)
  }, [])
  useSwipeBack(readerRef, closeReader, readerOpen)
  useEffect(() => {
    if (!readerOpen) return
    window.history.pushState({ mailReader: true }, '')
    const onPop = () => closeReader()
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      if (window.history.state?.mailReader) window.history.back()
    }
  }, [readerOpen, closeReader])

  return (
    <div className={`${styles.app} ${readerOpen ? styles.appReaderOpen : ''}`}>
      <div className={styles.toolbar}>
        {account ? <span className={styles.muted}>{account}</span> : null}
        <div className={styles.folders} role="tablist" aria-label="Mail folders">
          {MAIL_TABS.map((entry) => {
            const active =
              entry === 'scheduled' ? showScheduled : entry === 'awaiting' ? showAwaiting : !panelOpen && entry === folder
            return (
              <button
                key={entry}
                type="button"
                role="tab"
                className={`${styles.btn} ${styles.folderBtn} ${active ? styles.folderActive : ''}`}
                aria-selected={active}
                onClick={() => selectTab(entry)}
              >
                {mailTabLabel(entry, counts)}
              </button>
            )
          })}
        </div>
        {panelOpen ? null : <form
          className={styles.search}
          onSubmit={(event) => {
            event.preventDefault()
            setQuery(search)
            void loadInbox({ folder, q: search })
          }}
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${FOLDER_LABELS[folder].toLowerCase()}`}
            aria-label={`Search ${FOLDER_LABELS[folder].toLowerCase()}`}
          />
        </form>}
        <span className={styles.muted}>{syncNote}</span>
        {/* Collapsed confirmation of the last hide, so it does not take a full row. */}
        {lastHidden ? (
          <details key={lastHidden} className={styles.hiddenNote}>
            <summary className={styles.muted}>Sender hidden</summary>
            <span className={styles.hiddenNoteBody}>
              Hidden {lastHidden.startsWith('@') ? `everyone at ${lastHidden}` : lastHidden}.{' '}
              <button type="button" className={styles.linkBtn} onClick={() => void unhideSender(lastHidden)}>
                Undo
              </button>
            </span>
          </details>
        ) : null}
        <button
          type="button"
          className={styles.btn}
          onClick={() => setShowHiddenPanel((open) => !open)}
          aria-expanded={showHiddenPanel}
          title="Senders hidden from this inbox"
        >
          Hidden{hiddenSenders.length ? ` (${hiddenSenders.length})` : ''}
        </button>
        <button
          type="button"
          className={styles.btn}
          onClick={() => setShowClientPanel((open) => !open)}
          aria-expanded={showClientPanel}
          title="Senders whose unread emails show on the dashboard"
        >
          ★ Clients{clientSenders.length ? ` (${clientSenders.length})` : ''}
        </button>
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

      {showClientPanel ? (
        <div className={styles.panel} style={{ marginTop: 0 }}>
          <h3 className={styles.panelTitle}>Client senders</h3>
          <p className={styles.muted}>
            Unread emails from these addresses or domains show in the dashboard&apos;s Unread client emails panel. Star a sender from an open
            email, or add one here. Gmail is not changed.
          </p>
          {clientSenders.length === 0 ? <p className={styles.muted}>No client senders yet.</p> : null}
          <ul className={styles.hiddenList}>
            {clientSenders.map((entry) => (
              <li key={entry}>
                <span>{entry.startsWith('@') ? `Anyone at ${entry}` : entry}</span>
                <button type="button" className={styles.linkBtn} onClick={() => void unstarEntries([entry])}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <form
            className={styles.aiRow}
            onSubmit={(event) => {
              event.preventDefault()
              const entry = normaliseClientSender(clientInput)
              if (!entry) {
                setError({ message: 'Enter an email address (jo@client.com) or a domain (@client.com).' })
                return
              }
              setClientInput('')
              void starSender(entry)
            }}
          >
            <input
              className={styles.instruction}
              value={clientInput}
              onChange={(e) => setClientInput(e.target.value)}
              placeholder="Add an address (jo@client.com) or a domain (@client.com)"
              aria-label="Client sender to add"
            />
            <button type="submit" className={styles.btn}>
              Add
            </button>
          </form>
        </div>
      ) : null}

      {showHiddenPanel ? (
        <div className={styles.panel} style={{ marginTop: 0 }}>
          <h3 className={styles.panelTitle}>Hidden senders</h3>
          <p className={styles.muted}>
            Emails from these addresses or domains are left out of this inbox and are no longer saved to client timelines. They stay in Gmail untouched.
          </p>
          {hiddenSenders.length === 0 ? <p className={styles.muted}>Nothing hidden yet.</p> : null}
          <ul className={styles.hiddenList}>
            {hiddenSenders.map((entry) => (
              <li key={entry}>
                <span>{entry.startsWith('@') ? `Anyone at ${entry}` : entry}</span>
                <button type="button" className={styles.linkBtn} onClick={() => void unhideSender(entry)}>
                  Show again
                </button>
              </li>
            ))}
          </ul>
          <form
            className={styles.aiRow}
            onSubmit={(event) => {
              event.preventDefault()
              const entry = normaliseHiddenSender(hiddenInput)
              if (!entry) {
                setError({ message: 'Enter an email address (orders@shop.com) or a domain (@shop.com).' })
                return
              }
              setHiddenInput('')
              void hideSender(entry)
            }}
          >
            <input
              className={styles.instruction}
              value={hiddenInput}
              onChange={(e) => setHiddenInput(e.target.value)}
              placeholder="Add an address (orders@shop.com) or a domain (@shop.com)"
              aria-label="Sender to hide"
            />
            <button type="submit" className={styles.btn}>
              Hide
            </button>
          </form>

          <h3 className={styles.panelTitle}>Stored emails</h3>
          <p className={styles.muted}>
            Remove emails already saved to clients that are from hidden senders or automated (no-reply, notifications, newsletters). Emails you
            assigned by hand or summarised to a timeline are kept. Gmail is not changed.
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.btn} onClick={() => void checkCleanup()} disabled={cleanup.busy}>
              {cleanup.busy && cleanup.hidden === null ? 'Checking…' : 'Check stored emails'}
            </button>
            {cleanup.hidden !== null && cleanup.automated !== null ? (
              cleanup.hidden + cleanup.automated > 0 ? (
                <>
                  <span className={styles.muted}>
                    {cleanup.hidden} from hidden senders · {cleanup.automated} automated{cleanup.more ? ' (first 1,000 checked)' : ''}
                  </span>
                  <button type="button" className={styles.btn} onClick={() => void runCleanup()} disabled={cleanup.busy}>
                    {cleanup.busy ? 'Deleting…' : `Delete ${cleanup.hidden + cleanup.automated}`}
                  </button>
                </>
              ) : (
                <span className={styles.muted}>Nothing to remove.</span>
              )
            ) : null}
          </div>
          {cleanup.note ? <p className={styles.note}>{cleanup.note}</p> : null}
        </div>
      ) : null}

      {panelOpen && actionNote ? <p className={styles.note}>{actionNote}</p> : null}
      {showAwaiting ? (
        <AwaitingPanel
          items={followUps}
          loading={followUpsLoading}
          onDraftFollowUp={startFollowUp}
          onOpenThread={openFollowUpThread}
          onSnooze={snoozeFollowUp}
          onDismiss={dismissFollowUp}
        />
      ) : null}
      {showScheduled ? (
        <ScheduledPanel
          items={scheduled}
          loading={scheduledLoading}
          selectedId={selectedScheduledId}
          onSelect={(id) => {
            if (id === null && window.history.state?.mailReader) window.history.back()
            else setSelectedScheduledId(id)
          }}
          isMobile={isMobile}
          loadDetail={loadScheduledDetail}
          onEdit={editScheduled}
          onSendNow={sendScheduledNow}
          onReschedule={rescheduleScheduled}
          onCancel={cancelScheduled}
        />
      ) : null}

      <div className={styles.panes} style={panelOpen ? { display: 'none' } : undefined}>
        <ul className={styles.list} aria-label={FOLDER_LABELS[folder]}>
          {threads.map((thread) => (
            <li key={thread.threadId} className={styles.rowItem}>
              <button
                type="button"
                className={`${styles.row} ${thread.unread ? styles.unread : ''} ${thread.threadId === selectedThreadId ? styles.selected : ''}`}
                onClick={() => (folder === 'drafts' ? void openDraft(thread.messageId) : void openThread(thread))}
              >
                <span className={styles.rowTop}>
                  <span className={styles.senderLine}>
                  <span className={styles.sender}>
                    {folder === 'inbox' ? (
                      <>
                        {isClientSender(thread.from, clientSenders) ? (
                          <span className={styles.star} role="img" title="Client sender" aria-label="Client sender">
                            ★{' '}
                          </span>
                        ) : null}
                        {senderName(thread.from)}
                      </>
                    ) : (
                      <>
                        {folder === 'drafts' ? <span className={styles.draftTag}>Draft</span> : null}
                        To {recipientNames(thread.to) || '(no recipient)'}
                      </>
                    )}
                    {thread.messageCount > 1 ? <span className={styles.count}>{thread.messageCount}</span> : null}
                  </span>
                  {thread.client ? (
                    <span className={styles.badge} title={thread.client.name}>
                      {thread.client.name}
                    </span>
                  ) : null}
                  </span>
                  <span className={styles.date}>{shortDate(thread.date)}</span>
                </span>
                <span className={styles.subject}>{thread.subject || '(no subject)'}</span>
                <span className={styles.snippet}>{thread.snippet}</span>
              </button>
              {folder === 'drafts' ? (
                <button
                  type="button"
                  className={styles.deleteDraft}
                  aria-label="Delete draft"
                  title="Delete draft"
                  onClick={() => void deleteDraftRow(thread)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
                  </svg>
                </button>
              ) : null}
            </li>
          ))}
          {listLoading ? <li className={styles.empty}>Loading…</li> : null}
          {!listLoading && threads.length === 0 && !error ? <li className={styles.empty}>{FOLDER_EMPTY[folder]}</li> : null}
          {!listLoading && nextPageToken ? (
            <li className={styles.moreItem}>
              <button type="button" className={styles.more} onClick={() => void loadInbox({ folder, append: true, pageToken: nextPageToken, q: query })}>
                Load more
              </button>
            </li>
          ) : null}
        </ul>

        <section
          ref={readerRef}
          className={`${styles.reader} ${readerOpen ? styles.readerOpen : ''}`}
          aria-label="Reading pane"
          aria-hidden={isMobile && !readerOpen ? true : undefined}
          data-testid="mail-reader"
        >
          {isMobile && selectedThreadId ? (
            <div className={styles.mobileBar}>
              <button type="button" className={styles.backBtn} onClick={() => window.history.state?.mailReader ? window.history.back() : closeReader()} aria-label="Back to inbox">
                ‹ Inbox
              </button>
            </div>
          ) : null}
          {!selectedThreadId ? (
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
                  {/* Archive and read state are inbox labels; they do not apply to Sent. */}
                  {folder === 'inbox' ? (
                    <>
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
                    </>
                  ) : null}
                  {hideTarget ? (
                    starredEntries.length > 0 ? (
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.starred}`}
                        onClick={() => void unstarEntries(starredEntries)}
                        aria-pressed="true"
                        title={`Client sender (${starredEntries.join(', ')}). Click to unstar.`}
                      >
                        ★ Client
                      </button>
                    ) : hideTarget.domain && starChoice ? (
                      <span className={styles.assign}>
                        <button type="button" className={styles.btn} onClick={() => void starSender(hideTarget.address)}>
                          Star {hideTarget.address}
                        </button>
                        <button type="button" className={styles.btn} onClick={() => void starSender(`@${hideTarget.domain}`)}>
                          Star all @{hideTarget.domain}
                        </button>
                        <button type="button" className={styles.linkBtn} onClick={() => setStarChoice(false)}>
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={styles.btn}
                        onClick={() => (hideTarget.domain ? setStarChoice(true) : void starSender(hideTarget.address))}
                        aria-pressed="false"
                        title="Mark as a client sender: their unread emails show on the dashboard"
                      >
                        ☆ Mark as client
                      </button>
                    )
                  ) : null}
                  {hideTarget ? (
                    hideTarget.domain ? (
                      hideChoice ? (
                        <span className={styles.assign}>
                          <button type="button" className={styles.btn} onClick={() => void hideSender(hideTarget.address)}>
                            Hide {hideTarget.address}
                          </button>
                          <button type="button" className={styles.btn} onClick={() => void hideSender(`@${hideTarget.domain}`)}>
                            Hide all @{hideTarget.domain}
                          </button>
                          <button type="button" className={styles.linkBtn} onClick={() => setHideChoice(false)}>
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button type="button" className={styles.btn} onClick={() => setHideChoice(true)} title="Leave this sender out of the inbox">
                          Hide sender
                        </button>
                      )
                    ) : (
                      <button type="button" className={styles.btn} onClick={() => void hideSender(hideTarget.address)} title="Leave this sender out of the inbox">
                        Hide sender
                      </button>
                    )
                  ) : null}
                </div>
              </div>
              {actionNote ? <p className={styles.note}>{actionNote}</p> : null}

              {threadInvite && messages.some((message) => message.messageId === threadInvite.messageId) ? (
                <CalendarInviteCard key={threadInvite.messageId} data={threadInvite} />
              ) : null}

              {/* Newest message first, like the latest sender at the top. */}
              {[...messages].reverse().map((message) => (
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
                  {message.html ? (
                    <EmailBody html={message.html} title={message.subject || 'Email'} />
                  ) : (
                    <pre className={styles.body}>{message.body}</pre>
                  )}
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

          {readerOpen && latest && !threadLoading && !composer ? (
            <div className={styles.replyBar} data-testid="mail-reply-bar">
              <button type="button" className={`${styles.btn} ${styles.primary} ${styles.replyBtn}`} onClick={() => startReply(latest)}>
                Reply with AI
              </button>
            </div>
          ) : null}
        </section>
      </div>

      {composer ? (
        <ComposeWindow
          key={composer.key}
          initial={composer}
          title={
            composer.scheduledId !== undefined
              ? 'Edit scheduled email'
              : composer.mode === 'reply'
                ? `Reply to ${senderName(composer.replyTo?.from ?? '')}`
                : 'New message'
          }
          onClose={() => setComposer(null)}
          onSend={sendComposed}
          onSchedule={scheduleComposed}
          onSaveDraft={saveComposedDraft}
          onDeleteDraft={deleteComposedDraft}
          signatureHtml={signatureHtml}
        />
      ) : null}
    </div>
  )
}
