import { getPayload } from 'payload'
import config from '@payload-config'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const payload = await getPayload({ config })

    // Check actual table schema
    const schema = await payload.db.drizzle.run(
      "PRAGMA table_info(clients)"
    ) as unknown

    // Check if gsc_snapshots table exists
    let gscTable = null
    try {
      gscTable = await payload.db.drizzle.run(
        "PRAGMA table_info(gsc_snapshots)"
      ) as unknown
    } catch (e: unknown) {
      gscTable = { error: e instanceof Error ? e.message : String(e) }
    }

    // Try a basic query without new columns
    let basicQuery = null
    try {
      basicQuery = await payload.db.drizzle.run(
        'SELECT id, name, slug FROM clients LIMIT 1'
      ) as unknown
    } catch (e: unknown) {
      basicQuery = { error: e instanceof Error ? e.message : String(e) }
    }

    return NextResponse.json({ clientsSchema: schema, gscSnapshotsSchema: gscTable, basicQuery })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined
    return NextResponse.json({ success: false, error: message, stack }, { status: 500 })
  }
}
