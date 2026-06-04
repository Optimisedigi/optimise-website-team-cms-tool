import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { warmMonthlyKeywordTermsForClient } from '@/lib/monthly-keyword-terms-warmer'

export async function GET(req: NextRequest) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: req.headers })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const clientIdParam = req.nextUrl.searchParams.get('clientId')
  const customerId = req.nextUrl.searchParams.get('customerId') || ''
  const slug = req.nextUrl.searchParams.get('slug') || ''
  const monthsBack = Math.min(36, Math.max(1, parseInt(req.nextUrl.searchParams.get('monthsBack') || '36', 10) || 36))

  if (!clientIdParam || !customerId || !slug) {
    return NextResponse.json({ error: 'Missing clientId, customerId, or slug' }, { status: 400 })
  }

  const clientId = Number(clientIdParam)
  if (!Number.isInteger(clientId)) {
    return NextResponse.json({ error: 'Invalid clientId' }, { status: 400 })
  }

  const result = await warmMonthlyKeywordTermsForClient(payload, clientId, customerId, slug, monthsBack)
  const out = NextResponse.json({
    success: !result.error,
    months: result.months,
    selections: result.selections,
    misses: result.misses,
    missingMonths: result.missingMonths,
    error: result.error,
  })
  out.headers.set('Cache-Control', 'no-store')
  return out
}
