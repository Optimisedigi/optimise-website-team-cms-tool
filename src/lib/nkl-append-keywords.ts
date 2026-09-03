import { randomBytes } from 'node:crypto'
import { sql } from 'drizzle-orm'
import type { Payload } from 'payload'

export type NklKeywordInput = {
  keyword: string
  matchType: string
  negatedAt?: string
}

/**
 * Append keywords to a negative keyword list without rewriting the whole
 * array. `payload.update({ keywords: [...current, ...new] })` re-inserts every
 * existing row: at ~4,700 keywords that is >32,766 bound params (SQLite's hard
 * cap → "too many SQL variables") and holds a write lock long enough to 504
 * every concurrent auto-save. Inserting only the delta keeps the write O(new).
 *
 * Mirrors the side effects of the collection's beforeChange/afterChange hooks:
 * keywordCount, updatedAt, and the per-client relevancy-cache wipe.
 */
export async function appendNklKeywords(
  payload: Payload,
  nklId: number,
  clientId: number,
  keywords: NklKeywordInput[],
): Promise<number> {
  if (keywords.length === 0) return 0
  const db = payload.db.drizzle
  const now = new Date().toISOString()

  const orderRow = await db.run(
    sql`select coalesce(max(_order), 0) as max_order from negative_keyword_lists_keywords where _parent_id = ${nklId}`,
  )
  let order = Number((orderRow.rows?.[0] as { max_order?: number } | undefined)?.max_order ?? 0)

  // Chunk well under the 32,766-variable cap (7 columns per row).
  const CHUNK = 500
  for (let i = 0; i < keywords.length; i += CHUNK) {
    const values = keywords.slice(i, i + CHUNK).map((kw) => {
      order += 1
      return sql`(${order}, ${nklId}, ${randomBytes(12).toString('hex')}, ${kw.keyword}, ${kw.matchType}, 0, ${kw.negatedAt ?? now})`
    })
    await db.run(
      sql`insert into negative_keyword_lists_keywords (_order, _parent_id, id, keyword, match_type, flagged_for_removal, negated_at) values ${sql.join(values, sql`, `)}`,
    )
  }

  await db.run(
    sql`update negative_keyword_lists set keyword_count = ${order}, updated_at = ${now} where id = ${nklId}`,
  )
  await payload.delete({
    collection: 'negative-keyword-monthly-waste-relevancy-cache',
    where: { client: { equals: clientId } },
    overrideAccess: true,
  }).catch((err) => payload.logger?.warn?.(`[appendNklKeywords] relevancy cache cleanup failed: ${err}`))

  return keywords.length
}
