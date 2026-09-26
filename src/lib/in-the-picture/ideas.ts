import { z } from 'zod'
import type { Payload } from 'payload'
import type { Client } from '@libsql/client'
import { boundedJson, configuredClientId, websiteUrl } from './config'

export const ideaSchema = z.object({
  blogId: z.string().uuid(), priority: z.number().int().positive(),
  blogIdea: z.string().trim().min(1).max(10000), suggestedTitle: z.string().max(10000),
  mainPoint: z.string().max(10000), keyPoints: z.string().max(10000),
  pointsToAvoid: z.string().max(10000), supportingContent: z.string().max(10000),
  contributor: z.string().max(10000), idealAuthor: z.string().max(10000),
  status: z.enum(['open', 'published']), publishedSlug: z.string().max(200),
  updatedAt: z.string().datetime({ offset: true }),
  recordRevision: z.number().int().positive().safe(), orderRevision: z.number().int().positive().safe(),
}).strict()
export const batchSchema = z.object({ version: z.literal(1), ideas: z.array(ideaSchema).min(1).max(100) }).strict()
export type Idea = z.infer<typeof ideaSchema>

const sourceColumns = [
  ['blog_idea', 'blogIdea'], ['suggested_title', 'suggestedTitle'], ['main_point', 'mainPoint'],
  ['key_points', 'keyPoints'], ['points_to_avoid', 'pointsToAvoid'], ['supporting_content', 'supportingContent'],
  ['contributor', 'contributor'], ['ideal_author', 'idealAuthor'], ['status', 'status'], ['published_slug', 'publishedSlug'],
  ['source_updated_at', 'updatedAt'],
 ] as const
export async function applyIdeas(payload: Payload, ideas: Idea[], includeRank = true): Promise<{ applied: number; ignored: number }> {
  const client = configuredClientId()
  const db = (payload.db as unknown as { client?: Client }).client
  if (!client || !db) throw new Error('Sync client/database not configured')
  if (new Set(ideas.map(idea => idea.blogId)).size !== ideas.length) throw new Error('Duplicate blog IDs')
  const tx = await db.transaction('write')
  let applied = 0
  let ignored = 0
  try {
    const existingClient = await tx.execute({ sql: 'SELECT id FROM clients WHERE id = ?', args: [client] })
    if (!existingClient.rows.length) throw new Error('Sync client missing')
    for (const idea of ideas) {
      const record = await tx.execute({ sql: 'SELECT * FROM blog_ideas WHERE blog_id = ?', args: [idea.blogId] })
      const current = record.rows[0]
      if (current && Number(current.client_id) !== client) throw new Error('Blog ID belongs to another client')
      const recordNew = !current || idea.recordRevision > Number(current.record_revision)
      const orderNew = !current || (includeRank && idea.orderRevision > Number(current.order_revision))
      if (current && idea.recordRevision === Number(current.record_revision) && sourceColumns.some(([col, key]) => (current[col] ?? '') !== idea[key])) throw new Error('Conflicting record revision')
      if (current && includeRank && idea.orderRevision === Number(current.order_revision) && Number(current.priority) !== idea.priority) throw new Error('Conflicting order revision')
      if (!recordNew && !orderNew) { ignored++; continue }
      const now = new Date().toISOString()
      if (!current) {
        const columns = ['client_id', 'blog_id', 'priority', 'record_revision', 'order_revision', ...sourceColumns.map(([col]) => col), 'updated_at', 'created_at']
        await tx.execute({ sql: `INSERT INTO blog_ideas (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`, args: [client, idea.blogId, idea.priority, idea.recordRevision, idea.orderRevision, ...sourceColumns.map(([, key]) => idea[key]), now, now] })
      } else {
        const values = [
          ...(recordNew ? [['record_revision', idea.recordRevision], ...sourceColumns.map(([col, key]) => [col, idea[key]] as const)] : []),
          ...(orderNew ? [['order_revision', idea.orderRevision], ['priority', idea.priority]] : []),
          ['updated_at', now],
        ] as Array<readonly [string, string | number]>
        const updated = await tx.execute({ sql: `UPDATE blog_ideas SET ${values.map(([column]) => `${column} = ?`).join(',')} WHERE id = ? AND record_revision = ? AND order_revision = ?`, args: [...values.map(([, value]) => value), Number(current.id), Number(current.record_revision), Number(current.order_revision)] })
        if (updated.rowsAffected !== 1) throw new Error('Concurrent idea update; retry the batch')
      }
      applied++
    }
    await tx.commit()
    return { applied, ignored }
  } catch (error) { await tx.rollback(); throw error }
}

const feedSchema = z.object({ version: z.literal(1), ideas: z.array(ideaSchema).max(100), total: z.number().int().nonnegative().max(1000), nextOffset: z.number().int().nonnegative().nullable(), snapshotRevision: z.number().int().nonnegative().safe(), orderRevision: z.number().int().nonnegative().safe() }).strict()
export async function pullIdeas(payload: Payload): Promise<{ applied: number; count: number }> {
  const url = websiteUrl('/api/content-sync/ideas')
  const token = process.env.CONTENT_CMS_SYNC_TOKEN
  if (!url || !token || token.length < 32 || !configuredClientId()) throw new Error('Pull not configured')
  for (let attempt = 0; attempt < 3; attempt++) {
    let offset: number | null = 0
    let version: number | null = null
    let rankVersion: number | null = null
    let total: number | null = null
    const ideas: Idea[] = []
    let changed = false
    do {
      const pageUrl = new URL(url)
      pageUrl.searchParams.set('limit', '100')
      pageUrl.searchParams.set('offset', String(offset))
      const started = Date.now()
      const response = await fetch(pageUrl, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000), redirect: 'error', cache: 'no-store' })
      if (!response.ok || Number(response.headers.get('content-length') || 0) > 500000) throw new Error(`Idea feed rejected (${response.status})`)
      const page = feedSchema.parse(await boundedJson(response, 500000))
      console.info('[itp-sync] idea page', { count: page.ideas.length, status: response.status, elapsedMs: Date.now() - started })
      if (version !== null && (version !== page.snapshotRevision || rankVersion !== page.orderRevision || total !== page.total)) { changed = true; break }
      version = page.snapshotRevision; rankVersion = page.orderRevision; total = page.total
      ideas.push(...page.ideas)
      if (ideas.length > 1000 || (page.nextOffset !== null && (page.nextOffset <= (offset ?? 0) || page.ideas.length === 0))) throw new Error('Invalid idea feed offset')
      offset = page.nextOffset
    } while (offset !== null)
    if (changed) continue
    if (ideas.length !== total || new Set(ideas.map(idea => idea.blogId)).size !== ideas.length || ideas.some((idea, i) => idea.priority !== i + 1 || idea.orderRevision !== rankVersion)) throw new Error('Incomplete idea snapshot')
    // Never apply partial ranks: validate the complete traversal before any writes.
    const result = await applyIdeas(payload, ideas, true)
    return { applied: result.applied, count: ideas.length }
  }
  throw new Error('Idea feed changed during traversal')
}
