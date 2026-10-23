'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './ComposeWindow.module.css'
import EmailBody from './EmailBody'
import RichEmailEditor, { type EditorSnapshot, type EmailSelectionFormat, type RichEmailEditorHandle } from './RichEmailEditor'
import type { BlockEdit } from '../../lib/mail/revise-edits'
import FormatBar from './FormatBar'
import { buildEmailDocument } from '../../lib/mail/email-html'
import { MAX_SIGN_OFF_CHARS, splitSignatureSignOff } from '../../lib/mail/signature'
import { markdownLiteToBlocksHtml } from '../../lib/email-draft-markdown'
import { base64Bytes, extractInlineImages, type InlineImagePayload } from '../../lib/mail/compose-html'
import { MAIL_ATTACHMENT_LIMITS } from '../../lib/mail/compose-limits'
import SchedulePicker from './SchedulePicker'
import { fitImageForChat } from '../chat-image-fit'
import { browserStorage, clearPrompt, loadPrompt, promptKeys, savePrompt } from '../../lib/mail/ai-prompt-store'
import { OPTIMATE_OPENED_EVENT } from '../../lib/optimate-events'
import { FOLLOW_UP_DAY_OPTIONS } from '../../lib/mail/schedule-times'
import { mailAccountHeaders } from '../../lib/mail/accounts-shared'
import { finishedRecipientAddresses, type MailContact } from '../../lib/mail/contacts-shared'
import { RecipientInput } from './RecipientInput'
import { appendReplyQuote, replyQuoteHeader, replyQuoteStartHtml, type ReplyQuote } from '../../lib/mail/reply-quote'
import {
  MAIL_VOICE_GREETING,
  MAIL_VOICE_READ_TOOL,
  MAIL_VOICE_TOOLS,
  MAIL_VOICE_WRITE_TOOL,
  buildMailVoiceInstructions,
  describeDraftForVoice,
} from '../../lib/mail/voice-draft'
import OptiMateVoice, { type LocalVoiceSession } from '../OptiMateVoice'

/**
 * Gmail-style compose window docked bottom right, just left of the OptiMate orb.
 *
 * The AI works like OptiMate: each prompt produces a draft, and every further
 * prompt revises the current draft (including the user's own edits) until it
 * is right. A revision changes only the parts the request needs (the server
 * returns block edits, see lib/mail/revise-edits); everything else stays as
 * written, formatting included. Undo puts the body back as it was before the
 * last AI change, one change at a time. The model only ever sees the one email being replied to (server
 * enforced) plus this conversation. Nothing is sent until Send is clicked.
 * The user's Gmail signature is previewed at the end of the scrolling draft;
 * the server appends it on Send and Save as draft, so it is never part of the
 * editable text. Its sign-off ("Thanks, Peter") is the exception: it is shown
 * in the body font and can be edited for each email (see lib/mail/signature).
 *
 * The body is a rich editor (see RichEmailEditor), always Verdana at Gmail's
 * Normal size: Cmd/Ctrl+B/I/U, text colour, bulleted and numbered lists (the
 * formatting bar under the body), pasted or inserted tables, inline images,
 * and attached files (3 MB in total). Files dropped anywhere on the window
 * are attached (listed under the signature); pasted images go inline.
 *
 * Opened from the Scheduled tab (scheduledId set), the schedule picker opens
 * on the email's send time and Schedule send updates it in place.
 *
 * Send waits UNDO_SEND_MS before sending, like Gmail's undo send: the button
 * shows it is sending and an Undo button stops it. Closing the window during
 * the wait sends straight away (Send was pressed; only Undo cancels).
 *
 * Replies opened from an email can show that email under the reply ("•••",
 * see lib/mail/reply-quote) in its own editor, so notes can be typed into it.
 *
 * The mic next to Write with AI starts a GPT Realtime 2.1 voice call (see
 * lib/mail/voice-draft): the user talks the email through, the agent writes
 * it into the editor with the same Write with AI request, keeps revising it,
 * and can read it back. It can only draft; Send is always the user's click.
 */

/** How long Send waits, with Undo available, before the email actually goes. */
export const UNDO_SEND_MS = 3100

export interface ComposeReplyTarget {
  messageId: string
  from: string
  subject: string
  /** CMS client the message is stored against or matches, if any (offers "Use client data"). */
  client?: { id: number; name: string } | null
  /** The email itself, so it can be shown (and annotated) under the reply. */
  quote?: ReplyQuote
  /**
   * Recipients for a plain reply and a reply all, when the email had other
   * participants. Offers the reply all toggle next to Cc.
   */
  recipients?: { reply: { to: string; cc: string }; replyAll: { to: string; cc: string } }
}

export interface ComposeFile {
  name: string
  mediaType: string
  /** Raw base64, no data: prefix. */
  data: string
}

export interface ComposeState {
  mode: 'reply' | 'new'
  replyTo: ComposeReplyTarget | null
  /** A forward of an email in the reader (a new email with it as the starting body). */
  forward?: boolean
  to: string
  cc: string
  /** Blind copy; shown with Cc. */
  bcc?: string
  /**
   * The signature's sign-off ("Thanks,\nPeter") as edited for this email.
   * Undefined until edited: the Gmail signature's own sign-off is used.
   */
  signOff?: string
  /** Signature toggle off: send/save this email without the Gmail signature. Undefined = signature on. */
  noSignature?: boolean
  subject: string
  /** Starting body HTML (the editor owns it after that). */
  html: string
  attachments: ComposeFile[]
  /** Gmail draft this compose window is editing (opened from OptiMate or saved once). */
  draftId?: string
  /**
   * Scheduled email this window is editing (Scheduled tab → Edit). It stays
   * queued as it was until Update schedule or Send; nothing is autosaved to
   * Gmail Drafts, and closing keeps the scheduled version.
   */
  scheduledId?: number
  /** Its current send time (ISO), preselected in the schedule picker. */
  scheduledFor?: string
  /**
   * "Remind me if no reply" in business days (0 = off). Undefined until
   * chosen, which means off. Always resolved before onSend/onSchedule.
   */
  followUpDays?: number
  /** Pre-filled Write with AI instruction (e.g. Awaiting reply → Draft follow-up). */
  aiPrompt?: string
  /**
   * The extra Gmail account this email is written in ("" or undefined = the
   * main Gmail). Fixed when the window opens, so switching accounts in Mail
   * never moves a half-written email to another mailbox.
   */
  account?: string
}

/** What Send / Save as draft post to the server. */
export interface ComposeContent {
  html: string
  inlineImages: InlineImagePayload[]
  attachments: ComposeFile[]
}

interface Turn {
  instruction: string
  draft: string
}

/** The body before one AI change, for Undo. */
interface AiUndoEntry {
  snapshot: EditorSnapshot
  /** AI rounds before the change, so the next revision's history matches the restored body. */
  turnCount: number
  /** Subject the AI filled in with this change, cleared again on undo if still unedited. */
  subject?: string
}

type RecipientField = 'to' | 'cc' | 'bcc'

/** AI changes that can be undone, newest last. */
const MAX_AI_UNDO = 20

interface Props {
  initial: ComposeState
  title: string
  onClose: () => void
  onSend: (state: ComposeState, content: ComposeContent) => Promise<void>
  /** Queue the email to send at `when` instead of now. */
  onSchedule: (state: ComposeState, content: ComposeContent, when: Date) => Promise<void>
  /** Resolves to the Gmail draft id, so later saves update the same draft. */
  onSaveDraft: (state: ComposeState, content: ComposeContent) => Promise<string | undefined>
  /** Permanently delete the Gmail draft this window saved or opened. */
  onDeleteDraft: (draftId: string) => Promise<void>
  /** Gmail signature HTML; '' when none is set, null while unknown. */
  signatureHtml: string | null
}

async function postJson<T>(url: string, body: unknown, account?: string): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...mailAccountHeaders(account) },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; reason?: string }
  if (!res.ok) throw new Error(data.reason || data.error || `Request failed (${res.status})`)
  return data
}

function readBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(file)
  })
}

function naturalWidth(src: string): Promise<number | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img.naturalWidth || null)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
/** Pasted images display at most this wide in the email. */
const DISPLAY_WIDTH = 600
const LIMIT_NOTE = `Images and attachments can total up to ${formatSize(MAIL_ATTACHMENT_LIMITS.maxTotalBytes)} per email.`

export default function ComposeWindow({ initial, title, onClose, onSend, onSchedule, onSaveDraft, onDeleteDraft, signatureHtml }: Props) {
  const [state, setState] = useState<ComposeState>(initial)
  const signatureParts = useMemo(() => (signatureHtml ? splitSignatureSignOff(signatureHtml) : null), [signatureHtml])
  const signatureRef = useRef(signatureParts)
  signatureRef.current = signatureParts
  // The reminder choice as shown (the client default applied), read when sending.
  const followUpDaysRef = useRef(0)
  /** What is sent: always the shown sign-off, so the email matches the preview (Verdana, Normal). */
  const outgoing = useCallback((s: ComposeState): ComposeState => {
    const withFollowUp = { ...s, followUpDays: followUpDaysRef.current }
    const parts = signatureRef.current
    if (!parts) return withFollowUp
    return { ...withFollowUp, signOff: s.signOff ?? parts.signOff }
  }, [])
  const [turns, setTurns] = useState<Turn[]>([])
  const [aiUndo, setAiUndo] = useState<AiUndoEntry[]>([])
  // The unsent AI instruction is kept in this browser as you type (see ai-prompt-store).
  const [prompt, setPrompt] = useState(() =>
    initial.aiPrompt ??
    loadPrompt(
      browserStorage(),
      promptKeys({
        mode: initial.mode,
        replyToMessageId: initial.replyTo?.messageId,
        draftId: initial.draftId,
        startedNew: !initial.draftId,
      }),
      Date.now(),
    ),
  )
  const [busy, setBusy] = useState<'' | 'ai' | 'subject' | 'send' | 'draft' | 'schedule' | 'delete'>('')
  const [note, setNote] = useState('')
  const [minimised, setMinimised] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [showCc, setShowCc] = useState(Boolean(initial.cc || initial.bcc))
  const replyChoices = initial.mode === 'reply' ? (initial.replyTo?.recipients ?? null) : null
  const [replyAll, setReplyAll] = useState(
    () => replyChoices !== null && initial.to === replyChoices.replyAll.to && initial.cc === replyChoices.replyAll.cc,
  )
  const toggleReplyAll = () => {
    if (!replyChoices) return
    const next = !replyAll
    const target = next ? replyChoices.replyAll : replyChoices.reply
    setReplyAll(next)
    setState((s) => ({ ...s, to: target.to, cc: target.cc }))
    setSettledRecipients((s) => ({ ...s, to: target.to, cc: target.cc }))
    if (next && target.cc) setShowCc(true)
  }
  // To/Cc/Bcc suggestions, loaded once the first recipient field is focused.
  const [contacts, setContacts] = useState<MailContact[] | null>(null)
  const contactsRequested = useRef(false)
  const loadContacts = useCallback(() => {
    if (contactsRequested.current) return
    contactsRequested.current = true
    fetch('/api/mail/contacts', { credentials: 'include', headers: mailAccountHeaders(initial.account) })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as { contacts?: unknown } | null
        const list = res.ok && Array.isArray(data?.contacts) ? (data.contacts as MailContact[]) : []
        setContacts(list.filter((c) => typeof c?.email === 'string' && typeof c?.name === 'string'))
      })
      // Suggestions are a convenience: without them the fields work as plain text.
      .catch(() => setContacts([]))
  }, [initial.account])
  // Waiting out the undo window after Send; the timer is in sendTimerRef.
  const [sendPending, setSendPending] = useState(false)
  const sendTimerRef = useRef<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const [hasDraft, setHasDraft] = useState(Boolean(initial.html.trim()))
  const [tableOpen, setTableOpen] = useState(false)
  const [selectionFormat, setSelectionFormat] = useState<EmailSelectionFormat>({ list: null, color: null })
  const editingScheduled = initial.scheduledId !== undefined
  const [scheduleOpen, setScheduleOpen] = useState(editingScheduled)
  const [tableSize, setTableSize] = useState({ rows: 3, columns: 3 })
  // Opt-in: also give the AI the rest of this email's thread. Off by default.
  const [useThread, setUseThread] = useState(false)
  // Opt-in: also give the AI client facts from the CMS. Off by default; the
  // server resolves the client itself (never from this id).
  const [useClientData, setUseClientData] = useState(false)
  // New email: the client the recipients match (checked server-side, debounced).
  const [recipientClient, setRecipientClient] = useState<{ id: number; name: string } | null>(null)
  // Shown under the AI box after a draft that used client data.
  const [clientDataUsed, setClientDataUsed] = useState('')
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const editorRef = useRef<RichEmailEditorHandle>(null)
  // The quoted email under a reply ("•••"): shown or not, and its own editor.
  const quote = initial.replyTo?.quote ?? null
  const quoteHeader = useMemo(() => (quote ? replyQuoteHeader(quote) : ''), [quote])
  const quoteStartHtml = useMemo(() => (quote ? replyQuoteStartHtml(quote) : ''), [quote])
  const [quoteOpen, setQuoteOpen] = useState(false)
  // Mounted on first open, then only hidden, so notes typed into it survive closing it.
  const [quoteMounted, setQuoteMounted] = useState(false)
  const quoteOpenRef = useRef(false)
  quoteOpenRef.current = quoteOpen
  const quoteEditorRef = useRef<RichEmailEditorHandle>(null)
  const quoteBaseline = useRef<string | null>(null)
  // The formatting bar acts on whichever editor (reply or quote) was used last.
  const activeEditor = useRef<'body' | 'quote'>('body')
  const formatTarget = () => (activeEditor.current === 'quote' && quoteOpenRef.current ? quoteEditorRef.current : editorRef.current)
  /** What is sent and saved: the reply, plus the quoted email when it is shown. */
  const composedHtml = useCallback((): string => {
    const body = editorRef.current?.getHtml() ?? ''
    if (!quoteOpenRef.current || !quoteHeader) return body
    return appendReplyQuote(body, { header: quoteHeader, html: quoteEditorRef.current?.getHtml() ?? '' })
  }, [quoteHeader])
  const attachInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  // Autosave: the latest state, the Gmail draft id, and the in-flight save.
  const stateRef = useRef(state)
  stateRef.current = state

  /**
   * To / Cc / Bcc as of the last finished address. Typing a recipient changes
   * the fields on every letter, but only finishing an address (a comma, or
   * picking a suggestion), removing one, or leaving the field updates this, so
   * a half-typed address never sets off a draft save or a client lookup.
   */
  const [settledRecipients, setSettledRecipients] = useState(() => ({ to: initial.to, cc: initial.cc, bcc: initial.bcc ?? '' }))
  const setRecipient = (field: RecipientField, value: string) => {
    const previous = (field === 'bcc' ? stateRef.current.bcc : stateRef.current[field]) ?? ''
    setState((s) => ({ ...s, [field]: value }))
    if (finishedRecipientAddresses(previous).join(',') !== finishedRecipientAddresses(value).join(',')) {
      setSettledRecipients((s) => ({ ...s, [field]: value }))
    }
  }
  const settleRecipient = (field: RecipientField) => {
    const value = (field === 'bcc' ? stateRef.current.bcc : stateRef.current[field]) ?? ''
    setSettledRecipients((s) => (s[field] === value ? s : { ...s, [field]: value }))
  }
  const draftIdRef = useRef(initial.draftId)
  const savingRef = useRef<Promise<void> | null>(null)
  const dirtyRef = useRef(false)
  const closedRef = useRef(false)
  const promptTextRef = useRef(prompt)
  promptTextRef.current = prompt

  const currentPromptKeys = useCallback(
    () =>
      promptKeys({
        mode: initial.mode,
        replyToMessageId: initial.replyTo?.messageId,
        draftId: draftIdRef.current,
        startedNew: !initial.draftId,
      }),
    [initial.mode, initial.replyTo?.messageId, initial.draftId],
  )
  const persistPrompt = useCallback(() => {
    savePrompt(browserStorage(), currentPromptKeys(), promptTextRef.current, Date.now())
  }, [currentPromptKeys])
  const [edits, setEdits] = useState(0)
  const baselineHtml = useRef<string | null>(null)
  const fieldsMounted = useRef(false)
  const [autoStatus, setAutoStatus] = useState('')

  useEffect(() => {
    promptRef.current?.focus()
  }, [])

  // Opening OptiMate minimises this window so it doesn't cover the panel.
  useEffect(() => {
    const minimise = () => setMinimised(true)
    window.addEventListener(OPTIMATE_OPENED_EVENT, minimise)
    return () => window.removeEventListener(OPTIMATE_OPENED_EVENT, minimise)
  }, [])

  // Leaving the page (or closing another way) mid-wait cancels the timer; nothing is sent.
  useEffect(
    () => () => {
      if (sendTimerRef.current !== null) window.clearTimeout(sendTimerRef.current)
    },
    [],
  )

  const attachmentBytes = state.attachments.reduce((sum, file) => sum + base64Bytes(file.data), 0)

  /** Bytes of the images currently in the body plus attachments. */
  const usedBytes = useCallback((): number => {
    const { inlineImages } = extractInlineImages(composedHtml())
    return inlineImages.reduce((sum, image) => sum + base64Bytes(image.data), 0) + attachmentBytes
  }, [attachmentBytes, composedHtml])

  const addAttachments = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      setNote('')
      let budget = MAIL_ATTACHMENT_LIMITS.maxTotalBytes - usedBytes()
      const added: ComposeFile[] = []
      for (const file of files) {
        if (state.attachments.length + added.length >= MAIL_ATTACHMENT_LIMITS.maxAttachments) {
          setNote(`Attach up to ${MAIL_ATTACHMENT_LIMITS.maxAttachments} files.`)
          break
        }
        if (file.size > budget) {
          setNote(`${file.name} is too big. ${LIMIT_NOTE}`)
          continue
        }
        try {
          added.push({ name: file.name || 'attachment', mediaType: file.type || 'application/octet-stream', data: await readBase64(file) })
          budget -= file.size
        } catch {
          setNote(`Could not read ${file.name}.`)
        }
      }
      if (added.length > 0) setState((current) => ({ ...current, attachments: [...current.attachments, ...added] }))
    },
    [state.attachments.length, usedBytes],
  )

  const addInlineImages = useCallback(
    async (files: File[]) => {
      setNote('')
      for (const file of files) {
        const budget = MAIL_ATTACHMENT_LIMITS.maxTotalBytes - usedBytes()
        const fitted = await fitImageForChat(file, file.name || 'image', {
          maxBytes: Math.max(0, Math.min(budget, MAIL_ATTACHMENT_LIMITS.maxTotalBytes)),
          maxEdge: MAIL_ATTACHMENT_LIMITS.maxImageEdge,
        })
        if (!fitted.ok) {
          setNote(budget <= 0 ? LIMIT_NOTE : fitted.error)
          continue
        }
        const src = `data:${fitted.value.mediaType};base64,${fitted.value.data}`
        const width = await naturalWidth(src)
        editorRef.current?.insertImage(src, fitted.value.name, width ? Math.min(width, DISPLAY_WIDTH) : null)
      }
    },
    [usedBytes],
  )

  /** Pasted/dropped files: images go into the body, everything else is attached. */
  const onPasteFiles = useCallback(
    (files: File[]) => {
      const images = files.filter((file) => IMAGE_TYPES.has(file.type))
      const others = files.filter((file) => !IMAGE_TYPES.has(file.type))
      void addInlineImages(images).then(() => addAttachments(others))
    },
    [addAttachments, addInlineImages],
  )

  /** Save whatever is typed to Gmail Drafts; never throws, never overlaps itself. */
  const autosave = useCallback(async (): Promise<void> => {
    // A scheduled email is saved with Update schedule, never to Gmail Drafts.
    if (closedRef.current || stateRef.current.scheduledId !== undefined) return
    if (savingRef.current) {
      dirtyRef.current = true
      return
    }
    const current = stateRef.current
    const { html, inlineImages } = extractInlineImages(composedHtml())
    const hasText = html.replace(/<[^>]*>/g, '').trim() !== '' || inlineImages.length > 0
    if (!hasText && !current.to.trim() && !current.subject.trim() && current.attachments.length === 0) return
    const total = inlineImages.reduce((sum, image) => sum + base64Bytes(image.data), 0) + attachmentBytesRef.current
    if (total > MAIL_ATTACHMENT_LIMITS.maxTotalBytes) return
    dirtyRef.current = false
    setAutoStatus('Saving…')
    const job = (async () => {
      try {
        const draftId = await onSaveDraftRef.current(
          outgoing({ ...current, ...(draftIdRef.current ? { draftId: draftIdRef.current } : {}) }),
          { html, inlineImages, attachments: current.attachments },
        )
        if (draftId && draftId !== draftIdRef.current) {
          draftIdRef.current = draftId
          persistPrompt()
        }
        setAutoStatus('Saved')
      } catch {
        setAutoStatus('Not saved')
      }
    })()
    savingRef.current = job
    await job
    savingRef.current = null
    if (dirtyRef.current) void autosave()
  }, [persistPrompt, outgoing, composedHtml])

  const attachmentBytesRef = useRef(attachmentBytes)
  attachmentBytesRef.current = attachmentBytes
  const onSaveDraftRef = useRef(onSaveDraft)
  onSaveDraftRef.current = onSaveDraft

  // Save the AI instruction on every keystroke (localStorage is synchronous and cheap).
  useEffect(() => {
    persistPrompt()
  }, [prompt, persistPrompt])

  // Save shortly after typing stops, and when the tab is hidden or closed.
  useEffect(() => {
    if (edits === 0) return
    const timer = window.setTimeout(() => void autosave(), 1500)
    return () => window.clearTimeout(timer)
  }, [edits, autosave])

  // Recipients, subject and attachments count as edits too (not the initial values).
  // Recipients count once an address is finished, not on every letter (see setRecipient).
  useEffect(() => {
    if (!fieldsMounted.current) {
      fieldsMounted.current = true
      return
    }
    setEdits((n) => n + 1)
  }, [settledRecipients.to, settledRecipients.cc, settledRecipients.bcc, state.subject, state.signOff, state.noSignature, state.attachments])

  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden') void autosave()
    }
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [autosave])

  const linkedClient = state.mode === 'reply' ? (initial.replyTo?.client ?? null) : recipientClient
  // Off unless chosen for this email.
  const followUpDays = state.followUpDays ?? 0
  followUpDaysRef.current = followUpDays
  // Something to send: a reply body, or notes in the quoted email.
  const hasContent = hasDraft || quoteOpen

  useEffect(() => {
    if (state.mode !== 'new') return
    const to = settledRecipients.to.trim()
    const cc = settledRecipients.cc.trim()
    if (!to && !cc) {
      setRecipientClient(null)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      postJson<{ client: { id: number; name: string } | null }>('/api/mail/client-match', { to, cc }, initial.account)
        .then((data) => {
          if (!cancelled) setRecipientClient(data.client ?? null)
        })
        .catch(() => {
          if (!cancelled) setRecipientClient(null)
        })
    }, 500)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [state.mode, settledRecipients.to, settledRecipients.cc, initial.account])

  function setBodyFromText(text: string) {
    // Blank lines stay as empty lines: each editor paragraph is one line, as in Gmail.
    editorRef.current?.setHtml(text ? markdownLiteToBlocksHtml(text, { blankLines: true }) : '')
  }

  // One AI request at a time, whether typed or spoken.
  const aiInFlight = useRef(false)

  /**
   * Write or revise the body with the AI (the Write with AI button and the
   * voice agent both come here). Only ever drafts: it never sends or saves
   * anything itself; the new body autosaves to Drafts like typing does.
   */
  async function runAi(instruction: string): Promise<{ ok: true; text: string; subject?: string } | { ok: false; error: string }> {
    if (aiInFlight.current || (busy !== '' && busy !== 'ai')) return { ok: false, error: 'Still busy with the last request. Try again in a moment.' }
    aiInFlight.current = true
    setBusy('ai')
    setNote('')
    try {
      // The draft as blocks: a revision's edits name the blocks to change.
      const blocks = hasDraft ? (editorRef.current?.getBlocks() ?? []) : []
      // First AI request on a new email with no subject yet: the AI suggests one too.
      const suggestSubject = state.mode === 'new' && turns.length === 0 && blocks.length === 0 && !state.subject.trim()
      const withClientData = useClientData && linkedClient !== null
      const data = await postJson<{
        text: string
        edits?: BlockEdit[]
        subject?: string
        clientContext?: { id: number; name: string } | null
      }>(
        '/api/mail/ai',
        {
          action: state.mode === 'reply' ? 'reply' : 'draft',
          ...(state.mode === 'reply' ? { gmailMessageId: state.replyTo?.messageId, includeThread: useThread } : {}),
          ...(withClientData
            ? { includeClientData: true, ...(state.mode === 'new' ? { to: state.to, cc: state.cc } : {}) }
            : {}),
          ...(suggestSubject ? { suggestSubject: true } : {}),
          instruction,
          history: turns,
          currentBlocks: blocks.map((block) => block.markdown),
        },
        initial.account,
      )
      setClientDataUsed(data.clientContext ? data.clientContext.name || 'this client' : '')
      if (data.edits && data.edits.length === 0) {
        setNote('The AI found nothing to change. Try saying what to change in another way.')
        return { ok: true, text: data.text }
      }
      const editor = editorRef.current
      const snapshot = editor?.snapshot() ?? null
      // Only the blocks the revision changes are touched; if the body changed too much
      // while the AI was working, the whole revised text goes in instead.
      const applied = data.edits && blocks.length > 0 ? (editor?.applyBlockEdits(blocks.map((block) => block.key), data.edits) ?? false) : false
      if (!applied) setBodyFromText(data.text)
      const subject = data.subject?.trim()
      // Never overwrite a subject typed while the AI was writing.
      const fillSubject = Boolean(subject) && !stateRef.current.subject.trim()
      if (subject && fillSubject) setState((current) => (current.subject.trim() ? current : { ...current, subject }))
      if (snapshot) {
        const entry: AiUndoEntry = { snapshot, turnCount: turns.length, ...(subject && fillSubject ? { subject } : {}) }
        setAiUndo((current) => [...current, entry].slice(-MAX_AI_UNDO))
      }
      setTurns((current) => [...current, { instruction: instruction || 'Draft a reply', draft: data.text }])
      return { ok: true, text: data.text, ...(subject ? { subject } : {}) }
    } catch (err) {
      const message = (err as Error).message
      setNote(message)
      return { ok: false, error: message }
    } finally {
      aiInFlight.current = false
      setBusy('')
    }
  }
  const runAiRef = useRef(runAi)

  /** Fill the subject line with a short AI subject written from the body so far. */
  async function suggestSubjectLine() {
    const body = editorRef.current?.getMarkdown().trim() ?? ''
    if (busy !== '' || !body) return
    const before = stateRef.current.subject
    setBusy('subject')
    setNote('')
    try {
      const data = await postJson<{ subject: string }>('/api/mail/subject', { body }, initial.account)
      const subject = data.subject.trim()
      // Leave a subject typed while the AI was working alone.
      if (subject) setState((current) => (current.subject === before ? { ...current, subject } : current))
    } catch (err) {
      setNote((err as Error).message)
    } finally {
      setBusy('')
    }
  }
  runAiRef.current = runAi

  /** Put the body back as it was before the last AI change (edits made since then go too). */
  function undoAi() {
    const entry = aiUndo[aiUndo.length - 1]
    if (!entry || busy !== '') return
    editorRef.current?.restore(entry.snapshot)
    setAiUndo((current) => current.slice(0, -1))
    setTurns((current) => current.slice(0, entry.turnCount))
    if (entry.subject) setState((current) => (current.subject === entry.subject ? { ...current, subject: '' } : current))
    setNote('')
  }

  /**
   * Revise with an empty instruction: tidy the layout without the AI (table
   * columns sized to their text, empty lines between sections). Undo puts it back.
   */
  function tidyLayout() {
    const editor = editorRef.current
    if (!editor || busy !== '') return
    const snapshot = editor.snapshot()
    if (!editor.tidyLayout()) {
      setNote('The layout is already tidy. To change the wording, say what to change.')
      return
    }
    if (snapshot) setAiUndo((current) => [...current, { snapshot, turnCount: turns.length }].slice(-MAX_AI_UNDO))
    setNote('')
  }

  async function askAi() {
    const instruction = prompt.trim()
    if (busy) return
    if (!instruction && hasDraft) {
      tidyLayout()
      return
    }
    if (!instruction && state.mode === 'new') {
      setNote('Say what the email should be about.')
      return
    }
    const result = await runAi(instruction)
    if (result.ok) {
      setPrompt('')
      promptRef.current?.focus()
    }
  }

  // The voice agent's only two abilities: write/revise the draft, and read it back.
  const voiceSession = useMemo<LocalVoiceSession>(
    () => ({
      instructions: buildMailVoiceInstructions({
        mode: initial.mode,
        replyTo: initial.replyTo?.from,
        subject: initial.subject,
      }),
      tools: MAIL_VOICE_TOOLS,
      greeting: MAIL_VOICE_GREETING,
      executeTool: async (name, args) => {
        if (name === MAIL_VOICE_WRITE_TOOL) {
          const instruction = typeof args.instruction === 'string' ? args.instruction.trim().slice(0, 4000) : ''
          if (!instruction) return { ok: false, error: 'Say what the email should say.' }
          const result = await runAiRef.current(instruction)
          return result.ok
            ? { ok: true, data: { drafted: true, subject: result.subject ?? stateRef.current.subject, draft: result.text } }
            : { ok: false, error: result.error }
        }
        if (name === MAIL_VOICE_READ_TOOL) {
          const current = stateRef.current
          return {
            ok: true,
            data: describeDraftForVoice({ to: current.to, subject: current.subject, body: editorRef.current?.getMarkdown() ?? '' }),
          }
        }
        return { ok: false, error: 'That is not something I can do here.' }
      },
    }),
    // The window's opening context; the tools read the live state through refs.
    [initial.mode, initial.replyTo?.from, initial.subject],
  )

  function buildContent(): ComposeContent | null {
    const { html, inlineImages } = extractInlineImages(composedHtml())
    const total = inlineImages.reduce((sum, image) => sum + base64Bytes(image.data), 0) + attachmentBytes
    if (total > MAIL_ATTACHMENT_LIMITS.maxTotalBytes) {
      setNote(`This email has ${formatSize(total)} of images and attachments. ${LIMIT_NOTE}`)
      return null
    }
    return { html, inlineImages, attachments: state.attachments }
  }

  /** Send button: check the email, then wait UNDO_SEND_MS (Undo stops it) before sending. */
  function startSend() {
    if (busy || !hasContent) return
    setNote('')
    if (!buildContent()) return
    setBusy('send')
    setSendPending(true)
    // No autosave during the wait: it would re-create the draft that Send removes.
    closedRef.current = true
    sendTimerRef.current = window.setTimeout(() => {
      sendTimerRef.current = null
      void deliverNow()
    }, UNDO_SEND_MS)
  }

  function undoSend() {
    if (sendTimerRef.current === null) return
    window.clearTimeout(sendTimerRef.current)
    sendTimerRef.current = null
    setSendPending(false)
    setBusy('')
    closedRef.current = false
    setNote('Sending undone.')
    editorRef.current?.focus()
  }

  /** Close during the wait: Send was pressed, so send now rather than lose it. */
  function flushSend(): boolean {
    if (sendTimerRef.current === null) return false
    window.clearTimeout(sendTimerRef.current)
    sendTimerRef.current = null
    void deliverNow()
    return true
  }

  async function deliverNow() {
    setSendPending(false)
    // Built again so edits made during the wait are what gets sent.
    const content = buildContent()
    if (!content) {
      closedRef.current = false
      setBusy('')
      return
    }
    try {
      await savingRef.current
      const current = stateRef.current
      await onSend(outgoing({ ...current, ...(draftIdRef.current ? { draftId: draftIdRef.current } : {}) }), content)
      clearPrompt(browserStorage(), currentPromptKeys())
    } catch (err) {
      closedRef.current = false
      setNote((err as Error).message)
    } finally {
      setBusy('')
    }
  }

  async function saveDraftNow() {
    if (busy || !hasContent) return
    setNote('')
    const content = buildContent()
    if (!content) return
    setBusy('draft')
    try {
      await savingRef.current
      const draftId = await onSaveDraft(outgoing({ ...state, ...(draftIdRef.current ? { draftId: draftIdRef.current } : {}) }), content)
      if (draftId && draftId !== draftIdRef.current) {
        draftIdRef.current = draftId
        persistPrompt()
      }
      setAutoStatus('Saved')
      setNote('Saved to Gmail Drafts.')
    } catch (err) {
      setNote((err as Error).message)
    } finally {
      setBusy('')
    }
  }

  // Files dragged onto the window are attached (images too); pasted images go inline instead.
  const hasFiles = (event: React.DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files')
  const dragHandlers = {
    onDragEnter: (event: React.DragEvent) => {
      if (!hasFiles(event) || minimised) return
      event.preventDefault()
      dragDepth.current += 1
      setDragging(true)
    },
    onDragOver: (event: React.DragEvent) => {
      if (!hasFiles(event) || minimised) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    },
    onDragLeave: (event: React.DragEvent) => {
      if (!hasFiles(event)) return
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    },
    onDrop: (event: React.DragEvent) => {
      dragDepth.current = 0
      setDragging(false)
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (files.length === 0 || minimised) return
      event.preventDefault()
      if (busy !== '') return
      void addAttachments(files)
    },
  }

  async function runSchedule(when: Date | null) {
    if (busy || !hasContent) return
    setNote('')
    if (!when || when.getTime() < Date.now() + 60_000) {
      setNote('Choose a send time at least a minute from now.')
      return
    }
    const content = buildContent()
    if (!content) return
    setBusy('schedule')
    try {
      await savingRef.current
      closedRef.current = true
      await onSchedule(outgoing({ ...state, ...(draftIdRef.current ? { draftId: draftIdRef.current } : {}) }), content, when)
      clearPrompt(browserStorage(), currentPromptKeys())
    } catch (err) {
      closedRef.current = false
      setNote((err as Error).message)
    } finally {
      setBusy('')
    }
  }

  /** Trash icon: stop autosaving, delete the Gmail draft (if one was saved) and close. */
  async function discardDraft() {
    if (busy) return
    if (!window.confirm("Delete this draft? This can't be undone.")) return
    setBusy('delete')
    setNote('')
    closedRef.current = true
    try {
      await savingRef.current
      const draftId = draftIdRef.current
      if (draftId) await onDeleteDraft(draftId)
      clearPrompt(browserStorage(), currentPromptKeys())
      onClose()
    } catch (err) {
      closedRef.current = false
      setNote((err as Error).message)
      setBusy('')
    }
  }

  function toggleSchedule() {
    setScheduleOpen((open) => !open)
  }

  function insertTable() {
    const rows = Math.min(Math.max(Math.round(tableSize.rows) || 1, 1), 50)
    const columns = Math.min(Math.max(Math.round(tableSize.columns) || 1, 1), 10)
    editorRef.current?.focus()
    editorRef.current?.insertTable(rows, columns)
    setTableOpen(false)
  }

  const windowClass = [styles.window, minimised ? styles.minimised : '', expanded && !minimised ? styles.expanded : '']
    .filter(Boolean)
    .join(' ')

  // Portalled to <body>: inside the admin layout an ancestor's stacking context
  // capped the z-index, so the OptiMate orb and client-email alert covered it.
  return createPortal(
    <div className={windowClass} role="dialog" aria-label={title} {...dragHandlers}>
      {dragging ? (
        <div className={styles.dropOverlay} aria-hidden="true">
          Drop files to attach
        </div>
      ) : null}
      <header className={styles.header} onClick={() => minimised && setMinimised(false)}>
        <span className={styles.title}>
          {title}
          {autoStatus ? <span aria-live="polite"> · {autoStatus}</span> : null}
        </span>
        <span className={styles.headerButtons}>
          <button
            type="button"
            aria-label={minimised ? 'Restore' : 'Minimise'}
            title={minimised ? 'Restore' : 'Minimise'}
            onClick={(e) => {
              e.stopPropagation()
              setMinimised((m) => !m)
            }}
          >
            {minimised ? '▴' : '▁'}
          </button>
          {!minimised ? (
            <button type="button" aria-label={expanded ? 'Exit full size' : 'Full size'} title={expanded ? 'Exit full size' : 'Full size'} onClick={() => setExpanded((x) => !x)}>
              {expanded ? '⤡' : '⤢'}
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Close"
            title="Close"
            onClick={(e) => {
              e.stopPropagation()
              if (flushSend()) return
              if (editingScheduled && edits > 0 && !window.confirm('Close without saving? The scheduled email stays as it was.')) return
              // Typed text is autosaved to Gmail Drafts, so closing never loses it.
              void autosave().then(() => savingRef.current).finally(() => {
                closedRef.current = true
                onClose()
              })
            }}
          >
            ✕
          </button>
        </span>
      </header>

      {/* Hidden, not unmounted, when minimised so the editor keeps its content. */}
      <div className={styles.content} hidden={minimised}>
        <div className={styles.fields}>
          <label className={styles.field}>
            <span>To</span>
            <RecipientInput label="To" value={state.to} onChange={(to) => setRecipient('to', to)} onBlur={() => settleRecipient('to')} contacts={contacts} onWantContacts={loadContacts} />
            {replyChoices ? (
              <button
                type="button"
                className={`${styles.replyAllToggle} ${replyAll ? styles.replyAllOn : ''}`}
                onClick={toggleReplyAll}
                aria-pressed={replyAll}
                aria-label="Reply all"
                title={replyAll ? 'Reply to the sender only' : 'Reply all: include everyone on the email'}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="7 17 2 12 7 7" />
                  <polyline points="12 17 7 12 12 7" />
                  <path d="M22 18v-2a4 4 0 0 0-4-4H7" />
                </svg>
              </button>
            ) : null}
            {!showCc ? (
              <button type="button" className={styles.ccToggle} onClick={() => setShowCc(true)} title="Add Cc and Bcc recipients">
                Cc
              </button>
            ) : null}
          </label>
          {showCc ? (
            <>
              <label className={styles.field}>
                <span>Cc</span>
                <RecipientInput label="Cc" value={state.cc} onChange={(cc) => setRecipient('cc', cc)} onBlur={() => settleRecipient('cc')} contacts={contacts} onWantContacts={loadContacts} />
              </label>
              <label className={styles.field}>
                <span>Bcc</span>
                <RecipientInput label="Bcc" value={state.bcc ?? ''} onChange={(bcc) => setRecipient('bcc', bcc)} onBlur={() => settleRecipient('bcc')} contacts={contacts} onWantContacts={loadContacts} />
              </label>
            </>
          ) : null}
          <label className={styles.field}>
            <input
              value={state.subject}
              onChange={(e) => setState({ ...state, subject: e.target.value })}
              placeholder="Subject"
              aria-label="Subject"
            />
            {state.mode === 'new' ? (
              <button
                type="button"
                className={styles.aiSubject}
                onClick={() => void suggestSubjectLine()}
                disabled={busy !== '' || !hasDraft}
                title={hasDraft ? 'Write a subject line from the email with AI' : 'Write the email first, then let AI suggest a subject'}
                aria-label="Write subject with AI"
              >
                {busy === 'subject' ? 'Writing…' : '✨ AI subject'}
              </button>
            ) : null}
          </label>
        </div>

        {/* The body and signature scroll together so the whole email is visible. */}
        <div className={styles.draftScroll}>
          <div onFocus={() => (activeEditor.current = 'body')}>
            <RichEmailEditor
              ref={editorRef}
              initialHtml={initial.html}
              ariaLabel="Email body"
              placeholder="Write here, or ask the AI below. Cmd+B, I and U format text; Cmd+K adds a link. Paste images and tables straight in. Nothing is sent until you click Send."
              onContentChange={(has) => {
                setHasDraft(has)
                // The first change report is the editor loading its initial body, not an edit.
                const html = editorRef.current?.getHtml() ?? ''
                if (baselineHtml.current === null) baselineHtml.current = html
                else if (html !== baselineHtml.current) {
                  baselineHtml.current = html
                  setEdits((n) => n + 1)
                }
              }}
              onPasteFiles={onPasteFiles}
              onFormatChange={setSelectionFormat}
            />
          </div>

          {quote ? (
            <div className={styles.quote}>
              <button
                type="button"
                className={`${styles.quoteToggle} ${quoteOpen ? styles.quoteToggleOpen : ''}`}
                onClick={() => {
                  setQuoteMounted(true)
                  setQuoteOpen((open) => !open)
                  setEdits((n) => n + 1)
                }}
                aria-expanded={quoteOpen}
                aria-label={quoteOpen ? 'Hide the email you are replying to' : 'Show the email you are replying to'}
                title={quoteOpen ? 'Hide the email you are replying to (it is then left out of your reply)' : 'Show the email you are replying to, to add notes into it'}
              >
                •••
              </button>
              {quoteMounted ? (
                <div className={styles.quoteBody} hidden={!quoteOpen} onFocus={() => (activeEditor.current = 'quote')}>
                  <p className={styles.quoteHeader}>{quoteHeader}</p>
                  <div className={styles.quoteEditor}>
                    <RichEmailEditor
                      ref={quoteEditorRef}
                      initialHtml={quoteStartHtml}
                      ariaLabel="Email you are replying to (add your notes here)"
                      placeholder="The email you are replying to."
                      onContentChange={() => {
                        const html = quoteEditorRef.current?.getHtml() ?? ''
                        if (quoteBaseline.current === null) quoteBaseline.current = html
                        else if (html !== quoteBaseline.current) {
                          quoteBaseline.current = html
                          setEdits((n) => n + 1)
                        }
                      }}
                      // Files pasted into the quote are attached; images only go inline in the reply.
                      onPasteFiles={(files) => void addAttachments(files)}
                      onFormatChange={setSelectionFormat}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {signatureHtml === null || state.noSignature ? null : (
            <div className={styles.signature}>
              {signatureParts ? (
                <textarea
                  className={styles.signOff}
                  value={state.signOff ?? signatureParts.signOff}
                  rows={Math.max(1, (state.signOff ?? signatureParts.signOff).split('\n').length)}
                  maxLength={MAX_SIGN_OFF_CHARS}
                  onChange={(e) => setState((current) => ({ ...current, signOff: e.target.value }))}
                  aria-label="Sign-off"
                  title="Sign-off for this email. Edit it here; the rest of your signature is added from Gmail."
                  spellCheck
                />
              ) : null}
              {signatureParts && !signatureParts.rest ? null : signatureHtml ? (
                <EmailBody
                  html={buildEmailDocument(signatureParts ? signatureParts.rest : signatureHtml)}
                  title="Your Gmail signature (added automatically)"
                />
              ) : (
                <span className={styles.signatureLabel}>No Gmail signature set. Add one in Gmail settings, then reopen this window.</span>
              )}
            </div>
          )}

          {/* Attachments sit under the signature, as in Gmail. */}
          {state.attachments.length > 0 ? (
            <ul className={styles.attachments} aria-label="Attachments">
              {state.attachments.map((file, index) => (
                <li key={`${index}-${file.name}`} className={styles.attachment}>
                  <span className={styles.attachmentName} title={file.name}>
                    {file.name}
                  </span>
                  <span className={styles.signatureLabel}>{formatSize(base64Bytes(file.data))}</span>
                  <button
                    type="button"
                    className={styles.linkBtn}
                    aria-label={`Remove ${file.name}`}
                    onClick={() =>
                      setState((current) => ({ ...current, attachments: current.attachments.filter((_, i) => i !== index) }))
                    }
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className={styles.ai}>
          {/* Attach / image / table / colour / lists, with "Use whole thread" on the same row (right). */}
          <div className={styles.aiTools}>
            <div className={styles.toolbar}>
              <button
                type="button"
                className={`${styles.toolButton} ${styles.iconButton}`}
                onClick={() => attachInputRef.current?.click()}
                disabled={busy !== ''}
                aria-label="Attach files"
                title="Attach files"
              >
                <span aria-hidden="true">📎</span>
              </button>
              <button
                type="button"
                className={`${styles.toolButton} ${styles.iconButton}`}
                onClick={() => imageInputRef.current?.click()}
                disabled={busy !== ''}
                aria-label="Insert image"
                title="Insert image"
              >
                <span aria-hidden="true">🖼</span>
              </button>
              <button
                type="button"
                className={styles.toolButton}
                onClick={() => setTableOpen((open) => !open)}
                aria-expanded={tableOpen}
                disabled={busy !== ''}
              >
                ⊞ Insert table
              </button>
              <FormatBar
                format={selectionFormat}
                disabled={busy !== ''}
                onColor={(color) => formatTarget()?.setTextColor(color)}
                onList={(type) => formatTarget()?.toggleList(type)}
              />
              {tableOpen ? (
                <span className={styles.tablePicker}>
                  <label>
                    Rows
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={tableSize.rows}
                      onChange={(e) => setTableSize({ ...tableSize, rows: Number(e.target.value) })}
                      aria-label="Table rows"
                    />
                  </label>
                  <label>
                    Columns
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={tableSize.columns}
                      onChange={(e) => setTableSize({ ...tableSize, columns: Number(e.target.value) })}
                      aria-label="Table columns"
                    />
                  </label>
                  <button type="button" className={styles.toolButton} onClick={insertTable}>
                    Insert
                  </button>
                </span>
              ) : null}
              <input
                ref={attachInputRef}
                type="file"
                multiple
                hidden
                aria-label="Attach files"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? [])
                  e.target.value = ''
                  void addAttachments(files)
                }}
              />
              <input
                ref={imageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                multiple
                hidden
                aria-label="Insert image"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? [])
                  e.target.value = ''
                  void addInlineImages(files)
                }}
              />
            </div>
            {state.mode === 'reply' ? (
              <label className={styles.threadToggle}>
                <input type="checkbox" checked={useThread} onChange={(e) => setUseThread(e.target.checked)} disabled={busy !== ''} />
                <span>Use whole thread</span>
              </label>
            ) : null}
            {signatureHtml ? (
              <label className={styles.threadToggle} title="Untick to send this email without your Gmail signature">
                <input
                  type="checkbox"
                  checked={!state.noSignature}
                  onChange={(e) => setState((current) => ({ ...current, noSignature: !e.target.checked }))}
                  disabled={busy !== ''}
                />
                <span>Signature</span>
              </label>
            ) : null}
            {linkedClient ? (
              <label className={styles.threadToggle}>
                <input
                  type="checkbox"
                  checked={useClientData}
                  onChange={(e) => setUseClientData(e.target.checked)}
                  disabled={busy !== ''}
                />
                <span>Use client data{linkedClient.name ? ` (${linkedClient.name})` : ''}</span>
              </label>
            ) : null}
          </div>
          <div className={styles.promptRow}>
            <textarea
              ref={promptRef}
              className={styles.prompt}
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void askAi()
                }
              }}
              placeholder={
                hasDraft
                  ? 'Tell the AI what to change, e.g. "shorter" or "mention Thursday". Leave empty and press Revise to tidy the layout'
                  : state.mode === 'reply'
                    ? 'What should the reply say? e.g. "say Thursday works, keep it short"'
                    : 'What should the email say?'
              }
              aria-label="Instruction for the AI"
            />
            {/* Talk the email through; it drafts and revises without pressing Write with AI. It cannot send. */}
            <span className={styles.voice} title="Draft by voice (GPT Realtime 2.1). It writes and reads back drafts; only you can send.">
              <OptiMateVoice mode="mail" auditId="mail" businessName="this email" localSession={voiceSession} triggerSize={34} />
            </span>
            {aiUndo.length > 0 ? (
              <button
                type="button"
                className={styles.aiUndo}
                onClick={undoAi}
                disabled={busy !== ''}
                title="Put the email back as it was before the last Revise"
              >
                Undo
              </button>
            ) : null}
            <button type="button" className={styles.aiButton} onClick={() => void askAi()} disabled={busy !== ''}>
              {busy === 'ai' ? 'Writing…' : hasDraft ? 'Revise' : 'Write with AI'}
            </button>
          </div>
          {clientDataUsed ? <p className={styles.clientDataNote}>Used CMS data for {clientDataUsed}</p> : null}
        </div>

        {note ? <p className={styles.note}>{note}</p> : null}

        {scheduleOpen ? (
          <SchedulePicker
            busy={busy !== ''}
            scheduling={busy === 'schedule'}
            canSchedule={hasContent && (state.to.trim() !== '' || editingScheduled)}
            onSchedule={(when) => void runSchedule(when)}
            {...(initial.scheduledFor ? { initial: new Date(initial.scheduledFor) } : {})}
            {...(editingScheduled ? { actionLabel: 'Update schedule' } : {})}
          />
        ) : null}

        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.send}
            onClick={startSend}
            disabled={busy !== '' || !hasContent || !state.to.trim()}
            aria-busy={busy === 'send'}
          >
            {busy === 'send' ? (
              <>
                <span className={styles.spinner} aria-hidden="true" />
                Sending…
              </>
            ) : (
              'Send'
            )}
          </button>
          {sendPending ? (
            <button type="button" className={styles.undoSend} onClick={undoSend} autoFocus>
              Undo
            </button>
          ) : null}
          <button
            type="button"
            className={styles.secondary}
            onClick={toggleSchedule}
            disabled={busy !== '' || !hasContent}
            aria-expanded={scheduleOpen}
          >
            {editingScheduled ? 'Change schedule' : 'Schedule send'}
          </button>
          <label className={styles.followUp}>
            <span>Remind me if no reply</span>
            <select
              value={followUpDays}
              onChange={(e) => setState((current) => ({ ...current, followUpDays: Number(e.target.value) }))}
              disabled={busy !== ''}
            >
              <option value={0}>Off</option>
              {FOLLOW_UP_DAY_OPTIONS.map((days) => (
                <option key={days} value={days}>
                  {days} business day{days === 1 ? '' : 's'}
                </option>
              ))}
            </select>
          </label>
          {editingScheduled ? null : (
            <button type="button" className={styles.secondary} onClick={() => void saveDraftNow()} disabled={busy !== '' || !hasContent}>
              {busy === 'draft' ? 'Saving…' : 'Save as draft'}
            </button>
          )}
          {editingScheduled ? null : <button
            type="button"
            className={styles.trash}
            onClick={() => void discardDraft()}
            disabled={busy !== ''}
            aria-label="Delete draft"
            title="Delete draft"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
            </svg>
          </button>}
        </footer>
      </div>
    </div>,
    document.body,
  )
}
