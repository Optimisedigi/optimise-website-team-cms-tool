'use client'

import { useState } from 'react'

export default function MeetingSchedulerInstructions() {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      style={{
        marginBottom: 16,
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        overflow: 'hidden',
        background: '#f9fafb',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 600,
          color: '#374151',
        }}
      >
        <span>{'\u25B6'}{expanded ? '' : ''} How This Works (Team Guide)</span>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>{expanded ? 'Hide' : 'Show'}</span>
      </button>
      {expanded && (
        <div style={{ padding: '0 14px 14px', fontSize: 13, lineHeight: 1.6, color: '#4b5563' }}>
          <p style={{ margin: '0 0 10px' }}>
            Meeting Schedulers find a common time that works for everyone. The system checks your Google Calendar for free/busy times, sends each attendee a link to pick their available slots, and auto-books when everyone has responded.
          </p>

          <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#1f2937' }}>Step-by-Step</h4>
          <ol style={{ margin: '0 0 14px', paddingLeft: 20 }}>
            <li style={{ marginBottom: 6 }}>
              <strong>Connect Google Calendar</strong> (one-time setup) — Go to{' '}
              <a href="/admin/globals/calendar-auth" style={{ color: '#2563eb', textDecoration: 'underline' }}>
                Settings &gt; Google Calendar Auth
              </a>{' '}
              and connect your Google account.
            </li>
            <li style={{ marginBottom: 6 }}>
              <strong>Fill in the Setup tab</strong> — Enter the meeting title, select the client, choose a duration, and set the date range to check availability for.
            </li>
            <li style={{ marginBottom: 6 }}>
              <strong>Add attendees</strong> — Go to the Attendees tab and type names and emails in the table. Press <strong>Tab</strong> or <strong>Enter</strong> from the email field to add another row.
            </li>
            <li style={{ marginBottom: 6 }}>
              <strong>Generate available slots</strong> — Go to the Availability &amp; Result tab and click the button. This checks your Google Calendar and finds open time slots.
            </li>
            <li style={{ marginBottom: 6 }}>
              <strong>Send scheduling invites</strong> — Go to the Actions tab and click Send. Each attendee gets an email with a unique link to pick their available times.
            </li>
            <li style={{ marginBottom: 6 }}>
              <strong>Attendees pick times</strong> — They select which days work, then choose preferred times. One page, one click to confirm.
            </li>
            <li>
              <strong>Auto-booked</strong> — Once everyone responds, the system finds a common time and creates a Google Calendar event with all attendees. Everyone gets a confirmation email.
            </li>
          </ol>

          <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#1f2937' }}>Automated vs Manual</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600 }}>Action</th>
                <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600 }}>How</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '4px 8px' }}>Creating a meeting scheduler</td>
                <td style={{ padding: '4px 8px' }}><strong>Manual</strong> — you create it and fill in the details</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '4px 8px' }}>Checking calendar availability</td>
                <td style={{ padding: '4px 8px' }}><strong>Automated</strong> — queries Google Calendar free/busy API</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '4px 8px' }}>Sending invite emails</td>
                <td style={{ padding: '4px 8px' }}><strong>Automated</strong> — one click sends all invites</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '4px 8px' }}>Attendees picking times</td>
                <td style={{ padding: '4px 8px' }}><strong>Self-service</strong> — attendees use their unique link</td>
              </tr>
              <tr>
                <td style={{ padding: '4px 8px' }}>Booking the meeting</td>
                <td style={{ padding: '4px 8px' }}><strong>Automated</strong> — auto-books when all respond, creates Google Calendar event</td>
              </tr>
            </tbody>
          </table>

          <div style={{ fontSize: 11, color: '#6b7280', padding: '8px 10px', background: '#f0f9ff', borderRadius: 4, border: '1px solid #e0f2fe' }}>
            <strong>💡 Tip:</strong> Business hours default to 9am–5pm Sydney time. Adjust these per meeting if the client is in a different timezone.
          </div>
        </div>
      )}
    </div>
  )
}
