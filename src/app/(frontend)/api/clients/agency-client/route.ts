import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: req.headers })

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await payload.find({
    collection: 'clients',
    where: { isAgency: { equals: true } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    select: {
      name: true,
    } as never,
  })

  const client = result.docs[0] as { id: number | string; name?: string | null } | undefined
  return NextResponse.json({
    client: client
      ? {
          id: client.id,
          name: client.name ?? null,
        }
      : null,
  })
}
