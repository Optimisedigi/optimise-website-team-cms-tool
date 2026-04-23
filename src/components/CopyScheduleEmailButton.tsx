'use client'

import { useDocumentInfo, useAllFormFields, useAuth } from '@payloadcms/ui'
import { useState, useMemo } from 'react'

type Attendee = {
  name: string
  email: string
  token: string
}

function extractAttendees(fields: Record<string, any>): Attendee[] {
  const attendees: Attendee[] = []
  let i = 0
  while (true) {
    const hasRow =
      fields[`attendees.${i}.name`] !== undefined ||
      fields[`attendees.${i}.email`] !== undefined
    if (!hasRow) break
    attendees.push({
      name: fields[`attendees.${i}.name`]?.value ?? '',
      email: fields[`attendees.${i}.email`]?.value ?? '',
      token: fields[`attendees.${i}.token`]?.value ?? '',
    })
    i++
  }
  return attendees
}

export default function CopyScheduleEmailButton() {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [copied, setCopied] = useState<'none' | 'recipients' | 'subject' | 'body'>('none')

  const data = useMemo(() => {
    const anyFields = fields as Record<string, any>
    const title = anyFields?.title?.value ?? ''
    const topic = anyFields?.meetingTopic?.value ?? ''
    const duration = anyFields?.durationMinutes?.value ?? '30'
    const timezone = anyFields?.timezone?.value ?? 'Australia/Sydney'
    const slots = anyFields?.generatedSlots?.value
    const hasSlots = Array.isArray(slots) && slots.length > 0
    const attendees = extractAttendees(anyFields || {})
    return { title, topic, duration, timezone, hasSlots, attendees }
  }, [fields])

  const missingTokens = data.attendees.filter((a) => !a.token).length
  const anyName = (user as any)?.name || (user as any)?.email?.split('@')[0] || ''

  const handleOpen = () => {
    const baseUrl = window.location.origin
    const subj = `${data.title || 'Meeting'} — please pick your available times`

    const linkLines = data.attendees
      .filter((a) => a.email && a.token)
      .map((a) => `• ${a.name || a.email}: ${baseUrl}/schedule/${a.token}`)

    const bodyText = [
      'Hi team,',
      '',
      `I'm scheduling a meeting${data.title ? `: ${data.title}` : ''}.`,
      data.topic ? `\n${data.topic}\n` : null,
      `Duration: ${data.duration} min (${data.timezone}).`,
      '',
      "Please click YOUR personal link below and select every time that works for you. Once everyone has responded, we'll automatically match a time that works for all attendees and send a calendar invite.",
      '',
      ...linkLines,
      '',
      'Cheers,',
      anyName,
    ]
      .filter((l) => l !== null && l !== undefined)
      .join('\n')

    setSubject(subj)
    setBody(bodyText)
    setOpen(true)
    setCopied('none')
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

  const recipients = data.attendees.map((a) => a.email).filter(Boolean).join(', ')

  if (!id) return null

  return (
    <div style={{ marginTop: 12, marginBottom: 16 }}>
      <button onClick={open ? () => setOpen(false) : handleOpen} type="button" style={styles.openButton}>
        {open ? 'Close' : 'Copy Email for All Attendees'}
      </button>

      {open && (
        <div style={styles.panel}>
          {!data.hasSlots && (
            <div style={styles.warn}>
              No available slots generated yet. Attendee links will open an empty picker. Run <strong>Generate Available Slots</strong> first.
            </div>
          )}
          {missingTokens > 0 && (
            <div style={styles.warn}>
              {missingTokens} attendee(s) missing scheduling tokens. Save this record first to generate links for everyone.
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
  field: {
    marginBottom: 14,
  },
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    marginBottom: 4,
    color: 'var(--theme-elevation-700)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  inputRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'stretch',
  },
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
