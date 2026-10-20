'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './ComposeWindow.module.css'
import EmailBody from './EmailBody'
import RichEmailEditor, { type EmailSelectionFormat, type RichEmailEditorHandle } from './RichEmailEditor'
import FormatBar from './FormatBar'
import { buildEmailDocument } from '../../lib/mail/email-html'
import { markdownLiteToHtml } from '../../lib/email-draft-markdown'
import { base64Bytes, extractInlineImages, type InlineImagePayload } from '../../lib/mail/compose-html'
import { MAIL_ATTACHMENT_LIMITS } from '../../lib/mail/compose-limits'
import { parseDatetimeLocal, schedulePresets, toDatetimeLocalValue } from '../../lib/mail/schedule-times'
import { fitImageForChat } from '../chat-image-fit'
import { browserStorage, clearPrompt, loadPrompt, promptKeys, savePrompt } from '../../lib/mail/ai-prompt-store'
import { OPTIMATE_OPENED_EVENT } from '../../lib/optimate-events'

/**
 * Gmail-style compose window docked bottom right, just left of the OptiMate orb.
 *
 * The AI works like OptiMate: each prompt produces a draft, and every further
 * prompt revises the current draft (including the user's own edits) until it
 * is right. The model only ever sees the one email being replied to (server
 * enforced) plus this conversation. Nothing is sent until Send is clicked.
 * The user's Gmail signature is previewed at the end of the scrolling draft;
 * the server appends it on Send and Save as draft, so it is never part of the
 * editable text.
 *
 * The body is a rich editor (see RichEmailEditor), always Verdana at Gmail's
 * Normal size: Cmd/Ctrl+B/I/U, text colour, bulleted and numbered lists (the
 * formatting bar under the body), pasted or inserted tables, inline images,
 * and attached files (3 MB in total). Files dropped anywhere on the window
 * are attached (listed under the signature); pasted images go inline.
 *
 * Send waits UNDO_SEND_MS before sending, like Gmail's undo send: the button
 * shows it is sending and an Undo button stops it. Closing the window during
 * the wait sends straight away (Send was pressed; only Undo cancels).
 */

/** How long Send waits, with Undo available, before the email actually goes. */
export const UNDO_SEND_MS = 3100

export interface ComposeReplyTarget {
  messageId: string
  from: string
  subject: string
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
  to: string
  cc: string
  /** Blind copy; shown with Cc. */
  bcc?: string
  subject: string
  /** Starting body HTML (the editor owns it after that). */
  html: string
  attachments: ComposeFile[]
  /** Gmail draft this compose window is editing (opened from OptiMate or saved once). */
  draftId?: string
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

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
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
  const [turns, setTurns] = useState<Turn[]>([])
  // The unsent AI instruction is kept in this browser as you type (see ai-prompt-store).
  const [prompt, setPrompt] = useState(() =>
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
  const [busy, setBusy] = useState<'' | 'ai' | 'send' | 'draft' | 'schedule' | 'delete'>('')
  const [note, setNote] = useState('')
  const [minimised, setMinimised] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [showCc, setShowCc] = useState(Boolean(initial.cc || initial.bcc))
  // Waiting out the undo window after Send; the timer is in sendTimerRef.
  const [sendPending, setSendPending] = useState(false)
  const sendTimerRef = useRef<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const [hasDraft, setHasDraft] = useState(Boolean(initial.html.trim()))
  const [tableOpen, setTableOpen] = useState(false)
  const [selectionFormat, setSelectionFormat] = useState<EmailSelectionFormat>({ list: null, color: null })
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleAt, setScheduleAt] = useState('')
  const [tableSize, setTableSize] = useState({ rows: 3, columns: 3 })
  // Opt-in: also give the AI the rest of this email's thread. Off by default.
  const [useThread, setUseThread] = useState(false)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const editorRef = useRef<RichEmailEditorHandle>(null)
  const attachInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  // Autosave: the latest state, the Gmail draft id, and the in-flight save.
  const stateRef = useRef(state)
  stateRef.current = state
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
    const { inlineImages } = extractInlineImages(editorRef.current?.getHtml() ?? '')
    return inlineImages.reduce((sum, image) => sum + base64Bytes(image.data), 0) + attachmentBytes
  }, [attachmentBytes])

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
    if (closedRef.current) return
    if (savingRef.current) {
      dirtyRef.current = true
      return
    }
    const current = stateRef.current
    const { html, inlineImages } = extractInlineImages(editorRef.current?.getHtml() ?? '')
    const hasText = html.replace(/<[^>]*>/g, '').trim() !== '' || inlineImages.length > 0
    if (!hasText && !current.to.trim() && !current.subject.trim() && current.attachments.length === 0) return
    const total = inlineImages.reduce((sum, image) => sum + base64Bytes(image.data), 0) + attachmentBytesRef.current
    if (total > MAIL_ATTACHMENT_LIMITS.maxTotalBytes) return
    dirtyRef.current = false
    setAutoStatus('Saving…')
    const job = (async () => {
      try {
        const draftId = await onSaveDraftRef.current(
          { ...current, ...(draftIdRef.current ? { draftId: draftIdRef.current } : {}) },
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
  }, [persistPrompt])

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
  useEffect(() => {
    if (!fieldsMounted.current) {
      fieldsMounted.current = true
      return
    }
    setEdits((n) => n + 1)
  }, [state.to, state.cc, state.bcc, state.subject, state.attachments])

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

  function setBodyFromText(text: string) {
    editorRef.current?.setHtml(text ? markdownLiteToHtml(text) : '')
  }

  async function askAi() {
    const instruction = prompt.trim()
    if (busy) return
    if (!instruction && (hasDraft || state.mode === 'new')) {
      setNote(hasDraft ? 'Say what to change, e.g. "make it shorter".' : 'Say what the email should be about.')
      return
    }
    setBusy('ai')
    setNote('')
    try {
      const currentDraft = hasDraft ? (editorRef.current?.getMarkdown() ?? '') : ''
      // First AI request on a new email with no subject yet: the AI suggests one too.
      const suggestSubject = state.mode === 'new' && turns.length === 0 && !currentDraft && !state.subject.trim()
      const data = await postJson<{ text: string; subject?: string }>('/api/mail/ai', {
        action: state.mode === 'reply' ? 'reply' : 'draft',
        ...(state.mode === 'reply' ? { gmailMessageId: state.replyTo?.messageId, includeThread: useThread } : {}),
        ...(suggestSubject ? { suggestSubject: true } : {}),
        instruction,
        history: turns,
        currentDraft,
      })
      setTurns((current) => [...current, { instruction: instruction || 'Draft a reply', draft: data.text }])
      setBodyFromText(data.text)
      const subject = data.subject?.trim()
      // Never overwrite a subject typed while the AI was writing.
      if (subject) setState((current) => (current.subject.trim() ? current : { ...current, subject }))
      setPrompt('')
      promptRef.current?.focus()
    } catch (err) {
      setNote((err as Error).message)
    } finally {
      setBusy('')
    }
  }

  function buildContent(): ComposeContent | null {
    const { html, inlineImages } = extractInlineImages(editorRef.current?.getHtml() ?? '')
    const total = inlineImages.reduce((sum, image) => sum + base64Bytes(image.data), 0) + attachmentBytes
    if (total > MAIL_ATTACHMENT_LIMITS.maxTotalBytes) {
      setNote(`This email has ${formatSize(total)} of images and attachments. ${LIMIT_NOTE}`)
      return null
    }
    return { html, inlineImages, attachments: state.attachments }
  }

  /** Send button: check the email, then wait UNDO_SEND_MS (Undo stops it) before sending. */
  function startSend() {
    if (busy || !hasDraft) return
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
      await onSend({ ...current, ...(draftIdRef.current ? { draftId: draftIdRef.current } : {}) }, content)
      clearPrompt(browserStorage(), currentPromptKeys())
    } catch (err) {
      closedRef.current = false
      setNote((err as Error).message)
    } finally {
      setBusy('')
    }
  }

  async function saveDraftNow() {
    if (busy || !hasDraft) return
    setNote('')
    const content = buildContent()
    if (!content) return
    setBusy('draft')
    try {
      await savingRef.current
      const draftId = await onSaveDraft({ ...state, ...(draftIdRef.current ? { draftId: draftIdRef.current } : {}) }, content)
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
    if (busy || !hasDraft) return
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
      await onSchedule({ ...state, ...(draftIdRef.current ? { draftId: draftIdRef.current } : {}) }, content, when)
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
    if (!scheduleOpen && !scheduleAt) {
      const first = schedulePresets(new Date())[0]
      if (first) setScheduleAt(toDatetimeLocalValue(first.date))
    }
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
            <input value={state.to} onChange={(e) => setState({ ...state, to: e.target.value })} />
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
                <input value={state.cc} onChange={(e) => setState({ ...state, cc: e.target.value })} />
              </label>
              <label className={styles.field}>
                <span>Bcc</span>
                <input value={state.bcc ?? ''} onChange={(e) => setState({ ...state, bcc: e.target.value })} />
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
          </label>
        </div>

        {/* The body and signature scroll together so the whole email is visible. */}
        <div className={styles.draftScroll}>
          <RichEmailEditor
            ref={editorRef}
            initialHtml={initial.html}
            ariaLabel="Email body"
            placeholder="Write here, or ask the AI below. Cmd+B, I and U format text. Paste images and tables straight in. Nothing is sent until you click Send."
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

          {signatureHtml === null ? null : (
            <div className={styles.signature} title="Signature (added automatically)">
              {signatureHtml ? (
                <EmailBody html={buildEmailDocument(signatureHtml)} title="Your Gmail signature (added automatically)" />
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

        <FormatBar
          format={selectionFormat}
          disabled={busy !== ''}
          onColor={(color) => editorRef.current?.setTextColor(color)}
          onList={(type) => editorRef.current?.toggleList(type)}
        />

        <div className={styles.ai}>
          {/* Attach / image / table, with "Use whole thread" on the same row (right). */}
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
                  ? 'Tell the AI what to change, e.g. "shorter", "more formal", "mention Thursday"'
                  : state.mode === 'reply'
                    ? 'What should the reply say? e.g. "say Thursday works, keep it short"'
                    : 'What should the email say?'
              }
              aria-label="Instruction for the AI"
            />
            <button type="button" className={styles.aiButton} onClick={() => void askAi()} disabled={busy !== ''}>
              {busy === 'ai' ? 'Writing…' : hasDraft ? 'Revise' : 'Write with AI'}
            </button>
          </div>
        </div>

        {note ? <p className={styles.note}>{note}</p> : null}

        {scheduleOpen ? (
          <div className={styles.schedulePicker} role="group" aria-label="Schedule send">
            <div className={styles.schedulePresets}>
              {schedulePresets(new Date()).map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className={styles.secondary}
                  onClick={() => setScheduleAt(toDatetimeLocalValue(preset.date))}
                  disabled={busy !== ''}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <label className={styles.scheduleCustom}>
              <span>Send at</span>
              <input
                type="datetime-local"
                value={scheduleAt}
                min={toDatetimeLocalValue(new Date())}
                onChange={(e) => setScheduleAt(e.target.value)}
                aria-label="Send date and time"
              />
            </label>
            <button
              type="button"
              className={styles.send}
              onClick={() => void runSchedule(parseDatetimeLocal(scheduleAt))}
              disabled={busy !== '' || !hasDraft || !scheduleAt || !state.to.trim()}
            >
              {busy === 'schedule' ? 'Scheduling…' : 'Schedule send'}
            </button>
          </div>
        ) : null}

        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.send}
            onClick={startSend}
            disabled={busy !== '' || !hasDraft || !state.to.trim()}
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
            disabled={busy !== '' || !hasDraft}
            aria-expanded={scheduleOpen}
          >
            Schedule send
          </button>
          <button type="button" className={styles.secondary} onClick={() => void saveDraftNow()} disabled={busy !== '' || !hasDraft}>
            {busy === 'draft' ? 'Saving…' : 'Save as draft'}
          </button>
          <button
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
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
