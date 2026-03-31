'use client'

import { useEffect, useState } from 'react'

export default function ConnectCalendarButton() {
  const [connected, setConnected] = useState(false)
  const [email, setEmail] = useState('')

  useEffect(() => {
    fetch('/api/globals/calendar-auth')
      .then((r) => r.json())
      .then((data) => {
        if (data.connectedEmail) {
          setConnected(true)
          setEmail(data.connectedEmail)
        }
      })
      .catch(() => {})
  }, [])

  return (
    <div style={{ marginTop: 12 }}>
      {connected ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            background: 'var(--theme-elevation-50)',
            borderRadius: 4,
            fontSize: 13,
          }}
        >
          <span style={{ color: 'var(--theme-success-500, #22c55e)' }}>Connected</span>
          <span style={{ color: 'var(--theme-elevation-500)' }}>({email})</span>
          <a
            href="/api/calendar/connect"
            style={{
              marginLeft: 'auto',
              fontSize: 12,
              color: 'var(--theme-elevation-500)',
              textDecoration: 'underline',
            }}
          >
            Reconnect
          </a>
        </div>
      ) : (
        <a
          href="/api/calendar/connect"
          style={{
            display: 'inline-block',
            padding: '8px 16px',
            background: 'var(--theme-elevation-150)',
            color: 'var(--theme-text)',
            borderRadius: 4,
            textDecoration: 'none',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          Connect Google Calendar
        </a>
      )}
    </div>
  )
}
