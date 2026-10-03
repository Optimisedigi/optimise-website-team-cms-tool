import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { sendDueScheduledOneOffPayments } from '@/lib/hosting-one-off-issue'

export const maxDuration = 120

function isCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!secret || !token) return false
  const expected = Buffer.from(secret)
  const provided = Buffer.from(token)
  return expected.length === provided.length && crypto.timingSafeEqual(expected, provided)
}

/**
 * Vercel Cron: emails one-off payment links whose scheduled send time has
 * passed. Authenticated by the `CRON_SECRET` bearer token Vercel sends.
 */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET)
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  if (!isCron(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const started = Date.now()
  const payload = await getPayload({ config: await config })
  const summary = await sendDueScheduledOneOffPayments(payload, new Date())
  console.info('[hosting-one-off-payments] scheduled send run', {
    ...summary,
    elapsedMs: Date.now() - started,
  })
  return NextResponse.json(summary)
}
