import { getPayload } from 'payload'
import config from '@payload-config'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const payload = await getPayload({ config })

    // Raw SQL query to see actual date values in the clients table
    const raw = await payload.db.drizzle.run(
      'SELECT id, name, gscTokenExpiry, gscLastSync, createdAt, updatedAt FROM clients LIMIT 5'
    ) as unknown

    // Also try selecting just non-date fields to confirm it's a date issue
    let nonDateResult = null
    try {
      const r = await payload.find({
        collection: 'clients',
        depth: 0,
        limit: 1,
        overrideAccess: true,
        select: { name: true, slug: true, isActive: true },
      })
      nonDateResult = { success: true, totalDocs: r.totalDocs }
    } catch (e: unknown) {
      nonDateResult = { success: false, error: e instanceof Error ? e.message : String(e) }
    }

    return NextResponse.json({ raw, nonDateResult })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined
    return NextResponse.json({ success: false, error: message, stack }, { status: 500 })
  }
}
