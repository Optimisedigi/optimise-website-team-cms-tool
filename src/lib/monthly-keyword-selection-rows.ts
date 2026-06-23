import type { Payload } from 'payload'
import type { MonthlyKeywordSelectionRow } from './monthly-keyword-terms-warmer'

export type MonthlyKeywordSelectionRowDoc = MonthlyKeywordSelectionRow & Record<string, any> & {
  id?: string | number
  client?: string | number | { id?: string | number } | null
  searchTermKey?: string
  rowKey?: string
  keywordKey?: string | null
  createdAt?: string
  updatedAt?: string
}

type PayloadUser = { id?: string | number; name?: string | null; email?: string | null }

type SelectionDeletion = { yearMonth: string; searchTerm: string; rowIndex?: number }

const ROWS_COLLECTION = 'monthly-keyword-selection-rows' as const
const VALID_NON_PENDING = new Set(['approved', 'skipped', 'watch', 'needs_review'])
const DEFAULT_WATCH_HORIZON = 3

function addMonthsIso(from: Date, months: number): string {
  const next = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, from.getUTCDate()))
  return next.toISOString()
}

export function normaliseSearchTermKey(searchTerm: string): string {
  return searchTerm.toLowerCase().trim().replace(/\s+/g, ' ')
}

export function keywordKey(negativeKeyword: string, matchType: string): string {
  return `${negativeKeyword.toLowerCase().trim().replace(/\s+/g, ' ')}|${String(matchType || 'exact').toLowerCase().trim()}`
}

export function selectionRowKey(clientId: number | string, yearMonth: string, searchTerm: string, rowIndex = 0): string {
  return `${clientId}|${yearMonth}|${normaliseSearchTermKey(searchTerm)}|${Number(rowIndex || 0)}`
}

function relationId(value: unknown): string | number | null {
  if (value && typeof value === 'object' && 'id' in value) return (value as { id?: string | number }).id ?? null
  if (typeof value === 'string' || typeof value === 'number') return value
  return null
}

function asNklId(value: unknown): number | string | null {
  const id = relationId(value)
  if (id === null) return null
  return typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : id
}

function cleanUndefined<T extends Record<string, unknown>>(value: T): T {
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) delete value[key]
  }
  return value
}

export function rowDocToSelection(row: MonthlyKeywordSelectionRowDoc): MonthlyKeywordSelectionRow {
  return cleanUndefined({
    yearMonth: row.yearMonth,
    searchTerm: row.searchTerm,
    rowIndex: Number(row.rowIndex ?? 0),
    negativeKeyword: row.negativeKeyword,
    matchType: row.matchType,
    decision: row.decision,
    appliedToNKL: asNklId(row.appliedToNKL),
    appliedAt: row.appliedAt ?? null,
    watchHorizonMonths: row.watchHorizonMonths ?? null,
    watchUntil: row.watchUntil ?? null,
    appliedBy: row.appliedBy ?? null,
    appliedByUserId: row.appliedByUserId ?? null,
    removedComment: row.removedComment ?? null,
    removedBy: row.removedBy ?? null,
    removedByUserId: row.removedByUserId ?? null,
    removedAt: row.removedAt ?? null,
    decidedBy: row.decidedBy ?? null,
    decidedByUserId: row.decidedByUserId ?? null,
    reviewDismissedAt: row.reviewDismissedAt ?? null,
    reviewDismissedBy: row.reviewDismissedBy ?? null,
    reviewComment: row.reviewComment ?? null,
    reviewCommentBy: row.reviewCommentBy ?? null,
    reviewCommentAt: row.reviewCommentAt ?? null,
    reviewCommentTaggedUserIds: row.reviewCommentTaggedUserIds ?? null,
    outcomeType: row.outcomeType ?? null,
    outcomeDetail: row.outcomeDetail ?? null,
    outcomeComment: row.outcomeComment ?? null,
    outcomeBy: row.outcomeBy ?? null,
    outcomeByUserId: row.outcomeByUserId ?? null,
    outcomeAt: row.outcomeAt ?? null,
    outcomeFollowUpComments: row.outcomeFollowUpComments ?? undefined,
  } as Record<string, unknown>) as MonthlyKeywordSelectionRow
}

export function selectionToRowData(clientId: number, selection: MonthlyKeywordSelectionRow): MonthlyKeywordSelectionRowDoc {
  const rowIndex = Number(selection.rowIndex ?? 0)
  const searchTermKey = normaliseSearchTermKey(selection.searchTerm)
  return cleanUndefined({
    ...selection,
    client: clientId,
    rowIndex,
    searchTermKey,
    rowKey: selectionRowKey(clientId, selection.yearMonth, selection.searchTerm, rowIndex),
    keywordKey: keywordKey(selection.negativeKeyword, selection.matchType),
    appliedToNKL: asNklId(selection.appliedToNKL),
  } as Record<string, unknown>) as MonthlyKeywordSelectionRowDoc
}

export function legacyArrayRowsToRowRecords(clientId: number, rows: MonthlyKeywordSelectionRow[]): MonthlyKeywordSelectionRowDoc[] {
  return rows.map((row) => selectionToRowData(clientId, row))
}

async function findAllPages(payload: Payload, where: Record<string, unknown>, limit = 1000): Promise<MonthlyKeywordSelectionRowDoc[]> {
  const docs: MonthlyKeywordSelectionRowDoc[] = []
  let page = 1
  for (;;) {
    const result = await payload.find({
      collection: ROWS_COLLECTION,
      where,
      limit,
      page,
      depth: 0,
      overrideAccess: true,
    } as never) as unknown as { docs?: MonthlyKeywordSelectionRowDoc[]; totalPages?: number; hasNextPage?: boolean }
    docs.push(...(Array.isArray(result.docs) ? result.docs : []))
    if (result.hasNextPage === false || (result.totalPages && page >= result.totalPages) || (!result.totalPages && !result.hasNextPage)) break
    page += 1
  }
  return docs
}

export async function findSelectionRows(payload: Payload, clientId: number): Promise<MonthlyKeywordSelectionRowDoc[]> {
  return findAllPages(payload, { client: { equals: clientId } })
}

export async function findSelectionRow(payload: Payload, clientId: number, yearMonth: string, searchTerm: string, rowIndex: number | null = 0): Promise<MonthlyKeywordSelectionRowDoc | null> {
  const where = rowIndex === null
    ? { and: [{ client: { equals: clientId } }, { yearMonth: { equals: yearMonth } }, { searchTermKey: { equals: normaliseSearchTermKey(searchTerm) } }] }
    : { rowKey: { equals: selectionRowKey(clientId, yearMonth, searchTerm, rowIndex) } }
  const result = await payload.find({
    collection: ROWS_COLLECTION,
    where,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never) as unknown as { docs?: MonthlyKeywordSelectionRowDoc[] }
  return result.docs?.[0] ?? null
}

export async function findSelectionRowsByKeys(payload: Payload, clientId: number, rowKeys: string[]): Promise<MonthlyKeywordSelectionRowDoc[]> {
  const unique = Array.from(new Set(rowKeys.filter(Boolean)))
  if (unique.length === 0) return []
  try {
    return await findAllPages(payload, { and: [{ client: { equals: clientId } }, { rowKey: { in: unique } }] }, 1000)
  } catch {
    const allRows = await findSelectionRows(payload, clientId)
    const keySet = new Set(unique)
    return allRows.filter((row) => row.rowKey && keySet.has(row.rowKey))
  }
}

function shouldStampDecider(prev: MonthlyKeywordSelectionRowDoc | undefined, next: MonthlyKeywordSelectionRowDoc): boolean {
  return typeof next.decision === 'string'
    && VALID_NON_PENDING.has(next.decision)
    && (prev?.decision !== next.decision || !prev?.decidedByUserId)
}

function userName(user?: PayloadUser | null): string | null {
  return user?.name || user?.email || null
}

function mergeRow(prev: MonthlyKeywordSelectionRowDoc | undefined, incoming: MonthlyKeywordSelectionRowDoc, user?: PayloadUser | null): MonthlyKeywordSelectionRowDoc {
  const merged = cleanUndefined({ ...(prev || {}), ...incoming } as Record<string, unknown>) as MonthlyKeywordSelectionRowDoc
  if (user && shouldStampDecider(prev, merged)) {
    merged.decidedByUserId = String(user.id)
    merged.decidedBy = userName(user)
  }
  if (merged.decision === 'watch') {
    const horizon = Number.isFinite(Number(merged.watchHorizonMonths)) ? Number(merged.watchHorizonMonths) : DEFAULT_WATCH_HORIZON
    const horizonChanged = Number(prev?.watchHorizonMonths) !== horizon
    merged.watchHorizonMonths = horizon
    merged.watchUntil = incoming.watchUntil || (prev?.decision === 'watch' && prev.watchUntil && !horizonChanged ? prev.watchUntil : addMonthsIso(new Date(), horizon))
  } else {
    merged.watchHorizonMonths = null
    merged.watchUntil = null
  }
  merged.appliedToNKL = asNklId(merged.appliedToNKL)
  return stripServerManagedFields(merged)
}

function stripServerManagedFields<T extends MonthlyKeywordSelectionRowDoc>(row: T): T {
  const { id, createdAt, updatedAt, ...rest } = row
  return rest as T
}

export async function upsertSelectionRows(
  payload: Payload,
  clientId: number,
  incomingRows: MonthlyKeywordSelectionRow[],
  user?: PayloadUser | null,
): Promise<MonthlyKeywordSelectionRowDoc[]> {
  const incoming = incomingRows.map((row) => selectionToRowData(clientId, row))
  if (incoming.length === 0) return []
  const existing = await findSelectionRowsByKeys(payload, clientId, incoming.map((row) => row.rowKey || ''))
  const existingByKey = new Map(existing.map((row) => [row.rowKey, row]))
  const saved: MonthlyKeywordSelectionRowDoc[] = []

  for (const row of incoming) {
    const prev = existingByKey.get(row.rowKey)
    const data = mergeRow(prev, row, user)
    if (prev?.id !== undefined) {
      const updated = await payload.update({
        collection: ROWS_COLLECTION,
        id: prev.id,
        data,
        overrideAccess: true,
      } as never) as unknown as MonthlyKeywordSelectionRowDoc
      saved.push(updated)
    } else {
      const created = await payload.create({
        collection: ROWS_COLLECTION,
        data,
        overrideAccess: true,
      } as never) as unknown as MonthlyKeywordSelectionRowDoc
      saved.push(created)
    }
  }
  return saved
}

export async function deleteSelectionRows(payload: Payload, clientId: number, deletions: SelectionDeletion[]): Promise<number> {
  const rowKeys = deletions.map((deletion) => selectionRowKey(clientId, deletion.yearMonth, deletion.searchTerm, Number(deletion.rowIndex ?? 0)))
  const rows = await findSelectionRowsByKeys(payload, clientId, rowKeys)
  let deleted = 0
  for (const row of rows) {
    if (row.id === undefined) continue
    await payload.delete({ collection: ROWS_COLLECTION, id: row.id, overrideAccess: true } as never)
    deleted += 1
  }
  return deleted
}

export async function countSelectionRows(payload: Payload, clientId: number): Promise<number> {
  const result = await payload.find({
    collection: ROWS_COLLECTION,
    where: { client: { equals: clientId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never) as unknown as { totalDocs?: number; docs?: unknown[] }
  return typeof result.totalDocs === 'number' ? result.totalDocs : (result.docs?.length ?? 0)
}

export async function patchSelectionRow(
  payload: Payload,
  clientId: number,
  yearMonth: string,
  searchTerm: string,
  rowIndex: number | null,
  patch: Record<string, unknown>,
): Promise<MonthlyKeywordSelectionRowDoc | null> {
  const where = rowIndex === null
    ? { and: [{ client: { equals: clientId } }, { yearMonth: { equals: yearMonth } }, { searchTermKey: { equals: normaliseSearchTermKey(searchTerm) } }] }
    : { rowKey: { equals: selectionRowKey(clientId, yearMonth, searchTerm, rowIndex) } }
  const result = await payload.find({ collection: ROWS_COLLECTION, where, limit: 1, depth: 0, overrideAccess: true } as never) as unknown as { docs?: MonthlyKeywordSelectionRowDoc[] }
  const row = result.docs?.[0]
  if (!row?.id) return null
  const data: Record<string, unknown> = { ...patch, appliedToNKL: patch.appliedToNKL !== undefined ? asNklId(patch.appliedToNKL) : undefined }
  if (patch.negativeKeyword !== undefined || patch.matchType !== undefined) {
    data.keywordKey = keywordKey(String(patch.negativeKeyword ?? row.negativeKeyword), String(patch.matchType ?? row.matchType))
  }
  return await payload.update({ collection: ROWS_COLLECTION, id: row.id, data, overrideAccess: true } as never) as unknown as MonthlyKeywordSelectionRowDoc
}
