'use client'

import { useDocumentInfo, useAllFormFields, useAuth } from '@payloadcms/ui'
import { useMemo, useState } from 'react'

type Attendee = {
  name: string
  email: string
  token: string
  internalConfirmed: boolean
}

type TopicItem = { type: 'bullet' | 'text'; text: string }

// Parse free-text topic the same way the CMS / public schedule page does:
// lines starting with -, *, • or "1." are bullets; other non-empty lines are text.
function parseTopicItems(text: string): TopicItem[] {
  const items: TopicItem[] = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const bulletMatch = trimmed.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/)
    if (bulletMatch) items.push({ type: 'bullet', text: bulletMatch[1] })
    else items.push({ type: 'text', text: trimmed })
  }
  return items
}

function extractAttendees(fields: Record<string, any>): Attendee[] {
  const attendees: Attendee[] = []
  let i = 0
  while (true) {
    const hasRow =
      fields[`attendees.${i}.name`] !== undefined ||
      fields[`attendees.${i}.email`] !== undefined ||
      fields[`attendees.${i}.internalConfirmed`] !== undefined ||
      fields[`attendees.${i}.id`] !== undefined ||
      fields[`attendees.${i}.token`] !== undefined
    if (!hasRow) break
    attendees.push({
      name: fields[`attendees.${i}.name`]?.value ?? '',
      email: fields[`attendees.${i}.email`]?.value ?? '',
      token: fields[`attendees.${i}.token`]?.value ?? '',
      internalConfirmed: !!fields[`attendees.${i}.internalConfirmed`]?.value,
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
  const [copied, setCopied] = useState<'none' | 'recipients' | 'subject' | 'body' | 'bodyPlain'>('none')

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

  const anyName = (user as any)?.name || (user as any)?.email?.split('@')[0] || ''
  const missingTokens = data.attendees.filter((a) => a.email && !a.token).length

  const buildEmail = () => {
    const baseUrl = window.location.origin
    const title = data.title || 'Meeting'
    const topic = (data.topic || '').trim()
    const subj = `${title}: please pick your available times`

    const linkAttendees = data.attendees.filter((a) => a.email && a.token && !a.internalConfirmed)

    const plainParts: string[] = [
      'Hi team,',
      '',
      `Let's lock in a time for the meeting we're scheduling: ${title}, without a long email thread or comparing everyone's calendars.`,
      '',
      "Each link below is unique to one attendee. Open yours, tick every time that works for you, and we'll automatically confirm the first slot you all share.",
    ]
    if (topic) {
      plainParts.push('', "What's covered:")
      for (const item of parseTopicItems(topic)) {
        plainParts.push(item.type === 'bullet' ? `• ${item.text}` : item.text)
      }
    }
    plainParts.push('', `Duration: ${data.duration} min (${data.timezone}).`, '')
    if (linkAttendees.length) {
      plainParts.push(
        ...linkAttendees.map((a) => `• ${a.name || a.email}: ${baseUrl}/schedule/${a.token}`),
        '',
      )
    }
    plainParts.push('Cheers,', anyName)

    return { subject: subj, body: plainParts.join('\n') }
  }

  const buildHtml = () => {
    const baseUrl = window.location.origin
    const title = data.title || 'Meeting'
    const topic = (data.topic || '').trim()
    const linkAttendees = data.attendees.filter((a) => a.email && a.token && !a.internalConfirmed)
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    const lines: string[] = [
      '<div>Hi team,</div>',
      '<div>&nbsp;</div>',
      `<div>Let's lock in a time for the meeting we're scheduling: <span style="color:#2563eb;font-weight:600">${esc(title)}</span>, without a long email thread or comparing everyone's calendars.</div>`,
      '<div>&nbsp;</div>',
      "<div>Each link below is unique to one attendee. Open yours, tick every time that works for you, and we'll automatically confirm the first slot you all share.</div>",
    ]
    if (topic) {
      lines.push('<div>&nbsp;</div>', "<div><strong>What's covered:</strong></div>")
      const items = parseTopicItems(topic)
      let inList = false
      for (const item of items) {
        if (item.type === 'bullet') {
          if (!inList) {
            lines.push('<ul style="margin:0;padding-left:20px">')
            inList = true
          }
          lines.push(`<li>${esc(item.text)}</li>`)
        } else {
          if (inList) {
            lines.push('</ul>')
            inList = false
          }
          lines.push(`<div>${esc(item.text)}</div>`)
        }
      }
      if (inList) lines.push('</ul>')
    }
    lines.push('<div>&nbsp;</div>', `<div>Duration: ${esc(data.duration)} min (${esc(data.timezone)}).</div>`, '<div>&nbsp;</div>')
    if (linkAttendees.length) {
      lines.push('<ul style="margin:0;padding-left:20px">')
      for (const a of linkAttendees) {
        const label = esc(a.name || a.email)
        const url = `${baseUrl}/schedule/${a.token}`
        lines.push(`<li>${label}: <a href="${url}">${url}</a></li>`)
      }
      lines.push('</ul>', '<div>&nbsp;</div>')
    }
    lines.push('<div>Cheers,</div>', `<div>${esc(anyName)}</div>`)
    return lines.join('')
  }

  const handleOpen = () => {
    const { subject: s, body: b } = buildEmail()
    setSubject(s)
    setBody(b)
    setOpen(true)
    setCopied('none')
  }

  const copy = async (text: string, which: 'recipients' | 'subject' | 'body' | 'bodyPlain') => {
    try {
      if (which === 'body' && typeof ClipboardItem !== 'undefined') {
        const html = buildHtml()
        const item = new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        })
        await navigator.clipboard.write([item])
      } else {
        await navigator.clipboard.writeText(text)
      }
      setCopied(which)
      setTimeout(() => setCopied('none'), 2000)
    } catch {
      try {
        await navigator.clipboard.writeText(text)
        setCopied(which)
        setTimeout(() => setCopied('none'), 2000)
      } catch {
        alert('Could not access clipboard. Select and copy manually.')
      }
    }
  }

  const recipients = data.attendees.filter((a) => !a.internalConfirmed).map((a) => a.email).filter(Boolean).join(', ')

  if (!id) return null

  return (
    <div style={{ marginTop: 12, marginBottom: 16 }}>
      <button
        onClick={open ? () => setOpen(false) : handleOpen}
        type="button"
        style={styles.openButton}
      >
        {open ? 'Close' : 'Copy Email for All Attendees'}
      </button>

      {open && (
        <div style={styles.panel}>
          {!data.hasSlots && (
            <div style={styles.warn}>
              No available slots generated yet. Attendee links will open an empty picker. Run <strong>Generate Available Slots</strong> first.
            </div>
          )}
          {data.attendees.length === 0 && (
            <div style={styles.warn}>
              No attendees found. Add attendees and click Save before copying the email.
            </div>
          )}
          {missingTokens > 0 && (
            <div style={styles.warn}>
              {missingTokens} attendee(s) are missing scheduling tokens. Save the record once to generate them.
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
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                style={{ ...styles.copyBtn, ...styles.copyBtnPrimary }}
                onClick={() => copy(body, 'body')}
              >
                {copied === 'body' ? 'Copied for Gmail' : 'Copy for Gmail (rich text)'}
              </button>
              <button
                type="button"
                style={styles.copyBtn}
                onClick={() => copy(body, 'bodyPlain')}
              >
                {copied === 'bodyPlain' ? 'Copied as plain text' : 'Copy as plain text'}
              </button>
            </div>
          </div>

          <p style={styles.hint}>
            <strong>Copy for Gmail</strong> keeps the title in blue and links clickable when pasted into Gmail's compose window. Use BCC so attendees don't see each other's addresses.
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
  copyBtnPrimary: {
    background: '#2563eb',
    color: '#ffffff',
    border: '1px solid #2563eb',
  },
  hint: {
    margin: '8px 0 0',
    fontSize: 12,
    color: 'var(--theme-elevation-500)',
    lineHeight: 1.5,
  },
}
