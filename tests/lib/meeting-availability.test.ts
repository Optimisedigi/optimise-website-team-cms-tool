import { describe, expect, it } from 'vitest'
import {
  buildAvailability,
  busyRangesFromPeriods,
  cellsFromSlots,
  clientGridFromSlots,
  parseMeetingAvailability,
  rankSlotsByFavourites,
  slotsFromAvailability,
  slotsFromSelectedCells,
  zonedToUtc,
} from '@/lib/meeting-availability'

const tz = 'Australia/Sydney'
const now = new Date('2026-10-01T00:00:00Z')

// Tue 13 Oct 2026 (AEDT, UTC+11) with a 10:00–11:00 meeting in the calendar.
const busy = busyRangesFromPeriods(
  [{ start: '2026-10-12T23:00:00Z', end: '2026-10-13T00:00:00Z' }],
  ['2026-10-13'],
  tz,
)

function grid(overrides: Partial<Parameters<typeof buildAvailability>[0]> = {}) {
  return buildAvailability({
    rangeStart: '2026-10-13',
    rangeEnd: '2026-10-13',
    dayStartMinutes: 9 * 60,
    dayEndMinutes: 12 * 60,
    busy,
    timeZone: tz,
    now,
    checkedAt: now.toISOString(),
    ...overrides,
  })
}

describe('meeting availability', () => {
  it('maps calendar busy time to local minutes', () => {
    expect(busy).toEqual([{ date: '2026-10-13', startMinutes: 600, endMinutes: 660 }])
  })

  it('pre-selects every free cell inside the day window', () => {
    expect(grid().open).toEqual([
      '2026-10-13|540',
      '2026-10-13|570',
      '2026-10-13|660',
      '2026-10-13|690',
    ])
  })

  it('never offers weekends, even when a dictated window covers one', () => {
    const weekend = { rangeStart: '2026-10-17', rangeEnd: '2026-10-18', busy: [] }
    expect(grid(weekend).open).toEqual([])
    expect(
      grid({ ...weekend, windows: [{ date: '2026-10-17', startMinutes: 540, endMinutes: 600 }] })
        .open,
    ).toEqual([])
  })

  it('hides weekend days from the client grid for older schedulers', () => {
    const saturday = zonedToUtc('2026-10-17', 540, tz).toISOString()
    const monday = zonedToUtc('2026-10-19', 540, tz).toISOString()
    expect(clientGridFromSlots([saturday, monday], 30, tz, now).map((day) => day.date)).toEqual([
      '2026-10-19',
    ])
  })

  it('offers only start times whose whole meeting fits in open cells', () => {
    const slots = slotsFromAvailability(grid(), 60, tz, now)
    expect(slots).toEqual([
      zonedToUtc('2026-10-13', 540, tz).toISOString(),
      zonedToUtc('2026-10-13', 660, tz).toISOString(),
    ])
  })

  it('tries favourite times first when matching', () => {
    const slots = slotsFromAvailability(grid(), 30, tz, now)
    const ranked = rankSlotsByFavourites(slots, grid({ favourites: ['2026-10-13|690'] }), 30, tz)
    expect(ranked[0]).toBe(zonedToUtc('2026-10-13', 690, tz).toISOString())
    expect(ranked.slice(1)).toEqual(slots.filter((slot) => slot !== ranked[0]))
  })

  it('drops favourites that are no longer open and rejects malformed values', () => {
    expect(
      parseMeetingAvailability({
        ...grid(),
        open: ['2026-10-13|540'],
        favourites: ['2026-10-13|690'],
      })?.favourites,
    ).toEqual([])
    expect(parseMeetingAvailability({ ...grid(), rangeEnd: '2026-12-31' })).toBeNull()
    expect(parseMeetingAvailability('nope')).toBeNull()
  })

  it('round-trips a client selection through cells and meeting times', () => {
    const slots = slotsFromAvailability(grid(), 60, tz, now)
    const days = clientGridFromSlots(slots, 60, tz, now)
    expect(days).toEqual([{ date: '2026-10-13', open: new Set([540, 570, 660, 690]) }])

    // Dragging 9:00–10:00 picks the 9:00 meeting; half of 11:00 picks nothing more.
    const picked = new Set(['2026-10-13|540', '2026-10-13|570', '2026-10-13|660'])
    expect(slotsFromSelectedCells(picked, slots, 60, tz)).toEqual([slots[0]])
    expect(cellsFromSlots([slots[0] ?? ''], 60, tz)).toEqual(
      new Set(['2026-10-13|540', '2026-10-13|570']),
    )
  })
})
