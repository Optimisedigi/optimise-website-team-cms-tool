'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './ComposeWindow.module.css'

/**
 * Gmail-style compose window docked to the bottom right of the screen.
 *
 * The AI works like OptiMate: each prompt produces a draft, and every further
 * prompt revises the current draft (including the user's own edits) until it
 * is right. The model only ever sees the one email being replied to (server
 * enforced) plus this conversation. Nothing is sent until Send is clicked.
 */

export interface ComposeReplyTarget {
  messageId: string
  from: string
  subject: string
}

export interface ComposeState {
  mode: 'reply' | 'new'
  replyTo: ComposeReplyTarget | null
  to: string
  cc: string
  subject: string
  body: string
}

interface Turn {
  instruction: string
  draft: string
}

interface Props {
  initial: ComposeState
  title: string
  onClose: () => void
  /** Returns the client name the sent email was linked to, if any. */
  onSend: (state: ComposeState) => Promise<void>
  onSaveDraft: (state: ComposeState) => Promise<void>
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

export default function ComposeWindow({ initial, title, onClose, onSend, onSaveDraft }: Props) {
  const [state, setState] = useState<ComposeState>(initial)
  const [turns, setTurns] = useState<Turn[]>([])
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState<'' | 'ai' | 'send' | 'draft'>('')
  const [note, setNote] = useState('')
  const [minimised, setMinimised] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [showCc, setShowCc] = useState(Boolean(initial.cc))
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const historyEnd = useRef<HTMLDivElement>(null)

  useEffect(() => {
    promptRef.current?.focus()
  }, [])

  useEffect(() => {
    historyEnd.current?.scrollIntoView({ block: 'nearest' })
  }, [turns.length])

  const hasDraft = state.body.trim().length > 0

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
      const data = await postJson<{ text: string }>('/api/mail/ai', {
        action: state.mode === 'reply' ? 'reply' : 'draft',
        ...(state.mode === 'reply' ? { gmailMessageId: state.replyTo?.messageId } : {}),
        instruction,
        history: turns,
        currentDraft: hasDraft ? state.body : '',
      })
      setTurns((current) => [...current, { instruction: instruction || 'Draft a reply', draft: data.text }])
      setState((current) => ({ ...current, body: data.text }))
      setPrompt('')
      promptRef.current?.focus()
    } catch (err) {
      setNote((err as Error).message)
    } finally {
      setBusy('')
    }
  }

  function undoLast() {
    if (turns.length === 0) return
    const previous = turns.slice(0, -1)
    setTurns(previous)
    setState((current) => ({ ...current, body: previous[previous.length - 1]?.draft ?? '' }))
  }

  async function run(kind: 'send' | 'draft') {
    if (busy || !hasDraft) return
    setBusy(kind)
    setNote('')
    try {
      if (kind === 'send') {
        await onSend(state)
      } else {
        await onSaveDraft(state)
        setNote('Saved to Gmail Drafts.')
      }
    } catch (err) {
      setNote((err as Error).message)
    } finally {
      setBusy('')
    }
  }

  const windowClass = [styles.window, minimised ? styles.minimised : '', expanded && !minimised ? styles.expanded : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={windowClass} role="dialog" aria-label={title}>
      <header className={styles.header} onClick={() => minimised && setMinimised(false)}>
        <span className={styles.title}>{title}</span>
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
              if (hasDraft && !window.confirm('Discard this draft?')) return
              onClose()
            }}
          >
            ✕
          </button>
        </span>
      </header>

      {minimised ? null : (
        <div className={styles.content}>
          <div className={styles.fields}>
            <label className={styles.field}>
              <span>To</span>
              <input value={state.to} onChange={(e) => setState({ ...state, to: e.target.value })} />
              {!showCc ? (
                <button type="button" className={styles.ccToggle} onClick={() => setShowCc(true)}>
                  Cc
                </button>
              ) : null}
            </label>
            {showCc ? (
              <label className={styles.field}>
                <span>Cc</span>
                <input value={state.cc} onChange={(e) => setState({ ...state, cc: e.target.value })} />
              </label>
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

          <textarea
            className={styles.body}
            value={state.body}
            onChange={(e) => setState({ ...state, body: e.target.value })}
            placeholder="Write here, or ask the AI below. Nothing is sent until you click Send."
            aria-label="Email body"
          />

          <div className={styles.ai}>
            {turns.length > 0 ? (
              <div className={styles.history} aria-label="AI prompts so far">
                {turns.map((turn, index) => (
                  <span key={index} className={styles.chip} title={turn.instruction}>
                    {turn.instruction}
                  </span>
                ))}
                <button type="button" className={styles.linkBtn} onClick={undoLast} disabled={busy !== ''}>
                  Undo last
                </button>
                <div ref={historyEnd} />
              </div>
            ) : null}
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
            <p className={styles.hint}>
              {state.mode === 'reply'
                ? 'The AI sees only the email you are replying to, your prompts and this draft. Enter to send the prompt, Shift+Enter for a new line.'
                : 'The AI sees only your prompts and this draft. No emails are shared.'}
            </p>
          </div>

          {note ? <p className={styles.note}>{note}</p> : null}

          <footer className={styles.footer}>
            <button
              type="button"
              className={styles.send}
              onClick={() => void run('send')}
              disabled={busy !== '' || !hasDraft || !state.to.trim()}
            >
              {busy === 'send' ? 'Sending…' : 'Send'}
            </button>
            <button type="button" className={styles.secondary} onClick={() => void run('draft')} disabled={busy !== '' || !hasDraft}>
              {busy === 'draft' ? 'Saving…' : 'Save as draft'}
            </button>
          </footer>
        </div>
      )}
    </div>
  )
}
