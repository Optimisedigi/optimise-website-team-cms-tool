import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { userHasFeature } from '@/lib/access'

export async function POST(req: NextRequest) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: req.headers })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!userHasFeature(user, 'negative-keyword-lists')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if ((user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const clientId = Number(body?.clientId)
  if (!Number.isInteger(clientId)) {
    return NextResponse.json({ error: 'Invalid clientId' }, { status: 400 })
  }

  const result = await payload.delete({
    collection: 'monthly-keyword-terms-cache',
    where: { client: { equals: clientId } },
    overrideAccess: true,
  })

  return NextResponse.json({
    success: true,
    deleted: Array.isArray((result as any)?.docs) ? (result as any).docs.length : 0,
  })
}
