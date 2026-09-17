import config from '@/payload.config'
import { userHasFeature } from '@/lib/access'
import { createLocalReq, getPayload } from 'payload'
import { NextResponse } from 'next/server'

const MAX_CLIENTS_PER_REQUEST = 1000

export async function POST(request: Request) {
  try {
    const requestOrigin = request.headers.get('origin')
    if (requestOrigin && requestOrigin !== new URL(request.url).origin) {
      return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })
    }

    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      return NextResponse.json({ error: 'Expected a JSON request.' }, { status: 415 })
    }

    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: request.headers })
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!userHasFeature(user, 'nav:client-pulse')) {
      return NextResponse.json(
        { error: 'You do not have access to Client Pulse.' },
        { status: 403 },
      )
    }

    const body = (await request.json().catch(() => null)) as { clientIds?: unknown } | null
    if (
      !body ||
      !Array.isArray(body.clientIds) ||
      body.clientIds.length > MAX_CLIENTS_PER_REQUEST
    ) {
      return NextResponse.json({ error: 'Choose between 1 and 1000 clients.' }, { status: 400 })
    }

    const clientIds = [...new Set(body.clientIds)]
      .map((id) => (typeof id === 'number' ? id : Number.NaN))
      .filter((id) => Number.isSafeInteger(id) && id > 0)
    if (clientIds.length === 0 || clientIds.length !== new Set(body.clientIds).size) {
      return NextResponse.json({ error: 'One or more client IDs are invalid.' }, { status: 400 })
    }

    const req = await createLocalReq({ user }, payload)
    const clients = await payload.find({
      collection: 'clients',
      depth: 0,
      limit: clientIds.length,
      pagination: false,
      where: {
        and: [
          { id: { in: clientIds } },
          { isActive: { not_equals: false } },
          { 'clientPulse.enabled': { not_equals: true } },
        ],
      },
      select: { id: true, clientPulse: true },
      overrideAccess: false,
      req,
    })

    for (const client of clients.docs) {
      await payload.update({
        collection: 'clients',
        id: client.id,
        data: {
          clientPulse: {
            ...(client.clientPulse ?? {}),
            enabled: true,
          },
        },
        overrideAccess: false,
        req,
      })
    }

    return NextResponse.json({ added: clients.docs.length })
  } catch (error) {
    console.error('[client-pulse/clients] Failed to add clients:', error)
    return NextResponse.json({ error: 'Could not add clients to Client Pulse.' }, { status: 500 })
  }
}
