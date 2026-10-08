import type { Payload } from 'payload'
import type { AdminMateProspect, AdminMateSchedulerSummary } from './meeting-scheduler-tools'

/** Prospects (Client Proposals) in a compact shape, for linking meeting schedulers. */
export async function listMeetingProspects(payload: Payload): Promise<AdminMateProspect[]> {
  const result = await payload.find({
    collection: 'client-proposals',
    sort: 'businessName',
    limit: 1000,
    depth: 0,
    overrideAccess: true,
    select: { businessName: true, contactName: true, contactEmail: true },
  })
  const text = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined
  return result.docs.flatMap((doc) => {
    const businessName = text(doc.businessName)
    if (!businessName) return []
    const contactName = text(doc.contactName)
    const contactEmail = text(doc.contactEmail)
    return [
      {
        id: String(doc.id),
        businessName,
        ...(contactName ? { contactName } : {}),
        ...(contactEmail ? { contactEmail } : {}),
      },
    ]
  })
}

/** Recent meeting schedulers that are not yet confirmed, for sending invites. */
export async function listSendableMeetingSchedulers(
  payload: Payload,
): Promise<AdminMateSchedulerSummary[]> {
  const result = await payload.find({
    collection: 'meeting-schedulers',
    where: { status: { not_in: ['confirmed', 'expired'] } },
    sort: '-updatedAt',
    limit: 50,
    depth: 0,
    overrideAccess: true,
    select: { title: true, status: true, attendees: true },
  })
  return result.docs.map((doc) => ({
    id: String(doc.id),
    title: doc.title,
    status: doc.status,
    attendees: (doc.attendees ?? []).flatMap((attendee) =>
      [attendee.name, attendee.email].filter((value): value is string => Boolean(value)),
    ),
  }))
}
