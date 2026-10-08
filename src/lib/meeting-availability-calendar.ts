import type { Payload } from 'payload'
import { fetchBusyPeriods } from './calendar-service'
import {
  addDays,
  busyRangesFromPeriods,
  datesInRange,
  zonedToUtc,
  type BusyRange,
} from './meeting-availability'

export type CalendarBusyResult =
  | { ok: true; busy: BusyRange[]; checkedAt: string }
  | { ok: false; status: 400 | 502; error: string }

/**
 * Reads the connected Google Calendar's busy times for whole local days in the
 * range, so the grid can lock them (including rows added later).
 */
export async function loadCalendarBusy(
  payload: Payload,
  range: { rangeStart: string; rangeEnd: string; timeZone: string },
): Promise<CalendarBusyResult> {
  const calendarAuth = await payload.findGlobal({ slug: 'calendar-auth', overrideAccess: true })
  const refreshToken = (calendarAuth as { refreshToken?: unknown }).refreshToken
  if (typeof refreshToken !== 'string' || !refreshToken) {
    return {
      ok: false,
      status: 400,
      error:
        'Google Calendar is not connected. Go to Settings > Google Calendar Auth to connect it.',
    }
  }

  const startedAt = Date.now()
  try {
    const periods = await fetchBusyPeriods(
      refreshToken,
      zonedToUtc(range.rangeStart, 0, range.timeZone),
      zonedToUtc(addDays(range.rangeEnd, 1), 0, range.timeZone),
      range.timeZone,
    )
    const busy = busyRangesFromPeriods(
      periods,
      datesInRange(range.rangeStart, range.rangeEnd),
      range.timeZone,
    )
    console.info('[meeting-availability] calendar busy loaded', {
      rangeStart: range.rangeStart,
      rangeEnd: range.rangeEnd,
      busyRanges: busy.length,
      ms: Date.now() - startedAt,
    })
    return { ok: true, busy, checkedAt: new Date().toISOString() }
  } catch (error) {
    console.error('[meeting-availability] calendar busy failed', {
      rangeStart: range.rangeStart,
      rangeEnd: range.rangeEnd,
      ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    })
    return {
      ok: false,
      status: 502,
      error:
        'Google Calendar could not be read. Try again, or reconnect it in Settings > Google Calendar Auth.',
    }
  }
}
