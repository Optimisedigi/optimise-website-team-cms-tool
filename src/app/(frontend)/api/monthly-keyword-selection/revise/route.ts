import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { userHasFeature } from '@/lib/access'
import { findSelectionRow, patchSelectionRow } from '@/lib/monthly-keyword-selection-rows'

const NOTIFICATIONS = 'notifications' as never

function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  if (!year || !month) return yearMonth
  return new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, 1)))
}

type MatchType = 'exact' | 'broad' | 'phrase'
type NklKeyword = { keyword?: string; matchType?: MatchType; flaggedForRemoval?: boolean | null; negatedAt?: string | null; id?: string | null }

const VALID_MATCH_TYPES = new Set<MatchType>(['exact', 'broad', 'phrase'])

function nklIdOf(value: unknown): string | null {
  if (value && typeof value === 'object' && 'id' in value) return String((value as { id: unknown }).id)
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  return null
}

// NKL ids are integers. Payload's relationship field rejects a numeric *string*
// id ("4") with "field is invalid", so store a number when the id is digit-only.
function asNklId(value: string | null): number | string | null {
  if (value === null) return null
  return /^\d+$/.test(value) ? Number(value) : value
}

async function notifySubmitter(
  payload: Awaited<ReturnType<typeof getPayload>>,
  args: {
    recipient: string
    title: string
    yearMonth: string
    searchTerm: string
    detail: string
    comment: string
    clientId: number
  },
): Promise<boolean> {
  const client = await payload
    .findByID({ collection: 'clients', id: args.clientId, depth: 0, overrideAccess: true })
    .catch(() => null) as { name?: string } | null
  const clientName = client?.name || `Client ${args.clientId}`
  const body = `${monthLabel(args.yearMonth)} · "${args.searchTerm}": ${args.detail}${args.comment ? ` · ${args.comment.slice(0, 140)}` : ''}`
  try {
    await payload.create({
      collection: NOTIFICATIONS,
      data: {
        recipient: args.recipient,
        kind: 'negative-keywords-removed',
        title: `${args.title} — ${clientName}`,
        body,
        url: `/admin/monthly-keyword-selection?clientId=${args.clientId}`,
        relatedClient: args.clientId,
      } as never,
      overrideAccess: true,
    })
    return true
  } catch (err) {
    payload.logger?.warn?.(`[monthly-keyword-revise] notify failed for ${args.recipient}: ${err}`)
    return false
  }
}

/**
 * Safety-net revisions for negatives already applied to an NKL, driven from the
 * "Submitted negatives" tab.
 *
 *  - action 'remove': delete just this keyword+matchType from its NKL and mark
 *    the selection skipped so the term stays hidden in future months.
 *  - action 'update': replace the keyword text and/or match type in place inside
 *    the same NKL, keeping the selection applied. When `newNklId` differs from
 *    the current list the negative is moved — removed from the old NKL and added
 *    to the new one — and the selection's appliedToNKL is repointed.
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
  const action = body?.action === 'remove' || body?.action === 'update' ? body.action : null
  const newKeyword = typeof body?.newKeyword === 'string' ? body.newKeyword.trim() : ''
  const newMatchType = typeof body?.newMatchType === 'string' && VALID_MATCH_TYPES.has(body.newMatchType as MatchType)
    ? body.newMatchType as MatchType
    : null
  const newNklId = nklIdOf(body?.newNklId)
  const rowIndex = Number.isInteger(body?.rowIndex) ? Number(body.rowIndex) : null
  const comment = typeof body?.comment === 'string' ? body.comment.trim() : ''

  if (!Number.isInteger(clientId) || !/^\d{4}-\d{2}$/.test(yearMonth) || !searchTerm || !action) {
    return NextResponse.json({ error: 'clientId, yearMonth, searchTerm and a valid action are required' }, { status: 400 })
  }
  if (action === 'update' && (!newKeyword || !newMatchType)) {
    return NextResponse.json({ error: 'update requires newKeyword and newMatchType' }, { status: 400 })
  }

  try {
  const target = await findSelectionRow(payload, clientId, yearMonth, searchTerm, rowIndex)
  if (!target) return NextResponse.json({ error: 'Matching term not found' }, { status: 404 })

  const nklId = nklIdOf(target.appliedToNKL)
  if (!nklId) return NextResponse.json({ error: 'Term is not applied to a negative keyword list' }, { status: 400 })

  const oldKeyword = String(target.negativeKeyword || '').trim()
  const oldMatchType = String(target.matchType || 'exact') as MatchType

  const nkl = await payload.findByID({
    collection: 'negative-keyword-lists',
    id: nklId,
    depth: 0,
    overrideAccess: true,
  }).catch(() => null) as { id: number | string; name?: string; client?: unknown; keywords?: NklKeyword[] } | null
  if (!nkl) return NextResponse.json({ error: 'Negative keyword list not found' }, { status: 404 })

  const nklClientId = nkl.client && typeof nkl.client === 'object' ? Number((nkl.client as { id: unknown }).id) : Number(nkl.client)
  if (nklClientId !== clientId) {
    return NextResponse.json({ error: 'NKL does not belong to client' }, { status: 400 })
  }

  const currentKeywords: NklKeyword[] = Array.isArray(nkl.keywords) ? nkl.keywords : []
  const matchesOld = (kw: NklKeyword): boolean =>
    String(kw.keyword || '').toLowerCase() === oldKeyword.toLowerCase() && String(kw.matchType) === oldMatchType

  const now = new Date().toISOString()
  const actorName = (user as { name?: string; email?: string }).name || (user as { email?: string }).email || 'A reviewer'
  const actorUserId = String(user.id)
  const submitterUserId = target.appliedByUserId ? String(target.appliedByUserId) : ''

  if (action === 'remove') {
    const nextKeywords = currentKeywords.filter((kw) => !matchesOld(kw))
    await payload.update({
      collection: 'negative-keyword-lists',
      id: nklId,
      data: { keywords: nextKeywords },
      overrideAccess: true,
    })
    const removerName = (user as { name?: string; email?: string }).name || (user as { email?: string }).email || 'A reviewer'
    const appliedByUserId = target.appliedByUserId ? String(target.appliedByUserId) : ''
    // Keep the original submitter (appliedBy/appliedByUserId) intact so the
    // "Removed negatives explained" tab can attribute who first submitted it.
    await patchSelectionRow(payload, clientId, yearMonth, searchTerm, rowIndex, {
      decision: 'skipped',
      appliedToNKL: null,
      appliedAt: null,
      removedComment: comment || target.removedComment || null,
      removedBy: removerName,
      removedByUserId: String(user.id),
      removedAt: now,
    })

    // Notify the original submitter so new team members understand why a
    // negative they applied was removed. Only when a reason was given and the
    // submitter is someone other than the remover.
    let notified = false
    if (comment && appliedByUserId && appliedByUserId !== String(user.id)) {
      const client = await payload
        .findByID({ collection: 'clients', id: clientId, depth: 0, overrideAccess: true })
        .catch(() => null) as { name?: string } | null
      const clientName = client?.name || `Client ${clientId}`
      try {
        await payload.create({
          collection: NOTIFICATIONS,
          data: {
            recipient: appliedByUserId,
            kind: 'negative-keywords-removed',
            title: `${removerName} removed a negative you submitted — ${clientName}`,
            body: `${monthLabel(yearMonth)} · "${searchTerm}": ${comment.slice(0, 140)}`,
            url: `/admin/monthly-keyword-selection?clientId=${clientId}`,
            relatedClient: clientId,
          } as never,
          overrideAccess: true,
        })
        notified = true
      } catch (err) {
        payload.logger?.warn?.(`[monthly-keyword-revise] notify failed for ${appliedByUserId}: ${err}`)
      }
    }

    return NextResponse.json({ success: true, action, removed: currentKeywords.length - nextKeywords.length, notified })
  }

  // action === 'update' with a different target NKL — move the negative between
  // lists: remove it from the old NKL and add the (possibly edited) keyword to
  // the new one, then point the selection at the new list.
  if (newNklId && newNklId !== nklId && newMatchType) {
    const newNkl = await payload.findByID({
      collection: 'negative-keyword-lists',
      id: newNklId,
      depth: 0,
      overrideAccess: true,
    }).catch(() => null) as { id: number | string; name?: string; client?: unknown; keywords?: NklKeyword[] } | null
    if (!newNkl) return NextResponse.json({ error: 'Target negative keyword list not found' }, { status: 404 })

    const newNklClientId = newNkl.client && typeof newNkl.client === 'object' ? Number((newNkl.client as { id: unknown }).id) : Number(newNkl.client)
    if (newNklClientId !== clientId) {
      return NextResponse.json({ error: 'Target NKL does not belong to client' }, { status: 400 })
    }

    // Remove the negative from the old list, matching either the original
    // keyword/matchType or the freshly-edited values when edited in the same
    // request.
    const matchesEdited = (kw: NklKeyword): boolean =>
      String(kw.keyword || '').toLowerCase() === newKeyword.toLowerCase() && String(kw.matchType) === newMatchType
    const removedKeywords = currentKeywords.filter((kw) => !matchesOld(kw) && !matchesEdited(kw))
    await payload.update({
      collection: 'negative-keyword-lists',
      id: nklId,
      data: { keywords: removedKeywords },
      overrideAccess: true,
    })

    // Add to the new list, deduping if the keyword already exists there.
    const targetKeywords: NklKeyword[] = Array.isArray(newNkl.keywords) ? newNkl.keywords : []
    const alreadyPresent = targetKeywords.some((kw) => matchesEdited(kw))
    if (!alreadyPresent) {
      await payload.update({
        collection: 'negative-keyword-lists',
        id: newNklId,
        data: { keywords: [...targetKeywords, { keyword: newKeyword, matchType: newMatchType, flaggedForRemoval: false, negatedAt: now }] },
        overrideAccess: true,
      })
    }

    const oldNklName = nkl.name || `List ${nklId}`
    const newNklName = newNkl.name || `List ${newNklId}`
    // The list move is always recorded; when the keyword text and/or match type
    // also changed in the same action, append that before→after so the Review
    // outcomes tab can flag "negative keyword changed" alongside the move.
    const moveKwParts: string[] = []
    if (oldKeyword.toLowerCase() !== newKeyword.toLowerCase()) moveKwParts.push(`${oldKeyword} → ${newKeyword}`)
    if (oldMatchType !== newMatchType) moveKwParts.push(`${oldMatchType} → ${newMatchType}`)
    const moveDetail = `${oldNklName} → ${newNklName}${moveKwParts.length ? ` · ${moveKwParts.join(' · ')}` : ''}`
    await patchSelectionRow(payload, clientId, yearMonth, searchTerm, rowIndex, {
      negativeKeyword: newKeyword,
      matchType: newMatchType,
      decision: 'approved',
      appliedToNKL: asNklId(newNklId),
      appliedAt: now,
      outcomeType: 'moved',
      outcomeDetail: moveDetail,
      outcomeComment: comment || null,
      outcomeBy: actorName,
      outcomeByUserId: actorUserId,
      outcomeAt: now,
    })

    let notified = false
    if (submitterUserId && submitterUserId !== actorUserId) {
      notified = await notifySubmitter(payload, {
        recipient: submitterUserId,
        title: `${actorName} moved a negative you submitted`,
        yearMonth,
        searchTerm,
        detail: moveDetail,
        comment,
        clientId,
      })
    }

    return NextResponse.json({ success: true, action, moved: true, deduped: alreadyPresent, notified })
  }

  // action === 'update' — replace keyword/matchType in place inside the NKL.
  const duplicate = currentKeywords.some((kw) =>
    !matchesOld(kw)
    && String(kw.keyword || '').toLowerCase() === newKeyword.toLowerCase()
    && String(kw.matchType) === newMatchType,
  )
  let replaced = false
  const nextKeywords = currentKeywords
    .map((kw) => {
      if (!matchesOld(kw)) return kw
      replaced = true
      // If the revised keyword already exists elsewhere in the list, drop this
      // entry instead of creating a duplicate.
      if (duplicate) return null
      return { ...kw, keyword: newKeyword, matchType: newMatchType }
    })
    .filter((kw): kw is NklKeyword => kw !== null)

  if (!replaced) {
    return NextResponse.json({ error: 'Keyword no longer present in the list' }, { status: 409 })
  }

  await payload.update({
    collection: 'negative-keyword-lists',
    id: nklId,
    data: { keywords: nextKeywords },
    overrideAccess: true,
  })

  // Build a human before→after summary covering keyword text and/or match type.
  const updateParts: string[] = []
  if (oldKeyword.toLowerCase() !== newKeyword.toLowerCase()) updateParts.push(`${oldKeyword} → ${newKeyword}`)
  if (oldMatchType !== newMatchType) updateParts.push(`${oldMatchType} → ${newMatchType}`)
  const updateDetail = updateParts.length > 0 ? updateParts.join(' · ') : `${newKeyword} (${newMatchType})`

  await patchSelectionRow(payload, clientId, yearMonth, searchTerm, rowIndex, {
    negativeKeyword: newKeyword,
    matchType: newMatchType,
    appliedAt: now,
    outcomeType: 'updated',
    outcomeDetail: updateDetail,
    outcomeComment: comment || null,
    outcomeBy: actorName,
    outcomeByUserId: actorUserId,
    outcomeAt: now,
  })

  let notified = false
  if (submitterUserId && submitterUserId !== actorUserId) {
    notified = await notifySubmitter(payload, {
      recipient: submitterUserId,
      title: `${actorName} updated a negative you submitted`,
      yearMonth,
      searchTerm,
      detail: updateDetail,
      comment,
      clientId,
    })
  }

  return NextResponse.json({ success: true, action, deduped: duplicate, notified })
  } catch (err) {
    // Surface the real failure instead of a bare 500 (which the client shows as
    // a generic "Revision failed"). Logged for server-side diagnosis.
    const message = err instanceof Error ? err.message : String(err)
    payload.logger?.error?.(`[monthly-keyword-revise] ${action} failed for client ${clientId} · "${searchTerm}": ${message}`)
    return NextResponse.json({ error: `Revision failed: ${message}` }, { status: 500 })
  }
}
