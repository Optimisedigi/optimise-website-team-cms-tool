import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { migrations } from '@/migrations'

/**
 * Runs Payload's registered migrations (everything in src/migrations/index.ts
 * that hasn't been applied to the DB's `payload_migrations` table yet).
 *
 * The custom /api/migrate endpoint does raw SQL adds for legacy columns, but
 * it does NOT invoke Payload's own migration registry. On Vercel serverless,
 * `migrateOnInit` never fires, so registered migrations would never run
 * without this endpoint.
 *
 * POST /api/migrate/payload
 *   - header x-api-key: <AUDIT_API_KEY>  (CI/script access)
 *   - OR a valid admin session cookie (logged-in browser access)
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const apiKey = request.headers.get('x-api-key')
  const hasApiKey = apiKey && apiKey === process.env.AUDIT_API_KEY

  let payload: Awaited<ReturnType<typeof getPayload>>

  if (hasApiKey) {
    // API key auth — used by CI scripts
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  } else {
    // Require an active admin session as fallback — used by logged-in browser
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { user } = await payload.auth({ headers: (request as any).headers })
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    // Pass migrations explicitly: on Vercel the source `src/migrations/*.ts`
    // files aren't on disk at runtime, so payload.db.migrate() with no args
    // would log "No migration directory found". Importing the index gives us
    // the up/down functions directly.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await payload.db.migrate({ migrations: migrations as any })
    return NextResponse.json({
      ok: true,
      message: 'Payload migrations applied (see server logs for per-migration details).',
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    payload.logger.error({ err: e, msg: 'Payload migrate failed' })
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
