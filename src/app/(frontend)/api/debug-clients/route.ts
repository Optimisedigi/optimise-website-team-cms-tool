import { getPayload } from 'payload'
import config from '@payload-config'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const payload = await getPayload({ config })
    const result = await payload.find({
      collection: 'clients',
      depth: 0,
      limit: 1,
      overrideAccess: true,
    })
    return NextResponse.json({ success: true, totalDocs: result.totalDocs, firstDoc: result.docs[0] ? Object.keys(result.docs[0]) : [] })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined
    return NextResponse.json({ success: false, error: message, stack }, { status: 500 })
  }
}
