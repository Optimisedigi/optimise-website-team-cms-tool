import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { userHasFeature } from '@/lib/access'
import { logActivity } from '@/lib/activity-log'

type MatchType = 'exact' | 'broad' | 'phrase'

type KeywordSelection = {
  yearMonth?: string
  searchTerm?: string
  rowIndex?: number
  keyword: string
  matchType: MatchType
  appliedToNKL?: number | string | null
}

const VALID_MATCH_TYPES = new Set(['exact', 'broad', 'phrase'])

const NOTIFICATIONS = 'notifications' as never

// NKL ids are integers. Payload's relationship field rejects a numeric *string*
// id ("4") with "field is invalid", so coerce digit-only strings back to a
// number before persisting them onto the selection row.
function asNklId(value: number | string | null | undefined): number | string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return value
  return /^\d+$/.test(value) ? Number(value) : value
}

function keywordMatchKey(keyword: string, matchType: string): string {
  return `${keyword.trim().toLowerCase()}|${matchType.trim().toLowerCase()}`
}

function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  if (!year || !month) return yearMonth
  return new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, 1)))
}

function normaliseKeyword(value: any, fallbackNklId?: number | string | null): KeywordSelection | null {
  const keyword = typeof value?.negativeKeyword === 'string'
    ? value.negativeKeyword.trim()
    : typeof value?.keyword === 'string'
      ? value.keyword.trim()
      : ''
  const matchType = typeof value?.matchType === 'string' && VALID_MATCH_TYPES.has(value.matchType)
    ? value.matchType as MatchType
    : 'exact'
  const rawAppliedToNKL = typeof value?.appliedToNKL === 'object' && value.appliedToNKL !== null ? value.appliedToNKL.id : value?.appliedToNKL
  const appliedToNKL = typeof rawAppliedToNKL === 'string' || typeof rawAppliedToNKL === 'number' ? rawAppliedToNKL : fallbackNklId || null
  if (!keyword || !appliedToNKL) return null
  return {
    yearMonth: typeof value?.yearMonth === 'string' ? value.yearMonth : undefined,
    searchTerm: typeof value?.searchTerm === 'string' ? value.searchTerm : undefined,
    rowIndex: Number.isFinite(Number(value?.rowIndex)) ? Math.trunc(Number(value.rowIndex)) : 0,
    keyword,
    matchType,
    appliedToNKL,
  }
}

export async function POST(req: NextRequest) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: req.headers })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!userHasFeature(user, 'negative-keyword-lists')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const clientId = Number(body?.clientId)
  const fallbackNklId = body?.nklId
  const comment = typeof body?.comment === 'string' ? body.comment.trim() : ''
  const keywords = Array.isArray(body?.selections)
    ? body.selections.map((selection: unknown) => normaliseKeyword(selection, fallbackNklId)).filter(Boolean) as KeywordSelection[]
    : []

  if (!Number.isInteger(clientId) || keywords.length === 0) {
    return NextResponse.json({ error: 'clientId and selections with target NKLs are required' }, { status: 400 })
  }

  const byNkl = new Map<string, { id: number | string; keywords: KeywordSelection[] }>()
  for (const keyword of keywords) {
    const nklId = keyword.appliedToNKL as number | string
    const nklKey = String(nklId)
    const group = byNkl.get(nklKey) || { id: nklId, keywords: [] }
    group.keywords.push(keyword)
    byNkl.set(nklKey, group)
  }

  const now = new Date().toISOString()
  const applierName = user.name || user.email || 'A reviewer'
  const applierUserId = String(user.id)
  const nklNameById = new Map<string, string>()
  let applied = 0
  let skipped = 0

  for (const { id: nklId, keywords: nklKeywords } of byNkl.values()) {
    const nkl = await payload.findByID({
      collection: 'negative-keyword-lists',
      id: nklId,
      depth: 0,
      overrideAccess: true,
    }) as any
    if (!nkl) return NextResponse.json({ error: `NKL ${nklId} not found` }, { status: 404 })
    nklNameById.set(String(nklId), typeof nkl.name === 'string' && nkl.name ? nkl.name : `List ${nklId}`)

    const nklClientId = typeof nkl.client === 'object' ? Number(nkl.client?.id) : Number(nkl.client)
    if (nklClientId !== clientId) {
      return NextResponse.json({ error: `NKL ${nklId} does not belong to client` }, { status: 400 })
    }

    const currentKeywords = Array.isArray(nkl.keywords) ? nkl.keywords : []
    const existingSet = new Set(currentKeywords.map((kw: any) => keywordMatchKey(String(kw.keyword || ''), String(kw.matchType || ''))))
    const dedupIncoming = new Map<string, { keyword: string; matchType: MatchType }>()
    for (const keyword of nklKeywords) {
      dedupIncoming.set(keywordMatchKey(keyword.keyword, keyword.matchType), keyword)
    }

    const newKeywords = Array.from(dedupIncoming.values())
      .filter((kw) => !existingSet.has(keywordMatchKey(kw.keyword, kw.matchType)))
      .map((kw) => ({
        keyword: kw.keyword,
        matchType: kw.matchType,
        flaggedForRemoval: false,
        negatedAt: now,
      }))

    if (newKeywords.length > 0) {
      await payload.update({
        collection: 'negative-keyword-lists',
        id: nklId,
        data: { keywords: [...currentKeywords, ...newKeywords] },
        overrideAccess: true,
      })
    }

    applied += newKeywords.length
    skipped += nklKeywords.length - newKeywords.length
  }

  const selectionDoc = await payload.find({
    collection: 'monthly-keyword-selections',
    where: { client: { equals: clientId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const doc = selectionDoc.docs[0] as any
  if (doc) {
    const appliedSelectionKeys = new Map(
      keywords
        .filter((keyword) => keyword.yearMonth && keyword.searchTerm)
        .map((keyword) => [`${keyword.yearMonth}|${String(keyword.searchTerm).toLowerCase()}|${Number(keyword.rowIndex ?? 0)}`, keyword.appliedToNKL] as [string, number | string | null | undefined]),
    )
    const appliedKeywordKeys = new Map(
      keywords.map((keyword) => [keywordMatchKey(keyword.keyword, keyword.matchType), keyword.appliedToNKL] as [string, number | string | null | undefined]),
    )
    // Collect the flaggers we need to notify (a needs-review term applied here
    // is an "Added" teaching moment for whoever flagged it).
    const addedNotifications: { recipient: string; term: string; yearMonth: string; detail: string }[] = []
    // Tally the original reviewers (decidedBy — whoever first made the
    // add/skip decision in the monthly review) so the activity entry credits
    // them alongside the applier.
    const reviewerCounts = new Map<string, number>()
    const selections = (Array.isArray(doc.selections) ? doc.selections : []).map((selection: any) => {
      const selectionKey = `${String(selection.yearMonth)}|${String(selection.searchTerm || '').toLowerCase()}|${Number(selection.rowIndex ?? 0)}`
      const keywordKey = keywordMatchKey(String(selection.negativeKeyword || ''), String(selection.matchType || ''))
      const appliedToNKL = appliedSelectionKeys.get(selectionKey) || appliedKeywordKeys.get(keywordKey)
      if (!appliedToNKL) {
        // Untouched row: still coerce any legacy numeric-string id so a corrupted
        // sibling can't fail the whole-array re-validation.
        const existingId = asNklId(selection.appliedToNKL ?? null)
        return existingId === selection.appliedToNKL ? selection : { ...selection, appliedToNKL: existingId }
      }
      // Preserve the original submitter: only stamp appliedBy/appliedByUserId
      // when not already set on a previously-applied selection.
      const appliedBy = selection.appliedByUserId ? selection.appliedBy : applierName
      const appliedByUserId = selection.appliedByUserId ? selection.appliedByUserId : applierUserId
      const reviewer = typeof selection.decidedBy === 'string' && selection.decidedBy ? selection.decidedBy : 'Unknown reviewer'
      reviewerCounts.set(reviewer, (reviewerCounts.get(reviewer) || 0) + 1)
      const wasNeedsReview = selection.decision === 'needs_review'
      const next: any = {
        ...selection,
        decision: 'approved',
        appliedToNKL: asNklId(appliedToNKL),
        appliedAt: now,
        appliedBy,
        appliedByUserId,
      }
      if (wasNeedsReview) {
        // Record an "added" outcome so the original flagger can see what happened.
        const nklName = nklNameById.get(String(appliedToNKL)) || `List ${appliedToNKL}`
        const detail = `added to ${nklName} (${selection.matchType})`
        next.outcomeType = 'added'
        next.outcomeDetail = detail
        next.outcomeComment = comment || null
        next.outcomeBy = applierName
        next.outcomeByUserId = applierUserId
        next.outcomeAt = now
        const flaggerId = selection.decidedByUserId ? String(selection.decidedByUserId) : ''
        if (flaggerId && flaggerId !== applierUserId) {
          addedNotifications.push({
            recipient: flaggerId,
            term: String(selection.searchTerm || selection.negativeKeyword || ''),
            yearMonth: String(selection.yearMonth || ''),
            detail,
          })
        }
      }
      return next
    })
      // Drop the array sub-row `id` so Payload's SQLite array re-insert assigns
      // fresh unique ids. Preserving a stored duplicate id triggers
      // `UNIQUE constraint failed: monthly_keyword_selections_selections.id`.
      .map(({ id, ...rest }: { id?: unknown }) => rest)
    await payload.update({
      collection: 'monthly-keyword-selections',
      id: doc.id,
      data: { selections },
      overrideAccess: true,
    })

    // One change-history entry per apply: who pressed Apply, which lists, and
    // who originally reviewed the terms (so credit isn't lost to the applier).
    try {
      const listNames = Array.from(nklNameById.values()).join(', ')
      const reviewedBy = Array.from(reviewerCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => `${name} (${count})`)
        .join(', ')
      await logActivity(payload, {
        type: 'monthly_negative_applied',
        title: `Applied ${applied} monthly negative${applied === 1 ? '' : 's'} (${skipped} already on list)`,
        description: `Lists: ${listNames || '—'}. Reviewed by: ${reviewedBy || '—'}. Applied by: ${applierName}.`,
        user: typeof user.id === 'object' ? (user.id as { id: string | number }).id : user.id,
        client: clientId,
      })
    } catch (err) {
      payload.logger?.warn?.(`[monthly-keyword-apply] activity log failed: ${err}`)
    }

    // Notify each flagger that the negative they flagged was added to a list.
    if (addedNotifications.length > 0) {
      const client = await payload
        .findByID({ collection: 'clients', id: clientId, depth: 0, overrideAccess: true })
        .catch(() => null) as { name?: string } | null
      const clientName = client?.name || `Client ${clientId}`
      for (const note of addedNotifications) {
        const body = `${monthLabel(note.yearMonth)} · "${note.term}" → ${note.detail}${comment ? `: ${comment.slice(0, 140)}` : ''}`
        try {
          await payload.create({
            collection: NOTIFICATIONS,
            data: {
              recipient: note.recipient,
              kind: 'negative-keywords-needs-review',
              title: `${applierName} added a negative you flagged — ${clientName}`,
              body,
              url: `/admin/monthly-keyword-selection?clientId=${clientId}`,
              relatedClient: clientId,
            } as never,
            overrideAccess: true,
          })
        } catch (err) {
          payload.logger?.warn?.(`[monthly-keyword-apply] notify failed for ${note.recipient}: ${err}`)
        }
      }
    }
  }

  return NextResponse.json({
    success: true,
    applied,
    skipped,
  })
}
