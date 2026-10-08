'use client'

import { useField, useFormFields } from '@payloadcms/ui'
import { useMemo, useState } from 'react'
import AvailabilityGrid, { GridLegend, type GridDay } from './AvailabilityGrid'
import {
  addDays,
  buildAvailability,
  CELL_MINUTES,
  dateLabel,
  datesInRange,
  defaultDayWindow,
  isBusyCell,
  isPastCell,
  MAX_RANGE_DAYS,
  parseMeetingAvailability,
  slotsFromAvailability,
  weekdayOf,
  type BusyRange,
  type CellKey,
  type MeetingAvailability,
} from '@/lib/meeting-availability'

type Mode = 'open' | 'favourite'

function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Monday on or before the date. */
function mondayOf(date: string): string {
  return addDays(date, -((weekdayOf(date) + 6) % 7))
}

const colors = {
  ink: '#16191b',
  muted: '#5d655f',
  line: '#e4e6e1',
  control: '#dde0da',
  raised: '#fbfbf9',
  green: '#2c4a39',
  danger: '#8e332b',
}

const inputStyle: React.CSSProperties = {
  border: `1px solid ${colors.control}`,
  borderRadius: 9,
  padding: '7px 10px',
  fontSize: 13,
  background: '#fff',
  color: colors.ink,
  font: 'inherit',
}

const buttonBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 36,
  padding: '0 14px',
  borderRadius: 9,
  fontSize: 13.5,
  cursor: 'pointer',
  font: 'inherit',
}

const primaryButton: React.CSSProperties = {
  ...buttonBase,
  border: '1px solid transparent',
  background: colors.green,
  color: '#fff',
  fontWeight: 600,
}

const secondaryButton: React.CSSProperties = {
  ...buttonBase,
  border: `1px solid ${colors.control}`,
  background: '#fff',
  color: '#2c312d',
}

/**
 * Setup-tab availability for a meeting scheduler: pick a date range, check
 * the connected Google Calendar, then untick times or star favourites in a
 * week grid ported from Cipher Health's "Calendar block times". The value is
 * saved with the scheduler; the collection hook turns it into the meeting
 * times attendees are offered.
 */
export default function MeetingSchedulerAvailabilityGrid(): React.ReactElement {
  const { value, setValue } = useField<unknown>({ path: 'availability' })
  const timezone =
    useFormFields(([fields]) => fields.timezone?.value as string | undefined) || 'Australia/Sydney'
  const durationMinutes =
    Number.parseInt(
      String(useFormFields(([fields]) => fields.durationMinutes?.value) ?? '30'),
      10,
    ) || 30
  const legacyOverrides = useFormFields(([fields]) => fields.dateOverrides?.value)

  const availability = useMemo(() => parseMeetingAvailability(value), [value])
  const today = todayIn(timezone)
  const [rangeStart, setRangeStart] = useState(availability?.rangeStart ?? addDays(today, 1))
  const [rangeEnd, setRangeEnd] = useState(availability?.rangeEnd ?? addDays(today, 7))
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<Mode>('open')
  const [week, setWeek] = useState(() => mondayOf(availability?.rangeStart ?? addDays(today, 1)))

  const hasLegacyWindows =
    !availability && Array.isArray(legacyOverrides) && legacyOverrides.length > 0

  async function checkCalendar(): Promise<void> {
    setError('')
    if (!rangeStart || !rangeEnd) return setError('Choose a start and end date.')
    if (rangeEnd < rangeStart) return setError('The end date must be on or after the start date.')
    if (datesInRange(rangeStart, rangeEnd).length > MAX_RANGE_DAYS)
      return setError(`Choose a range of ${MAX_RANGE_DAYS} days or fewer.`)
    setChecking(true)
    try {
      const response = await fetch('/api/meeting-schedulers/calendar-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rangeStart, rangeEnd, timezone }),
      })
      const json = (await response.json().catch(() => ({}))) as {
        busy?: BusyRange[]
        checkedAt?: string
        error?: string
      }
      if (!response.ok) throw new Error(json.error || 'Could not check your calendar')
      const window = availability
        ? {
            dayStartMinutes: availability.dayStartMinutes,
            dayEndMinutes: availability.dayEndMinutes,
          }
        : defaultDayWindow()
      const next = buildAvailability({
        rangeStart,
        rangeEnd,
        ...window,
        busy: json.busy ?? [],
        timeZone: timezone,
        now: new Date(),
        checkedAt: json.checkedAt ?? new Date().toISOString(),
        // Favourites survive a re-check wherever the time is still free.
        favourites: availability?.favourites ?? [],
      })
      setValue(next)
      setWeek(mondayOf(rangeStart))
      setMode('open')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not check your calendar')
    } finally {
      setChecking(false)
    }
  }

  function update(changes: Partial<MeetingAvailability>): void {
    if (!availability) return
    const next = { ...availability, ...changes }
    const open = new Set(next.open)
    setValue({
      ...next,
      open: [...open],
      favourites: next.favourites.filter((key) => open.has(key)),
    })
  }

  const openSet = useMemo(() => new Set<CellKey>(availability?.open ?? []), [availability])
  const favouriteSet = useMemo(
    () => new Set<CellKey>(availability?.favourites ?? []),
    [availability],
  )
  const offeredCount = useMemo(
    () =>
      availability
        ? slotsFromAvailability(availability, durationMinutes, timezone, new Date()).length
        : 0,
    [availability, durationMinutes, timezone],
  )

  const firstWeek = availability ? mondayOf(availability.rangeStart) : week
  const lastWeek = availability ? mondayOf(availability.rangeEnd) : week
  const days: GridDay[] = [0, 1, 2, 3, 4].map((offset) => ({
    date: addDays(week, offset),
    weekendAfter: offset === 4,
  }))
  const rows: number[] = []
  if (availability) {
    for (let m = availability.dayStartMinutes; m < availability.dayEndMinutes; m += CELL_MINUTES)
      rows.push(m)
  }

  const lockReason = (date: string, minutes: number): string | null => {
    if (!availability) return null
    if (date < availability.rangeStart || date > availability.rangeEnd)
      return 'outside your date range'
    if (isBusyCell(availability.busy, date, minutes)) return 'busy in your Google Calendar'
    if (isPastCell(date, minutes, timezone, new Date())) return 'in the past'
    return null
  }

  // Weekend dates in the range are skipped by the grid, so count them apart.
  const weekendOpen = (availability?.open ?? []).filter((key) => {
    const day = weekdayOf(key.split('|')[0] ?? '')
    return day === 0 || day === 6
  }).length

  return (
    <div style={{ margin: '8px 0 24px', display: 'grid', gap: 12 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink }}>Your availability</div>
        <p style={{ margin: '2px 0 0', fontSize: 12.5, lineHeight: '20px', color: colors.muted }}>
          Pick the dates the meeting could happen, then check your Google Calendar. Every free time
          is ticked; untick any you don&apos;t want to offer, and star your favourites so
          they&apos;re matched first.
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 10 }}>
        <label
          style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600, color: colors.ink }}
        >
          Start date
          <input
            aria-label="Start date"
            min={today}
            onChange={(event) => setRangeStart(event.target.value)}
            style={inputStyle}
            type="date"
            value={rangeStart}
          />
        </label>
        <label
          style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600, color: colors.ink }}
        >
          End date
          <input
            aria-label="End date"
            min={rangeStart || today}
            onChange={(event) => setRangeEnd(event.target.value)}
            style={inputStyle}
            type="date"
            value={rangeEnd}
          />
        </label>
        <button
          disabled={checking}
          onClick={() => void checkCalendar()}
          style={primaryButton}
          type="button"
        >
          {checking
            ? 'Checking your calendar…'
            : availability
              ? 'Check again'
              : 'Check available times'}
        </button>
      </div>

      {error ? (
        <p
          role="alert"
          style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: colors.danger }}
        >
          {error}
        </p>
      ) : null}

      {hasLegacyWindows ? (
        <p style={{ margin: 0, fontSize: 12.5, color: colors.muted }}>
          This scheduler was set up with the older date list. Its current times keep working; check
          available times to switch it to the calendar grid.
        </p>
      ) : null}

      {availability ? (
        <div
          style={{
            display: 'grid',
            gap: 12,
            border: `1px solid ${colors.line}`,
            borderRadius: 12,
            background: '#fff',
            padding: 16,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div
              aria-label="What to do"
              role="radiogroup"
              style={{
                display: 'inline-flex',
                border: `1px solid ${colors.line}`,
                borderRadius: 10,
                background: colors.raised,
                padding: 4,
              }}
            >
              {(
                [
                  ['open', 'Open times'],
                  ['favourite', 'Favourite times'],
                ] as const
              ).map(([value, label]) => (
                <button
                  aria-checked={mode === value}
                  key={value}
                  onClick={() => setMode(value)}
                  role="radio"
                  style={{
                    border: 0,
                    borderRadius: 8,
                    padding: '6px 12px',
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: mode === value ? colors.ink : 'transparent',
                    color: mode === value ? '#fff' : colors.muted,
                  }}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
              <span style={{ fontSize: 12, color: colors.muted }}>Times are in {timezone}.</span>
              <button
                aria-label="Previous week"
                disabled={week <= firstWeek}
                onClick={() => setWeek(addDays(week, -7))}
                style={{
                  ...secondaryButton,
                  height: 30,
                  padding: '0 10px',
                  opacity: week <= firstWeek ? 0.5 : 1,
                }}
                type="button"
              >
                ←
              </button>
              <span
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: colors.ink,
                  minWidth: 128,
                  textAlign: 'center',
                }}
              >
                {dateLabel(week)} – {dateLabel(addDays(week, 4))}
              </span>
              <button
                aria-label="Next week"
                disabled={week >= lastWeek}
                onClick={() => setWeek(addDays(week, 7))}
                style={{
                  ...secondaryButton,
                  height: 30,
                  padding: '0 10px',
                  opacity: week >= lastWeek ? 0.5 : 1,
                }}
                type="button"
              >
                →
              </button>
            </div>
          </div>

          <p style={{ margin: 0, fontSize: 12.5, lineHeight: '20px', color: colors.muted }}>
            {mode === 'open'
              ? 'Drag across times to untick them, or drag across unticked times to open them again.'
              : 'Drag across open times to star them. Starred times are tried first when everyone’s picks are matched.'}
          </p>

          <AvailabilityGrid
            ariaLabel={mode === 'open' ? 'Times you are free to meet' : 'Your favourite times'}
            canSelect={mode === 'favourite' ? (key) => openSet.has(key) : undefined}
            days={days}
            favouriteMode={mode === 'favourite'}
            favourites={favouriteSet}
            filled={mode === 'favourite' ? openSet : undefined}
            isLocked={lockReason}
            onChange={(next) =>
              mode === 'open' ? update({ open: [...next] }) : update({ favourites: [...next] })
            }
            rows={rows}
            selected={mode === 'open' ? openSet : favouriteSet}
            selectedLabel={mode === 'open' ? 'open' : 'favourite'}
            unselectedLabel={mode === 'open' ? 'not offered' : 'not a favourite'}
            unavailableLabel="not offered, tick it first"
          />

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              disabled={availability.dayStartMinutes === 0}
              onClick={() =>
                update({ dayStartMinutes: Math.max(0, availability.dayStartMinutes - 60) })
              }
              style={secondaryButton}
              type="button"
            >
              + Add earlier times
            </button>
            <button
              disabled={availability.dayEndMinutes === 1440}
              onClick={() =>
                update({ dayEndMinutes: Math.min(1440, availability.dayEndMinutes + 60) })
              }
              style={secondaryButton}
              type="button"
            >
              + Add later times
            </button>
          </div>

          <GridLegend
            items={[
              { label: 'Open', kind: 'selected' },
              { label: 'Favourite', kind: 'favourite' },
              { label: 'Not offered', kind: 'free' },
              { label: 'Busy or past', kind: 'locked' },
            ]}
          />

          <p role="status" style={{ margin: 0, fontSize: 12.5, color: colors.ink }}>
            <strong>{offeredCount}</strong> {durationMinutes}-minute meeting{' '}
            {offeredCount === 1 ? 'time' : 'times'} will be offered
            {availability.favourites.length
              ? `, with ${availability.favourites.length} favourite half-hour${availability.favourites.length === 1 ? '' : 's'}`
              : ''}
            .{weekendOpen ? ` Includes ${weekendOpen} weekend half-hours.` : ''} Press{' '}
            <strong>Save</strong> to offer them.
          </p>
        </div>
      ) : null}
    </div>
  )
}
