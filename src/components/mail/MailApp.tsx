'use client'

import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import styles from './MailApp.module.css'
import { useIsMobileViewport, useSwipeBack } from '../../lib/swipe'
import EmailBody from './EmailBody'
import CalendarInviteCard from './CalendarInviteCard'
import type { ThreadInvite } from '../../lib/mail/calendar-invite'
import { browserStorage, clearPrompt, promptKeys } from '../../lib/mail/ai-prompt-store'
import type { ComposeContent, ComposeFile, ComposeState } from './ComposeWindow'
import { HIDDEN_SENDERS_PREF_KEY, isHiddenSender, normaliseHiddenSender } from '../../lib/mail/hidden-senders'
import {
  CLIENT_SENDERS_PREF_KEY,
  isClientSender,
  matchingClientSenderEntries,
  normaliseClientSender,
} from '../../lib/mail/client-senders'
import { normaliseDomain, SHARED_MAILBOX_DOMAINS } from '../../lib/mail/client-matching'
import { MAIL_DRAFT_QUERY_PARAM, MAIL_OPEN_LINK_EVENT, MAIL_THREAD_QUERY_PARAM, isGmailId } from '../../lib/mail/drafts'
import { MAIL_TABS, mailTabLabel, unreadFirst, type MailFolder, type MailTab, type MailTabCounts } from '../../lib/mail/folders'
import ScheduledPanel, { type ScheduledDetail, type ScheduledItem } from './ScheduledPanel'
import AwaitingPanel, { type FollowUpItem } from './AwaitingPanel'
import TriagePanel from './TriagePanel'
import { addBusinessDays } from '../../lib/mail/schedule-times'
import { MAIL_AUTO_REFRESH_MS, isMailAutoRefreshWindow } from '../../lib/mail/auto-refresh'
import {
  MAIL_ACCOUNT_QUERY_PARAM,
  MAIL_ACCOUNT_STORAGE_KEY,
  mailAccountHeaders,
  normaliseMailAccount,
} from '../../lib/mail/accounts-shared'
import type { SenderClientOverride } from '../../lib/mail/client-matching'
import { normaliseSenderEntry, senderClientFor } from '../../lib/mail/sender-clients'
import MailStepNav from './MailStepNav'
import { InboxSearch } from './InboxSearch'
import { searchSenderAddresses, type MailContact } from '../../lib/mail/contacts-shared'
import { loadSavedPeople, savePeople } from '../../lib/mail/people-cache'
import { forwardStartHtml, forwardSubject, hasOtherParticipants, replyRecipients } from '../../lib/mail/reply-actions'
import { exportFileName, messageToMarkdown, saveFile, threadToMarkdown } from '../../lib/mail/export'
import type { MailTag } from '../../lib/mail/tags'

/** People in the user's mail, from /api/mail/contacts. */
interface SearchPeople {
  contacts: MailContact[]
  senders: MailContact[]
}

function cleanContacts(value: unknown): MailContact[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (c): c is MailContact => typeof (c as MailContact)?.email === 'string' && typeof (c as MailContact)?.name === 'string',
  )
}

/** Phones (the overflow menu and floating compose button). */
const PHONE_MAX_WIDTH = 768

/**
 * The compose window (rich-text editor, voice) is a large chunk only needed
 * once you write an email: it is loaded after the first list shows, not with
 * the page.
 */
const loadComposeWindow = () => import('./ComposeWindow')
const ComposeWindow = lazy(loadComposeWindow)

/**
 * How long a search waits for the people list (/api/mail/contacts, slow on a
 * cold load) before running without part-name matches; when the list arrives
 * later and adds people, the search is run again with them. Normally the list
 * is ready at once: it is saved in this browser (see people-cache) and only
 * refreshed in the background.
 */
const SEARCH_PEOPLE_WAIT_MS = 300

/** Threads per bulk Mark as read request (the /api/mail/modify cap). */
const MODIFY_THREADS_PER_REQUEST = 50

/** Server reason (also read by agents/tools) → the wording users see in Mail. */
const GMAIL_NOT_CONNECTED_REASON = /gmail not connected for this user/i
const GMAIL_NOT_CONNECTED_COPY = 'Gmail isn\u2019t connected yet. Connect it to see client emails here.'

function friendlyMailError(message: string): { message: string; notConnected: boolean } {
  return GMAIL_NOT_CONNECTED_REASON.test(message)
    ? { message: GMAIL_NOT_CONNECTED_COPY, notConnected: true }
    : { message, notConnected: false }
}

/**
 * A "⋯" menu: the phone toolbar (Hidden / Clients / Refresh) and the open
 * email's less-used actions. Closes on outside tap and Escape.
 */
function MailOverflowMenu({
  items,
  label = 'More mail actions',
}: {
  items: Array<{ label: string; onSelect: () => void; disabled?: boolean; title?: string }>
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  useEffect(() => {
    if (!open) return
    const close = (event: Event) => {
      if (wrapRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div ref={wrapRef} className={styles.overflow}>
      <button
        ref={buttonRef}
        type="button"
        className={`${styles.btn} ${styles.overflowBtn}`}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        ⋯
      </button>
      {open ? (
        <div id={menuId} role="menu" aria-label={label} className={styles.overflowMenu}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={styles.overflowItem}
              disabled={item.disabled}
              title={item.title}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

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
 *
 * The breadcrumb's email is an account switcher (MailStepNav): Mail shows one
 * Gmail account at a time, the user's main Gmail or one of their extra
 * accounts, and every request names that account (MAIL_ACCOUNT_HEADER). A
 * compose window keeps the account it was opened in.
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
  /** Saved without the Gmail signature. */
  noSignature?: boolean
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

/** JSON request for the Gmail account `account` ('' = the main Gmail). */
async function apiRequest<T>(url: string, init: RequestInit | undefined, account: string): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...mailAccountHeaders(account), ...(init?.headers ?? {}) },
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

interface AccountsInfo {
  /** The main Gmail address, or null when none is connected. */
  primary: string | null
  accounts: Array<{ email: string }>
  addUrl: string
  extraAdds?: Array<{ url: string; label: string }>
  canAdd: boolean
}

/**
 * Mail always opens on the main Gmail; the account picked in the switcher
 * lasts while the page is open. Older versions remembered it in this browser,
 * which reopened an extra account after logging back in, so drop that.
 */
function forgetStoredAccount(): void {
  try {
    window.localStorage.removeItem(MAIL_ACCOUNT_STORAGE_KEY)
  } catch {
    // Storage unavailable: nothing was stored.
  }
}

export default function MailApp({ clients }: { clients: MailClientOption[] }) {
  // The Gmail account on screen: '' = the user's main Gmail, else an extra account's address.
  // The ref is what requests read, so callbacks never send a stale account.
  const accountRef = useRef('')
  const [activeAccount, setActiveAccount] = useState('')
  const [accountsInfo, setAccountsInfo] = useState<AccountsInfo | null>(null)
  /** Mail request on the account on screen. */
  function api<T>(url: string, init?: RequestInit): Promise<T> {
    return apiRequest<T>(url, init, accountRef.current)
  }
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
  // Inbox rows ticked for a bulk action (thread ids); only rows still listed count.
  const [checkedThreads, setCheckedThreads] = useState<Set<string>>(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  // Result of the last bulk action, shown above the list (the reading pane may be empty).
  const [bulkNote, setBulkNote] = useState('')
  const [account, setAccount] = useState('')
  // Senders hidden from the inbox list (stored in Payload user preferences; view-only).
  const [hiddenSenders, setHiddenSenders] = useState<string[]>([])
  const [showHiddenPanel, setShowHiddenPanel] = useState(false)
  // On-request AI triage of unread mail (sender + subject only).
  const [showTriagePanel, setShowTriagePanel] = useState(false)
  // Expanded triage takes the whole mail area; collapsed it is a slim bar above the inbox.
  const [triageExpanded, setTriageExpanded] = useState(true)
  /** Triage button: opens expanded; expands a collapsed panel; closes an expanded one. */
  const toggleTriage = () => {
    if (showTriagePanel && !triageExpanded) {
      setTriageExpanded(true)
      return
    }
    setTriageExpanded(true)
    setShowTriagePanel((open) => !open)
  }
  const [hiddenInput, setHiddenInput] = useState('')
  const [hideChoice, setHideChoice] = useState(false)
  const [lastHidden, setLastHidden] = useState<string | null>(null)
  // Starred client senders: their unread mail shows in the dashboard panel (Payload user preferences).
  const [clientSenders, setClientSenders] = useState<string[]>([])
  const [showClientPanel, setShowClientPanel] = useState(false)
  const [clientInput, setClientInput] = useState('')
  const [starChoice, setStarChoice] = useState(false)
  // The user's sender → client choices (which client pill a sender gets).
  const [senderClients, setSenderClients] = useState<SenderClientOverride[]>([])
  const [clientChoice, setClientChoice] = useState<{ sender: string; clientId: string; busy: boolean } | null>(null)
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [error, setError] = useState<{ message: string; connectUrl?: string } | null>(null)
  const [syncNote, setSyncNote] = useState('')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  // People for the Inbox search (suggestions and part-name matching), loaded
  // once per account when the search box is first focused.
  const [searchSenders, setSearchSenders] = useState<MailContact[]>([])
  const searchPeople = useRef<{ account: string; promise: Promise<SearchPeople> } | null>(null)
  // Extra `from:` addresses for the current Inbox search (see searchSenderAddresses).
  const querySenders = useRef<string[]>([])
  // The tag (Gmail label) whose emails the Inbox list shows instead of the inbox; null = the inbox.
  const [tagView, setTagView] = useState<MailTag | null>(null)
  const tagRef = useRef<MailTag | null>(null)

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const isMobile = useIsMobileViewport()
  const isPhone = useIsMobileViewport(PHONE_MAX_WIDTH)
  const readerRef = useRef<HTMLElement | null>(null)
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  // Calendar invite in the open thread; shown only while its message is loaded.
  const [threadInvite, setThreadInvite] = useState<ThreadInvite | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)
  const [threadError, setThreadError] = useState('')
  const [actionNote, setActionNote] = useState('')
  // The last thread moved to the Bin, offered for Undo above the list.
  const [lastDeleted, setLastDeleted] = useState<{ thread: ThreadRow; folder: MailFolder } | null>(null)
  // Message whose .eml is being downloaded, so its button shows progress.
  const [emlDownloading, setEmlDownloading] = useState<string | null>(null)

  /** Download one email as Gmail stores it (.eml), on the account on screen. */
  async function downloadEml(message: ThreadMessage) {
    setEmlDownloading(message.messageId)
    try {
      const res = await fetch(`/api/mail/message/${encodeURIComponent(message.messageId)}/eml`, {
        credentials: 'include',
        headers: mailAccountHeaders(accountRef.current),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as ApiError
        throw new Error(data.reason || data.error || `Download failed (${res.status})`)
      }
      saveFile(await res.blob(), exportFileName(message.subject, 'eml'))
    } catch (err) {
      setActionNote((err as Error).message)
    } finally {
      setEmlDownloading(null)
    }
  }

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
        if (opts.q && opts.folder === 'inbox' && querySenders.current.length > 0) {
          params.set('senders', querySenders.current.join(','))
        }
        if (opts.folder === 'inbox' && tagRef.current) params.set('tag', tagRef.current.id)
        const data = await api<{
          threads: ThreadRow[]
          nextPageToken: string | null
          account: string
          hiddenSenders?: string[]
          clientSenders?: string[]
          senderClients?: SenderClientOverride[]
        }>(
          `/api/mail/inbox?${params.toString()}`,
        )
        if (request !== listRequest.current) return
        setAccount(data.account)
        if (Array.isArray(data.hiddenSenders)) setHiddenSenders(data.hiddenSenders)
        if (Array.isArray(data.clientSenders)) setClientSenders(data.clientSenders)
        if (Array.isArray(data.senderClients)) setSenderClients(data.senderClients)
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

  /**
   * People for the Inbox search, loaded once per account (a failed load is
   * tried again next time). Searching works without them, just without
   * suggestions or part-name matching.
   */
  const loadSearchPeople = useCallback((): Promise<SearchPeople> => {
    const forAccount = accountRef.current
    if (searchPeople.current?.account === forAccount) return searchPeople.current.promise
    const storage = browserStorage()
    const saved = loadSavedPeople(storage, forAccount, Date.now())
    const fresh = apiRequest<{ contacts?: unknown; senders?: unknown }>('/api/mail/contacts', undefined, forAccount).then((data) => {
      const people = { contacts: cleanContacts(data.contacts), senders: cleanContacts(data.senders) }
      savePeople(storage, forAccount, people, Date.now())
      if (accountRef.current === forAccount) setSearchSenders(people.senders)
      return people
    })
    if (saved) {
      // Use the saved list now; the fresh one replaces it when it arrives (a failed refresh keeps the saved one).
      setSearchSenders(saved.senders)
      const promise = Promise.resolve(saved)
      searchPeople.current = { account: forAccount, promise }
      fresh
        .then((people) => {
          if (searchPeople.current?.promise === promise) searchPeople.current = { account: forAccount, promise: Promise.resolve(people) }
        })
        .catch(() => undefined)
      return promise
    }
    const promise = fresh.catch(() => {
      if (searchPeople.current?.promise === promise) searchPeople.current = null
      return { contacts: [], senders: [] }
    })
    searchPeople.current = { account: forAccount, promise }
    return promise
  }, [])

  /**
   * Runs the search box. In the Inbox, part of a name or address ("rebe") also
   * lists mail from the people it matches, since Gmail only matches whole words.
   */
  const runSearch = useCallback(
    async (value: string) => {
      const typed = value.trim()
      querySenders.current = []
      setQuery(value)
      if (folder !== 'inbox' || !typed) {
        void loadInbox({ folder, q: value })
        return
      }
      const pending = loadSearchPeople()
      let timer: number | undefined
      const people = await Promise.race([
        pending,
        new Promise<null>((resolve) => {
          timer = window.setTimeout(() => resolve(null), SEARCH_PEOPLE_WAIT_MS)
        }),
      ])
      window.clearTimeout(timer)
      if (people) querySenders.current = searchSenderAddresses(people.senders, people.contacts, typed)
      void loadInbox({ folder, q: value })
      if (people) return
      // Searched without the people list; widen the search once it arrives,
      // unless another list load (new search, folder, account) came since.
      const listId = listRequest.current
      void pending.then((late) => {
        if (listRequest.current !== listId) return
        const extra = searchSenderAddresses(late.senders, late.contacts, typed)
        if (extra.length === 0) return
        querySenders.current = extra
        void loadInbox({ folder, q: value })
      })
    },
    [folder, loadInbox, loadSearchPeople],
  )

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
    // Sync after the list, so it doesn't compete with it for Gmail's per-user rate limit.
    await Promise.all([
      (showScheduled ? loadScheduled() : showAwaiting ? loadFollowUps() : loadInbox({ folder, q: query })).then(() => runSync()),
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

  // Which account to open on, before the first load below: `?account=` (an
  // alert or the add-account return), else always the main Gmail.
  // Also shows the result of connecting another account.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const fromUrl = params.get(MAIL_ACCOUNT_QUERY_PARAM)
    const added = params.get('mail_account_added')
    const addError = params.get('mail_account_error')
    forgetStoredAccount()
    const initial = fromUrl !== null ? normaliseMailAccount(fromUrl) : ''
    accountRef.current = initial
    setActiveAccount(initial)
    if (added) setSyncNote(`Connected ${added}.`)
    if (addError) setError({ message: `Could not add the Gmail account: ${addError.slice(0, 300)}` })
    if (fromUrl !== null || added !== null || addError !== null) {
      params.delete(MAIL_ACCOUNT_QUERY_PARAM)
      params.delete('mail_account_added')
      params.delete('mail_account_error')
      const rest = params.toString()
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`)
    }
  }, [])

  const loadAccounts = useCallback(async () => {
    try {
      const data = await apiRequest<AccountsInfo>('/api/mail/accounts', undefined, '')
      setAccountsInfo(data)
      return data
    } catch {
      return null
    }
  }, [])

  // Sync on open, once the list has shown (Gmail rate-limits per user, so the
  // list goes first), then fetch the compose window in the background.
  useEffect(() => {
    void loadCounts()
    void loadInbox({ folder: 'inbox' }).then(() => {
      void runSync()
      void loadComposeWindow().catch(() => undefined)
    })
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
      tagRef.current = null
      setTagView(null)
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
      setClientChoice(null)
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
      // A tab click leaves a tag's list for the folder itself.
      tagRef.current = null
      setTagView(null)
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
      setClientChoice(null)
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

  // The signature of the account on screen (each Gmail account has its own).
  const signatureRequest = useRef(0)
  const loadSignature = useCallback(() => {
    const request = ++signatureRequest.current
    setSignatureHtml(null)
    apiRequest<{ settingsAccess?: boolean; signatureHtml?: string }>('/api/gmail/status', undefined, accountRef.current)
      .then((data) => {
        if (request === signatureRequest.current && data.settingsAccess) {
          setSignatureHtml(typeof data.signatureHtml === 'string' ? data.signatureHtml : '')
        }
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    loadSignature()
    void loadAccounts().then((data) => {
      // A remembered account that was removed (or belongs to someone else): back to the main Gmail.
      const current = accountRef.current
      if (data && current && current !== data.primary && !data.accounts.some((entry) => entry.email === current)) {
        switchAccountRef.current('')
      }
    })
    return () => {
      signatureRequest.current++
    }
  }, [loadSignature, loadAccounts])

  /**
   * Show another Gmail account ('' = the main one). The list, the open email
   * and the search reset; an open compose window stays, still on its own account.
   */
  const switchAccount = useCallback(
    (next: string) => {
      const clean = normaliseMailAccount(next)
      const target = clean && clean === accountsInfoRef.current?.primary ? '' : clean
      if (target === accountRef.current) return
      accountRef.current = target
      setActiveAccount(target)
      // Tags are per Gmail account.
      tagRef.current = null
      setTagView(null)
      setLastDeleted(null)
      threadRequest.current++
      listAppended.current = false
      setShowScheduled(false)
      setShowAwaiting(false)
      setSelectedScheduledId(null)
      setFolder('inbox')
      setThreads([])
      setAccount('')
      setCounts(null)
      setNextPageToken(null)
      setSelectedThreadId(null)
      setMessages([])
      setThreadInvite(null)
      setThreadLoading(false)
      setThreadError('')
      setActionNote('')
      setSummary(null)
      setHideChoice(false)
      setStarChoice(false)
      setClientChoice(null)
      setSearch('')
      setQuery('')
      setSearchSenders([])
      querySenders.current = []
      setError(null)
      setSyncNote('')
      loadSignature()
      void loadCounts()
      void loadInbox({ folder: 'inbox' }).then(() => runSync())
    },
    [loadCounts, loadInbox, loadSignature, runSync],
  )
  const switchAccountRef = useRef(switchAccount)
  switchAccountRef.current = switchAccount
  const accountsInfoRef = useRef(accountsInfo)
  accountsInfoRef.current = accountsInfo

  async function removeAccount(email: string) {
    try {
      await apiRequest('/api/mail/accounts', { method: 'DELETE', body: JSON.stringify({ email }) }, '')
      if (email === accountRef.current) switchAccount('')
      setSyncNote(`Removed ${email} from Mail.`)
    } catch (err) {
      showError(err)
    } finally {
      void loadAccounts()
    }
  }

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
          ...(draft.noSignature ? { noSignature: true } : {}),
          subject: draft.subject,
          html: draft.html,
          attachments: draft.attachments,
          draftId: draft.draftId,
          account: accountRef.current,
        })
      } catch (err) {
        showError(new Error(`Could not open the draft: ${(err as Error).message}`))
      }
    },
    [openThread, showError],
  )

  /**
   * Show the whole inbox again: clear the search and leave the Scheduled /
   * Awaiting tabs, so an email opened from a link is not hidden behind an
   * earlier search.
   */
  const showFullInbox = useCallback(() => {
    const searched = query.trim() !== '' || search.trim() !== '' || tagRef.current !== null
    tagRef.current = null
    setTagView(null)
    setSearch('')
    setQuery('')
    setSearchSenders([])
    querySenders.current = []
    setShowScheduled(false)
    setShowAwaiting(false)
    setSelectedScheduledId(null)
    if (folder !== 'inbox') {
      setFolder('inbox')
      setThreads([])
      setNextPageToken(null)
      void loadInbox({ folder: 'inbox' })
    } else if (searched) {
      void loadInbox({ folder: 'inbox' })
    }
  }, [folder, loadInbox, query, search])

  /**
   * List one tag's emails (archived ones too) in place of the inbox, to work
   * through them; Triage collapses to its bar so the list shows.
   */
  const openTag = useCallback(
    (tag: MailTag) => {
      tagRef.current = tag
      setTagView(tag)
      setTriageExpanded(false)
      setSearch('')
      setQuery('')
      querySenders.current = []
      setCheckedThreads(new Set())
      setShowScheduled(false)
      setShowAwaiting(false)
      setSelectedScheduledId(null)
      setFolder('inbox')
      setThreads([])
      setNextPageToken(null)
      void loadInbox({ folder: 'inbox' })
    },
    [loadInbox],
  )

  /**
   * Open a Mail link (`?thread=`, `?draft=`, `&account=`): from the URL when the
   * page loads, or from the client email alert / bell while Mail is already open.
   */
  const openLink = useCallback(
    (params: URLSearchParams, fromPageLoad: boolean) => {
      const threadId = params.get(MAIL_THREAD_QUERY_PARAM)
      const draftMessageId = params.get(MAIL_DRAFT_QUERY_PARAM)
      if (!fromPageLoad && (threadId || draftMessageId)) {
        // On page load the account was already picked from `?account=` (see above).
        const accountParam = params.get(MAIL_ACCOUNT_QUERY_PARAM)
        const before = accountRef.current
        if (accountParam !== null) switchAccountRef.current(accountParam)
        // switchAccount already resets the search and folder; otherwise do it here.
        if (accountRef.current === before) showFullInbox()
      }
      if (draftMessageId) void openDraft(draftMessageId)
      if (threadId && isGmailId(threadId)) {
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
      }
    },
    [openDraft, openThread, showFullInbox],
  )
  const openLinkRef = useRef(openLink)
  openLinkRef.current = openLink

  // Links in the URL when Mail loads; drop the params so a refresh doesn't reopen them.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (!params.get(MAIL_THREAD_QUERY_PARAM) && !params.get(MAIL_DRAFT_QUERY_PARAM)) return
    const link = new URLSearchParams(params)
    params.delete(MAIL_THREAD_QUERY_PARAM)
    params.delete(MAIL_DRAFT_QUERY_PARAM)
    const rest = params.toString()
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`)
    openLinkRef.current(link, true)
  }, [])

  // Links opened while Mail is already on screen (openCmsMailLink).
  useEffect(() => {
    const onOpen = (event: Event) => {
      const url = (event as CustomEvent<{ url?: unknown }>).detail?.url
      if (typeof url !== 'string') return
      const start = url.indexOf('?')
      openLinkRef.current(new URLSearchParams(start >= 0 ? url.slice(start + 1) : ''), false)
    }
    window.addEventListener(MAIL_OPEN_LINK_EVENT, onOpen)
    return () => window.removeEventListener(MAIL_OPEN_LINK_EVENT, onOpen)
  }, [])

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
  // The open sender's client pill: the user's own choice, else automatic matching.
  const senderChoice = hideTarget ? senderClientFor(hideTarget.address, senderClients) : undefined
  const senderPill = useMemo(() => {
    if (!hideTarget) return null
    const fromSender = [...messages].reverse().find((m) => senderAddress(m.from).toLowerCase() === hideTarget.address)
    return fromSender?.match ?? null
  }, [hideTarget, messages])

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

  // ── Sender → client pill ──
  // Saved per user (sender-clients.ts). The server also moves this sender's
  // automatically filed emails to the chosen client.
  async function reloadOpenThread() {
    const threadId = selectedThreadId
    if (!threadId) return
    const request = threadRequest.current
    try {
      const data = await api<{ messages: ThreadMessage[] }>(`/api/mail/thread/${encodeURIComponent(threadId)}`)
      if (request === threadRequest.current) setMessages(data.messages)
    } catch {
      // The pane keeps what it showed.
    }
  }

  async function saveSenderClient(sender: string, choice: string) {
    setClientChoice((current) => (current ? { ...current, busy: true } : current))
    try {
      const body = choice === 'auto' ? { sender, automatic: true } : { sender, clientId: choice === 'none' ? null : Number(choice) }
      const data = await api<{
        senderClients: SenderClientOverride[]
        client: { id: number; name: string } | null
        moved: number
        moveNote?: string | null
      }>('/api/mail/sender-client', { method: 'POST', body: JSON.stringify(body) })
      setSenderClients(data.senderClients)
      setClientChoice(null)
      const who = sender.startsWith('@') ? `everyone at ${sender}` : sender
      setActionNote(
        [
          choice === 'auto'
            ? `${who} is matched to a client automatically again.`
            : data.client
              ? `Emails from ${who} now go to ${data.client.name || 'that client'}.`
              : `Emails from ${who} are no longer linked to a client.`,
          data.moved ? `Moved ${data.moved} saved email${data.moved === 1 ? '' : 's'} to it.` : '',
          data.moveNote ?? '',
        ]
          .filter(Boolean)
          .join(' '),
      )
      if (!panelOpen) void loadInbox({ folder, q: query })
      void reloadOpenThread()
    } catch (err) {
      setClientChoice((current) => (current ? { ...current, busy: false } : current))
      setActionNote((err as Error).message)
    }
  }

  function clientLabel(clientId: number | null): string {
    if (clientId === null) return 'No client'
    return clients.find((client) => client.id === clientId)?.name ?? `Client ${clientId}`
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

  const checkedRows = useMemo(() => threads.filter((row) => checkedThreads.has(row.threadId)), [threads, checkedThreads])

  // A ticked row belongs to the folder and account it was ticked in.
  useEffect(() => {
    setCheckedThreads(new Set())
    setBulkNote('')
  }, [folder, account])

  function toggleChecked(threadId: string, on: boolean) {
    setBulkNote('')
    setCheckedThreads((current) => {
      const next = new Set(current)
      if (on) next.add(threadId)
      else next.delete(threadId)
      return next
    })
  }

  /** Mark every ticked inbox row read, in chunks the route accepts. */
  async function markCheckedRead() {
    const ids = checkedRows.map((row) => row.threadId)
    if (bulkBusy || ids.length === 0) return
    setBulkBusy(true)
    setBulkNote('')
    const done = new Set<string>()
    try {
      for (let i = 0; i < ids.length; i += MODIFY_THREADS_PER_REQUEST) {
        const chunk = ids.slice(i, i + MODIFY_THREADS_PER_REQUEST)
        await api('/api/mail/modify', { method: 'POST', body: JSON.stringify({ threadIds: chunk, action: 'read' }) })
        for (const id of chunk) done.add(id)
      }
      setBulkNote(`Marked ${done.size} email${done.size === 1 ? '' : 's'} read`)
    } catch (err) {
      setBulkNote(`${(err as Error).message}${done.size ? ` (${done.size} marked read before it stopped)` : ''}`)
    } finally {
      if (done.size > 0) {
        setThreads((current) => current.map((row) => (done.has(row.threadId) ? { ...row, unread: false } : row)))
        setCheckedThreads((current) => new Set([...current].filter((id) => !done.has(id))))
        void loadCounts()
      }
      setBulkBusy(false)
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

  function startReply(message: ThreadMessage, all = false) {
    setSummary(null)
    // Replying to one of our own sent messages goes back to its recipients, not to ourselves.
    const ownMessage = account !== '' && senderAddress(message.from).toLowerCase() === account.toLowerCase()
    const ownAddress = account || accountsInfo?.primary || ''
    const choices = replyRecipients(message, ownAddress ? [ownAddress] : [])
    const reply = { to: ownMessage && message.to ? message.to : senderAddress(message.from), cc: '' }
    // Reply all is only offered when the email had other participants.
    const hasOthers = hasOtherParticipants(reply, choices.replyAll)
    const recipients = hasOthers ? { reply, replyAll: choices.replyAll } : undefined
    const start = all && recipients ? recipients.replyAll : reply
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
        // Shown under the reply with "•••", to add notes into it.
        quote: { from: message.from, date: message.date, html: message.html, text: message.body },
        recipients,
      },
      to: start.to,
      cc: start.cc,
      subject: replySubject(message.subject),
      html: '',
      attachments: [],
      account: accountRef.current,
    })
  }

  /** Forward: a new email with the message (and its headers) as the starting body. */
  function startForward(message: ThreadMessage) {
    setSummary(null)
    setComposer({
      key: ++composeKey.current,
      mode: 'new',
      replyTo: null,
      forward: true,
      to: '',
      cc: '',
      subject: forwardSubject(message.subject),
      html: forwardStartHtml({ ...message, text: message.body }),
      attachments: [],
      account: accountRef.current,
    })
  }

  function startNew() {
    setSummary(null)
    setComposer({
      key: ++composeKey.current,
      mode: 'new',
      replyTo: null,
      to: '',
      cc: '',
      subject: '',
      html: '',
      attachments: [],
      account: accountRef.current,
    })
  }

  // Send is only ever reached from the compose window's Send button.
  async function sendComposed(state: ComposeState, content: ComposeContent) {
    // Always the account the compose window was opened in.
    const account = state.account ?? ''
    const onScreen = account === accountRef.current
    if (state.scheduledId !== undefined) {
      // Save the edits to the queued email, then send that one now: the queue's
      // claim means it can only ever go out once, and a failure leaves it in the queue.
      await saveScheduledEdit(state.scheduledId, state, content, null)
      await apiRequest(`/api/mail/schedule/${state.scheduledId}`, { method: 'PATCH', body: JSON.stringify({ action: 'send-now' }) }, account)
      setComposer(null)
      setActionNote('Sent.')
      void loadScheduled()
      void loadCounts()
      return
    }
    const data = await apiRequest<{ client: { name: string } | null; draftNote?: string | null; followUpNote?: string | null }>('/api/mail/send', {
      method: 'POST',
      body: JSON.stringify({
        to: state.to,
        cc: state.cc,
        bcc: state.bcc ?? '',
        ...(state.signOff !== undefined ? { signOff: state.signOff } : {}),
        ...(state.noSignature ? { noSignature: true } : {}),
        subject: state.subject,
        html: content.html,
        inlineImages: content.inlineImages,
        attachments: content.attachments,
        replyToMessageId: state.replyTo?.messageId ?? '',
        ...(state.draftId ? { draftId: state.draftId } : {}),
        // Business days are counted in this browser's local time.
        ...(state.followUpDays ? { followUpAt: addBusinessDays(new Date(), state.followUpDays).toISOString() } : {}),
      }),
    }, account)
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
    // The rest only applies when Mail is still showing the account it was sent from.
    if (!onScreen) return
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
    await apiRequest(`/api/mail/schedule/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        to: state.to,
        cc: state.cc,
        bcc: state.bcc ?? '',
        ...(state.signOff !== undefined ? { signOff: state.signOff } : {}),
        ...(state.noSignature ? { noSignature: true } : {}),
        subject: state.subject,
        html: content.html,
        inlineImages: content.inlineImages,
        attachments: content.attachments,
        ...(when ? { scheduledFor: when.toISOString() } : {}),
        followUpDays: state.followUpDays ?? 0,
      }),
    }, state.account ?? '')
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
    const data = await apiRequest<{ draftNote?: string | null }>('/api/mail/schedule', {
      method: 'POST',
      body: JSON.stringify({
        to: state.to,
        cc: state.cc,
        bcc: state.bcc ?? '',
        ...(state.signOff !== undefined ? { signOff: state.signOff } : {}),
        ...(state.noSignature ? { noSignature: true } : {}),
        subject: state.subject,
        html: content.html,
        inlineImages: content.inlineImages,
        attachments: content.attachments,
        replyToMessageId: state.replyTo?.messageId ?? '',
        scheduledFor: when.toISOString(),
        ...(state.draftId ? { draftId: state.draftId } : {}),
        ...(state.followUpDays ? { followUpDays: state.followUpDays } : {}),
      }),
    }, state.account ?? '')
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
      ...(detail.noSignature ? { noSignature: true } : {}),
      subject: item.subject,
      html: detail.html,
      attachments: detail.attachments,
      scheduledId: item.id,
      scheduledFor: item.scheduledFor,
      // Keep the reminder exactly as queued (off stays off).
      followUpDays: detail.followUpDays ?? 0,
      account: accountRef.current,
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
      account: accountRef.current,
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

  /**
   * Move a thread to Gmail's Bin (recoverable for 30 days; Undo puts it back).
   * Not asked first: Undo is offered above the list instead.
   */
  async function deleteThread(thread: ThreadRow) {
    const fromFolder = folder
    try {
      await api('/api/mail/modify', { method: 'POST', body: JSON.stringify({ threadId: thread.threadId, action: 'trash' }) })
      setThreads((current) => current.filter((row) => row.threadId !== thread.threadId))
      setCheckedThreads((current) => {
        if (!current.has(thread.threadId)) return current
        const next = new Set(current)
        next.delete(thread.threadId)
        return next
      })
      if (selectedThreadId === thread.threadId) {
        threadRequest.current++
        setSelectedThreadId(null)
        setMessages([])
        setComposer(null)
      }
      setLastDeleted({ thread, folder: fromFolder })
      void loadCounts()
    } catch (err) {
      showError(err)
    }
  }

  async function undoDelete() {
    const deleted = lastDeleted
    if (!deleted) return
    setLastDeleted(null)
    try {
      await api('/api/mail/modify', { method: 'POST', body: JSON.stringify({ threadId: deleted.thread.threadId, action: 'untrash' }) })
      if (folder === deleted.folder && !panelOpen) void loadInbox({ folder, q: query })
      void loadCounts()
    } catch (err) {
      showError(err)
    }
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

  async function deleteComposedDraft(draftId: string, account: string): Promise<void> {
    await apiRequest(`/api/gmail/draft?draftId=${encodeURIComponent(draftId)}`, { method: 'DELETE' }, account)
    if (account !== accountRef.current) return
    if (folder === 'drafts' && !panelOpen) void loadInbox({ folder, q: query })
    void loadCounts()
  }

  // Autosave and Save as draft: always into the compose window's own account.
  async function saveComposedDraft(state: ComposeState, content: ComposeContent): Promise<string | undefined> {
    const account = state.account ?? ''
    const data = await apiRequest<{ draftId?: string }>('/api/gmail/draft', {
      method: 'POST',
      body: JSON.stringify({
        to: state.to,
        cc: state.cc,
        bcc: state.bcc ?? '',
        ...(state.signOff !== undefined ? { signOff: state.signOff } : {}),
        ...(state.noSignature ? { noSignature: true } : {}),
        subject: state.subject,
        html: content.html,
        inlineImages: content.inlineImages,
        attachments: content.attachments,
        ...(state.replyTo ? { replyToMessageId: state.replyTo.messageId } : {}),
        ...(state.draftId ? { draftId: state.draftId } : {}),
      }),
    }, account)
    if (account === accountRef.current) {
      if (folder === 'drafts' && !panelOpen) void loadInbox({ folder, q: query })
      void loadCounts()
    }
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
      <MailStepNav
        current={account || activeAccount || accountsInfo?.primary || ''}
        accounts={[
          ...(accountsInfo?.primary ? [{ email: accountsInfo.primary, main: true }] : []),
          ...(accountsInfo?.accounts ?? []).map((entry) => ({ email: entry.email, main: false })),
          // The account on screen before the list loads (or if it is missing from it).
          ...(account && account !== accountsInfo?.primary && !(accountsInfo?.accounts ?? []).some((entry) => entry.email === account)
            ? [{ email: account, main: activeAccount === '' }]
            : []),
        ]}
        onSelect={(email, main) => switchAccount(main ? '' : email)}
        onRemove={(email) => void removeAccount(email)}
        addUrl={accountsInfo?.canAdd ? accountsInfo.addUrl : null}
        extraAdds={accountsInfo?.canAdd ? (accountsInfo.extraAdds ?? []) : []}
      />
      <div className={styles.toolbar}>
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
        {isPhone ? (
          <MailOverflowMenu
            items={[
              { label: 'Triage unread', onSelect: toggleTriage },
              {
                label: `Hidden${hiddenSenders.length ? ` (${hiddenSenders.length})` : ''}`,
                onSelect: () => setShowHiddenPanel((open) => !open),
              },
              {
                label: `★ Clients${clientSenders.length ? ` (${clientSenders.length})` : ''}`,
                onSelect: () => setShowClientPanel((open) => !open),
              },
              { label: 'Refresh', onSelect: () => void refresh(), disabled: listLoading },
            ]}
          />
        ) : (
          <>
            <button
              type="button"
              className={styles.btn}
              onClick={toggleTriage}
              aria-expanded={showTriagePanel && triageExpanded}
              title="Let AI sort your unread emails by sender and subject, then clear them in bulk"
            >
              ✨ Triage
            </button>
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
          </>
        )}
        <button
          type="button"
          className={`${styles.btn} ${styles.primary} ${isPhone ? styles.composeFab : ''}`}
          onClick={startNew}
          aria-label={isPhone ? 'Write message' : undefined}
          title={isPhone ? 'Write message' : undefined}
        >
          {isPhone ? <span aria-hidden="true">✎</span> : 'Write message'}
        </button>
      </div>

      {error ? (
        (() => {
          const shown = friendlyMailError(error.message)
          return (
            <div className={styles.error} role="alert">
              <span>{shown.message}</span>
              {error.connectUrl ? (
                <a className={`${styles.btn} ${styles.errorConnect}`} href={error.connectUrl}>
                  {shown.notConnected ? 'Connect Gmail' : 'Reconnect Gmail'}
                </a>
              ) : null}
              <button type="button" className={`${styles.linkBtn} ${styles.errorDismiss}`} onClick={() => setError(null)}>
                Dismiss
              </button>
            </div>
          )
        })()
      ) : null}

      {showTriagePanel ? (
        <TriagePanel
          key={activeAccount}
          api={api}
          onApplied={() => void refresh()}
          onClose={() => setShowTriagePanel(false)}
          fullView={triageExpanded}
          onFullViewChange={setTriageExpanded}
          onOpenTag={openTag}
        />
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

          <h3 className={styles.panelTitle}>Client pills you chose</h3>
          <p className={styles.muted}>
            Senders you moved to a different client (or to no client) with the Client button on an open email. New emails from them are saved to
            that client.
          </p>
          {senderClients.length === 0 ? <p className={styles.muted}>None yet: every sender is matched automatically.</p> : null}
          <ul className={styles.hiddenList}>
            {senderClients.map((entry) => (
              <li key={entry.sender}>
                <span>
                  {entry.sender.startsWith('@') ? `Anyone at ${entry.sender}` : entry.sender} → {clientLabel(entry.clientId)}
                </span>
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => {
                    const sender = normaliseSenderEntry(entry.sender)
                    if (sender) void saveSenderClient(sender, 'auto')
                  }}
                >
                  Use automatic
                </button>
              </li>
            ))}
          </ul>
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

      <div className={styles.panes} style={panelOpen || (showTriagePanel && triageExpanded) ? { display: 'none' } : undefined}>
        <div className={styles.listPane}>
        {/* Search sits right above the first email in the list. */}
        <InboxSearch
          value={search}
          onChange={(value) => {
            setSearch(value)
            // Clearing the box (its × or deleting the text) brings the full list back.
            if (!value.trim() && query.trim()) void runSearch('')
          }}
          onSubmit={(value) => void runSearch(value)}
          onPickSender={(contact) => {
            setSearch(contact.email)
            void runSearch(contact.email)
          }}
          senders={folder === 'inbox' ? searchSenders : []}
          onWantSenders={() => {
            if (folder === 'inbox') void loadSearchPeople()
          }}
          label={tagView ? `Search tag ${tagView.name}` : `Search ${FOLDER_LABELS[folder].toLowerCase()}`}
        />
        {folder === 'inbox' && tagView ? (
          <div className={styles.bulkBar} role="status">
            <span className={styles.bulkCount}>Tag: {tagView.name}</span>
            <button type="button" className={styles.linkBtn} onClick={showFullInbox}>
              Back to inbox
            </button>
          </div>
        ) : null}
        {folder === 'inbox' && checkedRows.length > 0 ? (
          <div className={styles.bulkBar} role="toolbar" aria-label="Selected emails">
            <span className={styles.bulkCount}>{checkedRows.length} selected</span>
            <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={() => void markCheckedRead()} disabled={bulkBusy}>
              {bulkBusy ? 'Marking read…' : 'Mark as read'}
            </button>
            <button type="button" className={styles.linkBtn} onClick={() => setCheckedThreads(new Set())} disabled={bulkBusy}>
              Clear
            </button>
          </div>
        ) : lastDeleted && lastDeleted.folder === folder ? (
          <div className={styles.bulkBar} role="status">
            <span className={styles.bulkCount}>Deleted “{lastDeleted.thread.subject || '(no subject)'}”. It stays in Gmail’s Bin for 30 days.</span>
            <button type="button" className={styles.linkBtn} onClick={() => void undoDelete()}>
              Undo
            </button>
          </div>
        ) : folder === 'inbox' && bulkNote ? (
          <p className={styles.bulkBar} role="status">
            {bulkNote}
          </p>
        ) : null}
        <ul className={styles.list} aria-label={tagView && folder === 'inbox' ? `Tag ${tagView.name}` : FOLDER_LABELS[folder]}>
          {threads.map((thread) => (
            <li key={thread.threadId} className={`${styles.rowItem} ${folder === 'inbox' ? styles.rowItemSelectable : ''}`}>
              {folder === 'inbox' ? (
                <label className={styles.rowCheck}>
                  <input
                    type="checkbox"
                    checked={checkedThreads.has(thread.threadId)}
                    onChange={(e) => toggleChecked(thread.threadId, e.target.checked)}
                    disabled={bulkBusy}
                    aria-label={`Select ${senderName(thread.from)}: ${thread.subject || '(no subject)'}`}
                  />
                </label>
              ) : null}
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
              ) : (
                <button
                  type="button"
                  className={styles.rowDelete}
                  aria-label={`Delete ${folder === 'inbox' ? senderName(thread.from) : 'email'}: ${thread.subject || '(no subject)'}`}
                  title="Delete (moves to Gmail’s Bin)"
                  onClick={() => void deleteThread(thread)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
                  </svg>
                </button>
              )}
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
        </div>

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
                    <>
                      <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={() => startReply(latest)}>
                        Reply
                      </button>
                      <button type="button" className={styles.btn} onClick={() => startReply(latest, true)}>
                        Reply all
                      </button>
                      <button type="button" className={styles.btn} onClick={() => startForward(latest)}>
                        Forward
                      </button>
                    </>
                  ) : null}
                  {selectedThread && folder !== 'drafts' ? (
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.iconBtn}`}
                      onClick={() => void deleteThread(selectedThread)}
                      aria-label="Delete"
                      title="Delete (moves to Gmail’s Bin)"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
                  </svg>
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
                  {hideTarget && starredEntries.length === 0 && hideTarget.domain && starChoice ? (
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
                  ) : null}
                  {hideTarget ? (
                    clientChoice ? (
                      <span className={styles.assign}>
                        {hideTarget.domain ? (
                          <select
                            value={clientChoice.sender}
                            onChange={(e) => setClientChoice({ ...clientChoice, sender: e.target.value })}
                            aria-label="Which emails"
                            disabled={clientChoice.busy}
                          >
                            <option value={hideTarget.address}>From {hideTarget.address}</option>
                            <option value={`@${hideTarget.domain}`}>From anyone @{hideTarget.domain}</option>
                          </select>
                        ) : null}
                        <select
                          value={clientChoice.clientId}
                          onChange={(e) => setClientChoice({ ...clientChoice, clientId: e.target.value })}
                          aria-label="Client for this sender"
                          disabled={clientChoice.busy}
                        >
                          <option value="auto">Automatic{senderChoice ? '' : senderPill ? ` (${senderPill.name})` : ' (none)'}</option>
                          {clients.map((client) => (
                            <option key={client.id} value={client.id}>
                              {client.name}
                            </option>
                          ))}
                          <option value="none">No client</option>
                        </select>
                        <button
                          type="button"
                          className={styles.btn}
                          disabled={clientChoice.busy}
                          onClick={() => void saveSenderClient(clientChoice.sender, clientChoice.clientId)}
                        >
                          {clientChoice.busy ? 'Saving…' : 'Save'}
                        </button>
                        <button type="button" className={styles.linkBtn} onClick={() => setClientChoice(null)} disabled={clientChoice.busy}>
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={styles.btn}
                        onClick={() =>
                          setClientChoice({
                            sender: senderChoice?.sender ?? hideTarget.address,
                            clientId: senderChoice ? (senderChoice.clientId === null ? 'none' : String(senderChoice.clientId)) : 'auto',
                            busy: false,
                          })
                        }
                        title="Change which client this sender's emails are added to"
                      >
                        Client: {senderPill?.name ?? (senderChoice?.clientId === null ? 'No client' : 'None')} ▾
                      </button>
                    )
                  ) : null}
                  {hideTarget?.domain && hideChoice ? (
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
                  ) : null}
                  {latest || hideTarget ? (
                    <MailOverflowMenu
                      label="More actions for this email"
                      items={[
                        ...(latest
                          ? [
                              {
                                label: 'Download thread (.md)',
                                title: 'Every message in this thread: sender, date and time, and content',
                                onSelect: () =>
                                  saveFile(
                                    new Blob([threadToMarkdown(messages)], { type: 'text/markdown;charset=utf-8' }),
                                    exportFileName(messages[0]?.subject ?? '', 'md'),
                                  ),
                              },
                            ]
                          : []),
                        ...(hideTarget
                          ? [
                              starredEntries.length > 0
                                ? {
                                    label: '★ Unmark as client',
                                    title: `Client sender (${starredEntries.join(', ')}). Their unread emails stop showing on the dashboard.`,
                                    onSelect: () => void unstarEntries(starredEntries),
                                  }
                                : {
                                    label: '☆ Mark as client',
                                    title: 'Mark as a client sender: their unread emails show on the dashboard',
                                    onSelect: () => (hideTarget.domain ? setStarChoice(true) : void starSender(hideTarget.address)),
                                  },
                              {
                                label: 'Hide sender',
                                title: 'Leave this sender out of the inbox',
                                onSelect: () => (hideTarget.domain ? setHideChoice(true) : void hideSender(hideTarget.address)),
                              },
                            ]
                          : []),
                      ]}
                    />
                  ) : null}
                </div>
              </div>
              {actionNote ? <p className={styles.note}>{actionNote}</p> : null}

              {threadInvite && messages.some((message) => message.messageId === threadInvite.messageId) ? (
                <CalendarInviteCard key={`${activeAccount}:${threadInvite.messageId}`} data={threadInvite} account={activeAccount} />
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
                    <button
                      type="button"
                      className={styles.linkBtn}
                      disabled={emlDownloading === message.messageId}
                      onClick={() => void downloadEml(message)}
                      title="The email exactly as Gmail has it, attachments included"
                    >
                      {emlDownloading === message.messageId ? 'Downloading…' : 'Download .eml'}
                    </button>
                    <button
                      type="button"
                      className={styles.linkBtn}
                      onClick={() => saveFile(new Blob([messageToMarkdown(message)], { type: 'text/markdown;charset=utf-8' }), exportFileName(message.subject, 'md'))}
                    >
                      Download .md
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
                Reply
              </button>
            </div>
          ) : null}
        </section>
      </div>

      {composer ? (
        <Suspense fallback={null}>
        <ComposeWindow
          key={composer.key}
          initial={composer}
          title={`${
            composer.scheduledId !== undefined
              ? 'Edit scheduled email'
              : composer.mode === 'reply'
                ? `Reply to ${senderName(composer.replyTo?.from ?? '')}`
                : composer.forward
                  ? 'Forward'
                  : 'New message'
          }${
            // With more than one account, say which one this email is written in.
            (accountsInfo?.accounts.length ?? 0) > 0 ? ` · ${composer.account || accountsInfo?.primary || 'main Gmail'}` : ''
          }`}
          onClose={() => setComposer(null)}
          onSend={sendComposed}
          onSchedule={scheduleComposed}
          onSaveDraft={saveComposedDraft}
          onDeleteDraft={(draftId) => deleteComposedDraft(draftId, composer.account ?? '')}
          signatureHtml={signatureHtml}
        />
        </Suspense>
      ) : null}
    </div>
  )
}
