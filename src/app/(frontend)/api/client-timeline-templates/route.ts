import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'

export async function GET() {
  try {
    const payload = await getPayload({ config })
    const result = await payload.find({
      collection: 'client-timeline-templates' as any,
      depth: 2,
      limit: 100,
      where: { isActive: { equals: true } },
    })
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 })
  }
}
