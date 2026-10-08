import type { Payload, PayloadRequest } from 'payload'
import type { StagedMeetingScheduler } from './meeting-scheduler-tools'
import {
  buildAvailability,
  cellKey,
  CELL_MINUTES,
  defaultDayWindow,
  type MeetingAvailability,
} from '../../meeting-availability'
import { loadCalendarBusy } from '../../meeting-availability-calendar'

function toMinutes(hhmm: string): number {
  const [hours = 0, minutes = 0] = hhmm.split(':').map(Number)
  return hours * 60 + minutes
}

/**
 * Availability grid for the dictated dates: only the spoken windows open,
 * minus Google Calendar busy times. A preferred start becomes favourite cells.
 * If the calendar can't be read the grid is still created, unchecked, so the
 * admin can press "Check available times" on the scheduler.
 */
async function availabilityFromStaged(
  payload: Payload,
  staged: StagedMeetingScheduler,
): Promise<MeetingAvailability> {
  const dates = staged.dates.map((row) => row.date).sort()
  const rangeStart = dates[0] ?? ''
  const rangeEnd = dates[dates.length - 1] ?? rangeStart
  const windows = staged.dates.map((row) => ({
    date: row.date,
    startMinutes: Math.ceil(toMinutes(row.start) / CELL_MINUTES) * CELL_MINUTES,
    endMinutes: Math.floor(toMinutes(row.end) / CELL_MINUTES) * CELL_MINUTES,
  }))
  const defaults = defaultDayWindow()
  const duration = Number(staged.durationMinutes)
  const favourites = staged.dates.flatMap((row) => {
    if (!row.preferred) return []
    const start = Math.floor(toMinutes(row.preferred) / CELL_MINUTES) * CELL_MINUTES
    const cells: string[] = []
    for (let minutes = start; minutes < start + duration; minutes += CELL_MINUTES) {
      cells.push(cellKey(row.date, minutes))
    }
    return cells
  })
  const calendar = await loadCalendarBusy(payload, {
    rangeStart,
    rangeEnd,
    timeZone: staged.timezone,
  })
  return buildAvailability({
    rangeStart,
    rangeEnd,
    dayStartMinutes: Math.min(defaults.dayStartMinutes, ...windows.map((w) => w.startMinutes)),
    dayEndMinutes: Math.max(defaults.dayEndMinutes, ...windows.map((w) => w.endMinutes)),
    busy: calendar.ok ? calendar.busy : [],
    timeZone: staged.timezone,
    now: new Date(),
    checkedAt: calendar.ok ? calendar.checkedAt : '',
    windows,
    favourites,
  })
}

export class MeetingLinkNotFoundError extends Error {
  constructor(kind: 'client' | 'prospect') {
    super(
      `The linked ${kind === 'client' ? 'client' : 'client proposal'} no longer exists. Remove it and try again.`,
    )
    this.name = 'MeetingLinkNotFoundError'
  }
}

/**
 * Writes an admin-confirmed staged meeting scheduler using only the AdminMate
 * field allowlist. Attendee tokens and the offered meeting times are derived by
 * the collection hook; invites are still sent from the scheduler's own button.
 */
export async function createMeetingSchedulerFromStaged(
  payload: Payload,
  staged: StagedMeetingScheduler,
  req: PayloadRequest,
): Promise<{ id: number | string; title: string }> {
  let client:
    | { relationTo: 'clients'; value: number }
    | { relationTo: 'client-proposals'; value: number }
    | null = null
  if (staged.link) {
    const id = Number(staged.link.id)
    client =
      staged.link.kind === 'client'
        ? { relationTo: 'clients', value: id }
        : { relationTo: 'client-proposals', value: id }
    const exists = await payload
      .findByID({ collection: client.relationTo, id, depth: 0, overrideAccess: false, req })
      .catch(() => null)
    if (!exists) throw new MeetingLinkNotFoundError(staged.link.kind)
  }

  const created = await payload.create({
    collection: 'meeting-schedulers',
    data: {
      title: staged.title,
      status: 'draft',
      client,
      durationMinutes: staged.durationMinutes,
      meetingTopic: staged.meetingTopic ?? null,
      timezone: staged.timezone,
      availability: { ...(await availabilityFromStaged(payload, staged)) },
      attendees: staged.attendees.map((attendee) => ({
        name: attendee.name,
        email: attendee.email,
        internalConfirmed: attendee.internalConfirmed,
      })),
    },
    depth: 0,
    overrideAccess: false,
    req,
  })
  return { id: created.id, title: created.title }
}
