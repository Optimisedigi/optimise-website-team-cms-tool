'use client'

import {
  MEETING_DURATION_OPTIONS,
  type StagedMeetingScheduler,
} from '@/lib/agents/adminmate/meeting-scheduler-tools'

interface Props {
  staged: StagedMeetingScheduler
  creating: boolean
  onChange: (changes: Partial<StagedMeetingScheduler>) => void
  onCreate: () => void
  onDiscard: () => void
}

/**
 * Review card for a meeting scheduler AdminMate staged. Nothing is written to
 * the CMS until the admin presses Create (or says "yes, create it").
 */
export default function AdminMateMeetingSchedulerCard({
  staged,
  creating,
  onChange,
  onCreate,
  onDiscard,
}: Props): React.ReactElement {
  return (
    <section
      aria-label="New meeting scheduler review"
      style={{
        border: '1px solid #6ee7b7',
        borderRadius: 12,
        padding: 12,
        background: 'rgba(16,185,129,.08)',
        display: 'grid',
        gap: 10,
      }}
    >
      <strong>Review new meeting scheduler</strong>
      <label style={labelStyle}>
        Title
        <input
          aria-label="Meeting title"
          value={staged.title}
          onChange={(event) => onChange({ title: event.target.value })}
          style={inputStyle}
        />
      </label>
      <div style={labelStyle}>
        Client or prospect
        <span style={{ fontWeight: 400, fontSize: 13 }}>
          {staged.link
            ? `${staged.link.name} (${staged.link.kind === 'client' ? 'client' : 'prospect'})`
            : 'Not linked'}
        </span>
      </div>
      <label style={labelStyle}>
        Duration
        <select
          aria-label="Duration"
          value={staged.durationMinutes}
          onChange={(event) =>
            onChange({
              durationMinutes: event.target.value as StagedMeetingScheduler['durationMinutes'],
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
        Topic
        <textarea
          aria-label="Meeting topic"
          value={staged.meetingTopic ?? ''}
          onChange={(event) => onChange({ meetingTopic: event.target.value })}
          rows={2}
          maxLength={2000}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </label>
      <div style={labelStyle}>
        Available dates ({staged.timezone})
        <ul style={listStyle}>
          {staged.dates.map((row) => (
            <li key={row.date}>
              {row.date}: {row.start}–{row.end}
              {row.preferred ? ` (prefer ${row.preferred})` : ''}
            </li>
          ))}
        </ul>
      </div>
      <div style={labelStyle}>
        Attendees
        {staged.attendees.length === 0 ? (
          <span style={{ fontWeight: 400, fontSize: 13 }}>None yet — add them in the CMS.</span>
        ) : (
          <ul style={listStyle}>
            {staged.attendees.map((attendee) => (
              <li key={attendee.email}>
                {attendee.name} &lt;{attendee.email}&gt;
                {attendee.internalConfirmed ? ' — internal, no invite' : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div role="status" style={noticeStyle}>
        Say “yes, create it” or press Create. Then open the scheduler to generate slots and send
        invites.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={onCreate}
          disabled={creating || !staged.title.trim()}
          style={{ ...primaryButtonStyle, flex: 1 }}
        >
          {creating ? 'Creating…' : `Create ${staged.title.trim() || 'meeting scheduler'}`}
        </button>
        <button type="button" onClick={onDiscard} disabled={creating} style={secondaryButtonStyle}>
          Discard
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
const listStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  fontWeight: 400,
  fontSize: 13,
  lineHeight: 1.5,
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
  background: 'var(--theme-elevation-100)',
  fontSize: 13,
  lineHeight: 1.45,
}
