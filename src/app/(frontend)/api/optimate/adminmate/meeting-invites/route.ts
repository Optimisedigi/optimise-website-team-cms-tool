import { NextResponse } from 'next/server'
import { createLocalReq, getPayload } from 'payload'
import config from '@/payload.config'
import { validateInviteEdits } from '@/lib/agents/adminmate/meeting-scheduler-tools'
import {
  applyInviteEdits,
  invitePreviewFromDoc,
  SchedulerNotSendableError,
  sendSchedulerInvites,
} from '@/lib/meeting-scheduler-invites'

async function adminUser(request: Request) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user)
    return { payload, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if ((user as { role?: string }).role !== 'admin')
    return { payload, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { payload, user }
}

/** Details AdminMate shows on the send-invites card before anything is emailed. */
export async function GET(request: Request): Promise<NextResponse> {
  const { payload, user, error } = await adminUser(request)
  if (error) return error
  const id = new URL(request.url).searchParams.get('id') ?? ''
  if (!/^\d+$/.test(id))
    return NextResponse.json({ error: 'Invalid scheduler id' }, { status: 400 })
  try {
    const doc = await payload.findByID({
      collection: 'meeting-schedulers',
      id,
      depth: 0,
      overrideAccess: false,
      user,
    })
    return NextResponse.json(invitePreviewFromDoc(doc as never))
  } catch {
    return NextResponse.json({ error: 'Meeting scheduler not found' }, { status: 404 })
  }
}

/**
 * Saves the admin's confirmed edits, then emails each external attendee their
 * private scheduling link. Only runs after the admin presses Send (or says
 * "send it") on the card.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const { payload, user, error } = await adminUser(request)
  if (error) return error

  let edits
  try {
    edits = validateInviteEdits(await request.json().catch(() => null))
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'Invalid invite details' },
      { status: 400 },
    )
  }

  const req = await createLocalReq({ user }, payload)
  try {
    await applyInviteEdits(payload, edits.schedulerId, edits, req)
  } catch (cause) {
    if (cause instanceof SchedulerNotSendableError)
      return NextResponse.json({ error: cause.message }, { status: 409 })
    console.error('[adminmate/meeting-invites] saving edits failed:', cause)
    return NextResponse.json({ error: 'The meeting details could not be saved' }, { status: 500 })
  }

  const result = await sendSchedulerInvites(payload, edits.schedulerId, { req })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  const failed = result.results.filter((entry) => !entry.ok).map((entry) => entry.email)
  return NextResponse.json({
    sentCount: result.sentCount,
    failed,
    adminUrl: `/admin/collections/meeting-schedulers/${edits.schedulerId}`,
  })
}
