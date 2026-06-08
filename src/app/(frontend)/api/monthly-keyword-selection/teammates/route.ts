import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { userHasFeature } from '@/lib/access'

/**
 * Return the list of users a reviewer can @-tag on a monthly negative-keyword
 * comment. The Users collection read is admin-only, so this gated endpoint
 * fetches the list with overrideAccess for any tool user — mirroring the
 * server-side mapping in the standalone monthly-keyword-selection page.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: req.headers })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!userHasFeature(user, 'negative-keyword-lists')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const usersResult = await payload.find({
    collection: 'users',
    limit: 500,
    depth: 0,
    overrideAccess: true,
    sort: 'name',
  })
  const teammates = (usersResult.docs as Array<{ id: number | string; name?: string; email?: string }>).map((u) => ({
    id: String(u.id),
    label: u.name || u.email || `User ${u.id}`,
  }))

  return NextResponse.json({ teammates })
}
