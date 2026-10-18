'use client'

import { useState } from 'react'
import styles from './MailApp.module.css'
import { parseDatetimeLocal, toDatetimeLocalValue } from '../../lib/mail/schedule-times'

/**
 * The Scheduled tab: emails queued to send later. Each can be sent now,
 * moved to another time, or cancelled until it starts sending. Bodies are not
 * loaded here; the list only carries recipient, subject and time.
 */

export interface ScheduledItem {
  id: number
  to: string
  cc: string
  subject: string
  scheduledFor: string
  status: 'pending' | 'sending' | 'sent' | 'failed'
  lastError: string
  attachmentCount: number
  isReply: boolean
}

interface Props {
  items: ScheduledItem[]
  loading: boolean
  onSendNow: (id: number) => Promise<void>
  onReschedule: (id: number, when: Date) => Promise<void>
  onCancel: (id: number) => Promise<void>
}

function whenLabel(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

export default function ScheduledPanel({ items, loading, onSendNow, onReschedule, onCancel }: Props) {
  const [busyId, setBusyId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [note, setNote] = useState('')

  async function act(id: number, action: () => Promise<void>) {
    setBusyId(id)
    setNote('')
    try {
      await action()
      setEditingId(null)
    } catch (err) {
      setNote((err as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className={styles.scheduled} aria-label="Scheduled emails">
      {note ? <p className={styles.note} role="alert">{note}</p> : null}
      <ul className={styles.scheduledList}>
        {items.map((item) => {
          const busy = busyId === item.id
          const sending = item.status === 'sending'
          return (
            <li key={item.id} className={styles.scheduledRow}>
              <div className={styles.scheduledMain}>
                <span className={styles.sender}>To {item.to || '(reply recipient)'}</span>
                <span className={styles.subject}>{item.subject || '(no subject)'}</span>
                <span className={styles.muted}>
                  {item.status === 'failed' ? 'Not sent' : sending ? 'Sending now' : `Sends ${whenLabel(item.scheduledFor)}`}
                  {item.attachmentCount > 0 ? ` · ${item.attachmentCount} attachment${item.attachmentCount === 1 ? '' : 's'}` : ''}
                </span>
                {item.status === 'failed' && item.lastError ? <span className={styles.scheduledError}>{item.lastError}</span> : null}
              </div>
              {editingId === item.id ? (
                <div className={styles.scheduledActions}>
                  <input
                    type="datetime-local"
                    value={editValue}
                    min={toDatetimeLocalValue(new Date())}
                    onChange={(e) => setEditValue(e.target.value)}
                    aria-label="New send date and time"
                  />
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.primary}`}
                    disabled={busy || !parseDatetimeLocal(editValue)}
                    onClick={() => {
                      const when = parseDatetimeLocal(editValue)
                      if (when) void act(item.id, () => onReschedule(item.id, when))
                    }}
                  >
                    Save time
                  </button>
                  <button type="button" className={styles.btn} onClick={() => setEditingId(null)}>
                    Back
                  </button>
                </div>
              ) : (
                <div className={styles.scheduledActions}>
                  <button type="button" className={styles.btn} disabled={busy || sending} onClick={() => void act(item.id, () => onSendNow(item.id))}>
                    {item.status === 'failed' ? 'Retry now' : 'Send now'}
                  </button>
                  <button
                    type="button"
                    className={styles.btn}
                    disabled={busy || sending}
                    onClick={() => {
                      setEditValue(toDatetimeLocalValue(new Date(Math.max(Date.parse(item.scheduledFor) || 0, Date.now() + 5 * 60_000))))
                      setEditingId(item.id)
                    }}
                  >
                    Change time
                  </button>
                  <button
                    type="button"
                    className={styles.btn}
                    disabled={busy || sending}
                    onClick={() => {
                      if (window.confirm('Cancel this scheduled email? It will not be sent and cannot be recovered.')) {
                        void act(item.id, () => onCancel(item.id))
                      }
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </li>
          )
        })}
        {loading ? <li className={styles.empty}>Loading…</li> : null}
        {!loading && items.length === 0 ? <li className={styles.empty}>No scheduled emails.</li> : null}
      </ul>
    </section>
  )
}
