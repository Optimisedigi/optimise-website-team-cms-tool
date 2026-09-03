import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { userHasFeature } from '@/lib/access'
import { findSelectionRow, patchSelectionRow } from '@/lib/monthly-keyword-selection-rows'
import { notifyTaggedUsers, resolveMentionableUserIds } from '@/lib/monthly-keyword-mentions'

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

  if (!Number.isInteger(clientId) || !/^\d{4}-\d{2}$/.test(yearMonth) || !searchTerm) {
    return NextResponse.json({ error: 'clientId, yearMonth and searchTerm are required' }, { status: 400 })
  }

  const authorName = (user as { name?: string; email?: string }).name || (user as { email?: string }).email || 'A reviewer'
  const now = new Date().toISOString()
  const taggedUserIds = await resolveMentionableUserIds(payload, body?.taggedUserIds, String(user.id))

  const existingRow = rowIndex === null ? null : await findSelectionRow(payload, clientId, yearMonth, searchTerm, rowIndex)
  const patched = await patchSelectionRow(payload, clientId, yearMonth, searchTerm, rowIndex, {
    decision: 'skipped',
    reviewComment: comment,
    reviewCommentBy: authorName,
    reviewCommentAt: now,
    reviewCommentTaggedUserIds: taggedUserIds.join(','),
    reviewDismissedAt: now,
    reviewDismissedBy: authorName,
  })
  const originalHandlerId = existingRow?.decidedByUserId ? String(existingRow.decidedByUserId) : patched?.decidedByUserId ? String(patched.decidedByUserId) : null

  if (!patched) return NextResponse.json({ error: 'Matching term not found' }, { status: 404 })

  const recipientIds = Array.from(new Set([originalHandlerId, ...taggedUserIds].filter(Boolean) as string[]))
  const notified = await notifyTaggedUsers(payload, {
    recipientIds,
    actorId: String(user.id),
    authorName,
    clientId,
    yearMonth,
    searchTerm,
    comment,
    title: (clientName) => comment.trim()
      ? `${authorName} left feedback on a negative keyword — ${clientName}`
      : `${authorName} dismissed a negative keyword you flagged — ${clientName}`,
  })

  return NextResponse.json({ success: true, notified })
}
