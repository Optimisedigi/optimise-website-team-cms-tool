'use client'

import { useCallback, useRef, useState } from 'react'
import {
  MAX_MEETING_ATTENDEES,
  MEETING_DURATION_OPTIONS,
  isGenericMeetingTitle,
  titleFromTopic,
  type MeetingInviteEdits,
} from '@/lib/agents/adminmate/meeting-scheduler-tools'
import type { MeetingInvitePreview } from '@/lib/meeting-scheduler-invites'
import type { MailContact } from '@/lib/mail/contacts-shared'
import AdminMateInviteeEmailInput from './AdminMateInviteeEmailInput'

interface Props {
  preview: MeetingInvitePreview
  edits: MeetingInviteEdits
  sending: boolean
  onChange: (changes: Partial<MeetingInviteEdits>) => void
  onSend: () => void
  onDiscard: () => void
}

function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))
}

/**
 * People from the admin's own sent and received Gmail, loaded the first time
 * an invitee email field is focused. Suggestions are a convenience: if Gmail
 * is not connected or the request fails, the fields work as plain text.
 */
function useInboxContacts(): { contacts: MailContact[] | null; load: () => void } {
  const [contacts, setContacts] = useState<MailContact[] | null>(null)
  const requested = useRef(false)
  const load = useCallback(() => {
    if (requested.current) return
    requested.current = true
    const run = async (): Promise<void> => {
      try {
        const response = await fetch('/api/mail/contacts', { credentials: 'include' })
        const data = (await response.json().catch(() => null)) as { contacts?: unknown } | null
        const list: unknown[] = response.ok && Array.isArray(data?.contacts) ? data.contacts : []
        setContacts(
          list.filter(
            (contact): contact is MailContact =>
              typeof (contact as MailContact | null)?.email === 'string' &&
              typeof (contact as MailContact | null)?.name === 'string',
          ),
        )
      } catch {
        setContacts([])
      }
    }
    void run()
  }, [])
  return { contacts, load }
}

/**
 * Confirm-and-send card for a meeting scheduler's invite emails. The admin
 * can edit the details first; nothing is emailed until they press Send (or
 * say "send it").
 */
export default function AdminMateMeetingInvitesCard({
  preview,
  edits,
  sending,
  onChange,
  onSend,
  onDiscard,
}: Props): React.ReactElement {
  const recipients = edits.attendees.filter(
    (attendee) => !attendee.internalConfirmed && attendee.email.trim(),
  )
  const resend = edits.attendees.some(
    (attendee) =>
      preview.attendees.find((p) => p.email.toLowerCase() === attendee.email.toLowerCase())
        ?.alreadySent,
  )
  const updateAttendee = (
    index: number,
    changes: Partial<MeetingInviteEdits['attendees'][number]>,
  ) =>
    onChange({
      attendees: edits.attendees.map((attendee, i) =>
        i === index ? { ...attendee, ...changes } : attendee,
      ),
    })
  const { contacts, load: loadContacts } = useInboxContacts()
  const skipEmail = edits.skipEmail === true
  const people = `${recipients.length} ${recipients.length === 1 ? 'person' : 'people'}`
  const canSend =
    !sending && edits.title.trim().length > 0 && recipients.length > 0 && preview.offeredTimes > 0

  return (
    <section
      aria-label="Send meeting invites review"
      style={{
        border: '1px solid #6ee7b7',
        borderRadius: 12,
        padding: 12,
        background: 'rgba(16,185,129,.08)',
        display: 'grid',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <strong>Send scheduling invites?</strong>
        <a href={preview.adminUrl} target="_blank" rel="noreferrer" style={linkStyle}>
          Open
        </a>
      </div>
      <label style={labelStyle}>
        Title
        <input
          aria-label="Invite meeting title"
          value={edits.title}
          maxLength={200}
          onChange={(event) => onChange({ title: event.target.value })}
          style={inputStyle}
        />
      </label>
      <label style={labelStyle}>
        Duration
        <select
          aria-label="Invite duration"
          value={edits.durationMinutes}
          onChange={(event) =>
            onChange({
              durationMinutes: event.target.value as MeetingInviteEdits['durationMinutes'],
            })
          }
          style={inputStyle}
        >
          {MEETING_DURATION_OPTIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes} minutes
            </option>
          ))}
        </select>
      </label>
      <label style={labelStyle}>
        What&apos;s covered
        <textarea
          aria-label="Invite meeting topic"
          value={edits.meetingTopic ?? ''}
          onChange={(event) => {
            const meetingTopic = event.target.value
            const title = edits.title.trim()
            // Keep the title in step while it is blank, a placeholder or made
            // from the previous topic; a title the admin typed is kept.
            const follows =
              !title || isGenericMeetingTitle(title) || title === titleFromTopic(edits.meetingTopic)
            onChange(
              follows && titleFromTopic(meetingTopic)
                ? { meetingTopic, title: titleFromTopic(meetingTopic) }
                : { meetingTopic },
            )
          }}
          rows={2}
          maxLength={2000}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </label>
      <div style={labelStyle}>
        Times offered
        <span style={{ fontWeight: 400, fontSize: 13 }}>
          {preview.offeredTimes === 0
            ? 'None yet — open the scheduler and check your calendar first.'
            : `${preview.offeredTimes} times${
                preview.firstTime && preview.lastTime
                  ? `, ${formatTime(preview.firstTime, preview.timezone)} to ${formatTime(preview.lastTime, preview.timezone)}`
                  : ''
              }`}
        </span>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 6 }}>
        <legend style={{ ...labelStyle, marginBottom: 4 }}>Invitees</legend>
        {edits.attendees.map((attendee, index) => (
          <div key={index} style={{ display: 'grid', gap: 4 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                aria-label={`Invitee ${index + 1} name`}
                placeholder="Name"
                value={attendee.name}
                maxLength={200}
                onChange={(event) => updateAttendee(index, { name: event.target.value })}
                style={{ ...inputStyle, flex: 1 }}
              />
              <AdminMateInviteeEmailInput
                label={`Invitee ${index + 1} email`}
                value={attendee.email}
                onChange={(email) => updateAttendee(index, { email })}
                onPick={(contact) =>
                  updateAttendee(index, {
                    email: contact.email,
                    // Fill the name from the email headers unless one was typed.
                    ...(!attendee.name.trim() && contact.name ? { name: contact.name } : {}),
                  })
                }
                contacts={contacts}
                onWantContacts={loadContacts}
                exclude={
                  new Set(
                    edits.attendees
                      .filter((_, i) => i !== index)
                      .map((other) => other.email.trim().toLowerCase()),
                  )
                }
                style={{ flex: 1.4 }}
              />
              <button
                type="button"
                aria-label={`Remove invitee ${index + 1}`}
                onClick={() =>
                  onChange({ attendees: edits.attendees.filter((_, i) => i !== index) })
                }
                style={{ ...secondaryButtonStyle, padding: '0 10px' }}
              >
                ×
              </button>
            </div>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
              <input
                type="checkbox"
                checked={attendee.internalConfirmed}
                onChange={(event) =>
                  updateAttendee(index, { internalConfirmed: event.target.checked })
                }
              />
              Optimise Digital team (no invite email)
            </label>
          </div>
        ))}
        {edits.attendees.length < MAX_MEETING_ATTENDEES && (
          <button
            type="button"
            onClick={() =>
              onChange({
                attendees: [...edits.attendees, { name: '', email: '', internalConfirmed: false }],
              })
            }
            style={{ ...secondaryButtonStyle, justifySelf: 'start' }}
          >
            + Add invitee
          </button>
        )}
      </fieldset>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
        <input
          type="checkbox"
          checked={skipEmail}
          onChange={(event) => onChange({ skipEmail: event.target.checked })}
        />
        Don&apos;t email invitees — I&apos;ll copy and share the links myself
      </label>
      <div role="status" style={noticeStyle}>
        {skipEmail
          ? 'Nobody is emailed. Press Get links or say “send it” to get each invitee’s private link to copy.'
          : `${resend ? 'Some invitees were already emailed; sending again re-sends their link. ' : ''}Check the details, then press Send or say “send it”.`}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          style={{ ...primaryButtonStyle, flex: 1 }}
        >
          {sending
            ? skipEmail
              ? 'Getting links…'
              : 'Sending…'
            : skipEmail
              ? `Get invite links for ${people}`
              : `Send invites to ${people}`}
        </button>
        <button type="button" onClick={onDiscard} disabled={sending} style={secondaryButtonStyle}>
          Not now
        </button>
      </div>
    </section>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid var(--theme-elevation-200)',
  borderRadius: 7,
  padding: '8px 9px',
  background: 'var(--theme-bg)',
  color: 'var(--theme-text)',
  font: 'inherit',
}
const labelStyle: React.CSSProperties = { display: 'grid', gap: 3, fontSize: 12, fontWeight: 700 }
const linkStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: 'inherit',
  textDecoration: 'underline',
}
const primaryButtonStyle: React.CSSProperties = {
  border: 0,
  borderRadius: 8,
  padding: '9px 12px',
  background: '#047857',
  color: '#fff',
  fontWeight: 800,
  cursor: 'pointer',
}
const secondaryButtonStyle: React.CSSProperties = {
  border: '1px solid var(--theme-elevation-200)',
  borderRadius: 8,
  padding: '9px 12px',
  background: 'var(--theme-bg)',
  color: 'var(--theme-text)',
  fontWeight: 700,
  cursor: 'pointer',
}
const noticeStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 9,
  border: '1px solid var(--theme-elevation-200)',
  background: 'transparent',
  color: 'inherit',
  fontSize: 13,
  lineHeight: 1.45,
}
