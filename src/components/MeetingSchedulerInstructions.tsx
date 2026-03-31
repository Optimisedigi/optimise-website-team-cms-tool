'use client'

import { useState } from 'react'

export default function MeetingSchedulerInstructions() {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      style={{
        margin: '0 0 20px',
        padding: '16px 20px',
        background: 'var(--theme-elevation-50)',
        borderRadius: 6,
        fontSize: 13,
        lineHeight: 1.6,
        color: 'var(--theme-elevation-600)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <span style={{ fontWeight: 600, color: 'var(--theme-text)' }}>
          How to schedule a meeting
        </span>
        <span style={{ fontSize: 12, color: 'var(--theme-elevation-400)' }}>
          {expanded ? 'Hide' : 'Show steps'}
        </span>
      </div>
      {expanded && (
        <ol style={{ margin: '12px 0 0', paddingLeft: 20 }}>
          <li style={{ marginBottom: 8 }}>
            <strong>Connect Google Calendar</strong> (one-time setup): Go to{' '}
            <a href="/admin/globals/calendar-auth" style={{ color: 'var(--theme-elevation-600)', textDecoration: 'underline' }}>
              Settings &gt; Google Calendar Auth
            </a>{' '}
            and connect your Google account.
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Create a new Meeting Scheduler</strong>: Fill in the meeting title, select the client,
            choose a duration, and set the date range you want to check availability for.
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Add attendees</strong> in the Attendees tab: Enter the name and email of each person
            who needs to attend.
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Generate Available Slots</strong>: Go to the Availability &amp; Result tab and click
            the button. This checks your Google Calendar and finds open time slots.
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Send Scheduling Invites</strong>: Go to the Actions tab and click Send. Each attendee
            gets an email with a unique link to pick their available times.
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Attendees pick times</strong>: They select which days work, then choose preferred
            times. One page, one click to confirm.
          </li>
          <li>
            <strong>Auto-booked</strong>: Once everyone responds, the system finds a common time and
            creates a Google Calendar event with all attendees. Everyone gets a confirmation email.
          </li>
        </ol>
      )}
    </div>
  )
}
