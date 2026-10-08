/**
 * Calendar-grid availability for the meeting scheduler.
 *
 * The admin picks a date range, the server reads their Google Calendar busy
 * times, and the grid pre-selects every free 30-minute cell. The admin's open
 * and favourite cells are stored on the scheduler as `availability`; the
 * meeting start times offered to attendees (`generatedSlots`) are derived from
 * them. The client page turns those slots back into cells for its own grid.
 *
 * Pure (no network, no Node APIs) so the admin UI, client page and server
 * share one implementation. Cells are keyed by local date and start minute in
 * the scheduler's timezone, so DST changes never shift a cell.
 */

export const CELL_MINUTES = 30
export const MAX_RANGE_DAYS = 31
const DEFAULT_DAY_START = 9 * 60
const DEFAULT_DAY_END = 17 * 60

/** `YYYY-MM-DD|minutes` — a 30-minute cell starting at that local time. */
export type CellKey = string

export interface BusyRange {
  date: string
  startMinutes: number
  endMinutes: number
}

export interface MeetingAvailability {
  version: 1
  rangeStart: string
  rangeEnd: string
  /** First and last grid rows shown (minutes since midnight, end exclusive). */
  dayStartMinutes: number
  dayEndMinutes: number
  checkedAt: string
  /** Busy times from Google Calendar for each date, whole day. */
  busy: BusyRange[]
  open: CellKey[]
  favourites: CellKey[]
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/

export function cellKey(date: string, minutes: number): CellKey {
  return `${date}|${minutes}`
}

export function parseCellKey(key: string): { date: string; minutes: number } | null {
  const [date, raw] = key.split('|')
  const minutes = Number(raw)
  if (!date || !datePattern.test(date) || !Number.isInteger(minutes)) return null
  if (minutes < 0 || minutes >= 1440 || minutes % CELL_MINUTES !== 0) return null
  return { date, minutes }
}

export function isRealDate(value: string): boolean {
  if (!datePattern.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

export function datesInRange(start: string, end: string): string[] {
  const dates: string[] = []
  for (let date = start; date <= end && dates.length <= MAX_RANGE_DAYS; date = addDays(date, 1)) {
    dates.push(date)
  }
  return dates
}

/** 0 = Sunday … 6 = Saturday, for a calendar date (timezone independent). */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

export function isWeekend(date: string): boolean {
  const day = weekdayOf(date)
  return day === 0 || day === 6
}

/** Local date and minutes-since-midnight of an instant in a timezone. */
export function zonedParts(
  iso: string | Date,
  timeZone: string,
): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(typeof iso === 'string' ? new Date(iso) : iso)
  const map: Record<string, string> = {}
  for (const part of parts) if (part.type !== 'literal') map[part.type] = part.value
  const hour = Number(map.hour) === 24 ? 0 : Number(map.hour)
  return { date: `${map.year}-${map.month}-${map.day}`, minutes: hour * 60 + Number(map.minute) }
}

/** The UTC instant of a wall-clock local time in a timezone (DST-correct). */
export function zonedToUtc(date: string, minutes: number, timeZone: string): Date {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number)
  const guess = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60)
  const offsetAt = (instant: number): number => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date(instant))
    const map: Record<string, string> = {}
    for (const part of parts) if (part.type !== 'literal') map[part.type] = part.value
    const hour = Number(map.hour) === 24 ? 0 : Number(map.hour)
    const wall = Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      hour,
      Number(map.minute),
      Number(map.second || 0),
    )
    return instant - wall
  }
  const first = guess + offsetAt(guess)
  // Re-check at the corrected instant, in case the guess crossed a DST change.
  return new Date(guess + offsetAt(first))
}

/**
 * Clips Google Calendar busy periods to each local date in the range, as
 * minute ranges, so the grid can lock the cells they touch.
 */
export function busyRangesFromPeriods(
  periods: ReadonlyArray<{ start: string; end: string }>,
  dates: readonly string[],
  timeZone: string,
): BusyRange[] {
  const ranges: BusyRange[] = []
  for (const date of dates) {
    const dayStart = zonedToUtc(date, 0, timeZone).getTime()
    const dayEnd = zonedToUtc(addDays(date, 1), 0, timeZone).getTime()
    for (const period of periods) {
      const start = Math.max(new Date(period.start).getTime(), dayStart)
      const end = Math.min(new Date(period.end).getTime(), dayEnd)
      if (!(end > start)) continue
      const startMinutes = start === dayStart ? 0 : zonedParts(new Date(start), timeZone).minutes
      const endMinutes = end === dayEnd ? 1440 : zonedParts(new Date(end), timeZone).minutes
      if (endMinutes > startMinutes) ranges.push({ date, startMinutes, endMinutes })
    }
  }
  return ranges.sort((a, b) =>
    a.date === b.date ? a.startMinutes - b.startMinutes : a.date < b.date ? -1 : 1,
  )
}

export function isBusyCell(busy: readonly BusyRange[], date: string, minutes: number): boolean {
  return busy.some(
    (range) =>
      range.date === date &&
      range.startMinutes < minutes + CELL_MINUTES &&
      range.endMinutes > minutes,
  )
}

export function isPastCell(date: string, minutes: number, timeZone: string, now: Date): boolean {
  return zonedToUtc(date, minutes, timeZone).getTime() <= now.getTime()
}

function minutesFromHHMM(value: unknown, fallback: number): number {
  if (typeof value !== 'string') return fallback
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return fallback
  const minutes = Number(match[1]) * 60 + Number(match[2])
  return minutes >= 0 && minutes <= 1440 ? minutes : fallback
}

export function defaultDayWindow(
  startHHMM?: unknown,
  endHHMM?: unknown,
): { dayStartMinutes: number; dayEndMinutes: number } {
  const floor = (value: number) => Math.floor(value / CELL_MINUTES) * CELL_MINUTES
  const ceil = (value: number) => Math.ceil(value / CELL_MINUTES) * CELL_MINUTES
  const start = floor(minutesFromHHMM(startHHMM, DEFAULT_DAY_START))
  const end = ceil(minutesFromHHMM(endHHMM, DEFAULT_DAY_END))
  return end > start
    ? { dayStartMinutes: start, dayEndMinutes: end }
    : { dayStartMinutes: DEFAULT_DAY_START, dayEndMinutes: DEFAULT_DAY_END }
}

/**
 * A fresh grid from a calendar check: every free weekday cell inside the day
 * window is open. When `windows` is given (AdminMate dictated specific dates
 * and hours), only cells inside them open. Weekends are never offered.
 */
export function buildAvailability(input: {
  rangeStart: string
  rangeEnd: string
  dayStartMinutes: number
  dayEndMinutes: number
  busy: BusyRange[]
  timeZone: string
  now: Date
  checkedAt: string
  windows?: ReadonlyArray<{ date: string; startMinutes: number; endMinutes: number }>
  favourites?: readonly CellKey[]
}): MeetingAvailability {
  const open: CellKey[] = []
  for (const date of datesInRange(input.rangeStart, input.rangeEnd)) {
    const dayWindows = isWeekend(date)
      ? []
      : input.windows
        ? input.windows.filter((window) => window.date === date)
        : [{ date, startMinutes: input.dayStartMinutes, endMinutes: input.dayEndMinutes }]
    for (let minutes = 0; minutes < 1440; minutes += CELL_MINUTES) {
      const inWindow = dayWindows.some(
        (window) => window.startMinutes <= minutes && window.endMinutes >= minutes + CELL_MINUTES,
      )
      if (!inWindow) continue
      if (isBusyCell(input.busy, date, minutes)) continue
      if (isPastCell(date, minutes, input.timeZone, input.now)) continue
      open.push(cellKey(date, minutes))
    }
  }
  const openSet = new Set(open)
  return {
    version: 1,
    rangeStart: input.rangeStart,
    rangeEnd: input.rangeEnd,
    dayStartMinutes: input.dayStartMinutes,
    dayEndMinutes: input.dayEndMinutes,
    checkedAt: input.checkedAt,
    busy: input.busy,
    open,
    favourites: (input.favourites ?? []).filter((key) => openSet.has(key)),
  }
}

function sortedCells(keys: Iterable<string>): CellKey[] {
  return [...new Set(keys)].filter((key) => parseCellKey(key) !== null).sort(compareCells)
}

export function compareCells(a: CellKey, b: CellKey): number {
  const left = parseCellKey(a)
  const right = parseCellKey(b)
  if (!left || !right) return a < b ? -1 : a > b ? 1 : 0
  if (left.date !== right.date) return left.date < right.date ? -1 : 1
  return left.minutes - right.minutes
}

/**
 * Validates a stored or submitted `availability` value. Returns null for
 * anything malformed, so callers fall back to the legacy date-window flow.
 */
export function parseMeetingAvailability(raw: unknown): MeetingAvailability | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  const rangeStart = typeof value.rangeStart === 'string' ? value.rangeStart : ''
  const rangeEnd = typeof value.rangeEnd === 'string' ? value.rangeEnd : ''
  if (!isRealDate(rangeStart) || !isRealDate(rangeEnd) || rangeEnd < rangeStart) return null
  if (datesInRange(rangeStart, rangeEnd).length > MAX_RANGE_DAYS) return null
  const dayStart = Number(value.dayStartMinutes)
  const dayEnd = Number(value.dayEndMinutes)
  if (
    !Number.isInteger(dayStart) ||
    !Number.isInteger(dayEnd) ||
    dayStart < 0 ||
    dayEnd > 1440 ||
    dayEnd <= dayStart ||
    dayStart % CELL_MINUTES !== 0 ||
    dayEnd % CELL_MINUTES !== 0
  ) {
    return null
  }
  const inRange = (key: string) => {
    const cell = parseCellKey(key)
    return cell !== null && cell.date >= rangeStart && cell.date <= rangeEnd
  }
  const strings = (list: unknown) =>
    Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : []
  const open = sortedCells(strings(value.open).filter(inRange))
  const openSet = new Set(open)
  const busy = (Array.isArray(value.busy) ? value.busy : []).flatMap((item): BusyRange[] => {
    if (!item || typeof item !== 'object') return []
    const range = item as Record<string, unknown>
    const date = typeof range.date === 'string' ? range.date : ''
    const startMinutes = Number(range.startMinutes)
    const endMinutes = Number(range.endMinutes)
    if (!isRealDate(date) || !Number.isFinite(startMinutes) || !Number.isFinite(endMinutes))
      return []
    if (startMinutes < 0 || endMinutes > 1440 || endMinutes <= startMinutes) return []
    return [{ date, startMinutes, endMinutes }]
  })
  return {
    version: 1,
    rangeStart,
    rangeEnd,
    dayStartMinutes: dayStart,
    dayEndMinutes: dayEnd,
    checkedAt: typeof value.checkedAt === 'string' ? value.checkedAt : '',
    busy,
    open,
    favourites: sortedCells(strings(value.favourites).filter((key) => openSet.has(key))),
  }
}

/** Cells (by key) a meeting starting at `minutes` on `date` covers. */
function coveredCells(date: string, minutes: number, durationMinutes: number): CellKey[] {
  const first = Math.floor(minutes / CELL_MINUTES) * CELL_MINUTES
  const keys: CellKey[] = []
  for (let cell = first; cell < minutes + durationMinutes; cell += CELL_MINUTES) {
    keys.push(cellKey(date, cell))
  }
  return keys
}

/**
 * Meeting start times offered to attendees: every open cell from which the
 * whole meeting fits inside open cells on the same day, in the future.
 */
export function slotsFromAvailability(
  availability: MeetingAvailability,
  durationMinutes: number,
  timeZone: string,
  now: Date,
): string[] {
  const open = new Set(availability.open)
  const slots: string[] = []
  for (const key of availability.open) {
    const cell = parseCellKey(key)
    if (!cell || cell.minutes + durationMinutes > 1440) continue
    if (
      !coveredCells(cell.date, cell.minutes, durationMinutes).every((covered) => open.has(covered))
    )
      continue
    const start = zonedToUtc(cell.date, cell.minutes, timeZone)
    if (start.getTime() <= now.getTime()) continue
    slots.push(start.toISOString())
  }
  return [...new Set(slots)].sort()
}

/**
 * Re-orders already preference-ordered slots so those covering more of the
 * admin's favourite times are tried first. Stable, so ties keep their order.
 */
export function rankSlotsByFavourites(
  orderedSlots: readonly string[],
  availability: MeetingAvailability | null,
  durationMinutes: number,
  timeZone: string,
): string[] {
  if (!availability || availability.favourites.length === 0) return [...orderedSlots]
  const favourites = new Set(availability.favourites)
  const score = (iso: string) => {
    const { date, minutes } = zonedParts(iso, timeZone)
    const cells = coveredCells(date, minutes, durationMinutes)
    return cells.filter((key) => favourites.has(key)).length / Math.max(cells.length, 1)
  }
  return orderedSlots
    .map((iso, index) => ({ iso, index, score: score(iso) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ iso }) => iso)
}

export interface ClientGridDay {
  date: string
  /** Cells the attendee may pick (covered by some offered meeting time). */
  open: Set<number>
}

/**
 * The client grid: each date with offered times, and the cells those times
 * cover. Past times are dropped, as on the old list.
 */
export function clientGridFromSlots(
  slots: readonly string[],
  durationMinutes: number,
  timeZone: string,
  now: Date,
): ClientGridDay[] {
  const byDate = new Map<string, Set<number>>()
  for (const iso of slots) {
    if (new Date(iso).getTime() <= now.getTime()) continue
    const { date, minutes } = zonedParts(iso, timeZone)
    for (const key of coveredCells(date, minutes, durationMinutes)) {
      const cell = parseCellKey(key)
      if (!cell) continue
      const open = byDate.get(cell.date) ?? new Set<number>()
      open.add(cell.minutes)
      byDate.set(cell.date, open)
    }
  }
  // Weekends are never shown, even for older schedulers that offered them.
  return [...byDate.keys()]
    .filter((date) => !isWeekend(date))
    .sort()
    .map((date) => ({ date, open: byDate.get(date) ?? new Set() }))
}

/** Offered meeting times whose every cell the attendee selected. */
export function slotsFromSelectedCells(
  selected: ReadonlySet<CellKey>,
  slots: readonly string[],
  durationMinutes: number,
  timeZone: string,
): string[] {
  return slots
    .filter((iso) => {
      const { date, minutes } = zonedParts(iso, timeZone)
      return coveredCells(date, minutes, durationMinutes).every((key) => selected.has(key))
    })
    .sort()
}

/** The cells an earlier response covered, to show it again. */
export function cellsFromSlots(
  selectedSlots: readonly string[],
  durationMinutes: number,
  timeZone: string,
): Set<CellKey> {
  const cells = new Set<CellKey>()
  for (const iso of selectedSlots) {
    const { date, minutes } = zonedParts(iso, timeZone)
    for (const key of coveredCells(date, minutes, durationMinutes)) cells.add(key)
  }
  return cells
}

/** `9:00 am` style label for a row. */
export function minutesLabel(minutes: number): string {
  return new Intl.DateTimeFormat('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2000, 0, 1, 0, minutes)))
}

/** `Thu 8 Oct` style label for a column. */
export function dateLabel(date: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}
