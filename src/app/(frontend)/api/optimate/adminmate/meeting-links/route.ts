import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { listExistingClients } from '@/lib/agents/adminmate/list-clients'
import { listMeetingProspects } from '@/lib/agents/adminmate/list-prospects'

/**
 * Clients and prospects (Client Proposals) for the meeting card's
 * "Client or prospect" dropdown. Names and contact emails only.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((user as { role?: string }).role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [clients, prospects] = await Promise.all([
    listExistingClients(payload),
    listMeetingProspects(payload),
  ])
  return NextResponse.json({
    clients: clients.map((client) => ({
      id: client.id,
      name: client.name,
      ...(client.contactName ? { contactName: client.contactName } : {}),
      ...(client.contactEmail ? { contactEmail: client.contactEmail } : {}),
    })),
    prospects,
  })
}
