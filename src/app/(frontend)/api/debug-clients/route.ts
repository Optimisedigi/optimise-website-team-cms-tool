import { getPayload } from 'payload'
import config from '@payload-config'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const payload = await getPayload({ config })

    // Check all tables
    const tables = await payload.db.drizzle.run(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ) as unknown as { rows: unknown[][] }

    // Check clients columns
    const clientsCols = await payload.db.drizzle.run("PRAGMA table_info(clients)") as unknown as { rows: unknown[][] }

    // Check blog_posts columns
    const blogCols = await payload.db.drizzle.run("PRAGMA table_info(blog_posts)") as unknown as { rows: unknown[][] }

    return NextResponse.json({
      tables: tables.rows.map((r: unknown[]) => r[0]),
      clientColumns: clientsCols.rows.map((r: unknown[]) => r[1]),
      blogPostColumns: blogCols.rows.map((r: unknown[]) => r[1]),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
