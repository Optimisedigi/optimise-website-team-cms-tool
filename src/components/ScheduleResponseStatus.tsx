'use client'

import { useEffect, useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'

interface Attendee {
  name: string
  email: string
  responded: boolean
  respondedAt?: string
  emailSentAt?: string
  selectedSlots?: string[]
}

export default function ScheduleResponseStatus() {
  const { id } = useDocumentInfo()
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [status, setStatus] = useState('')
  const [matchedSlot, setMatchedSlot] = useState('')

  useEffect(() => {
    if (!id) return
    fetch(`/api/globals/meeting-schedulers/${id}`)
      .catch(() => {})
    // Use Payload's REST API to get the document
    fetch(`/api/meeting-schedulers/${id}`)
      .then((r) => r.json())
      .then((doc) => {
        setAttendees(doc.attendees || [])
        setStatus(doc.status || '')
        setMatchedSlot(doc.matchedSlot || '')
      })
      .catch(() => {})
  }, [id])

  if (!id || attendees.length === 0) return null

  const responded = attendees.filter((a) => a.responded).length
  const total = attendees.length

  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          padding: '16px 20px',
          background: 'var(--theme-elevation-50)',
          borderRadius: 6,
          fontSize: 13,
        }}
      >
        <div style={{ marginBottom: 12, fontWeight: 600, color: 'var(--theme-text)' }}>
          Response Status ({responded}/{total} responded)
        </div>
        {matchedSlot && (
          <div
            style={{
              padding: '8px 12px',
              background: 'var(--theme-success-100, #dcfce7)',
              borderRadius: 4,
              marginBottom: 12,
              color: 'var(--theme-success-500, #166534)',
              fontWeight: 500,
            }}
          >
            Confirmed: {new Date(matchedSlot).toLocaleString('en-AU', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            })}
          </div>
        )}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--theme-elevation-150)' }}>
              <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--theme-elevation-500)' }}>Name</th>
              <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--theme-elevation-500)' }}>Email</th>
              <th style={{ textAlign: 'center', padding: '4px 8px', color: 'var(--theme-elevation-500)' }}>Status</th>
              <th style={{ textAlign: 'center', padding: '4px 8px', color: 'var(--theme-elevation-500)' }}>Slots</th>
            </tr>
          </thead>
          <tbody>
            {attendees.map((a, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--theme-elevation-100)' }}>
                <td style={{ padding: '6px 8px' }}>{a.name}</td>
                <td style={{ padding: '6px 8px', color: 'var(--theme-elevation-500)' }}>{a.email}</td>
                <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                  {a.responded ? (
                    <span style={{ color: 'var(--theme-success-500, #22c55e)' }}>Responded</span>
                  ) : a.emailSentAt ? (
                    <span style={{ color: 'var(--theme-elevation-400)' }}>Waiting</span>
                  ) : (
                    <span style={{ color: 'var(--theme-elevation-300)' }}>Not sent</span>
                  )}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                  {a.responded ? (a.selectedSlots?.length || 0) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
