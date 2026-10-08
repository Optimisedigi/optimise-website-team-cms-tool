import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { userHasFeature } from '@/lib/access'
import { loadCalendarBusy } from '@/lib/meeting-availability-calendar'
import { datesInRange, isRealDate, MAX_RANGE_DAYS } from '@/lib/meeting-availability'

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-AU', { timeZone: value })
    return true
  } catch {
    return false
  }
}

/**
 * Busy times on the connected Google Calendar for a date range, for the
 * meeting scheduler's availability grid. Only users who can manage meeting
 * schedulers may read them.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!userHasFeature(user, 'meeting-schedulers'))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const rangeStart = typeof body?.rangeStart === 'string' ? body.rangeStart : ''
  const rangeEnd = typeof body?.rangeEnd === 'string' ? body.rangeEnd : ''
  const timeZone =
    typeof body?.timezone === 'string' && body.timezone ? body.timezone : 'Australia/Sydney'
  if (!isRealDate(rangeStart) || !isRealDate(rangeEnd))
    return NextResponse.json({ error: 'Choose a start and end date.' }, { status: 400 })
  if (rangeEnd < rangeStart)
    return NextResponse.json(
      { error: 'The end date must be on or after the start date.' },
      { status: 400 },
    )
  if (datesInRange(rangeStart, rangeEnd).length > MAX_RANGE_DAYS)
    return NextResponse.json(
      { error: `Choose a range of ${MAX_RANGE_DAYS} days or fewer.` },
      { status: 400 },
    )
  if (!isTimeZone(timeZone))
    return NextResponse.json({ error: 'The scheduler timezone is not valid.' }, { status: 400 })

  const result = await loadCalendarBusy(payload, { rangeStart, rangeEnd, timeZone })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ busy: result.busy, checkedAt: result.checkedAt })
}
