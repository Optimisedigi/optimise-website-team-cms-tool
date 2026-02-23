'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@payloadcms/ui'

/* ── Pomodoro modes ── */
type Mode = 'focus' | 'breathwork' | 'break' | 'long'

const DURATIONS: Record<Mode, number> = {
  focus: 25 * 60,
  breathwork: 5 * 60,
  break: 5 * 60,
  long: 15 * 60,
}

const MODE_LABELS: Record<Mode, string> = {
  focus: 'Focus',
  breathwork: 'Breathe',
  break: 'Break',
  long: 'Long Break',
}

/* ── Tabs ── */
type Tab = 'pomodoro' | 'tracker'

interface ClientOption {
  id: string | number
  name: string
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/* ── Breathwork phase helper ── */
type BreathPhase = 'inhale' | 'hold' | 'exhale'

function getBreathPhase(timeLeft: number, total: number): { phase: BreathPhase; secondsInPhase: number } {
  const elapsed = total - timeLeft
  // 4s inhale, 4s hold, 4s exhale = 12s cycle
  const cyclePos = elapsed % 12
  if (cyclePos < 4) return { phase: 'inhale', secondsInPhase: 4 - cyclePos }
  if (cyclePos < 8) return { phase: 'hold', secondsInPhase: 8 - cyclePos }
  return { phase: 'exhale', secondsInPhase: 12 - cyclePos }
}

const BREATH_COLORS: Record<BreathPhase, string> = {
  inhale: '#22c55e',
  hold: '#3b82f6',
  exhale: '#a855f7',
}

const BREATH_LABELS: Record<BreathPhase, string> = {
  inhale: 'Breathe In',
  hold: 'Hold',
  exhale: 'Breathe Out',
}

const PomodoroTimer = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth()

  /* ── Widget state ── */
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('pomodoro')

  /* ── Pomodoro state ── */
  const [mode, setMode] = useState<Mode>('focus')
  const [timeLeft, setTimeLeft] = useState(DURATIONS.focus)
  const [running, setRunning] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const notifiedRef = useRef(false)

  /* ── Tracker state ── */
  const [taskName, setTaskName] = useState('')
  const [tracking, setTracking] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const trackerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [saving, setSaving] = useState(false)
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null)

  /* ── Client @mention state ── */
  const [clients, setClients] = useState<ClientOption[]>([])
  const [showMentions, setShowMentions] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionIndex, setMentionIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const clearTracker = useCallback(() => {
    if (trackerRef.current) {
      clearInterval(trackerRef.current)
      trackerRef.current = null
    }
  }, [])

  /* ── Pomodoro tick ── */
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

  /* ── Pomodoro notify ── */
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

  /* ── Tracker tick ── */
  useEffect(() => {
    if (!tracking) {
      clearTracker()
      return
    }

    trackerRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1)
    }, 1000)

    return clearTracker
  }, [tracking, clearTracker])

  /* ── Fetch active clients for @mention ── */
  useEffect(() => {
    fetch('/api/clients/list')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: ClientOption[]) => setClients(data))
      .catch(() => {})
  }, [])

  /* ── Mention helpers ── */
  const filteredClients = mentionQuery
    ? clients.filter((c) => c.name.toLowerCase().includes(mentionQuery.toLowerCase()))
    : clients

  const handleTaskInput = (value: string) => {
    setTaskName(value)

    // Detect @mention trigger
    const atMatch = value.match(/@(\w*)$/)
    if (atMatch) {
      setMentionQuery(atMatch[1])
      setShowMentions(true)
      setMentionIndex(0)
    } else {
      setShowMentions(false)
    }
  }

  const insertMention = (client: ClientOption) => {
    // Replace the @query with @ClientName
    const newName = taskName.replace(/@\w*$/, `@${client.name} `)
    setTaskName(newName)
    setSelectedClient(client)
    setShowMentions(false)
    inputRef.current?.focus()
  }

  const handleMentionKeyDown = (e: React.KeyboardEvent) => {
    if (!showMentions || filteredClients.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setMentionIndex((prev) => Math.min(prev + 1, filteredClients.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setMentionIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      insertMention(filteredClients[mentionIndex])
    } else if (e.key === 'Escape') {
      setShowMentions(false)
    }
  }

  /* ── Pomodoro actions ── */
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

  /* ── Tracker actions ── */
  const startTracking = () => {
    if (!taskName.trim()) return
    setShowMentions(false)
    setElapsed(0)
    setTracking(true)
  }

  const stopTracking = async () => {
    setTracking(false)
    if (elapsed < 1) return

    setSaving(true)
    try {
      await fetch('/api/time-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskName: taskName.trim(),
          durationSeconds: elapsed,
          clientId: selectedClient?.id || null,
        }),
      })
    } catch {
      // silent fail — activity log is non-critical
    } finally {
      setSaving(false)
      setTaskName('')
      setSelectedClient(null)
      setElapsed(0)
    }
  }

  if (!user) return <>{children}</>

  /* ── Pill label ── */
  const pillLabel = tracking
    ? formatElapsed(elapsed)
    : running
      ? formatTime(timeLeft)
      : 'Pomodoro'

  const pillColor = tracking ? '#3b82f6' : '#111'

  /* ── Breath phase (for breathwork mode) ── */
  const breathPhase = mode === 'breathwork' && running
    ? getBreathPhase(timeLeft, DURATIONS.breathwork)
    : null

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
            background: pillColor,
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
            fontFamily: running || tracking
              ? '"Press Start 2P", "Courier New", monospace'
              : 'inherit',
            letterSpacing: running || tracking ? '0.5px' : undefined,
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
            width: 320,
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
            <span style={{ fontWeight: 700, fontSize: 14 }}>
              {tab === 'pomodoro' ? 'Pomodoro Timer' : 'Time Tracker'}
            </span>
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

          {/* Tab switcher */}
          <div
            style={{
              display: 'flex',
              gap: 4,
              padding: '0 18px 12px',
            }}
          >
            {([
              { key: 'pomodoro' as Tab, label: 'Pomodoro' },
              { key: 'tracker' as Tab, label: 'Tracker' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                style={{
                  flex: 1,
                  padding: '7px 0',
                  borderRadius: 8,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 700,
                  background: tab === key ? '#fff' : 'rgba(255,255,255,0.08)',
                  color: tab === key ? '#111' : 'rgba(255,255,255,0.5)',
                  transition: 'all 150ms',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── POMODORO TAB ── */}
          {tab === 'pomodoro' && (
            <>
              {/* Mode tabs */}
              <div
                style={{
                  display: 'flex',
                  gap: 3,
                  padding: '0 18px 14px',
                }}
              >
                {(['focus', 'breathwork', 'break', 'long'] as Mode[]).map((m) => (
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
                      fontSize: 11,
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

              {/* Breathwork indicator */}
              {mode === 'breathwork' && running && breathPhase && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '0 18px 8px',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '4px 14px',
                      borderRadius: 20,
                      fontSize: 13,
                      fontWeight: 700,
                      background: BREATH_COLORS[breathPhase.phase],
                      color: '#fff',
                      transition: 'background 300ms',
                    }}
                  >
                    {BREATH_LABELS[breathPhase.phase]}
                  </span>
                </div>
              )}

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
                Focus {DURATIONS.focus / 60}m &middot; Breathe {DURATIONS.breathwork / 60}m &middot; Break {DURATIONS.break / 60}m &middot; Long {DURATIONS.long / 60}m
              </div>
            </>
          )}

          {/* ── TRACKER TAB ── */}
          {tab === 'tracker' && (
            <>
              {/* Task input with @mention */}
              <div style={{ padding: '0 18px 14px', position: 'relative' }}>
                {/* Selected client tag */}
                {selectedClient && !tracking && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginBottom: 8,
                  }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '3px 8px',
                      borderRadius: 4,
                      background: 'rgba(59,130,246,0.2)',
                      color: '#3b82f6',
                      fontSize: 11,
                      fontWeight: 600,
                    }}>
                      @{selectedClient.name}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedClient(null)
                          setTaskName(taskName.replace(new RegExp(`@${selectedClient.name}\\s?`), ''))
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#3b82f6',
                          cursor: 'pointer',
                          padding: 0,
                          fontSize: 13,
                          lineHeight: 1,
                        }}
                      >
                        &times;
                      </button>
                    </span>
                  </div>
                )}
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="What are you working on? Use @ for client"
                  value={taskName}
                  onChange={(e) => handleTaskInput(e.target.value)}
                  disabled={tracking}
                  onKeyDown={(e) => {
                    if (showMentions) {
                      handleMentionKeyDown(e)
                      return
                    }
                    if (e.key === 'Enter' && !tracking) startTracking()
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: 'rgba(255,255,255,0.06)',
                    color: '#fff',
                    fontSize: 13,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />

                {/* @mention dropdown */}
                {showMentions && filteredClients.length > 0 && (
                  <div style={{
                    position: 'absolute',
                    left: 18,
                    right: 18,
                    bottom: '100%',
                    marginBottom: 4,
                    background: '#1a1a1a',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 8,
                    maxHeight: 160,
                    overflowY: 'auto',
                    zIndex: 10,
                  }}>
                    {filteredClients.slice(0, 8).map((client, i) => (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => insertMention(client)}
                        style={{
                          display: 'block',
                          width: '100%',
                          padding: '8px 12px',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 500,
                          textAlign: 'left',
                          background: i === mentionIndex ? 'rgba(59,130,246,0.2)' : 'transparent',
                          color: i === mentionIndex ? '#3b82f6' : 'rgba(255,255,255,0.7)',
                          transition: 'background 100ms',
                        }}
                      >
                        @{client.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Elapsed time */}
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
                    color: tracking ? '#3b82f6' : '#fff',
                  }}
                >
                  {formatElapsed(elapsed)}
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
                {!tracking ? (
                  <button
                    type="button"
                    onClick={startTracking}
                    disabled={!taskName.trim()}
                    style={{
                      padding: '8px 32px',
                      borderRadius: 8,
                      border: 'none',
                      cursor: taskName.trim() ? 'pointer' : 'not-allowed',
                      fontWeight: 700,
                      fontSize: 13,
                      background: taskName.trim() ? '#22c55e' : 'rgba(255,255,255,0.15)',
                      color: taskName.trim() ? '#fff' : 'rgba(255,255,255,0.3)',
                      transition: 'background 150ms',
                    }}
                  >
                    Start
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopTracking}
                    disabled={saving}
                    style={{
                      padding: '8px 32px',
                      borderRadius: 8,
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: 700,
                      fontSize: 13,
                      background: '#ef4444',
                      color: '#fff',
                      transition: 'background 150ms',
                    }}
                  >
                    {saving ? 'Saving...' : 'Stop'}
                  </button>
                )}
              </div>

              {/* Footer */}
              <div
                style={{
                  padding: '10px 18px',
                  borderTop: '1px solid rgba(255,255,255,0.1)',
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.35)',
                  textAlign: 'center',
                }}
              >
                {tracking
                  ? `Tracking: ${taskName}`
                  : 'Enter a task and press Start'}
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}

export default PomodoroTimer
