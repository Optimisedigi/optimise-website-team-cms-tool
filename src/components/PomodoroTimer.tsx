'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@payloadcms/ui'

type Mode = 'focus' | 'break' | 'long'

const DURATIONS: Record<Mode, number> = {
  focus: 25 * 60,
  break: 5 * 60,
  long: 15 * 60,
}

const MODE_LABELS: Record<Mode, string> = {
  focus: 'Focus',
  break: 'Break',
  long: 'Long Break',
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const PomodoroTimer = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('focus')
  const [timeLeft, setTimeLeft] = useState(DURATIONS.focus)
  const [running, setRunning] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const notifiedRef = useRef(false)

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  // Tick
  useEffect(() => {
    if (!running) {
      clearTimer()
      return
    }

    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setRunning(false)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return clearTimer
  }, [running, clearTimer])

  // Notify on complete
  useEffect(() => {
    if (timeLeft === 0 && !notifiedRef.current) {
      notifiedRef.current = true
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Pomodoro Timer', {
          body: `${MODE_LABELS[mode]} session complete!`,
          icon: '/optimise-digital-favicon.png',
        })
      }
    }
    if (timeLeft > 0) {
      notifiedRef.current = false
    }
  }, [timeLeft, mode])

  const switchMode = (newMode: Mode) => {
    setMode(newMode)
    setTimeLeft(DURATIONS[newMode])
    setRunning(false)
  }

  const reset = () => {
    setTimeLeft(DURATIONS[mode])
    setRunning(false)
  }

  const extend = () => {
    setTimeLeft((prev) => prev + 5 * 60)
  }

  const requestNotificationPermission = () => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }

  if (!user) return <>{children}</>

  const pillLabel = running ? formatTime(timeLeft) : 'Pomodoro'

  return (
    <>
      {children}

      {/* Collapsed pill */}
      {!open && (
        <button
          type="button"
          onClick={() => {
            setOpen(true)
            requestNotificationPermission()
          }}
          style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            zIndex: 99999,
            background: '#111',
            color: '#fff',
            border: 'none',
            borderRadius: 24,
            padding: '10px 18px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            fontFamily: running
              ? '"Press Start 2P", "Courier New", monospace'
              : 'inherit',
            letterSpacing: running ? '0.5px' : undefined,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          {pillLabel}
        </button>
      )}

      {/* Expanded panel */}
      {open && (
        <div
          style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            zIndex: 99999,
            background: '#111',
            color: '#fff',
            borderRadius: 16,
            width: 300,
            boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 18px 10px',
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 14 }}>Pomodoro Timer</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.5)',
                cursor: 'pointer',
                fontSize: 18,
                padding: 0,
                lineHeight: 1,
              }}
            >
              &times;
            </button>
          </div>

          {/* Mode tabs */}
          <div
            style={{
              display: 'flex',
              gap: 4,
              padding: '0 18px 14px',
            }}
          >
            {(['focus', 'break', 'long'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                style={{
                  flex: 1,
                  padding: '6px 0',
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  background: mode === m ? '#fff' : 'rgba(255,255,255,0.1)',
                  color: mode === m ? '#111' : 'rgba(255,255,255,0.6)',
                  transition: 'all 150ms',
                }}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>

          {/* Countdown */}
          <div
            style={{
              textAlign: 'center',
              padding: '10px 18px 20px',
            }}
          >
            <div
              style={{
                fontFamily: '"Press Start 2P", "Courier New", monospace',
                fontSize: 40,
                fontWeight: 700,
                letterSpacing: 2,
                lineHeight: 1.2,
              }}
            >
              {formatTime(timeLeft)}
            </div>
          </div>

          {/* Controls */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              padding: '0 18px 18px',
              justifyContent: 'center',
            }}
          >
            <button
              type="button"
              onClick={() => setRunning(!running)}
              style={{
                padding: '8px 24px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 13,
                background: running ? '#ef4444' : '#22c55e',
                color: '#fff',
                transition: 'background 150ms',
              }}
            >
              {running ? 'Pause' : timeLeft === 0 ? 'Start' : timeLeft < DURATIONS[mode] ? 'Resume' : 'Start'}
            </button>
            <button
              type="button"
              onClick={reset}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.2)',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13,
                background: 'transparent',
                color: 'rgba(255,255,255,0.7)',
              }}
            >
              Reset
            </button>
            <button
              type="button"
              onClick={extend}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.2)',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13,
                background: 'transparent',
                color: 'rgba(255,255,255,0.7)',
              }}
            >
              +5m
            </button>
          </div>

          {/* Settings footer */}
          <div
            style={{
              padding: '10px 18px',
              borderTop: '1px solid rgba(255,255,255,0.1)',
              fontSize: 11,
              color: 'rgba(255,255,255,0.35)',
              textAlign: 'center',
            }}
          >
            Focus {DURATIONS.focus / 60}m &middot; Break {DURATIONS.break / 60}m &middot; Long {DURATIONS.long / 60}m
          </div>
        </div>
      )}
    </>
  )
}

export default PomodoroTimer
