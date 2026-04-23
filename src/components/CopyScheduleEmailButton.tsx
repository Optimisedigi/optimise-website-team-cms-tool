'use client'

import { useDocumentInfo, useAuth } from '@payloadcms/ui'
import { useState } from 'react'

type Attendee = {
  name?: string
  email: string
  token?: string
}

type SchedulerDoc = {
  title?: string
  meetingTopic?: string
  durationMinutes?: string
  timezone?: string
  generatedSlots?: string[] | null
  attendees?: Attendee[]
}

export default function CopyScheduleEmailButton() {
  const { id } = useDocumentInfo()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [doc, setDoc] = useState<SchedulerDoc | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [copied, setCopied] = useState<'none' | 'recipients' | 'subject' | 'body'>('none')
  const [error, setError] = useState<string | null>(null)

  const anyName = (user as any)?.name || (user as any)?.email?.split('@')[0] || ''

  const handleOpen = async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/meeting-schedulers/${id}?depth=0`)
      if (!res.ok) throw new Error(`Failed to load scheduler (${res.status})`)
      const fetched: SchedulerDoc = await res.json()
      setDoc(fetched)

      const baseUrl = window.location.origin
      const title = fetched.title || 'Meeting'
      const topic = (fetched.meetingTopic || '').trim()
      const duration = fetched.durationMinutes || '30'
      const timezone = fetched.timezone || 'Australia/Sydney'
      const attendees = fetched.attendees || []

      const subj = `${title} — please pick your available times`

      const linkLines = attendees
        .filter((a) => a.email && a.token)
        .map((a) => `• ${a.name || a.email}: ${baseUrl}/schedule/${a.token}`)

      const bodyParts: string[] = [
        'Hi team,',
        '',
        `I'm scheduling a meeting: ${title}.`,
      ]
      if (topic) {
        bodyParts.push('', topic)
      }
      bodyParts.push(
        '',
        `Duration: ${duration} min (${timezone}).`,
        '',
        "Please click YOUR personal link below and select every time that works for you. Once everyone has responded, we'll automatically match a time that works for all attendees and send a calendar invite.",
        '',
      )
      if (linkLines.length > 0) {
        bodyParts.push(...linkLines, '')
      }
      bodyParts.push('Cheers,', anyName)

      setSubject(subj)
      setBody(bodyParts.join('\n'))
      setOpen(true)
      setCopied('none')
    } catch (err: any) {
      setError(err?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const copy = async (text: string, which: 'recipients' | 'subject' | 'body') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      setTimeout(() => setCopied('none'), 2000)
    } catch {
      alert('Could not access clipboard. Select and copy manually.')
    }
  }

  const attendees = doc?.attendees || []
  const recipients = attendees.map((a) => a.email).filter(Boolean).join(', ')
  const missingTokens = attendees.filter((a) => !a.token && a.email).length
  const hasSlots = Array.isArray(doc?.generatedSlots) && (doc?.generatedSlots?.length || 0) > 0

  if (!id) return null

  return (
    <div style={{ marginTop: 12, marginBottom: 16 }}>
      <button
        onClick={open ? () => setOpen(false) : handleOpen}
        disabled={loading}
        type="button"
        style={{ ...styles.openButton, opacity: loading ? 0.6 : 1 }}
      >
        {loading ? 'Loading…' : open ? 'Close' : 'Copy Email for All Attendees'}
      </button>
      {error && <span style={{ marginLeft: 12, color: '#dc2626', fontSize: 12 }}>{error}</span>}

      {open && (
        <div style={styles.panel}>
          {!hasSlots && (
            <div style={styles.warn}>
              No available slots generated yet. Attendee links will open an empty picker. Run <strong>Generate Available Slots</strong> first.
            </div>
          )}
          {attendees.length === 0 && (
            <div style={styles.warn}>
              No attendees saved on this scheduler. Add attendees and click Save before copying the email.
            </div>
          )}
          {missingTokens > 0 && (
            <div style={styles.warn}>
              {missingTokens} attendee(s) missing scheduling tokens. Save this record again to generate links.
            </div>
          )}

          <div style={styles.field}>
            <label style={styles.label}>Recipients (paste into Gmail BCC)</label>
            <div style={styles.inputRow}>
              <input readOnly value={recipients} style={styles.input} />
              <button type="button" style={styles.copyBtn} onClick={() => copy(recipients, 'recipients')}>
                {copied === 'recipients' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Subject</label>
            <div style={styles.inputRow}>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} style={styles.input} />
              <button type="button" style={styles.copyBtn} onClick={() => copy(subject, 'subject')}>
                {copied === 'subject' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={14}
              style={{ ...styles.input, resize: 'vertical', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}
            />
            <button type="button" style={{ ...styles.copyBtn, marginTop: 8 }} onClick={() => copy(body, 'body')}>
              {copied === 'body' ? 'Copied body to clipboard' : 'Copy body to clipboard'}
            </button>
          </div>

          <p style={styles.hint}>
            Tip: use BCC so attendees don't see each other's addresses. Paste the body into Gmail as plain text to keep the per-person links.
          </p>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  openButton: {
    padding: '8px 16px',
    background: 'var(--theme-elevation-800)',
    color: 'var(--theme-elevation-0)',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  },
  panel: {
    marginTop: 12,
    padding: 16,
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: 6,
    background: 'var(--theme-elevation-50)',
  },
  warn: {
    padding: '8px 12px',
    background: 'var(--theme-warning-100, #fef3c7)',
    color: 'var(--theme-warning-800, #78350f)',
    borderRadius: 4,
    fontSize: 12,
    marginBottom: 12,
    border: '1px solid var(--theme-warning-250, #fde68a)',
  },
  field: { marginBottom: 14 },
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    marginBottom: 4,
    color: 'var(--theme-elevation-700)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  inputRow: { display: 'flex', gap: 8, alignItems: 'stretch' },
  input: {
    flex: 1,
    padding: '6px 10px',
    border: '1px solid var(--theme-elevation-200)',
    borderRadius: 3,
    background: 'var(--theme-input-bg)',
    color: 'var(--theme-text)',
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box',
  },
  copyBtn: {
    padding: '6px 14px',
    background: 'var(--theme-elevation-100)',
    color: 'var(--theme-elevation-800)',
    border: '1px solid var(--theme-elevation-200)',
    borderRadius: 3,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
  hint: {
    margin: '8px 0 0',
    fontSize: 12,
    color: 'var(--theme-elevation-500)',
    lineHeight: 1.5,
  },
}
