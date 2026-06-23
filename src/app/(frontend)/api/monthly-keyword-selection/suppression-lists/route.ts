import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { userHasFeature } from '@/lib/access'

function normalizeSubmittedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const ids: string[] = []
  const seen = new Set<string>()
  for (const raw of value) {
    if (typeof raw !== 'string' && typeof raw !== 'number') continue
    const id = String(raw).trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

export async function POST(req: NextRequest) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: req.headers })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!userHasFeature(user, 'negative-keyword-lists')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const clientId = Number(body?.clientId)
  if (!Number.isInteger(clientId)) {
    return NextResponse.json({ error: 'Invalid clientId' }, { status: 400 })
  }

  const submittedIds = normalizeSubmittedIds(body?.suppressionNklIds)

  const nklResult = await payload.find({
    collection: 'negative-keyword-lists',
    where: {
      and: [
        { client: { equals: clientId } },
        { isActive: { equals: true } },
      ],
    },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })
  const activeIds = new Set(nklResult.docs.map((doc) => String(doc.id)))
  const validIds = submittedIds.filter((id) => activeIds.has(id))

  const existingResult = await payload.find({
    collection: 'monthly-keyword-selections',
    where: { client: { equals: clientId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const existingDoc = existingResult.docs[0]
  const data = {
    suppressionNklIdsConfigured: true,
    suppressionNklIds: validIds.join(','),
  }

  if (existingDoc) {
    await payload.update({
      collection: 'monthly-keyword-selections',
      id: existingDoc.id,
      data,
      overrideAccess: true,
    })
  } else {
    await payload.create({
      collection: 'monthly-keyword-selections',
      data: { client: clientId, status: 'active', ...data },
      overrideAccess: true,
    })
  }

  return NextResponse.json({ success: true, suppressionNklIds: validIds })
}
