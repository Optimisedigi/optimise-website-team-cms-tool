'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import styles from './TriagePanel.module.css'

/** Mirrors the /api/mail/triage response (src/lib/mail/triage.ts). */
export interface TriageSenderRow {
  address: string
  name: string
  count: number
  subjects: string[]
  messageIds: string[]
}

export interface TriageCategoryRow {
  key: string
  label: string
  count: number
  defaultSelected: boolean
  senders: TriageSenderRow[]
}

interface TriageResult {
  categories: TriageCategoryRow[]
  scanned: number
  truncated: boolean
  failedBatches: number
}

/** Ids per apply request (the route's cap). */
const APPLY_CHUNK = 1000
/** Ids per "read" step (the route's cap, TRIAGE_READ_CHUNK). */
const READ_CHUNK = 200
/** Gmail's per-account read rate the route keeps to (TRIAGE_READS_PER_MINUTE). */
const READS_PER_MINUTE = 250

/** A message's sender and subject, as the "read" step returns them. */
type TriageMessage = Record<string, unknown>

/** "about 12 minutes" / "under a minute" for the reads still to do. */
function timeLeft(remaining: number): string {
  const minutes = Math.ceil(remaining / READS_PER_MINUTE)
  return minutes <= 1 ? 'under a minute' : `about ${minutes} minutes`
}
const SUBJECTS_SHOWN = 3

/** One colour per category, used in the overview bar, swatches and share bars. */
const CATEGORY_TONES: Record<string, string> = {
  sales_pitch: '#e4572e',
  newsletter: '#2c97c9',
  promotion: '#f0a202',
  notification: '#8e7cc3',
  keep: '#5b8c5a',
  clients: '#1f6f8b',
}

const fmt = (n: number) => n.toLocaleString('en-AU')
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`

function defaultSelection(categories: TriageCategoryRow[]): Set<string> {
  return new Set(categories.filter((category) => category.defaultSelected).flatMap((category) => category.senders.map((sender) => sender.address)))
}

/**
 * On-request inbox triage: the AI sorts unread senders (sender + subject only)
 * into categories; the user unticks anything to keep and archives or marks
 * the rest read. Nothing changes in Gmail until Archive / Mark read is clicked.
 */
export default function TriagePanel({
  api,
  onApplied,
  onClose,
}: {
  api: <T>(url: string, init?: RequestInit) => Promise<T>
  onApplied: () => void
  onClose: () => void
}) {
  const [result, setResult] = useState<TriageResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<'' | 'archive' | 'read'>('')
  const [note, setNote] = useState('')
  // Stops a running triage when the panel closes.
  const runRef = useRef<AbortController | null>(null)
  useEffect(() => () => runRef.current?.abort(), [])

  /**
   * List the unread ids, read their senders and subjects in chunks (Gmail lets
   * one account read only about 300 a minute, so a big inbox takes minutes),
   * then sort. If Gmail stops a later chunk, what was read so far is sorted.
   */
  async function runTriage() {
    runRef.current?.abort()
    const run = new AbortController()
    runRef.current = run
    const post = <T,>(body: unknown) =>
      api<T>('/api/mail/triage', { method: 'POST', body: JSON.stringify(body), signal: run.signal })
    setLoading(true)
    setNote('Finding unread emails…')
    try {
      const listed = await post<{ ids: string[]; truncated: boolean }>({ step: 'list' })
      const messages: TriageMessage[] = []
      let stoppedEarly = ''
      for (let i = 0; i < listed.ids.length; i += READ_CHUNK) {
        setNote(
          `Reading senders and subjects: ${fmt(i)} of ${fmt(listed.ids.length)}. Gmail allows about ${READS_PER_MINUTE} a minute, so this takes ${timeLeft(listed.ids.length - i)}. You can keep using Mail.`,
        )
        try {
          const read = await post<{ messages: TriageMessage[] }>({ step: 'read', ids: listed.ids.slice(i, i + READ_CHUNK) })
          messages.push(...read.messages)
        } catch (err) {
          if (run.signal.aborted || messages.length === 0) throw err
          stoppedEarly = (err as Error).message
          break
        }
      }
      if (run.signal.aborted) return
      setNote(`Sorting ${plural(messages.length, 'email')} by sender…`)
      const sorted = await post<Omit<TriageResult, 'truncated'>>({ step: 'sort', messages })
      if (run.signal.aborted) return
      setResult({ ...sorted, truncated: listed.truncated || stoppedEarly !== '' })
      setSelected(defaultSelection(sorted.categories))
      setExpanded(new Set())
      setNote(stoppedEarly ? `Gmail stopped the reading early (${stoppedEarly}). These are the emails read so far.` : '')
    } catch (err) {
      if (!run.signal.aborted) setNote((err as Error).message)
    } finally {
      if (runRef.current === run) {
        runRef.current = null
        setLoading(false)
      }
    }
  }

  const totals = useMemo(() => {
    const senders = result?.categories.flatMap((category) => category.senders) ?? []
    const picked = senders.filter((sender) => selected.has(sender.address))
    return {
      emails: senders.reduce((sum, sender) => sum + sender.count, 0),
      senders: senders.length,
      pickedEmails: picked.reduce((sum, sender) => sum + sender.count, 0),
      pickedSenders: picked.length,
      pickedIds: picked.flatMap((sender) => sender.messageIds),
    }
  }, [result, selected])

  function toggleSender(address: string, on: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      if (on) next.add(address)
      else next.delete(address)
      return next
    })
  }

  function toggleCategory(category: TriageCategoryRow, on: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      for (const sender of category.senders) {
        if (on) next.add(sender.address)
        else next.delete(sender.address)
      }
      return next
    })
  }

  function toggleExpanded(key: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function apply(action: 'archive' | 'read') {
    const ids = totals.pickedIds
    if (busy !== '' || ids.length === 0) return
    setBusy(action)
    setNote('')
    const done = new Set<string>()
    try {
      for (let i = 0; i < ids.length; i += APPLY_CHUNK) {
        const chunk = ids.slice(i, i + APPLY_CHUNK)
        setNote(`${action === 'archive' ? 'Archiving' : 'Marking read'} ${fmt(Math.min(i + chunk.length, ids.length))} of ${fmt(ids.length)}…`)
        await api('/api/mail/triage/apply', { method: 'POST', body: JSON.stringify({ messageIds: chunk, action }) })
        for (const id of chunk) done.add(id)
      }
      setNote(`${action === 'archive' ? 'Archived' : 'Marked read'} ${plural(done.size, 'email')}.`)
    } catch (err) {
      setNote(`${(err as Error).message}${done.size ? ` (${fmt(done.size)} done before it stopped)` : ''}`)
    } finally {
      // Drop what was cleared from the summary; senders with emails left stay listed.
      if (done.size > 0) {
        setResult((current) =>
          current
            ? {
                ...current,
                categories: current.categories
                  .map((category) => {
                    const senders = category.senders
                      .map((sender) => {
                        const messageIds = sender.messageIds.filter((id) => !done.has(id))
                        return { ...sender, messageIds, count: Math.max(0, sender.count - (sender.messageIds.length - messageIds.length)) }
                      })
                      .filter((sender) => sender.count > 0)
                    return { ...category, senders, count: senders.reduce((sum, sender) => sum + sender.count, 0) }
                  })
                  .filter((category) => category.senders.length > 0),
              }
            : current,
        )
        onApplied()
      }
      setBusy('')
    }
  }

  const categoryTone = (key: string) => CATEGORY_TONES[key] ?? 'var(--theme-elevation-400)'

  return (
    <div className={styles.panel} aria-label="Inbox triage">
      <div className={styles.head}>
        <h3 className={styles.title}>Triage unread</h3>
        <button type="button" className={styles.linkBtn} onClick={onClose}>
          Close
        </button>
      </div>
      <p className={styles.muted}>
        Runs only when you click the button below. The AI sees each sender and subject line, never the emails themselves. Untick anything
        you want to keep. Nothing changes in Gmail until you click Archive or Mark read.
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.btn} onClick={() => void runTriage()} disabled={loading || busy !== ''}>
          {loading ? 'Sorting unread emails…' : result ? 'Triage again' : 'Triage unread emails'}
        </button>
      </div>

      {result ? (
        <>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statValue}>{fmt(totals.emails)}</span>
              <span className={styles.statLabel}>unread emails</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{fmt(totals.senders)}</span>
              <span className={styles.statLabel}>senders</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{fmt(totals.pickedEmails)}</span>
              <span className={styles.statLabel}>selected to clear</span>
            </div>
          </div>
          {totals.emails > 0 ? (
            <div className={styles.stack} aria-hidden="true">
              {result.categories.map((category) => (
                <span
                  key={category.key}
                  className={styles.stackPart}
                  style={{ flexGrow: category.count, background: categoryTone(category.key) }}
                  title={`${category.label}: ${fmt(category.count)}`}
                />
              ))}
            </div>
          ) : null}
          <p className={styles.summary}>
            {totals.emails === 0
              ? 'No unread emails left to triage.'
              : `${plural(totals.emails, 'unread email')} from ${plural(totals.senders, 'sender')}.`}
            {result.truncated ? ` Only the newest ${fmt(result.scanned)} were checked; triage again after clearing these.` : ''}
            {result.failedBatches > 0 ? ' Some senders could not be sorted and are under Might need a look.' : ''}
          </p>

          {result.categories.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption className={styles.srOnly}>Unread emails by category</caption>
                <thead>
                  <tr>
                    <th scope="col" className={styles.checkCol}>
                      <span className={styles.srOnly}>Clear</span>
                    </th>
                    <th scope="col">Category</th>
                    <th scope="col" className={styles.num}>
                      Emails
                    </th>
                    <th scope="col" className={styles.num}>
                      Senders
                    </th>
                    <th scope="col" className={styles.shareCol}>
                      Share
                    </th>
                    <th scope="col" className={styles.num}>
                      Selected
                    </th>
                  </tr>
                </thead>
                {result.categories.map((category) => {
                  const pickedSenders = category.senders.filter((sender) => selected.has(sender.address))
                  const picked = pickedSenders.length
                  const pickedEmails = pickedSenders.reduce((sum, sender) => sum + sender.count, 0)
                  const open = expanded.has(category.key)
                  const share = totals.emails ? Math.round((category.count / totals.emails) * 100) : 0
                  return (
                    <tbody key={category.key} className={styles.group}>
                      <tr className={styles.categoryRow}>
                        <td className={styles.checkCol}>
                          <input
                            type="checkbox"
                            checked={picked === category.senders.length}
                            ref={(el) => {
                              if (el) el.indeterminate = picked > 0 && picked < category.senders.length
                            }}
                            onChange={(e) => toggleCategory(category, e.target.checked)}
                            disabled={busy !== ''}
                            aria-label={`Select all ${category.label}`}
                          />
                        </td>
                        <th scope="row">
                          <button
                            type="button"
                            className={styles.categoryToggle}
                            onClick={() => toggleExpanded(category.key)}
                            aria-expanded={open}
                          >
                            <span aria-hidden="true" className={styles.chevron}>
                              {open ? '▾' : '▸'}
                            </span>
                            <span className={styles.swatch} style={{ background: categoryTone(category.key) }} aria-hidden="true" />
                            {category.label}
                          </button>
                        </th>
                        <td className={`${styles.num} ${styles.strong}`}>{fmt(category.count)}</td>
                        <td className={styles.num}>{fmt(category.senders.length)}</td>
                        <td className={styles.shareCol}>
                          <span className={styles.bar} aria-hidden="true">
                            <span style={{ width: `${share}%`, background: categoryTone(category.key) }} />
                          </span>
                          <span className={styles.shareText}>{share}%</span>
                        </td>
                        <td className={styles.num}>{fmt(pickedEmails)}</td>
                      </tr>
                      {open ? (
                        <tr className={styles.detailRow}>
                          <td colSpan={6}>
                            <table className={styles.senderTable}>
                              <caption className={styles.srOnly}>{category.label} by sender</caption>
                              <thead>
                                <tr>
                                  <th scope="col" className={styles.checkCol}>
                                    <span className={styles.srOnly}>Clear</span>
                                  </th>
                                  <th scope="col">Sender</th>
                                  <th scope="col" className={styles.num}>
                                    Emails
                                  </th>
                                  <th scope="col">Subjects</th>
                                </tr>
                              </thead>
                              <tbody>
                                {category.senders.map((sender) => (
                                  <tr key={sender.address} className={selected.has(sender.address) ? undefined : styles.kept}>
                                    <td className={styles.checkCol}>
                                      <input
                                        type="checkbox"
                                        checked={selected.has(sender.address)}
                                        onChange={(e) => toggleSender(sender.address, e.target.checked)}
                                        disabled={busy !== ''}
                                        aria-label={`Clear ${sender.name} (${sender.address})`}
                                      />
                                    </td>
                                    <td className={styles.senderCell}>
                                      <span className={styles.senderName}>{sender.name}</span>
                                      {sender.name !== sender.address ? <span className={styles.senderAddress}>{sender.address}</span> : null}
                                    </td>
                                    <td className={`${styles.num} ${styles.strong}`}>{fmt(sender.count)}</td>
                                    <td className={styles.subjects}>
                                      {sender.subjects.slice(0, SUBJECTS_SHOWN).join(' · ')}
                                      {sender.subjects.length > SUBJECTS_SHOWN ? (
                                        <details className={styles.more}>
                                          <summary>+{fmt(sender.subjects.length - SUBJECTS_SHOWN)} more subjects</summary>
                                          <ul>
                                            {sender.subjects.slice(SUBJECTS_SHOWN).map((subject) => (
                                              <li key={subject}>{subject}</li>
                                            ))}
                                          </ul>
                                        </details>
                                      ) : null}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  )
                })}
                <tfoot>
                  <tr>
                    <td />
                    <th scope="row">Total</th>
                    <td className={`${styles.num} ${styles.strong}`}>{fmt(totals.emails)}</td>
                    <td className={styles.num}>{fmt(totals.senders)}</td>
                    <td className={styles.shareCol} />
                    <td className={`${styles.num} ${styles.strong}`}>{fmt(totals.pickedEmails)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : null}
          {totals.emails > 0 ? (
            <div className={styles.footer}>
              <span className={styles.muted}>
                Selected: {plural(totals.pickedEmails, 'email')} from {plural(totals.pickedSenders, 'sender')}
              </span>
              <button
                type="button"
                className={`${styles.btn} ${styles.primary}`}
                onClick={() => void apply('archive')}
                disabled={busy !== '' || totals.pickedEmails === 0}
              >
                {busy === 'archive' ? 'Archiving…' : 'Archive selected'}
              </button>
              <button type="button" className={styles.btn} onClick={() => void apply('read')} disabled={busy !== '' || totals.pickedEmails === 0}>
                {busy === 'read' ? 'Marking read…' : 'Mark selected read'}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
      {note ? (
        <p className={styles.note} role="status">
          {note}
        </p>
      ) : null}
    </div>
  )
}
