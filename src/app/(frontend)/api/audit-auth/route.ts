import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'

export async function POST(req: NextRequest) {
  const { slug, password } = await req.json()

  if (!slug || !password) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })

  const result = await payload.find({
    collection: 'seo-audits',
    where: { reportSlug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
    select: { reportPassword: true },
  })

  const audit = result.docs[0]
  if (!audit) {
    return NextResponse.json({ ok: false }, { status: 404 })
  }

  const storedPassword = (audit as any).reportPassword
  if (!storedPassword || password === storedPassword) {
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false }, { status: 401 })
}
