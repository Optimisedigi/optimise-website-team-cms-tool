import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { userHasFeature } from '@/lib/access'
import { findSelectionRow, patchSelectionRow } from '@/lib/monthly-keyword-selection-rows'

const SOURCE_FIELD = {
  outcome: 'outcomeComment',
  removed: 'removedComment',
  dismissed: 'reviewComment',
} as const
const NOTIFICATIONS = 'notifications' as never

type OutcomeSource = keyof typeof SOURCE_FIELD

function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  if (!year || !month) return yearMonth
  return new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, 1)))
}

/**
 * Edit the single canonical comment on one Review-outcomes row. The field
 * written depends on which outcome the row was sourced from so the log keeps a
 * single comment per row rather than a thread:
 *   outcome → outcomeComment · removed → removedComment · dismissed → reviewComment
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
  const rowIndex = Number.isInteger(body?.rowIndex) ? Number(body.rowIndex) : 0
  const source = body?.source as OutcomeSource
  const comment = typeof body?.comment === 'string' ? body.comment : ''
  const mode = body?.mode === 'append' ? 'append' : 'replace'
  const taggedUserIds = Array.isArray(body?.taggedUserIds)
    ? body.taggedUserIds.map((id: unknown) => String(id)).filter((id: string) => id && id !== 'undefined')
    : []

  if (!Number.isInteger(clientId) || !/^\d{4}-\d{2}$/.test(yearMonth) || !searchTerm) {
    return NextResponse.json({ error: 'clientId, yearMonth and searchTerm are required' }, { status: 400 })
  }
  if (source !== 'outcome' && source !== 'removed' && source !== 'dismissed') {
    return NextResponse.json({ error: 'source must be one of outcome, removed, dismissed' }, { status: 400 })
  }

  const field = SOURCE_FIELD[source]
  const authorName = (user as { name?: string; email?: string }).name || (user as { email?: string }).email || 'A reviewer'
  const now = new Date().toISOString()
  let followUps: Array<Record<string, unknown>> = []
  const existingRow = await findSelectionRow(payload, clientId, yearMonth, searchTerm, rowIndex)
  if (!existingRow) return NextResponse.json({ error: 'Matching outcome not found' }, { status: 404 })

  if (mode === 'append') {
    followUps = [
      ...(Array.isArray(existingRow.outcomeFollowUpComments) ? existingRow.outcomeFollowUpComments as Array<Record<string, unknown>> : []),
      { comment, by: authorName, byUserId: String(user.id), at: now, taggedUserIds: taggedUserIds.join(',') },
    ]
  }

  const patched = await patchSelectionRow(payload, clientId, yearMonth, searchTerm, rowIndex, mode === 'append'
    ? { outcomeFollowUpComments: followUps }
    : { [field]: comment })

  if (!patched) return NextResponse.json({ error: 'Matching outcome not found' }, { status: 404 })

  let notified = 0
  if (mode === 'append' && taggedUserIds.length > 0 && comment.trim()) {
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
            title: `${authorName} retagged you on a negative keyword — ${clientName}`,
            body: `${monthLabel(yearMonth)} · "${searchTerm}": ${comment.slice(0, 140)}`,
            url,
            relatedClient: clientId,
          } as never,
          overrideAccess: true,
        })
        notified += 1
      } catch (err) {
        payload.logger?.warn?.(`[monthly-keyword-outcome-comment] notify failed for ${recipientId}: ${err}`)
      }
    }
  }

  return NextResponse.json({ success: true, followUps, notified })
}
