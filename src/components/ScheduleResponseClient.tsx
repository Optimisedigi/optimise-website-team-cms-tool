'use client'

import { useState, useEffect, useMemo } from 'react'
import AvailabilityGrid, { GridLegend } from './AvailabilityGrid'
import {
  CELL_MINUTES,
  cellKey,
  cellsFromSlots,
  clientGridFromSlots,
  slotsFromSelectedCells,
  type CellKey,
} from '@/lib/meeting-availability'

/** Days shown side by side before paging. */
const DAYS_PER_PAGE_DESKTOP = 5
const DAYS_PER_PAGE_MOBILE = 3

interface MeetingData {
  title: string
  meetingTopic?: string
  durationMinutes: string
  timezone: string
  generatedSlots: string[]
  attendeeName: string
  attendeeEmail?: string
  attendeeEmails?: string[]
  responded: boolean
  response?: 'accepted' | 'maybe' | 'declined' | null
  selectedSlots: string[]
  status: string
}

function RocketSplash() {
  return (
    <>
      <style>{`
        @keyframes od-rocket-loop {
          0%, 8% { transform: translateX(-50%) translateY(0); opacity: 0; }
          15% { opacity: 1; }
          18% { transform: translateX(-50%) translateY(2px); opacity: 1; }
          32% { transform: translateX(-50%) translateY(-6px); opacity: 1; }
          78% { transform: translateX(-50%) translateY(-130px); opacity: 1; }
          92%, 100% { transform: translateX(-50%) translateY(-220px); opacity: 0; }
        }
        @keyframes od-flame-loop {
          0%, 25% { opacity: 0; }
          32% { opacity: 0.6; }
          78% { opacity: 1; }
          92%, 100% { opacity: 0; }
        }
        @keyframes od-flame-flicker {
          from { transform: scaleY(1); }
          to { transform: scaleY(1.15); }
        }
        .od-splash { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 380px; gap: 24px; }
        .od-splash__scene { position: relative; width: 80px; height: 140px; }
        .od-splash__rocket { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); animation: od-rocket-loop 2.6s cubic-bezier(0.4,0,0.2,1) infinite; z-index: 2; }
        .od-splash__rocket img { display: block; width: 48px; height: 48px; object-fit: contain; transform: rotate(-30deg); }
        .od-splash__flames { position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); width: 20px; height: 60px; animation: od-rocket-loop 2.6s cubic-bezier(0.4,0,0.2,1) infinite; z-index: 1; }
        .od-splash__flame { position: absolute; bottom: 0; border-radius: 50% 50% 40% 40%; }
        .od-splash__flame--1 { width: 10px; height: 28px; left: 5px; background: linear-gradient(to top, transparent, #f59e0b, #ef4444); opacity: 0; animation: od-flame-loop 2.6s cubic-bezier(0.4,0,0.2,1) infinite, od-flame-flicker 0.15s ease-in-out infinite alternate; }
        .od-splash__flame--2 { width: 6px; height: 18px; left: 2px; background: linear-gradient(to top, transparent, #fbbf24); opacity: 0; animation: od-flame-loop 2.6s cubic-bezier(0.4,0,0.2,1) 0.08s infinite, od-flame-flicker 0.2s ease-in-out infinite alternate; }
        .od-splash__flame--3 { width: 6px; height: 20px; left: 10px; background: linear-gradient(to top, transparent, #fb923c); opacity: 0; animation: od-flame-loop 2.6s cubic-bezier(0.4,0,0.2,1) 0.04s infinite, od-flame-flicker 0.18s ease-in-out infinite alternate; }
        .od-splash__text { font-size: 13px; font-weight: 500; color: #94a3b8; letter-spacing: 0.5px; }
      `}</style>
      <div className="od-splash">
        <div className="od-splash__scene">
          <div className="od-splash__flames">
            <div className="od-splash__flame od-splash__flame--1" />
            <div className="od-splash__flame od-splash__flame--2" />
            <div className="od-splash__flame od-splash__flame--3" />
          </div>
          <div className="od-splash__rocket">
            <img src="/optimise-rocket-logo-black.png" alt="" width={48} height={48} />
          </div>
        </div>
        <div className="od-splash__text">Loading</div>
      </div>
    </>
  )
}

function durationOf(data: Pick<MeetingData, 'durationMinutes'>): number {
  return Number.parseInt(data.durationMinutes, 10) || 30
}

function timeZoneLabel(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    timeZoneName: 'short',
  }).formatToParts(new Date())
  return parts.find((part) => part.type === 'timeZoneName')?.value || timezone
}

type MeetingTopicBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }

function renderFormattedMeetingTopic(text: string) {
  const blocks: MeetingTopicBlock[] = []
  const lines = text.split(/\r?\n/)
  let listItems: string[] = []

  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push({ type: 'list', items: listItems })
      listItems = []
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      flushList()
      continue
    }

    const bulletMatch = trimmed.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/)
    if (bulletMatch) {
      listItems.push(bulletMatch[1])
      continue
    }

    flushList()
    blocks.push({ type: 'paragraph', text: trimmed })
  }
  flushList()

  return blocks.map((block, index) => {
    if (block.type === 'list') {
      return (
        <ul key={`list-${index}`} style={styles.topicList}>
          {block.items.map((item, itemIndex) => (
            <li key={`${item}-${itemIndex}`}>{item}</li>
          ))}
        </ul>
      )
    }

    return <p key={`paragraph-${index}`} style={styles.topicParagraph}>{block.text}</p>
  })
}

export default function ScheduleResponseClient({
  token,
  previewData,
}: {
  token: string
  previewData?: MeetingData
}) {
  const [data, setData] = useState<MeetingData | null>(previewData || null)
  const [loading, setLoading] = useState(!previewData)
  const [error, setError] = useState<string | null>(null)
  // The attendee picks 30-minute cells; the meeting times they cover in full
  // are what gets submitted.
  const [selectedCells, setSelectedCells] = useState<Set<CellKey>>(new Set())
  const [dayPage, setDayPage] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submittedResponse, setSubmittedResponse] = useState<'accepted' | 'maybe' | 'declined' | null>(null)
  const [submitResult, setSubmitResult] = useState<{
    confirmed?: boolean
    matchedSlot?: string
  } | null>(null)
  const [additionalAttendeeName, setAdditionalAttendeeName] = useState('')
  const [additionalAttendeeEmail, setAdditionalAttendeeEmail] = useState('')
  const [showAdditionalAttendee, setShowAdditionalAttendee] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const updateIsMobile = () => setIsMobile(window.innerWidth < 760)
    updateIsMobile()
    window.addEventListener('resize', updateIsMobile)
    return () => window.removeEventListener('resize', updateIsMobile)
  }, [])

  useEffect(() => {
    if (previewData) {
      setLoading(false)
      if (previewData.responded) {
        setSubmitted(true)
        setSubmittedResponse(previewData.response || 'accepted')
        setSelectedCells(
          cellsFromSlots(previewData.selectedSlots, durationOf(previewData), previewData.timezone),
        )
      }
      return
    }

    fetch(`/api/meeting-schedulers/respond/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error('Not found')
        return r.json()
      })
      .then((d: MeetingData) => {
        setData(d)
        if (d.responded) {
          setSubmitted(true)
          setSubmittedResponse(d.response || 'accepted')
          setSelectedCells(cellsFromSlots(d.selectedSlots, durationOf(d), d.timezone))
        }
      })
      .catch(() => setError('This scheduling link is not valid or has expired.'))
      .finally(() => setLoading(false))
  }, [token, previewData])

  // Mounted-time clock so past times drop off; fixed per render pass.
  const [now] = useState(() => new Date())
  const gridDays = useMemo(() => {
    if (!data) return []
    return clientGridFromSlots(data.generatedSlots, durationOf(data), data.timezone, now)
  }, [data, now])

  // Only the hours that hold free times, e.g. 9:00 am to 5:00 pm.
  const gridRows = useMemo(() => {
    const minutes = gridDays.flatMap((day) => [...day.open])
    if (minutes.length === 0) return []
    const rows: number[] = []
    for (let m = Math.min(...minutes); m <= Math.max(...minutes); m += CELL_MINUTES) rows.push(m)
    return rows
  }, [gridDays])

  const selectedSlots = useMemo(
    () =>
      data
        ? new Set(
            slotsFromSelectedCells(selectedCells, data.generatedSlots, durationOf(data), data.timezone),
          )
        : new Set<string>(),
    [data, selectedCells],
  )

  const allOpenCells = useMemo(
    () => gridDays.flatMap((day) => [...day.open].map((minutes) => cellKey(day.date, minutes))),
    [gridDays],
  )
  const everythingSelected =
    allOpenCells.length > 0 && allOpenCells.every((key) => selectedCells.has(key))

  const daysPerPage = isMobile ? DAYS_PER_PAGE_MOBILE : DAYS_PER_PAGE_DESKTOP
  const pageCount = Math.max(1, Math.ceil(gridDays.length / daysPerPage))
  const page = Math.min(dayPage, pageCount - 1)
  const pageDays = gridDays.slice(page * daysPerPage, page * daysPerPage + daysPerPage)
  const openByDate = useMemo(
    () => new Map(gridDays.map((day) => [day.date, day.open])),
    [gridDays],
  )

  const handleSubmit = async (response: 'accepted' | 'maybe' | 'declined') => {
    if (response !== 'declined' && selectedSlots.size === 0) return
    setSubmitting(true)
    setError(null)
    try {
      const additionalAttendee = {
        name: additionalAttendeeName.trim(),
        email: additionalAttendeeEmail.trim(),
      }
      const res = await fetch(`/api/meeting-schedulers/respond/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response,
          selectedSlots: response === 'declined' ? [] : Array.from(selectedSlots),
          additionalAttendee:
            response !== 'declined' && (additionalAttendee.name || additionalAttendee.email)
              ? additionalAttendee
              : undefined,
        }),
      })
      const result = await res.json()
      if (res.ok) {
        setSubmitted(true)
        setSubmittedResponse(response)
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
        <div style={styles.siteHeader}>
          <p style={styles.logoEyebrow}>Meeting scheduler by</p>
          <img
            src="/Optimise-Digital-Logo-rocket-animation (larger file).gif"
            alt="Optimise Digital"
            style={styles.logo}
          />
        </div>
        <div style={styles.card}>
          <RocketSplash />
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
        <div style={styles.siteHeader}>
          <p style={styles.logoEyebrow}>Meeting scheduler by</p>
          <img
            src="/Optimise-Digital-Logo-rocket-animation (larger file).gif"
            alt="Optimise Digital"
            style={styles.logo}
          />
        </div>
        <div style={styles.card}>
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

  // Already submitted (accepted / maybe / declined)
  if (submitted && !submitResult?.confirmed) {
    const declined = submittedResponse === 'declined'
    const maybe = submittedResponse === 'maybe'
    return (
      <div style={styles.wrapper}>
        <div style={styles.siteHeader}>
          <p style={styles.logoEyebrow}>Meeting scheduler by</p>
          <img
            src="/Optimise-Digital-Logo-rocket-animation (larger file).gif"
            alt="Optimise Digital"
            style={styles.logo}
          />
        </div>
        <div style={styles.card}>
          <div style={styles.body}>
            <div style={styles.successBanner}>
              <p style={styles.successTitle}>
                Thanks{data.attendeeName ? `, ${data.attendeeName}` : ''}!
              </p>
              <p style={styles.successText}>
                {declined
                  ? "Thanks for letting us know you can't make it. We won't include you in this meeting."
                  : maybe
                    ? "Your tentative availability has been recorded. We'll confirm a time once everyone has responded."
                    : 'Your availability has been recorded. We will confirm the meeting time once everyone has responded.'}
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
        <div style={styles.siteHeader}>
          <p style={styles.logoEyebrow}>Meeting scheduler by</p>
          <img
            src="/Optimise-Digital-Logo-rocket-animation (larger file).gif"
            alt="Optimise Digital"
            style={styles.logo}
          />
        </div>
        <div style={styles.card}>
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

  const meetingDetails = (
    <section style={{ ...styles.meetingPanel, ...(isMobile ? styles.mobileMeetingPanel : {}) }}>
      <div style={styles.titleRow}>
        <p style={styles.kicker}>Meeting details</p>
        {data.attendeeEmail && (
          <span style={styles.attendeeBadge}>
            Private link for <strong>{data.attendeeEmail}</strong>
          </span>
        )}
      </div>
      <h2 style={styles.title}>{data.title}</h2>
      <div style={styles.metaChips}>
        <span style={styles.metaChip}>{data.durationMinutes}min meeting</span>
        <span style={styles.metaChip}>Calendar invite sent after match</span>
      </div>
      {data.meetingTopic && (
        <div style={styles.topic}>
          <p style={styles.topicHeading}>What's covered</p>
          <div>{renderFormattedMeetingTopic(data.meetingTopic)}</div>
        </div>
      )}
      {data.attendeeEmails && data.attendeeEmails.length > 0 && (
        <div style={styles.attendeesLine}>
          <strong>Attendees:</strong>
          <div style={styles.attendeesList}>
            {data.attendeeEmails.map((email) => (
              <span key={email}>{email}</span>
            ))}
          </div>
        </div>
      )}
    </section>
  )

  const availabilitySelector = (
    <section style={{ ...styles.availabilityPanel, ...(isMobile ? styles.mobileAvailabilityPanel : {}) }}>
      <div style={styles.availabilityHeader}>
        <div style={styles.availabilityHeadingBlock}>
          <p style={styles.kicker}>Availability</p>
          <h3 style={styles.availabilityTitle}>Select your free calendar times</h3>
        </div>
        <span style={styles.selectionCount}>
          {selectedSlots.size} {selectedSlots.size === 1 ? 'time' : 'times'} selected
        </span>
      </div>
      <p style={styles.instructions}>
        Once everyone has responded, we'll match availability and send a calendar invite for the first slot that works for all attendees.
      </p>

      <div style={styles.declinePrompt}>
        <span style={styles.declinePromptText}>
          Can't make this meeting? No need to pick a time.
        </span>
        <button
          type="button"
          onClick={() => handleSubmit('declined')}
          disabled={submitting}
          style={{
            ...styles.declineButton,
            opacity: submitting ? 0.6 : 1,
            cursor: submitting ? 'wait' : 'pointer',
          }}
        >
          Decline
        </button>
      </div>

      <div style={{ ...styles.timeSection, ...(isMobile ? styles.mobileTimeSection : {}) }}>
        <div style={styles.timeSectionHeader}>
          <div style={styles.timeSectionTitleBlock}>
            <p style={styles.timeSectionMeta}>
              {isMobile ? 'Tap' : 'Click or drag across'} the free times that suit you.{' '}
              {data.durationMinutes} min meeting ({timeZoneLabel(data.timezone)}).
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSelectedCells(everythingSelected ? new Set() : new Set(allOpenCells))}
            style={styles.selectDayButton}
          >
            {everythingSelected ? 'Clear all' : 'Select all'}
          </button>
        </div>

        {pageCount > 1 && (
          <div style={styles.pageNav}>
            <button
              type="button"
              aria-label="Earlier days"
              disabled={page === 0}
              onClick={() => setDayPage(page - 1)}
              style={{ ...styles.pageButton, opacity: page === 0 ? 0.4 : 1 }}
            >
              ←
            </button>
            <span style={styles.pageLabel}>
              Days {page * daysPerPage + 1}–{Math.min((page + 1) * daysPerPage, gridDays.length)} of{' '}
              {gridDays.length}
            </span>
            <button
              type="button"
              aria-label="Later days"
              disabled={page >= pageCount - 1}
              onClick={() => setDayPage(page + 1)}
              style={{ ...styles.pageButton, opacity: page >= pageCount - 1 ? 0.4 : 1 }}
            >
              →
            </button>
          </div>
        )}

        <AvailabilityGrid
          ariaLabel="Free times to choose from"
          days={pageDays.map((day) => ({ date: day.date }))}
          isLocked={(date, minutes) => (openByDate.get(date)?.has(minutes) ? null : 'unavailable')}
          onChange={setSelectedCells}
          rows={gridRows}
          selected={selectedCells}
          selectedLabel="selected"
          unselectedLabel="free"
          variant="client"
        />
        <GridLegend
          variant="client"
          items={[
            { label: 'Free', kind: 'free' },
            { label: 'Selected', kind: 'selected' },
            { label: 'Unavailable', kind: 'locked' },
          ]}
        />
        {selectedCells.size > 0 && selectedSlots.size === 0 && (
          <p style={styles.timeSectionMeta} role="status">
            Select at least {data.durationMinutes} minutes in a row so the meeting fits.
          </p>
        )}
      </div>
    </section>
  )

  return (
    <div style={{ ...styles.wrapper, ...(isMobile ? styles.mobileWrapper : {}) }}>
      <div style={styles.siteHeader}>
        <p style={styles.logoEyebrow}>Meeting scheduler by</p>
        <img
          src="/Optimise-Digital-Logo-rocket-animation (larger file).gif"
          alt="Optimise Digital"
          style={styles.logo}
        />
      </div>
      <div style={{ ...styles.card, ...(isMobile ? styles.mobileCard : {}) }}>
        <div style={{ ...styles.body, ...(isMobile ? styles.mobileBody : {}) }}>
          {isMobile ? availabilitySelector : (
            <div style={styles.contentGrid}>
              {meetingDetails}
              {availabilitySelector}
            </div>
          )}

          {error && <p style={styles.errorText}>{error}</p>}

          {selectedSlots.size > 0 && (
            <div style={styles.additionalAttendeeBox}>
              <button
                type="button"
                onClick={() => setShowAdditionalAttendee((open) => !open)}
                style={styles.additionalAttendeeToggle}
              >
                <span style={styles.additionalAttendeePlus}>+</span>
                Should anyone else be in this meeting?
              </button>
              {showAdditionalAttendee && (
                <>
                  <p style={styles.additionalAttendeeNote}>Add their details and we'll send them this invite too.</p>
                  <div style={styles.additionalAttendeeGrid}>
                    <input
                      type="text"
                      value={additionalAttendeeName}
                      onChange={(event) => setAdditionalAttendeeName(event.target.value)}
                      placeholder="First name"
                      style={styles.additionalAttendeeInput}
                    />
                    <input
                      type="email"
                      value={additionalAttendeeEmail}
                      onChange={(event) => setAdditionalAttendeeEmail(event.target.value)}
                      placeholder="Email"
                      style={styles.additionalAttendeeInput}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {selectedSlots.size > 0 && (
            <div style={styles.submitRow}>
              <button
                onClick={() => handleSubmit('accepted')}
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
                  : `Submit availability (${selectedSlots.size} selected)`}
              </button>
              <button
                onClick={() => handleSubmit('maybe')}
                disabled={submitting}
                type="button"
                style={{
                  ...styles.maybeButton,
                  opacity: submitting ? 0.6 : 1,
                  cursor: submitting ? 'wait' : 'pointer',
                }}
              >
                Set as maybe
              </button>
            </div>
          )}

          {isMobile && meetingDetails}
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #ffffff 0%, #f8f9fb 56%, #eef4fb 100%)',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '20px 16px 48px',
    fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
  },
  siteHeader: {
    width: '100%',
    maxWidth: 1180,
    padding: '0 4px 16px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  logoEyebrow: {
    margin: 0,
    fontSize: 13,
    fontWeight: 700,
    color: '#476788',
    letterSpacing: '0.08em',
    transform: 'translateX(-4px)',
  },
  card: {
    width: '100%',
    maxWidth: 1180,
    background: '#ffffff',
    borderRadius: 24,
    overflow: 'hidden',
    border: '1px solid #e7edf6',
    boxShadow: '0 4px 5px rgba(71,103,136,0.04), 0 8px 15px rgba(71,103,136,0.03), 0 30px 50px rgba(71,103,136,0.08)',
  },
  logo: {
    height: 22,
    width: 'auto',
    display: 'block',
  },
  body: {
    padding: '28px',
  },
  contentGrid: {
    display: 'grid',
    // Meeting details 40%, availability 60%.
    gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 3fr)',
    gap: 24,
    alignItems: 'start',
  },
  meetingPanel: {
    minHeight: '100%',
    padding: '28px',
    background: '#f8f9fb',
    border: '1px solid #e7edf6',
    borderRadius: 18,
  },
  titleRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap' as const,
    margin: '0 0 14px',
  },
  kicker: {
    margin: 0,
    fontSize: 11,
    fontWeight: 800,
    color: '#006bff',
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
  },
  title: {
    margin: 0,
    fontSize: 26,
    lineHeight: 1.16,
    letterSpacing: '-0.03em',
    fontWeight: 750,
    color: '#0b3558',
  },
  metaChips: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 8,
    margin: '18px 0 22px',
  },
  metaChip: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 10px',
    borderRadius: 999,
    background: '#e7edf6',
    color: '#004eba',
    fontSize: 12,
    fontWeight: 700,
  },
  topic: {
    margin: '0 0 12px',
    fontSize: 15,
    color: '#476788',
    lineHeight: 1.65,
  },
  topicHeading: {
    margin: '0 0 8px',
    fontSize: 15,
    fontWeight: 800,
    color: '#0b3558',
  },
  topicParagraph: {
    margin: '0 0 8px',
    fontSize: 15,
    color: '#476788',
    lineHeight: 1.6,
  },
  topicList: {
    margin: '0 0 10px 18px',
    padding: 0,
    fontSize: 15,
    color: '#476788',
    lineHeight: 1.6,
  },
  meta: {
    margin: '0 0 8px',
    fontSize: 12,
    color: '#94a3b8',
  },
  attendeesLine: {
    margin: '18px 0 0',
    fontSize: 14,
    color: '#476788',
    lineHeight: 1.55,
  },
  attendeesList: {
    display: 'grid',
    gap: 2,
    marginTop: 4,
  },
  attendeeBadge: {
    padding: '3px 9px',
    borderRadius: 999,
    background: '#ffffff',
    border: '1px solid #d4e0ed',
    fontSize: 12,
    lineHeight: 1.35,
    color: '#476788',
    whiteSpace: 'nowrap' as const,
  },
  availabilityPanel: {
    padding: '28px',
    background: '#ffffff',
    border: '1px solid #d4e0ed',
    borderRadius: 18,
    boxShadow: '0 4px 5px rgba(71,103,136,0.04), 0 8px 15px rgba(71,103,136,0.03), 0 18px 34px rgba(71,103,136,0.07)',
  },
  availabilityHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    margin: '0 0 8px',
  },
  availabilityHeadingBlock: {
    flex: '1 1 auto',
    minWidth: 0,
  },
  availabilityTitle: {
    margin: '14px 0 0',
    color: '#0b3558',
    fontSize: 24,
    lineHeight: 1.2,
    letterSpacing: '-0.02em',
    whiteSpace: 'nowrap' as const,
  },
  selectionCount: {
    flex: '0 0 auto',
    padding: '5px 8px',
    borderRadius: 999,
    background: '#f8f9fb',
    color: '#476788',
    fontSize: 12,
    fontWeight: 700,
  },
  instructions: {
    margin: '0 0 12px',
    padding: '0 0 0 10px',
    background: 'transparent',
    borderLeft: '3px solid #006bff',
    fontSize: 13,
    lineHeight: 1.4,
    fontWeight: 600,
    color: '#476788',
  },
  pageNav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    margin: '0 0 8px',
  },
  pageButton: {
    width: 32,
    height: 32,
    border: '1px solid #d4e0ed',
    borderRadius: 999,
    background: '#ffffff',
    color: '#0b3558',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  },
  pageLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: '#476788',
  },
  timeSection: {
    minWidth: 0,
    padding: '10px 14px 14px',
    background: '#f8f9fb',
    borderRadius: 16,
    border: '1px solid #e7edf6',
  },
  timeSectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    margin: '0 0 8px',
  },
  // Takes the free width so Select all stays on the same row, at the right.
  timeSectionTitleBlock: {
    flex: '1 1 0',
    minWidth: 0,
  },
  timeSectionLabel: {
    margin: 0,
    fontSize: 13,
    fontWeight: 800,
    color: '#0b3558',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  timeSectionMeta: {
    margin: '-2px 0 0',
    fontSize: 12,
    color: '#476788',
  },
  selectDayButton: {
    flex: '0 0 auto',
    padding: '6px 10px',
    border: '1px solid #006bff',
    borderRadius: 999,
    background: '#006bff',
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 8px 16px rgba(0,107,255,0.18)',
  },
  additionalAttendeeBox: {
    marginTop: 18,
    padding: '16px',
    background: '#ffffff',
    border: '1px solid #d4e0ed',
    borderRadius: 14,
  },
  additionalAttendeeToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: 0,
    border: 'none',
    background: 'transparent',
    color: '#0b3558',
    fontSize: 13,
    fontWeight: 600,
    textAlign: 'left' as const,
    cursor: 'pointer',
  },
  additionalAttendeePlus: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    borderRadius: 999,
    background: '#006bff',
    color: '#ffffff',
    fontSize: 16,
    lineHeight: 1,
    fontWeight: 700,
  },
  additionalAttendeeNote: {
    margin: '10px 0 10px',
    fontSize: 12,
    color: '#64748b',
    lineHeight: 1.4,
  },
  additionalAttendeeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 8,
  },
  additionalAttendeeInput: {
    width: '100%',
    boxSizing: 'border-box' as const,
    padding: '10px 12px',
    border: '1px solid #d4e0ed',
    borderRadius: 10,
    color: '#0b3558',
    fontSize: 14,
    background: '#ffffff',
  },
  confirmButton: {
    flex: 1,
    padding: '14px 24px',
    background: '#006bff',
    color: '#ffffff',
    border: 'none',
    borderRadius: 999,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  submitRow: {
    display: 'flex',
    gap: 10,
    marginTop: 14,
    flexWrap: 'wrap' as const,
  },
  maybeButton: {
    padding: '14px 24px',
    background: '#ffffff',
    color: '#334155',
    border: '1px solid #cbd5e1',
    borderRadius: 999,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  declinePrompt: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '6px 8px 6px 14px',
    marginBottom: 12,
    background: '#f8fafc',
    border: '1px solid #e7edf6',
    borderRadius: 12,
    flexWrap: 'wrap' as const,
  },
  declinePromptText: {
    fontSize: 13,
    color: '#476788',
    fontWeight: 500,
  },
  declineButton: {
    padding: '4px 14px',
    background: '#ffffff',
    color: '#b91c1c',
    border: '1px solid #fca5a5',
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  mobileWrapper: {
    padding: '16px 0 32px',
    background: '#ffffff',
    alignItems: 'stretch',
  },
  mobileCard: {
    maxWidth: 'none',
    border: 'none',
    borderRadius: 0,
    boxShadow: 'none',
  },
  mobileBody: {
    padding: '0 14px 20px',
  },
  mobileAvailabilityPanel: {
    padding: '12px',
    border: '1px solid #e7edf6',
    borderRadius: 14,
    boxShadow: 'none',
  },
  mobileMeetingPanel: {
    minHeight: 'auto',
    marginTop: 18,
    padding: '18px 0 0',
    background: 'transparent',
    border: 'none',
    borderRadius: 0,
  },
  mobileTimeSection: {
    borderLeft: 'none',
    borderRight: 'none',
    borderRadius: 12,
  },
  loadingText: {
    textAlign: 'center' as const,
    padding: 40,
    color: '#64748b',
    fontSize: 14,
  },
  successBanner: {
    background: '#eff6ff',
    borderRadius: 8,
    padding: '24px 20px',
    textAlign: 'center' as const,
  },
  successTitle: {
    margin: '0 0 8px',
    fontSize: 18,
    fontWeight: 600,
    color: '#1e40af',
  },
  successText: {
    margin: 0,
    fontSize: 14,
    color: '#1d4ed8',
    lineHeight: 1.5,
  },
  confirmedBanner: {
    background: '#eff6ff',
    borderRadius: 8,
    padding: '24px 20px',
    textAlign: 'center' as const,
  },
  confirmedTitle: {
    margin: '0 0 8px',
    fontSize: 20,
    fontWeight: 600,
    color: '#1e40af',
  },
  confirmedSubtitle: {
    margin: '0 0 8px',
    fontSize: 16,
    fontWeight: 500,
    color: '#1d4ed8',
  },
  confirmedText: {
    margin: '0 0 4px',
    fontSize: 14,
    color: '#1d4ed8',
  },
  confirmedMeta: {
    margin: '0 0 12px',
    fontSize: 13,
    color: '#2563eb',
  },
  errorText: {
    margin: '12px 0 0',
    fontSize: 13,
    color: '#dc2626',
  },
}
