import { NextResponse } from 'next/server'
import { createLocalReq, getPayload } from 'payload'
import config from '@/payload.config'
import { validateStagedMeetingScheduler } from '@/lib/agents/adminmate/meeting-scheduler-tools'
import {
  MeetingLinkNotFoundError,
  createMeetingSchedulerFromStaged,
} from '@/lib/agents/adminmate/create-meeting-scheduler'

/**
 * Creates the meeting scheduler the admin confirmed in the AdminMate review
 * card. The staged payload comes from the browser, so it is re-validated
 * through the same field allowlist the agent used.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((user as { role?: string }).role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null)
  let staged
  try {
    staged = validateStagedMeetingScheduler(body)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid meeting scheduler' },
      { status: 400 },
    )
  }

  try {
    const created = await createMeetingSchedulerFromStaged(
      payload,
      staged,
      await createLocalReq({ user }, payload),
    )
    return NextResponse.json({
      ...created,
      adminUrl: `/admin/collections/meeting-schedulers/${created.id}`,
    })
  } catch (error) {
    if (error instanceof MeetingLinkNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error('[adminmate/create-meeting-scheduler] create failed:', error)
    return NextResponse.json(
      { error: 'The meeting scheduler could not be created' },
      { status: 500 },
    )
  }
}
