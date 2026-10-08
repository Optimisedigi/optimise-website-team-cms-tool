import type { Payload, PayloadRequest } from 'payload'
import { generateScheduleInviteEmail } from './schedule-email'

export interface InviteAttendeePreview {
  name: string
  email: string
  /** Optimise Digital team members get no invite. */
  internalConfirmed: boolean
  /** Already emailed at least once (a send re-sends to them too). */
  alreadySent: boolean
  responded: boolean
}

/** What AdminMate shows before sending a scheduler's invites. */
export interface MeetingInvitePreview {
  schedulerId: string
  title: string
  durationMinutes: string
  meetingTopic?: string
  timezone: string
  status: string
  offeredTimes: number
  firstTime?: string
  lastTime?: string
  attendees: InviteAttendeePreview[]
  adminUrl: string
}

export type SendInvitesResult =
  | {
      ok: true
      sentCount: number
      results: Array<{ email: string; ok: boolean; error?: string }>
    }
  | { ok: false; status: 400 | 404 | 500; error: string }

interface SchedulerDoc {
  id: number | string
  title: string
  durationMinutes?: string | null
  meetingTopic?: string | null
  timezone?: string | null
  status?: string | null
  generatedSlots?: Array<{ slot?: string | null } | string> | null
  attendees?: Array<Record<string, any>> | null
}

function slotIso(entry: { slot?: string | null } | string): string | undefined {
  if (typeof entry === 'string') return entry
  return typeof entry?.slot === 'string' ? entry.slot : undefined
}

export function invitePreviewFromDoc(doc: SchedulerDoc): MeetingInvitePreview {
  const slots = (doc.generatedSlots ?? [])
    .map(slotIso)
    .filter((slot): slot is string => Boolean(slot))
    .sort()
  return {
    schedulerId: String(doc.id),
    title: doc.title,
    durationMinutes: String(doc.durationMinutes || '30'),
    ...(doc.meetingTopic ? { meetingTopic: doc.meetingTopic } : {}),
    timezone: doc.timezone || 'Australia/Sydney',
    status: doc.status || 'draft',
    offeredTimes: slots.length,
    ...(slots[0] ? { firstTime: slots[0] } : {}),
    ...(slots.length ? { lastTime: slots[slots.length - 1] } : {}),
    attendees: (doc.attendees ?? []).flatMap((attendee) =>
      typeof attendee?.email === 'string' && attendee.email
        ? [
            {
              name: typeof attendee.name === 'string' ? attendee.name : '',
              email: attendee.email,
              internalConfirmed: attendee.internalConfirmed === true,
              alreadySent: Boolean(attendee.emailSentAt),
              responded: attendee.responded === true,
            },
          ]
        : [],
    ),
    adminUrl: `/admin/collections/meeting-schedulers/${doc.id}`,
  }
}

function publicBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SERVER_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : 'http://localhost:3004')
  )
}

/**
 * Emails each external attendee their private scheduling link via Brevo, then
 * records who was sent and moves the scheduler to "Invites Sent". Shared by
 * the scheduler page's button and AdminMate.
 */
export async function sendSchedulerInvites(
  payload: Payload,
  id: string | number,
  options: { req?: PayloadRequest; fetchImpl?: typeof fetch } = {},
): Promise<SendInvitesResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  let doc: SchedulerDoc
  try {
    doc = (await payload.findByID({
      collection: 'meeting-schedulers',
      id,
      overrideAccess: true,
    })) as unknown as SchedulerDoc
  } catch {
    return { ok: false, status: 404, error: 'Not found' }
  }

  if (!doc.generatedSlots || doc.generatedSlots.length === 0) {
    return {
      ok: false,
      status: 400,
      error: 'Check available times and save them before sending invites.',
    }
  }
  const attendees = doc.attendees ?? []
  if (attendees.length === 0) {
    return { ok: false, status: 400, error: 'Add at least one attendee before sending invites.' }
  }
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) return { ok: false, status: 500, error: 'BREVO_API_KEY not configured' }

  const baseUrl = publicBaseUrl()
  const fromEmail = process.env.SCHEDULE_FROM_EMAIL || 'meetings@optimisedigital.online'
  const results: Array<{ email: string; ok: boolean; error?: string }> = []

  for (const attendee of attendees) {
    if (!attendee.email || !attendee.token || attendee.internalConfirmed) continue
    const scheduleUrl = `${baseUrl}/schedule/${attendee.token}`
    const startedAt = Date.now()
    try {
      const res = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { name: 'Optimise Digital', email: fromEmail },
          to: [{ email: attendee.email, name: attendee.name || 'there' }],
          subject: `Meeting scheduling: ${doc.title}`,
          // Tag carries the scheduler id + attendee token so the Brevo delivery
          // webhook can match events back to the exact attendee row.
          tags: [`msched:${id}:${attendee.token}`],
          htmlContent: generateScheduleInviteEmail({
            recipientName: attendee.name || 'there',
            meetingTitle: doc.title,
            meetingTopic: doc.meetingTopic ?? undefined,
            durationMinutes: doc.durationMinutes || '30',
            attendeeEmails: attendees.map((a) => a.email).filter(Boolean),
            scheduleUrl,
          }),
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        console.error('[meeting-invites] Brevo send failed', {
          schedulerId: id,
          email: attendee.email,
          status: res.status,
          ms: Date.now() - startedAt,
          body: text.slice(0, 500),
        })
        results.push({ email: attendee.email, ok: false, error: `Brevo ${res.status}` })
      } else {
        results.push({ email: attendee.email, ok: true })
      }
    } catch (error) {
      results.push({
        email: attendee.email,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const now = new Date().toISOString()
  const updatedAttendees = attendees.map((a) => {
    const sent = results.find((r) => r.email === a.email && r.ok)
    return {
      ...a,
      emailSentAt: sent ? now : a.emailSentAt,
      // Reset to "sent" so a re-send clears any prior bounce until the webhook
      // reports the new outcome.
      deliveryStatus: sent ? 'sent' : a.deliveryStatus,
      deliveryDetail: sent ? null : a.deliveryDetail,
      deliveryUpdatedAt: sent ? now : a.deliveryUpdatedAt,
    }
  })

  await payload.update({
    collection: 'meeting-schedulers',
    id,
    data: { attendees: updatedAttendees, status: 'invites_sent' } as never,
    ...(options.req ? { req: options.req } : {}),
  })

  return { ok: true, sentCount: results.filter((r) => r.ok).length, results }
}

export interface InviteEditsInput {
  title: string
  durationMinutes: string
  meetingTopic?: string
  attendees: Array<{ name: string; email: string; internalConfirmed: boolean }>
}

export class SchedulerNotSendableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SchedulerNotSendableError'
  }
}

/**
 * Saves the admin's edits from the send-invites card. Existing attendees are
 * matched by email so their private link and any responses are kept; new
 * attendees get a fresh link from the collection hook.
 */
export async function applyInviteEdits(
  payload: Payload,
  id: string | number,
  edits: InviteEditsInput,
  req: PayloadRequest,
): Promise<void> {
  const doc = (await payload.findByID({
    collection: 'meeting-schedulers',
    id,
    depth: 0,
    overrideAccess: false,
    req,
  })) as unknown as SchedulerDoc
  if (doc.status === 'confirmed')
    throw new SchedulerNotSendableError('This meeting is already confirmed.')

  const existing = new Map(
    (doc.attendees ?? []).map((attendee) => [String(attendee.email ?? '').toLowerCase(), attendee]),
  )
  const attendees = edits.attendees.map((attendee) => {
    const previous = existing.get(attendee.email.toLowerCase())
    return previous
      ? { ...previous, name: attendee.name, internalConfirmed: attendee.internalConfirmed }
      : {
          name: attendee.name,
          email: attendee.email,
          internalConfirmed: attendee.internalConfirmed,
        }
  })

  await payload.update({
    collection: 'meeting-schedulers',
    id,
    data: {
      title: edits.title,
      durationMinutes: edits.durationMinutes,
      meetingTopic: edits.meetingTopic ?? null,
      attendees,
    } as never,
    depth: 0,
    overrideAccess: false,
    req,
  })
}
