import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { userHasFeature } from '@/lib/access'
import { patchSelectionRow } from '@/lib/monthly-keyword-selection-rows'
import { notifyTaggedUsers, resolveMentionableUserIds } from '@/lib/monthly-keyword-mentions'

/**
 * Save a reviewer comment against a single monthly "needs review" term and
 * notify any tagged teammates. Kept separate from the bulk /save autosave so
 * notifications only fire on an explicit comment post, never per keystroke.
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

  const patched = await patchSelectionRow(payload, clientId, yearMonth, searchTerm, rowIndex, {
    reviewComment: comment,
    reviewCommentBy: authorName,
    reviewCommentAt: now,
    reviewCommentTaggedUserIds: taggedUserIds.join(','),
  })

  if (!patched) return NextResponse.json({ error: 'Matching term not found' }, { status: 404 })

  const notified = comment.trim()
    ? await notifyTaggedUsers(payload, {
        recipientIds: taggedUserIds,
        actorId: String(user.id),
        authorName,
        clientId,
        yearMonth,
        searchTerm,
        comment,
      })
    : 0

  return NextResponse.json({ success: true, reviewCommentBy: authorName, reviewCommentAt: now, notified })
}
