import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { userHasFeature } from '@/lib/access'
import { patchSelectionRow } from '@/lib/monthly-keyword-selection-rows'

const NOTIFICATIONS = 'notifications' as never

function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  if (!year || !month) return yearMonth
  return new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, 1)))
}

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
  // Optional sub-row index: when present the comment is scoped to one negative
  // of the term; when absent (legacy clients) it falls back to matching the term.
  const rowIndex = Number.isInteger(body?.rowIndex) ? Number(body.rowIndex) : null
  const comment = typeof body?.comment === 'string' ? body.comment : ''
  const taggedUserIds = Array.isArray(body?.taggedUserIds)
    ? body.taggedUserIds.map((id: unknown) => String(id)).filter((id: string) => id && id !== 'undefined')
    : []

  if (!Number.isInteger(clientId) || !/^\d{4}-\d{2}$/.test(yearMonth) || !searchTerm) {
    return NextResponse.json({ error: 'clientId, yearMonth and searchTerm are required' }, { status: 400 })
  }

  const authorName = (user as { name?: string; email?: string }).name || (user as { email?: string }).email || 'A reviewer'
  const now = new Date().toISOString()
  const taggedCsv = taggedUserIds.join(',')

  const patched = await patchSelectionRow(payload, clientId, yearMonth, searchTerm, rowIndex, {
    reviewComment: comment,
    reviewCommentBy: authorName,
    reviewCommentAt: now,
    reviewCommentTaggedUserIds: taggedCsv,
  })

  if (!patched) return NextResponse.json({ error: 'Matching term not found' }, { status: 404 })

  // Fan out a bell notification to each tagged teammate (skip self).
  let notified = 0
  if (taggedUserIds.length > 0 && comment.trim()) {
    const client = await payload
      .findByID({ collection: 'clients', id: clientId, depth: 0, overrideAccess: true })
      .catch(() => null) as { name?: string } | null
    const clientName = client?.name || `Client ${clientId}`
    const url = `/admin/monthly-keyword-selection?clientId=${clientId}`
    for (const recipientId of taggedUserIds) {
      if (String(recipientId) === String(user.id)) continue
      try {
        await payload.create({
          collection: NOTIFICATIONS,
          data: {
            recipient: recipientId,
            kind: 'negative-keywords-needs-review',
            title: `${authorName} tagged you on a negative keyword — ${clientName}`,
            body: `${monthLabel(yearMonth)} · "${searchTerm}": ${comment.slice(0, 140)}`,
            url,
            relatedClient: clientId,
          } as never,
          overrideAccess: true,
        })
        notified += 1
      } catch (err) {
        payload.logger?.warn?.(`[monthly-keyword-comment] notify failed for ${recipientId}: ${err}`)
      }
    }
  }

  return NextResponse.json({ success: true, reviewCommentBy: authorName, reviewCommentAt: now, notified })
}
