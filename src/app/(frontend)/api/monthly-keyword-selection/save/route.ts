import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import type { MonthlyKeywordSelectionRow } from '@/lib/monthly-keyword-terms-warmer'

const VALID_MATCH_TYPES = new Set(['broad', 'phrase', 'exact'])
const VALID_DECISIONS = new Set(['pending', 'approved', 'skipped'])

function normaliseSelection(value: any): MonthlyKeywordSelectionRow | null {
  const yearMonth = typeof value?.yearMonth === 'string' ? value.yearMonth.trim() : ''
  const searchTerm = typeof value?.searchTerm === 'string' ? value.searchTerm.trim() : ''
  const negativeKeyword = typeof value?.negativeKeyword === 'string' ? value.negativeKeyword.trim() : searchTerm
  const matchType = typeof value?.matchType === 'string' && VALID_MATCH_TYPES.has(value.matchType) ? value.matchType : 'exact'
  const decision = typeof value?.decision === 'string' && VALID_DECISIONS.has(value.decision) ? value.decision : 'pending'

  if (!/^\d{4}-\d{2}$/.test(yearMonth) || !searchTerm || !negativeKeyword) return null
  return { yearMonth, searchTerm, negativeKeyword, matchType, decision } as MonthlyKeywordSelectionRow
}

export async function POST(req: NextRequest) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: req.headers })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const clientId = Number(body?.clientId)
  if (!Number.isInteger(clientId)) {
    return NextResponse.json({ error: 'Invalid clientId' }, { status: 400 })
  }

  const incoming = Array.isArray(body?.selections) ? body.selections.map(normaliseSelection).filter(Boolean) as MonthlyKeywordSelectionRow[] : []

  const existingResult = await payload.find({
    collection: 'monthly-keyword-selections',
    where: { client: { equals: clientId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const existingDoc = existingResult.docs[0] as any
  const existingSelections = Array.isArray(existingDoc?.selections) ? existingDoc.selections : []
  const byTerm = new Map<string, any>()

  for (const selection of existingSelections) {
    byTerm.set(`${selection.yearMonth}|${String(selection.searchTerm).toLowerCase()}`, selection)
  }
  for (const selection of incoming) {
    const key = `${selection.yearMonth}|${selection.searchTerm.toLowerCase()}`
    byTerm.set(key, { ...(byTerm.get(key) || {}), ...selection })
  }

  const selections = Array.from(byTerm.values()).sort((a, b) =>
    String(a.yearMonth).localeCompare(String(b.yearMonth)) || String(a.searchTerm).localeCompare(String(b.searchTerm)),
  )

  const doc = existingDoc
    ? await payload.update({
        collection: 'monthly-keyword-selections',
        id: existingDoc.id,
        data: { selections },
        overrideAccess: true,
      })
    : await payload.create({
        collection: 'monthly-keyword-selections',
        data: { client: clientId, status: 'active', selections },
        overrideAccess: true,
      })

  return NextResponse.json({ success: true, selectionCount: selections.length, docId: doc.id })
}
