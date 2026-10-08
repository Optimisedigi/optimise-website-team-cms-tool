import type { Payload } from 'payload'
import type { AdminMateProspect } from './meeting-scheduler-tools'

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
