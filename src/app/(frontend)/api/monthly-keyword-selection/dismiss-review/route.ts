import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { userHasFeature } from '@/lib/access'

const NOTIFICATIONS = 'notifications' as never

function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  if (!year || !month) return yearMonth
  return new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, 1)))
}

/**
 * Dismiss a "needs review" term as feedback. Rather than silently dropping it
 * back to pending, this resolves the term as `skipped`, retains the reviewer's
 * comment, and notifies the auto-tracked original handler (decidedByUserId)
 * plus any manually tagged teammates — so feedback is never lost.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: req.headers })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!userHasFeature(user, 'negative-keyword-lists')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const clientId = Number(body?.clientId)
  const yearMonth = typeof body?.yearMonth === 'string' ? body.yearMonth.trim() : ''
  const searchTerm = typeof body?.searchTerm === 'string' ? body.searchTerm.trim() : ''
  const rowIndex = Number.isInteger(body?.rowIndex) ? Number(body.rowIndex) : null
  const comment = typeof body?.comment === 'string' ? body.comment : ''
  const taggedUserIds = Array.isArray(body?.taggedUserIds)
    ? body.taggedUserIds.map((id: unknown) => String(id)).filter((id: string) => id && id !== 'undefined')
    : []

  if (!Number.isInteger(clientId) || !/^\d{4}-\d{2}$/.test(yearMonth) || !searchTerm) {
    return NextResponse.json({ error: 'clientId, yearMonth and searchTerm are required' }, { status: 400 })
  }
  // A comment is optional: dismissing resolves the term and still notifies the
  // flagger even when no reason text is supplied.

  const existing = await payload.find({
    collection: 'monthly-keyword-selections',
    where: { client: { equals: clientId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const doc = existing.docs[0] as { id: number | string; selections?: Array<Record<string, unknown>> } | undefined
  if (!doc) return NextResponse.json({ error: 'No selections found for client' }, { status: 404 })

  const authorName = (user as { name?: string; email?: string }).name || (user as { email?: string }).email || 'A reviewer'
  const now = new Date().toISOString()
  const taggedCsv = taggedUserIds.join(',')

  let matched = false
  let originalHandlerId: string | null = null
  const selections = (Array.isArray(doc.selections) ? doc.selections : []).map((selection) => {
    const sameTerm = String(selection.yearMonth) === yearMonth
      && String(selection.searchTerm || '').toLowerCase() === searchTerm.toLowerCase()
      && (rowIndex === null || Number(selection.rowIndex ?? 0) === rowIndex)
    if (!sameTerm) return selection
    matched = true
    const decidedBy = selection.decidedByUserId
    originalHandlerId = decidedBy ? String(decidedBy) : null
    return {
      ...selection,
      decision: 'skipped' as const,
      reviewComment: comment,
      reviewCommentBy: authorName,
      reviewCommentAt: now,
      reviewCommentTaggedUserIds: taggedCsv,
      reviewDismissedAt: now,
      reviewDismissedBy: authorName,
    }
  })

  if (!matched) return NextResponse.json({ error: 'Matching term not found' }, { status: 404 })

  await payload.update({
    collection: 'monthly-keyword-selections',
    id: doc.id,
    data: { selections },
    overrideAccess: true,
  })

  // Recipients: the auto-tracked original handler plus any manual tags,
  // de-duplicated and excluding the current user.
  const recipientIds = Array.from(new Set([originalHandlerId, ...taggedUserIds].filter(Boolean) as string[]))
    .filter((id) => String(id) !== String(user.id))

  let notified = 0
  if (recipientIds.length > 0) {
    const client = await payload
      .findByID({ collection: 'clients', id: clientId, depth: 0, overrideAccess: true })
      .catch(() => null) as { name?: string } | null
    const clientName = client?.name || `Client ${clientId}`
    const url = `/admin/monthly-keyword-selection?clientId=${clientId}`
    const reason = comment.trim() ? `: ${comment.trim().slice(0, 140)}` : ' (no comment)'
    const title = comment.trim()
      ? `${authorName} left feedback on a negative keyword — ${clientName}`
      : `${authorName} dismissed a negative keyword you flagged — ${clientName}`
    for (const recipientId of recipientIds) {
      try {
        await payload.create({
          collection: NOTIFICATIONS,
          data: {
            recipient: recipientId,
            kind: 'negative-keywords-needs-review',
            title,
            body: `${monthLabel(yearMonth)} · "${searchTerm}"${reason}`,
            url,
            relatedClient: clientId,
          } as never,
          overrideAccess: true,
        })
        notified += 1
      } catch (err) {
        payload.logger?.warn?.(`[monthly-keyword-dismiss-review] notify failed for ${recipientId}: ${err}`)
      }
    }
  }

  return NextResponse.json({ success: true, notified })
}
