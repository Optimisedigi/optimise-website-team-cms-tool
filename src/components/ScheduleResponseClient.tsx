'use client'

import { useState, useEffect, useMemo } from 'react'

interface MeetingData {
  title: string
  meetingTopic?: string
  durationMinutes: string
  timezone: string
  generatedSlots: string[]
  attendeeName: string
  responded: boolean
  selectedSlots: string[]
  status: string
}

interface SlotsByDay {
  dateKey: string
  label: string
  slots: { iso: string; timeLabel: string }[]
}

function groupSlotsByDay(slots: string[], timezone: string): SlotsByDay[] {
  const groups: Record<string, { iso: string; timeLabel: string }[]> = {}
  const dateLabels: Record<string, string> = {}

  for (const iso of slots) {
    const d = new Date(iso)
    // Skip past slots
    if (d <= new Date()) continue

    const dateKey = d.toLocaleDateString('en-AU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: timezone,
    })
    const label = d.toLocaleDateString('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: timezone,
    })
    const timeLabel = d.toLocaleTimeString('en-AU', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone,
    })

    if (!groups[dateKey]) {
      groups[dateKey] = []
      dateLabels[dateKey] = label
    }
    groups[dateKey].push({ iso, timeLabel })
  }

  return Object.keys(groups)
    .sort()
    .map((dateKey) => ({
      dateKey,
      label: dateLabels[dateKey],
      slots: groups[dateKey].sort(
        (a, b) => new Date(a.iso).getTime() - new Date(b.iso).getTime()
      ),
    }))
}

export default function ScheduleResponseClient({ token }: { token: string }) {
  const [data, setData] = useState<MeetingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set())
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitResult, setSubmitResult] = useState<{
    confirmed?: boolean
    matchedSlot?: string
  } | null>(null)

  useEffect(() => {
    fetch(`/api/meeting-schedulers/respond/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error('Not found')
        return r.json()
      })
      .then((d: MeetingData) => {
        setData(d)
        if (d.responded) {
          setSubmitted(true)
          setSelectedSlots(new Set(d.selectedSlots))
        }
      })
      .catch(() => setError('This scheduling link is not valid or has expired.'))
      .finally(() => setLoading(false))
  }, [token])

  const dayGroups = useMemo(() => {
    if (!data) return []
    return groupSlotsByDay(data.generatedSlots, data.timezone)
  }, [data])

  const toggleDay = (dateKey: string) => {
    setSelectedDays((prev) => {
      const next = new Set(prev)
      if (next.has(dateKey)) {
        next.delete(dateKey)
        // Remove slots for this day
        const group = dayGroups.find((g) => g.dateKey === dateKey)
        if (group) {
          setSelectedSlots((prevSlots) => {
            const nextSlots = new Set(prevSlots)
            group.slots.forEach((s) => nextSlots.delete(s.iso))
            return nextSlots
          })
        }
      } else {
        next.add(dateKey)
      }
      return next
    })
  }

  const toggleSlot = (iso: string) => {
    setSelectedSlots((prev) => {
      const next = new Set(prev)
      if (next.has(iso)) {
        next.delete(iso)
      } else {
        next.add(iso)
      }
      return next
    })
  }

  const handleSubmit = async () => {
    if (selectedSlots.size === 0) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/meeting-schedulers/respond/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedSlots: Array.from(selectedSlots) }),
      })
      const result = await res.json()
      if (res.ok) {
        setSubmitted(true)
        setSubmitResult(result)
      } else {
        setError(result.error || 'Something went wrong')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <p style={styles.loadingText}>Loading...</p>
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <p style={{ ...styles.loadingText, color: '#dc2626' }}>{error}</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  // Meeting already confirmed
  if (data.status === 'confirmed') {
    return (
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <div style={styles.header}>
            <h1 style={styles.brand}>Optimise Digital</h1>
          </div>
          <div style={styles.body}>
            <div style={styles.confirmedBanner}>
              <p style={styles.confirmedTitle}>Meeting Confirmed!</p>
              <p style={styles.confirmedText}>
                A calendar invite has been sent to all attendees.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Already submitted
  if (submitted && !submitResult?.confirmed) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <div style={styles.header}>
            <h1 style={styles.brand}>Optimise Digital</h1>
          </div>
          <div style={styles.body}>
            <div style={styles.successBanner}>
              <p style={styles.successTitle}>
                Thanks{data.attendeeName ? `, ${data.attendeeName}` : ''}!
              </p>
              <p style={styles.successText}>
                Your availability has been recorded. We will confirm the meeting time once
                everyone has responded.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Confirmed after submission
  if (submitted && submitResult?.confirmed && submitResult.matchedSlot) {
    const d = new Date(submitResult.matchedSlot)
    const dateStr = d.toLocaleDateString('en-AU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: data.timezone,
    })
    const timeStr = d.toLocaleTimeString('en-AU', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: data.timezone,
    })

    return (
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <div style={styles.header}>
            <h1 style={styles.brand}>Optimise Digital</h1>
          </div>
          <div style={styles.body}>
            <div style={styles.confirmedBanner}>
              <p style={styles.confirmedTitle}>Meeting Confirmed!</p>
              <p style={styles.confirmedSubtitle}>{data.title}</p>
              <p style={styles.confirmedText}>
                {dateStr} at {timeStr}
              </p>
              <p style={styles.confirmedMeta}>
                {data.durationMinutes} min ({data.timezone})
              </p>
              <p style={styles.confirmedText}>
                A Google Calendar invite has been sent to all attendees.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.brand}>Optimise Digital</h1>
        </div>
        <div style={styles.body}>
          <h2 style={styles.title}>{data.title}</h2>
          {data.meetingTopic && <p style={styles.topic}>{data.meetingTopic}</p>}
          <p style={styles.meta}>
            {data.durationMinutes} min meeting ({data.timezone})
          </p>

          {/* Step 1: Select days */}
          <p style={styles.stepLabel}>
            {data.attendeeName ? `Hi ${data.attendeeName}, w` : 'W'}hich days work for you?
          </p>
          <div style={styles.dayGrid}>
            {dayGroups.map((group) => (
              <button
                key={group.dateKey}
                type="button"
                onClick={() => toggleDay(group.dateKey)}
                style={{
                  ...styles.dayPill,
                  ...(selectedDays.has(group.dateKey) ? styles.dayPillActive : {}),
                }}
              >
                {group.label}
              </button>
            ))}
          </div>

          {/* Step 2: Select times for chosen days */}
          {dayGroups
            .filter((g) => selectedDays.has(g.dateKey))
            .map((group) => (
              <div key={group.dateKey} style={styles.timeSection}>
                <p style={styles.timeSectionLabel}>{group.label}</p>
                <div style={styles.timeGrid}>
                  {group.slots.map((slot) => (
                    <button
                      key={slot.iso}
                      type="button"
                      onClick={() => toggleSlot(slot.iso)}
                      style={{
                        ...styles.timeSlot,
                        ...(selectedSlots.has(slot.iso) ? styles.timeSlotActive : {}),
                      }}
                    >
                      {slot.timeLabel}
                    </button>
                  ))}
                </div>
              </div>
            ))}

          {error && <p style={styles.errorText}>{error}</p>}

          {selectedSlots.size > 0 && (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              type="button"
              style={{
                ...styles.confirmButton,
                opacity: submitting ? 0.6 : 1,
                cursor: submitting ? 'wait' : 'pointer',
              }}
            >
              {submitting
                ? 'Submitting...'
                : `Confirm ${selectedSlots.size} time${selectedSlots.size > 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    minHeight: '100vh',
    background: '#f1f5f9',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '40px 16px',
    fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
  },
  card: {
    width: '100%',
    maxWidth: 520,
    background: '#ffffff',
    borderRadius: 12,
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  header: {
    background: '#1e293b',
    padding: '20px 24px',
  },
  brand: {
    margin: 0,
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 600,
  },
  body: {
    padding: '28px 24px 32px',
  },
  title: {
    margin: '0 0 8px',
    fontSize: 20,
    fontWeight: 600,
    color: '#0f172a',
  },
  topic: {
    margin: '0 0 12px',
    fontSize: 14,
    color: '#64748b',
    lineHeight: 1.5,
  },
  meta: {
    margin: '0 0 24px',
    fontSize: 13,
    color: '#94a3b8',
  },
  stepLabel: {
    margin: '0 0 12px',
    fontSize: 15,
    fontWeight: 500,
    color: '#334155',
  },
  dayGrid: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 8,
    marginBottom: 20,
  },
  dayPill: {
    padding: '10px 16px',
    border: '2px solid #e2e8f0',
    borderRadius: 8,
    background: '#ffffff',
    color: '#475569',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  dayPillActive: {
    border: '2px solid #059669',
    background: '#f0fdf4',
    color: '#059669',
  },
  timeSection: {
    marginBottom: 16,
    padding: '16px',
    background: '#f8fafc',
    borderRadius: 8,
  },
  timeSectionLabel: {
    margin: '0 0 10px',
    fontSize: 13,
    fontWeight: 600,
    color: '#334155',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  timeGrid: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 8,
  },
  timeSlot: {
    padding: '8px 14px',
    border: '2px solid #e2e8f0',
    borderRadius: 6,
    background: '#ffffff',
    color: '#475569',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  timeSlotActive: {
    border: '2px solid #059669',
    background: '#dcfce7',
    color: '#166534',
  },
  confirmButton: {
    width: '100%',
    padding: '14px 24px',
    background: '#059669',
    color: '#ffffff',
    border: 'none',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    marginTop: 24,
    cursor: 'pointer',
  },
  loadingText: {
    textAlign: 'center' as const,
    padding: 40,
    color: '#64748b',
    fontSize: 14,
  },
  successBanner: {
    background: '#f0fdf4',
    borderRadius: 8,
    padding: '24px 20px',
    textAlign: 'center' as const,
  },
  successTitle: {
    margin: '0 0 8px',
    fontSize: 18,
    fontWeight: 600,
    color: '#166534',
  },
  successText: {
    margin: 0,
    fontSize: 14,
    color: '#15803d',
    lineHeight: 1.5,
  },
  confirmedBanner: {
    background: '#f0fdf4',
    borderRadius: 8,
    padding: '24px 20px',
    textAlign: 'center' as const,
  },
  confirmedTitle: {
    margin: '0 0 8px',
    fontSize: 20,
    fontWeight: 600,
    color: '#166534',
  },
  confirmedSubtitle: {
    margin: '0 0 8px',
    fontSize: 16,
    fontWeight: 500,
    color: '#15803d',
  },
  confirmedText: {
    margin: '0 0 4px',
    fontSize: 14,
    color: '#15803d',
  },
  confirmedMeta: {
    margin: '0 0 12px',
    fontSize: 13,
    color: '#16a34a',
  },
  errorText: {
    margin: '12px 0 0',
    fontSize: 13,
    color: '#dc2626',
  },
}
