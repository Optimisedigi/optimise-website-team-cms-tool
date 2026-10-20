'use client'

import { useRef, useState } from 'react'
import MailCalendar from './MailCalendar'
import {
  addDays,
  addMinutesToTime,
  combineDateAndTime,
  dateKey,
  defaultScheduleChoice,
  formatTime12,
  parseDateKey,
  QUICK_SEND_TIMES,
} from '../../lib/mail/schedule-times'
import styles from './ComposeWindow.module.css'

/**
 * Schedule send panel: Today / Tomorrow day pills, quick send times (7:48am,
 * 8:11am) each with a +2 button that moves that time two minutes later before
 * you pick it, a date box that opens the calendar and a time box that opens
 * the browser's time picker, both anywhere you click on them.
 */

interface Props {
  busy: boolean
  scheduling: boolean
  canSchedule: boolean
  onSchedule: (when: Date | null) => void
  /** Injected for tests; defaults to the real clock. */
  now?: () => Date
}

function openNativePicker(input: HTMLInputElement) {
  try {
    input.showPicker()
  } catch {
    // Not supported (or not allowed right now): the field still takes typing.
  }
}

export default function SchedulePicker({ busy, scheduling, canSchedule, onSchedule, now = () => new Date() }: Props) {
  const [choice, setChoice] = useState(() => defaultScheduleChoice(now()))
  const [quickTimes, setQuickTimes] = useState<string[]>(() => [...QUICK_SEND_TIMES])
  const [calendarOpen, setCalendarOpen] = useState(false)
  const timeRef = useRef<HTMLInputElement>(null)

  const today = dateKey(now())
  const tomorrow = dateKey(addDays(now(), 1))
  const day = parseDateKey(choice.day)
  const dayLabel = day ? day.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'Pick a date'

  const pickDay = (next: string) => setChoice((current) => ({ ...current, day: next }))
  const pickTime = (next: string) => setChoice((current) => ({ ...current, time: next }))

  return (
    <div className={styles.schedulePicker} role="group" aria-label="Schedule send">
      <div className={styles.scheduleQuick}>
        {[
          { label: 'Today', value: today },
          { label: 'Tomorrow', value: tomorrow },
        ].map((pill) => (
          <button
            key={pill.label}
            type="button"
            className={styles.pill}
            aria-pressed={choice.day === pill.value}
            onClick={() => pickDay(pill.value)}
            disabled={busy}
          >
            {pill.label}
          </button>
        ))}
        {quickTimes.map((time, index) => (
          <span key={index} className={styles.quickTime}>
            <button
              type="button"
              className={styles.pill}
              aria-pressed={choice.time === time}
              onClick={() => pickTime(time)}
              disabled={busy}
            >
              {formatTime12(time)}
            </button>
            <button
              type="button"
              className={styles.plusTwo}
              aria-label={`Add 2 minutes to ${formatTime12(time)}`}
              title="2 minutes later"
              onClick={() => setQuickTimes((current) => current.map((t, i) => (i === index ? addMinutesToTime(t, 2) : t)))}
              disabled={busy}
            >
              +2
            </button>
          </span>
        ))}
      </div>

      <div className={styles.scheduleFields}>
        <button
          type="button"
          className={styles.dateBox}
          onClick={() => setCalendarOpen((open) => !open)}
          aria-expanded={calendarOpen}
          aria-label={`Send date: ${dayLabel}`}
          disabled={busy}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          {dayLabel}
        </button>
        <input
          ref={timeRef}
          type="time"
          className={styles.timeBox}
          value={choice.time}
          onChange={(event) => pickTime(event.target.value)}
          onClick={(event) => openNativePicker(event.currentTarget)}
          aria-label="Send time"
          disabled={busy}
        />
        <button
          type="button"
          className={styles.send}
          onClick={() => onSchedule(combineDateAndTime(choice.day, choice.time))}
          disabled={busy || !canSchedule || !choice.time}
        >
          {scheduling ? 'Scheduling…' : 'Schedule send'}
        </button>
      </div>

      {calendarOpen ? (
        <MailCalendar
          selected={choice.day}
          min={today}
          today={today}
          onSelect={(next) => {
            pickDay(next)
            setCalendarOpen(false)
            timeRef.current?.focus()
          }}
        />
      ) : null}
    </div>
  )
}
